import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  CartPanel,
  discountFromPct,
  type BuyerForm,
  type CartLine,
  type InvoicePaymentMode,
  type TransactionType,
} from "@/components/pos/cart-panel";
import { ADHOC_ID_PREFIX } from "@/components/pos/add-adhoc-line-dialog";
import { InventoryGrid } from "@/components/pos/inventory-grid";
import { InvoiceIssuedScreen } from "@/components/pos/invoice-issued-screen";
import { SaleReceiptScreen } from "@/components/pos/sale-receipt-screen";
import { ApiError, api } from "@/lib/api";
import { readApiMessage, readUserMessages } from "@/lib/api-errors";
import { useAuth } from "@/lib/auth";
import { DRAFTS_ENABLED } from "@/lib/feature-flags";
import {
  createInvoiceDraft,
  getNextSequence,
  heartbeatReservations,
  listInventory,
  releaseReservations,
  scanInventory,
  upsertReservations,
} from "@/lib/resources";
import type {
  Invoice,
  InvoiceDraft,
  InventoryItem,
  Receipt,
} from "@/lib/types";

type SaleState =
  | { kind: "cart" }
  | { kind: "issued"; invoice: Invoice }
  | { kind: "draft"; draft: InvoiceDraft }
  | { kind: "paid"; invoice: Invoice; receipt: Receipt };

/** Error-state shape. When the MoR call fails in a way that's recoverable
 *  via the draft path (transport / 5xx), `draftPayload` carries the exact
 *  body the cashier was trying to send so the "Save as draft" CTA can
 *  post it without rebuilding from the cart state. */
type SaleError = {
  title: string;
  items: string[];
  draftPayload?: Record<string, unknown>;
  canSaveDraft?: boolean;
};

const WALK_IN_BUYER: BuyerForm = {
  tin: "",
  legalName: "Walk In Customer",
  phone: "",
  email: "",
  vatNumber: "",
  city: "Addis Abeba",
  region: "13",
  country: "70",
  zone: "SHA",
  kebele: "03",
  wereda: "574",
  houseNumber: "NEW",
  idType: "",
  idNumber: "",
};

const EMPTY_BUSINESS_BUYER: BuyerForm = {
  tin: "",
  legalName: "",
  phone: "",
  email: "",
  vatNumber: "",
  city: "Addis Abeba",
  region: "13",
  country: "70",
  zone: "SHA",
  kebele: "03",
  wereda: "574",
  houseNumber: "NEW",
  idType: "NID",
  idNumber: "",
};

/**
 * The moment the cashier hits Submit, in EIRMS' DD-MM-YYYYTHH:mm:ss shape
 * (UTC). This is the time the invoice was issued from the operator's
 * perspective. The server re-checks against its own clock and applies a
 * small backoff only if the cashier's device looks ahead of "now" by enough
 * that MoR would reject it as future.
 */
function nowAsEirmsDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function SalePage() {
  const { t } = useTranslation();
  const { user, branch: ownBranch } = useAuth();
  const defaultName =
    user?.name?.trim() || user?.email?.split("@")[0] || "";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [transactionType, setTransactionType] = useState<TransactionType>("B2C");
  const [buyer, setBuyer] = useState<BuyerForm>(WALK_IN_BUYER);
  const [cashierName, setCashierName] = useState(defaultName);
  const [salespersonName, setSalespersonName] = useState(defaultName);
  const [paymentMode, setPaymentMode] = useState<InvoicePaymentMode>("CASH");
  const [paymentTerm, setPaymentTerm] = useState("IMMIDIATE");
  // Branch context comes from the shell's switcher — every operational page
  // reads `useAuth().branch` and lets the switcher be the single source of
  // truth. No per-page picker any more.
  const [nextSeq, setNextSeq] = useState<{
    documentNumber: string;
    invoiceCounter: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SaleError | null>(null);
  const [saleState, setSaleState] = useState<SaleState>({ kind: "cart" });
  const [savingDraft, setSavingDraft] = useState(false);

  // POS cart-session id — stable for the lifetime of this component instance.
  // Every reservation write we make is keyed by this UUID so the server can
  // tell "our" holds from other cashiers' holds.
  const cartSessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  // Server-side inventory search, debounced. Empty query fetches everything
  // (still capped at 50 server-side).
  useEffect(() => {
    const handle = setTimeout(() => {
      void listInventory(search).then(setItems).catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [search]);

  // Show next document #/counter that the backend will assign. Refetched after
  // every successful submit so the cashier sees the updated next number.
  useEffect(() => {
    void refreshNextSequence();
  }, []);

  // Sync server-side reservations whenever the cart changes. Only catalog
  // items (with a persisted inventoryItemId) participate — ad-hoc lines are
  // synthetic and have nothing to reserve. Skip when cart is empty and just
  // release everything.
  useEffect(() => {
    if (saleState.kind !== "cart") return;
    const catalogLines = cart
      .filter((l) => !l.item.id.startsWith(ADHOC_ID_PREFIX))
      .map((l) => ({ inventoryItemId: l.item.id, quantity: l.quantity }));
    const cartSessionId = cartSessionIdRef.current;
    if (catalogLines.length === 0) {
      void releaseReservations(cartSessionId).catch(() => undefined);
      return;
    }
    void upsertReservations({ cartSessionId, items: catalogLines }).catch(
      (err) => {
        if (err instanceof ApiError && err.status === 409) {
          setError({
            title: t("sale.errors.reservationConflict"),
            items: readUserMessages(err.body),
          });
        }
      },
    );
  }, [cart, saleState.kind]);

  // Heartbeat the reservation TTL every 60 s while the POS page is open. On
  // unmount, release everything so an abandoned tab doesn't hold stock for
  // the full 10 min TTL.
  useEffect(() => {
    const cartSessionId = cartSessionIdRef.current;
    // Captured at mount: AppShell remounts this page on a branch switch, and
    // the unmount release must target the branch the holds were taken in, not
    // the one just switched to.
    const heldBranchId = ownBranch?.id;
    const timer = setInterval(() => {
      void heartbeatReservations(cartSessionId).catch(() => undefined);
    }, 60_000);
    return () => {
      clearInterval(timer);
      void releaseReservations(cartSessionId, heldBranchId).catch(
        () => undefined,
      );
    };
  }, []);
  async function refreshNextSequence() {
    try {
      setNextSeq(await getNextSequence());
    } catch {
      setNextSeq(null);
    }
  }

  // Reset buyer when transaction type changes — walk-in fills defaults; switching
  // to business clears so the cashier picks/types fresh details.
  useEffect(() => {
    setBuyer(transactionType === "B2C" ? WALK_IN_BUYER : EMPTY_BUSINESS_BUYER);
  }, [transactionType]);

  const cartCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const line of cart) m.set(line.item.id, line.quantity);
    return m;
  }, [cart]);

  const totals = useMemo(() => {
    let preTax = 0;
    let discount = 0;
    let excise = 0;
    let tax = 0;
    for (const line of cart) {
      const sub = line.item.unitPrice * line.quantity;
      const taxable = Math.max(0, sub - line.discount);
      // Excise is ad-valorem on the raw unit price (qty * unitPrice), not on
      // the discounted taxable subtotal — MoR treats it as an item-level
      // fixed rate that a per-invoice discount doesn't reduce.
      const lineExcise = sub * ((line.item.exciseRate ?? 0) / 100);
      // MoR includes excise in the taxable base: TaxAmount = (PreTax + Excise) * rate.
      preTax += taxable;
      discount += line.discount;
      excise += lineExcise;
      tax += (taxable + lineExcise) * (line.item.taxRate / 100);
    }
    const total = preTax + tax + excise;
    return {
      preTax: round2(preTax),
      discount: round2(discount),
      excise: round2(excise),
      tax: round2(tax),
      total: round2(total),
      currency: "ETB",
    };
  }, [cart]);

  // Stock policy comes from whichever branch the switcher has selected.
  const blockOnEmpty = ownBranch?.stockPolicy === "BLOCK_ON_EMPTY";

  /** Refuse to add a tracked-out-of-stock item when the branch is strict.
   *  Untracked items always add (they're not counted). */
  function refuseIfOversell(item: InventoryItem): string | null {
    if (!blockOnEmpty) return null;
    if (!item.trackStock) return null;
    const inCart =
      cart.find((l) => l.item.id === item.id)?.quantity ?? 0;
    const onHand = item.sellable ?? 0;
    // Adding one more would tip past on-hand — refuse.
    if (inCart + 1 > onHand) {
      return onHand <= 0
        ? t("sale.errors.outOfStock", { description: item.description })
        : t("sale.errors.onlyOnHand", {
            onHand,
            description: item.description,
            inCart,
          });
    }
    return null;
  }

  function addToCart(item: InventoryItem) {
    // Goods and services can't share an invoice — block a mismatched add.
    if (cart.length > 0 && cart[0].item.nature !== item.nature) {
      setError({
        title: t("sale.errors.goodsServicesMixTitle"),
        items: [t("sale.errors.goodsServicesMixBody")],
      });
      return;
    }
    const oversell = refuseIfOversell(item);
    if (oversell) {
      setError({
        title: t("sale.errors.outOfStockTitle"),
        items: [oversell],
      });
      return;
    }
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { item, quantity: 1, discount: 0 }];
    });
  }

  /** Barcode-scanner Enter path: exact match against UPC/SKU/code. If it
   *  hits, add + clear the input (so the next scan starts clean). If not,
   *  leave the fuzzy search results as-is and let the cashier pick manually. */
  async function submitSearchScan() {
    const q = search.trim();
    if (!q) return;
    try {
      const hit = await scanInventory(q);
      if (hit) {
        addToCart(hit);
        setSearch("");
      }
    } catch {
      // scanInventory swallows 404 → null; anything reaching here is a real
      // transport error. Fall back to the fuzzy list already on screen.
    }
  }

  function setQuantity(itemId: string, quantity: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.item.id !== itemId) return l;
        // A percentage discount tracks the line, so it has to be re-applied to
        // the new subtotal. A flat discount stays as typed, but can't outgrow
        // a line that just shrank.
        const gross = l.item.unitPrice * quantity;
        const discount =
          l.discountPct != null
            ? discountFromPct(gross, l.discountPct)
            : Math.min(l.discount, gross);
        return { ...l, quantity, discount };
      }),
    );
  }

  function adjustLine(
    itemId: string,
    patch: Partial<Pick<CartLine, "discount" | "discountPct">>,
  ) {
    setCart((prev) =>
      prev.map((l) => (l.item.id === itemId ? { ...l, ...patch } : l)),
    );
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId));
  }

  function resetSale() {
    setCart([]);
    setSearch("");
    setError(null);
    setTransactionType("B2C");
    setBuyer(WALK_IN_BUYER);
    setPaymentMode("CASH");
    setPaymentTerm("IMMIDIATE");
    setSaleState({ kind: "cart" });
  }

  async function submit() {
    if (cart.length === 0) {
      setError({ title: t("sale.errors.cartEmpty"), items: [] });
      return;
    }
    if (!ownBranch?.id) {
      setError({
        title: t("sale.errors.pickBranch"),
        items: [],
      });
      return;
    }
    if (!cashierName.trim() || !salespersonName.trim()) {
      setError({
        title: t("sale.errors.namesRequired"),
        items: [],
      });
      return;
    }
    if (transactionType !== "B2C") {
      if (!buyer.tin.trim() || !buyer.legalName.trim()) {
        setError({
          title: t("sale.errors.buyerBusinessRequired"),
          items: [],
        });
        return;
      }
    }
    const email = buyer.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError({
        title: t("sale.errors.buyerEmailInvalid"),
        items: [],
      });
      return;
    }
    const exciseWithoutHc = cart.filter(
      (l) =>
        (l.item.exciseRate ?? 0) > 0 &&
        !l.item.harmonizationCode?.trim(),
    );
    if (exciseWithoutHc.length > 0) {
      setError({
        title: t("sale.errors.hcMissingTitle"),
        items: exciseWithoutHc.map((l) =>
          t("sale.errors.hcMissingItem", { description: l.item.description }),
        ),
      });
      return;
    }
    setError(null);
    setSubmitting(true);
    // Built outside the try so the catch can hand it to the draft path —
    // a transport failure means we already know what we *would* have
    // sent and don't need to rebuild it from cart state.
    let payload: Record<string, unknown> | null = null;
    try {
      const itemList = cart.map((line, idx) => {
        const sub = line.item.unitPrice * line.quantity;
        const preTax = Math.max(0, sub - line.discount);
        const lineExcise = round2(sub * ((line.item.exciseRate ?? 0) / 100));
        // MoR's line TaxAmount is the total tax on the line — VAT on the
        // extended (PreTax + Excise) base PLUS the excise itself. Then
        // TotalLineAmount = PreTax + TaxAmount. The envelope's TaxValue
        // and ExciseValue stay broken out separately (see ValueDetails).
        const lineVat = (preTax + lineExcise) * (line.item.taxRate / 100);
        const taxAmt = round2(lineVat + lineExcise);
        return {
          LineNumber: idx + 1,
          ItemCode: line.item.code,
          ProductDescription: line.item.description,
          NatureOfSupplies: line.item.nature,
          Unit: line.item.unit,
          Quantity: line.quantity,
          UnitPrice: line.item.unitPrice,
          Discount: round2(line.discount),
          ExciseTaxValue: lineExcise,
          TaxCode: line.item.taxCode,
          TaxAmount: taxAmt,
          PreTaxValue: round2(preTax),
          TotalLineAmount: round2(preTax + taxAmt),
          HarmonizationCode: line.item.harmonizationCode?.trim() || null,
          // Off-catalog lines created via the "Custom line" dialog have a
          // synthetic id; the backend skips stock decrement for them.
          inventoryItemId: line.item.id.startsWith(ADHOC_ID_PREFIX)
            ? undefined
            : line.item.id,
        };
      });

      payload = {
        TransactionType: transactionType,
        BuyerDetails: {
          Tin: buyer.tin,
          LegalName: buyer.legalName,
          Email: buyer.email || undefined,
          Phone: buyer.phone || undefined,
          VatNumber: buyer.vatNumber || undefined,
          HouseNumber: buyer.houseNumber || undefined,
          IdType: buyer.idType || undefined,
          IdNumber: buyer.idNumber || undefined,
          Region: buyer.region || undefined,
          Country: buyer.country || undefined,
          Zone: buyer.zone || undefined,
          Kebele: buyer.kebele || undefined,
          Wereda: buyer.wereda || undefined,
          City: buyer.city || undefined,
        },
        DocumentDetails: {
          DocumentNumber: "",
          // Real time of issuance — server keeps this value unless the device
          // clock is far enough ahead to risk MoR's "not future" rule.
          Date: nowAsEirmsDate(),
          Type: "INV",
        },
        ItemList: itemList,
        PaymentDetails: {
          Mode: paymentMode,
          // Server refuses non-IMMIDIATE terms on CASH/ADVANCE — keep both
          // in sync here so the UI can't submit a mismatch even if a stale
          // custom term was left over from a CREDIT selection.
          PaymentTerm:
            paymentMode === "CREDIT"
              ? paymentTerm.trim() || "NET_30"
              : "IMMIDIATE",
        },
        ValueDetails: {
          Discount: totals.discount > 0 ? totals.discount : null,
          ExciseValue: totals.excise,
          TaxValue: round2(itemList.reduce((s, l) => s + l.TaxAmount, 0)),
          IncomeWithholdValue: 0,
          TransactionWithholdValue: 0,
          TotalValue: totals.total,
          InvoiceCurrency: totals.currency,
        },
        SourceSystem: {
          CashierName: cashierName.trim(),
          SalesPersonName: salespersonName.trim(),
          InvoiceCounter: 1, // backend overrides with next-sequence
        },
        // Explicit branch — always the branch the switcher shows as active.
        // The interceptor also carries this via X-Branch-Id and would refuse
        // any mismatched value here.
        branchId: ownBranch.id,
        // Cart-session id so the server can release our reservations in the
        // same transaction as the stock decrement.
        cartSessionId: cartSessionIdRef.current,
      };

      // Preview with the same backend configuration service used by the
      // registration path. This removes the browser's arithmetic from the
      // trust boundary and ensures the issued-result UI reflects server data.
      const calculated = await api<{
        lines: Array<{ LineNumber: number; TaxCode: string; PreTaxValue: number; ExciseTaxValue: number; TaxAmount: number; TotalLineAmount: number }>;
        taxValue: number; exciseValue: number; totalValue: number;
      }>("/invoices/calculate", { method: "POST", body: JSON.stringify(payload) });
      const calculatedByLine = new Map(calculated.lines.map((line) => [line.LineNumber, line]));
      const serverItems = (payload.ItemList as Array<Record<string, unknown>>).map((line) => ({ ...line, ...calculatedByLine.get(Number(line.LineNumber)) }));
      payload.ItemList = serverItems;
      payload.ValueDetails = {
        ...(payload.ValueDetails as Record<string, unknown>),
        TaxValue: calculated.taxValue,
        ExciseValue: calculated.exciseValue,
        TotalValue: calculated.totalValue,
      };

      const invoice = await api<Invoice>("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSaleState({ kind: "issued", invoice });
      void refreshNextSequence();
    } catch (err) {
      if (err instanceof ApiError) {
        // 502 from our API = MoR was unreachable or rejected at the
        // transport layer (BadGatewayException). That's the case the
        // draft path solves; surface the "Save as draft" CTA alongside
        // the error. Validation errors (4xx) come from MoR's rule
        // engine — saving them as drafts would just fail on sync the
        // same way, so we don't offer the CTA there.
        const offerDraft =
          DRAFTS_ENABLED &&
          (err.status === 502 || err.status === 503) &&
          payload !== null;
        setError({
          title: readApiMessage(err.body) ?? "Couldn't issue this invoice.",
          items: readUserMessages(err.body),
          ...(offerDraft ? { draftPayload: payload! } : {}),
          canSaveDraft: offerDraft,
        });
      } else {
        // Network-level error: the API itself was unreachable. Same
        // remedy as a 5xx — save as draft locally.
        setError({
          title: "Couldn't reach the server. Please try again.",
          items: [],
          ...(DRAFTS_ENABLED && payload ? { draftPayload: payload } : {}),
          canSaveDraft: DRAFTS_ENABLED && payload !== null,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAsDraft() {
    if (!error?.draftPayload) return;
    setSavingDraft(true);
    setError(null);
    try {
      const draft = await createInvoiceDraft(error.draftPayload);
      setSaleState({ kind: "draft", draft });
      void refreshNextSequence();
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          title: readApiMessage(err.body) ?? "Couldn't save this draft.",
          items: readUserMessages(err.body),
        });
      } else {
        setError({
          title: "Couldn't reach the server to save the draft.",
          items: [],
        });
      }
    } finally {
      setSavingDraft(false);
    }
  }

  if (saleState.kind === "issued") {
    return (
      <InvoiceIssuedScreen
        invoice={saleState.invoice}
        onPaid={(receipt) =>
          setSaleState({ kind: "paid", invoice: saleState.invoice, receipt })
        }
        onNewSale={resetSale}
      />
    );
  }

  if (saleState.kind === "draft") {
    return <DraftSavedScreen draft={saleState.draft} onNewSale={resetSale} />;
  }

  if (saleState.kind === "paid") {
    return (
      <SaleReceiptScreen
        invoice={saleState.invoice}
        receipt={saleState.receipt}
        onNewSale={resetSale}
      />
    );
  }

  return (
    <div className="grid h-svh grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_24rem] xl:grid-cols-[1fr_28rem]">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
        <InventoryGrid
          items={items.filter((i) => i.active)}
          search={search}
          onSearchChange={setSearch}
          onSearchSubmit={submitSearchScan}
          onAdd={addToCart}
          cartCounts={cartCounts}
          forcedNature={cart[0]?.item.nature ?? null}
          blockOnEmpty={blockOnEmpty}
        />
      </section>
      <CartPanel
        cart={cart}
        onQty={setQuantity}
        onAdjust={adjustLine}
        onRemove={removeFromCart}
        transactionType={transactionType}
        onTransactionTypeChange={setTransactionType}
        buyer={buyer}
        onBuyerChange={setBuyer}
        cashierName={cashierName}
        onCashierNameChange={setCashierName}
        paymentMode={paymentMode}
        onPaymentModeChange={setPaymentMode}
        paymentTerm={paymentTerm}
        onPaymentTermChange={setPaymentTerm}
        salespersonName={salespersonName}
        onSalespersonNameChange={setSalespersonName}
        nextSequence={nextSeq}
        submitting={submitting}
        error={error}
        savingDraft={savingDraft}
        onSubmit={submit}
        onSaveDraft={saveAsDraft}
        totals={totals}
      />
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Shown after a successful "Save as draft" — confirms what we kept
 *  locally and points the cashier at the invoices page where the draft
 *  lives until sync. Intentionally lighter than the InvoiceIssuedScreen:
 *  there's no QR, no IRN, no buyer-facing artefact yet. */
function DraftSavedScreen({
  draft,
  onNewSale,
}: {
  draft: InvoiceDraft;
  onNewSale: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-50/60 px-5 py-4 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <span className="text-base font-semibold">
            {t("sale.draft.savedTitle")}
          </span>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium">
            {t("sale.draft.pendingSync")}
          </span>
        </div>
        <p className="text-sm text-amber-800/90 dark:text-amber-200/80">
          {t("sale.draft.explainer", {
            number: draft.provisionalDocumentNumber,
          })}
        </p>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t("sale.draft.buyer")}</dt>
        <dd className="font-medium">{draft.buyerLegalName}</dd>
        <dt className="text-muted-foreground">{t("sale.draft.total")}</dt>
        <dd className="font-medium tabular-nums">
          {draft.totalValue.toFixed(2)} {draft.currency}
        </dd>
        <dt className="text-muted-foreground">{t("sale.draft.cashier")}</dt>
        <dd>{draft.cashierName}</dd>
        <dt className="text-muted-foreground">{t("sale.draft.status")}</dt>
        <dd>{draft.status}</dd>
      </dl>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={onNewSale}
          className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
        >
          {t("sale.draft.newSale")}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/invoices">{t("sale.draft.viewInvoices")}</Link>
        </Button>
      </div>
    </div>
  );
}
