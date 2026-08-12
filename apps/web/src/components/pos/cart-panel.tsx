import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";

import { BuyerCombobox } from "@/components/buyer-combobox";
import { ErrorCallout } from "@/components/error-callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { Buyer, InventoryItem } from "@/lib/types";
import { nonTaxableSuffix } from "@/lib/invoice-types";
import { cn } from "@/lib/utils";

export type TransactionType = "B2B" | "B2C" | "B2G";

/** MoR classification sent as PaymentDetails.Mode. Instrument (cheque, card,
 *  transfer, …) is captured on the receipt, not here. */
export type InvoicePaymentMode = "CASH" | "ADVANCE" | "CREDIT";

/** Payment-term presets surfaced in the picker. MoR accepts free-form strings;
 *  operators can still send a bespoke value via the "Custom" option. */
export const PAYMENT_TERM_PRESETS: readonly string[] = [
  "IMMIDIATE",
  "NET_7",
  "NET_15",
  "NET_30",
];

export interface CartLine {
  item: InventoryItem;
  quantity: number;
  /** Absolute discount in ETB. Always the effective value — everything
   *  downstream (totals, the MoR payload) reads only this. */
  discount: number;
  /** Set when the cashier entered the discount as a percentage. `discount` is
   *  then kept as that percentage of the line subtotal and recomputed whenever
   *  the quantity changes. Null/undefined means a flat amount was typed. */
  discountPct?: number | null;
}

/** Absolute discount implied by a percentage of a line's gross subtotal,
 *  rounded to cents. `Math.round(gross * pct) / 100` is exactly
 *  `round2(gross * pct / 100)` — the two /100s cancel. */
export function discountFromPct(gross: number, pct: number): number {
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round(gross * clamped) / 100;
}

export interface BuyerForm {
  tin: string;
  legalName: string;
  phone: string;
  email: string;
  vatNumber: string;
  city: string;
  region: string;
  country: string;
  zone: string;
  kebele: string;
  wereda: string;
  houseNumber: string;
  idType: string;
  idNumber: string;
}

export interface CartPanelProps {
  cart: CartLine[];
  onQty: (itemId: string, qty: number) => void;
  onAdjust: (
    itemId: string,
    patch: Partial<Pick<CartLine, "discount" | "discountPct">>,
  ) => void;
  onRemove: (itemId: string) => void;
  transactionType: TransactionType;
  onTransactionTypeChange: (t: TransactionType) => void;
  buyer: BuyerForm;
  onBuyerChange: (b: BuyerForm) => void;
  cashierName: string;
  onCashierNameChange: (v: string) => void;
  salespersonName: string;
  onSalespersonNameChange: (v: string) => void;
  paymentMode: InvoicePaymentMode;
  onPaymentModeChange: (m: InvoicePaymentMode) => void;
  paymentTerm: string;
  onPaymentTermChange: (t: string) => void;
  nextSequence: { documentNumber: string; invoiceCounter: number } | null;
  submitting: boolean;
  /** When `error.canSaveDraft` is true, the panel surfaces a "Save as draft"
   *  button beneath the error so the cashier can preserve the sale through
   *  an EIRMS outage without re-keying. The parent owns the actual save
   *  call via {@link onSaveDraft}. */
  error: {
    title: string;
    items: string[];
    canSaveDraft?: boolean;
  } | null;
  savingDraft?: boolean;
  onSubmit: () => void;
  onSaveDraft?: () => void;
  totals: {
    preTax: number;
    tax: number;
    excise: number;
    discount: number;
    total: number;
    currency: string;
  };
}

const TX_TYPES: { value: TransactionType; labelKey: string; sub: string }[] = [
  { value: "B2C", labelKey: "sale.cart.walkIn", sub: "C2B" },
  { value: "B2B", labelKey: "sale.cart.business", sub: "B2B" },
  { value: "B2G", labelKey: "sale.cart.government", sub: "G2B" },
];

export function CartPanel(props: CartPanelProps) {
  const { t } = useTranslation();
  const {
    cart,
    onQty,
    onAdjust,
    onRemove,
    transactionType,
    onTransactionTypeChange,
    buyer,
    onBuyerChange,
    cashierName,
    onCashierNameChange,
    salespersonName,
    onSalespersonNameChange,
    paymentMode,
    onPaymentModeChange,
    paymentTerm,
    onPaymentTermChange,
    nextSequence,
    submitting,
    error,
    savingDraft,
    onSubmit,
    onSaveDraft,
    totals,
  } = props;

  const isWalkIn = transactionType === "B2C";
  const lineCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  function pickSavedBuyer(b: Buyer) {
    onBuyerChange({
      tin: b.tin,
      legalName: b.legalName,
      phone: b.phone ?? "",
      email: b.email ?? "",
      vatNumber: b.vatNumber ?? "",
      city: b.city ?? "",
      region: b.region ?? "13",
      country: b.country ?? "70",
      zone: b.zone ?? "SHA",
      kebele: b.kebele ?? "03",
      wereda: b.wereda ?? "574",
      houseNumber: b.houseNumber ?? "NEW",
      idType: b.idType ?? "NID",
      idNumber: b.idNumber ?? "",
    });
  }

  function clearBusinessBuyer() {
    onBuyerChange({
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
    });
  }

  return (
    <aside className="flex h-full flex-col gap-4 overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Cart header + items */}
      <div className="flex flex-col gap-3 px-5 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t("sale.cart.title")}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {t("sale.cart.items", { count: lineCount })}
          </span>
        </div>
        {nextSequence && (
          <div className="flex items-center justify-between rounded-md border border-dashed bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span>{t("sale.cart.willIssueAs")}</span>
            <span className="tabular-nums">
              <span className="font-mono font-medium text-foreground">
                #{nextSequence.documentNumber}
              </span>
              <span className="mx-1.5 opacity-40">·</span>
              {t("sale.cart.counter")}{" "}
              <span className="font-mono font-medium text-foreground">
                {nextSequence.invoiceCounter}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* One scroll container for cart items + customer + payment + totals +
       *  error + submit. Splitting the panel into two regions clipped the
       *  customer/error/submit stack whenever it overflowed — the header of
       *  the footer became unreachable. A single scroll fixes that: when the
       *  error grows tall, the cashier just scrolls up to edit inputs. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ShoppingBag className="size-6 text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">
              {t("sale.cart.empty")}
            </span>
          </div>
        ) : (
          <ul className="flex flex-col divide-y">
            {cart.map((line) => {
              const sub = line.item.unitPrice * line.quantity;
              const lineExcise = sub * ((line.item.exciseRate ?? 0) / 100);
              const lineNet = Math.max(0, sub - line.discount + lineExcise);
              return (
                <li key={line.item.id} className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">
                      {line.item.description}
                      {nonTaxableSuffix(line.item.taxCode)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {line.item.unitPrice.toFixed(2)} ×{line.quantity}
                      {line.discount > 0 && (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-400">
                          −{line.discount.toFixed(2)}
                        </span>
                      )}
                      {lineExcise > 0 && (
                        <span className="ml-1 text-amber-700 dark:text-amber-400">
                          +{lineExcise.toFixed(2)}{" "}
                          {t("common.excise").toLowerCase()}
                        </span>
                      )}
                    </p>
                  </div>
                  <QtyStepper
                    value={line.quantity}
                    onChange={(q) => onQty(line.item.id, q)}
                  />
                  <LineAdjust line={line} onAdjust={onAdjust} />
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium tabular-nums">
                      {lineNet.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(line.item.id)}
                      className="text-muted-foreground/60 hover:text-destructive"
                      aria-label={t("common.remove")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>

        {/* Customer + cashier + totals + submit — same scroll container as
         *  the cart items above so a tall error stack never clips the buyer
         *  inputs. */}
        <div className="mt-3 border-t bg-muted/20 px-5 py-4">
        <div className="flex flex-col gap-4">
          {/* Customer type pills */}
          <div>
            <Label className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("sale.cart.customer")}
            </Label>
            <div className="grid grid-cols-3 rounded-lg border bg-background p-1">
              {TX_TYPES.map((tx) => (
                <button
                  key={tx.value}
                  type="button"
                  onClick={() => onTransactionTypeChange(tx.value)}
                  className={cn(
                    "rounded-md py-2 text-center text-xs transition-colors",
                    tx.value === transactionType
                      ? "bg-[#5700FF] text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="font-medium">{t(tx.labelKey)}</div>
                  <div
                    className={cn(
                      "text-[9px] uppercase tracking-widest",
                      tx.value === transactionType
                        ? "text-white/70"
                        : "text-muted-foreground/60",
                    )}
                  >
                    {tx.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {isWalkIn ? (
            <WalkInBuyer buyer={buyer} onChange={onBuyerChange} />
          ) : (
            <BusinessBuyer
              buyer={buyer}
              onChange={onBuyerChange}
              onPick={pickSavedBuyer}
              onClear={clearBusinessBuyer}
            />
          )}

          {/* Payment classification (+ credit-only term) — full width, sits
              between buyer info and cashier so the cashier explicitly picks
              how the invoice settles before naming the person collecting. */}
          <div className="flex flex-col gap-2">
            <PaymentModePills
              mode={paymentMode}
              onModeChange={(m) => {
                onPaymentModeChange(m);
                if (m !== "CREDIT") onPaymentTermChange("IMMIDIATE");
              }}
            />
            {paymentMode === "CREDIT" && (
              <PaymentTermPicker
                term={paymentTerm}
                onTermChange={onPaymentTermChange}
              />
            )}
          </div>

          {/* Cashier */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {t("sale.cart.cashier")}
              </Label>
              <Input
                value={cashierName}
                onChange={(e) => onCashierNameChange(e.target.value)}
                placeholder={t("common.name")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {t("sale.cart.salesperson")}
              </Label>
              <Input
                value={salespersonName}
                onChange={(e) => onSalespersonNameChange(e.target.value)}
                placeholder={t("common.name")}
              />
            </div>
          </div>

          <Separator />

          {/* Totals + invoice-level adjustments */}
          <dl className="flex flex-col gap-1 text-sm tabular-nums">
            <Row label={t("common.subtotal")}>
              {totals.preTax.toFixed(2)} {totals.currency}
            </Row>
            {totals.discount > 0 && (
              <Row label={t("common.discount")}>
                −{totals.discount.toFixed(2)} {totals.currency}
              </Row>
            )}
            {totals.excise > 0 && (
              <Row label={t("common.excise")}>
                {totals.excise.toFixed(2)} {totals.currency}
              </Row>
            )}
            <Row label={t("common.tax")}>
              {totals.tax.toFixed(2)} {totals.currency}
            </Row>
            <Row label={t("common.total")} emphasized>
              {totals.total.toFixed(2)} {totals.currency}
            </Row>
          </dl>

          {error && (
            <div className="flex flex-col gap-2">
              <ErrorCallout title={error.title} items={error.items} />
              {error.canSaveDraft && onSaveDraft && (
                // EIRMS-side failure — offer the local draft path so the
                // cashier doesn't lose the sale. Sync happens later (from
                // the invoices page) once MoR is reachable.
                <Button
                  type="button"
                  variant="outline"
                  onClick={onSaveDraft}
                  disabled={savingDraft}
                  className="h-10 w-full"
                >
                  {savingDraft ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  {savingDraft
                    ? t("sale.cart.savingDraft")
                    : t("sale.cart.saveAsDraft")}
                </Button>
              )}
            </div>
          )}

          <Button
            type="button"
            disabled={submitting || cart.length === 0}
            onClick={onSubmit}
            className="h-12 w-full bg-[#5700FF] text-base text-white hover:bg-[#5700FF]/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {submitting ? (
              <Loader2 className="animate-spin" />
            ) : null}
            {submitting
              ? t("sale.cart.issuing")
              : `${t("sale.cart.issueInvoice")} · ${totals.total.toFixed(2)} ${totals.currency}`}
          </Button>
        </div>
        </div>
      </div>
    </aside>
  );
}

function Row({
  label,
  emphasized,
  children,
}: {
  label: string;
  emphasized?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between",
        emphasized && "pt-1 text-base",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(emphasized ? "font-semibold" : "font-medium")}>
        {children}
      </dd>
    </div>
  );
}

function LineAdjust({
  line,
  onAdjust,
}: {
  line: CartLine;
  onAdjust: (
    itemId: string,
    patch: Partial<Pick<CartLine, "discount" | "discountPct">>,
  ) => void;
}) {
  const { t } = useTranslation();
  const gross = line.item.unitPrice * line.quantity;
  const percentMode = line.discountPct != null;
  const active = line.discount > 0;

  /** Flip the input between "birr off" and "% off", carrying the current
   *  discount across so the amount the cashier already entered survives. */
  function toggleMode() {
    if (percentMode) {
      onAdjust(line.item.id, { discountPct: null });
      return;
    }
    const pct = gross > 0 ? Math.round((line.discount / gross) * 10000) / 100 : 0;
    onAdjust(line.item.id, {
      discountPct: Math.min(100, pct),
      discount: discountFromPct(gross, pct),
    });
  }

  function handleInput(raw: string) {
    const n = Number(raw) || 0;
    if (percentMode) {
      const pct = Math.min(100, Math.max(0, n));
      onAdjust(line.item.id, {
        discountPct: pct,
        discount: discountFromPct(gross, pct),
      });
    } else {
      // A flat discount can't exceed the line — a negative taxable base would
      // be rejected by MoR anyway.
      onAdjust(line.item.id, {
        discount: Math.min(gross, Math.max(0, n)),
        discountPct: null,
      });
    }
  }

  const inputValue = percentMode ? (line.discountPct ?? 0) : line.discount;
  const lineTotal = Math.max(0, gross - line.discount);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground",
            active && "border-[#5700FF]/40 text-[#5700FF]",
          )}
          aria-label={t("sale.cart.adjustLine")}
        >
          <SlidersHorizontal className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("sale.cart.lineAdjustments")}
          </span>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("common.discount")}</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="any"
                min="0"
                max={percentMode ? 100 : undefined}
                value={inputValue || ""}
                onChange={(e) => handleInput(e.target.value)}
                placeholder={percentMode ? "0" : "0.00"}
                className="h-8"
              />
              <button
                type="button"
                onClick={toggleMode}
                aria-pressed={percentMode}
                aria-label={t("sale.cart.discountPercentToggle")}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                  percentMode
                    ? "border-[#5700FF] bg-[#5700FF] text-white"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                %
              </button>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {discountOutcome(t, {
              percentMode,
              pct: line.discountPct ?? 0,
              discount: line.discount,
              gross,
              lineTotal,
            })}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Plain-language summary of what the discount does to this line. */
function discountOutcome(
  t: TFunction,
  o: {
    percentMode: boolean;
    pct: number;
    discount: number;
    gross: number;
    lineTotal: number;
  },
): string {
  const money = (n: number) => n.toFixed(2);
  if (o.discount <= 0) {
    return t("sale.cart.discountOutcomeNone", { total: money(o.lineTotal) });
  }
  const common = {
    off: money(o.discount),
    gross: money(o.gross),
    total: money(o.lineTotal),
  };
  return o.percentMode
    ? t("sale.cart.discountOutcomePercent", { ...common, pct: o.pct })
    : t("sale.cart.discountOutcome", common);
}

function QtyStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  // Local string buffer so the user can clear the field while typing
  // ("" → typing "12") without us snapping it back to the prop each
  // keystroke. We commit on blur / Enter, revert on invalid.
  const [buffer, setBuffer] = useState(String(value));
  // Keep the buffer in sync when the parent changes the value (e.g.
  // the +/- buttons, or a stock-clamp upstream).
  useEffect(() => {
    setBuffer(String(value));
  }, [value]);

  function commit() {
    const n = Math.floor(Number(buffer));
    if (!Number.isFinite(n) || n < 1) {
      // Reject invalid input — restore the last good value visibly.
      setBuffer(String(value));
      return;
    }
    if (n !== value) onChange(n);
    else setBuffer(String(value)); // normalise leading zeros etc.
  }

  return (
    <div className="flex items-center rounded-md border bg-background">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={t("sale.cart.decrease")}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            // Cancel edit without commit.
            setBuffer(String(value));
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        // Drop the native spin buttons (they collide with our ±) and the
        // browser's number-input border. The wrapper supplies the look.
        className="w-9 border-0 bg-transparent p-0 text-center text-sm tabular-nums focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={t("common.quantity")}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={t("sale.cart.increase")}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function WalkInBuyer({
  buyer,
  onChange,
}: {
  buyer: BuyerForm;
  onChange: (b: BuyerForm) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-[#5700FF]/10 text-[#5700FF]">
          <UserRound className="size-4" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {t("sale.cart.walkInCustomer")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t("sale.cart.walkInHint")}
          </span>
        </div>
      </div>
      <Input
        value={buyer.phone}
        onChange={(e) => onChange({ ...buyer, phone: e.target.value })}
        placeholder={t("sale.cart.phoneOptional")}
        className="h-9"
      />
      <Input
        type="email"
        value={buyer.email}
        onChange={(e) => onChange({ ...buyer, email: e.target.value })}
        placeholder={t("sale.cart.emailOptional")}
        className="h-9"
      />
      <Input
        value={buyer.tin}
        onChange={(e) => onChange({ ...buyer, tin: e.target.value })}
        placeholder={t("sale.cart.tinOptional")}
        className="h-9"
      />
    </div>
  );
}

function BusinessBuyer({
  buyer,
  onChange,
  onPick,
  onClear,
}: {
  buyer: BuyerForm;
  onChange: (b: BuyerForm) => void;
  onPick: (b: Buyer) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <BuyerCombobox value={buyer.tin} onPick={onPick} onClear={onClear} />
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={buyer.tin}
          onChange={(e) => onChange({ ...buyer, tin: e.target.value })}
          placeholder={`${t("auth.signup.tin")} *`}
          className="h-9"
        />
        <Input
          value={buyer.legalName}
          onChange={(e) => onChange({ ...buyer, legalName: e.target.value })}
          placeholder={`${t("auth.signup.legalName")} *`}
          className="h-9"
        />
        <Input
          value={buyer.vatNumber}
          onChange={(e) => onChange({ ...buyer, vatNumber: e.target.value })}
          placeholder="VAT #"
          className="h-9"
        />
        <Input
          value={buyer.phone}
          onChange={(e) => onChange({ ...buyer, phone: e.target.value })}
          placeholder={t("common.phone")}
          className="h-9"
        />
      </div>
      <Input
        type="email"
        value={buyer.email}
        onChange={(e) => onChange({ ...buyer, email: e.target.value })}
        placeholder={t("sale.cart.emailOptional")}
        className="h-9"
      />
    </div>
  );
}

/**
 * Compact three-pill classification picker (Cash / Advance / Credit) sized
 * to sit next to the Customer picker. The term selection lives on a separate
 * component below because it's Credit-only.
 */
function PaymentModePills({
  mode,
  onModeChange,
}: {
  mode: InvoicePaymentMode;
  onModeChange: (m: InvoicePaymentMode) => void;
}) {
  const { t } = useTranslation();
  const modes: {
    value: InvoicePaymentMode;
    labelKey: string;
    subKey: string;
  }[] = [
    { value: "CASH", labelKey: "sale.cart.cash", subKey: "sale.cart.cashSub" },
    {
      value: "ADVANCE",
      labelKey: "sale.cart.advance",
      subKey: "sale.cart.advanceSub",
    },
    {
      value: "CREDIT",
      labelKey: "sale.cart.credit",
      subKey: "sale.cart.creditSub",
    },
  ];
  return (
    <div>
      <Label className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {t("sale.cart.payment")}
      </Label>
      <div className="grid grid-cols-3 rounded-lg border bg-background p-1">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className={cn(
              "rounded-md py-2 text-center text-xs transition-colors",
              m.value === mode
                ? "bg-[#5700FF] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <div className="font-medium">{t(m.labelKey)}</div>
            <div
              className={cn(
                "text-[9px] uppercase tracking-widest",
                m.value === mode
                  ? "text-white/70"
                  : "text-muted-foreground/60",
              )}
            >
              {t(m.subKey)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Payment-term picker — only rendered when Mode is CREDIT. Chips for the
 * NET_x presets plus a Custom option that reveals a free-text input.
 */
function PaymentTermPicker({
  term,
  onTermChange,
}: {
  term: string;
  onTermChange: (t: string) => void;
}) {
  const isCustom = !PAYMENT_TERM_PRESETS.includes(term);
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        Payment term
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {PAYMENT_TERM_PRESETS.filter((t) => t !== "IMMIDIATE").map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTermChange(t)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors",
              t === term
                ? "border-[#5700FF] bg-[#5700FF]/10 text-foreground"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {t.replace("_", " ")}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onTermChange("")}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs transition-colors",
            isCustom
              ? "border-[#5700FF] bg-[#5700FF]/10 text-foreground"
              : "border-input text-muted-foreground hover:text-foreground",
          )}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <Input
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          placeholder="e.g. NET_45 or END_OF_MONTH"
          className="h-9"
          maxLength={40}
        />
      )}
    </div>
  );
}
