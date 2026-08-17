import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	Banknote,
	ChartColumn,
	Building2,
	CircleDollarSign,
	Crown,
	CheckCircle2,
	FileText,
	Package,
	Percent,
	ReceiptText,
	RefreshCw,
	ShieldCheck,
	ShoppingCart,
	Store,
	TrendingUp,
	TriangleAlert,
	Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { isPlaceholderTin } from "@/lib/invoice-types";
import {
	getAccountantSummary,
	getCashierSummary,
	getDashboardSummary,
} from "@/lib/resources";
import { ScopeToggle, useListScope } from "@/components/scope-toggle";
import { SystemDashboardPage } from "@/pages/system-dashboard";
import type {
	AccountantSummary,
	CashierSummary,
	DashboardSummary,
} from "@/lib/types";
import { parseInvoiceDate, receiptIssuedAt } from "@/lib/invoice-date";
import { cn } from "@/lib/utils";

export function DashboardPage() {
	const { user, can } = useAuth();
	if (user?.role === "SUPER_ADMIN" && !can("dashboard.view")) {
		return <SystemDashboardPage />;
	}
	if (user?.role === "CASHIER") {
		return <CashierDashboardPage />;
	}
	if (user?.role === "ACCOUNTANT") {
		return <AccountantDashboardPage />;
	}
	// BRANCH_ADMIN deliberately uses the operational business dashboard. The
	// request context pins every aggregate to their single granted branch, and
	// ScopeToggle remains hidden because cross-branch access is merchant-only.
	return <MerchantDashboardPage />;
}

function MerchantDashboardPage() {
	const { user, branch, merchant, availableBranches, selectBranch } = useAuth();
	const [data, setData] = useState<DashboardSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [scope, setScope] = useListScope("eirms:list-scope:dashboard");
	const [switchingBranch, setSwitchingBranch] = useState(false);
	const requestSequence = useRef(0);

	const greeting = (() => {
		const h = new Date().getHours();
		if (h < 12) return "Good morning";
		if (h < 17) return "Good afternoon";
		return "Good evening";
	})();

	const displayName =
		user?.name?.trim() || user?.email?.split("@")[0] || "there";

	useEffect(() => {
		void refresh();
	}, [scope, branch?.id]);

	async function refresh() {
		const requestId = ++requestSequence.current;
		setLoading(true);
		setError(null);
		try {
			const next = await getDashboardSummary({ scope });
			if (requestId === requestSequence.current) setData(next);
		} catch (e) {
			if (requestId === requestSequence.current) {
				setError((e as Error).message);
			}
		} finally {
			if (requestId === requestSequence.current) setLoading(false);
		}
	}

	async function changeDashboardScope(value: string) {
		if (value === "ALL") {
			setScope("merchant");
			return;
		}
		setScope("branch");
		if (value === branch?.id) return;
		setSwitchingBranch(true);
		setError(null);
		try {
			await selectBranch(value);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSwitchingBranch(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
			{/* ── Page header ──────────────────────────────────────────────── */}
			<header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col gap-1">
					<p className="text-[13px] font-medium text-muted-foreground">
						{greeting},{" "}
						<span className="font-semibold text-foreground">{displayName}</span>
					</p>
					<h1 className="flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground">
						<span className="flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
							<Crown className="size-4" />
						</span>
						Dashboard
					</h1>
					<p className="text-[13px] text-muted-foreground">
						{merchant?.tradeName ?? merchant?.legalName ?? "Your business"} · {scope === "merchant" ? "All branches" : (branch?.tradeName ?? branch?.name ?? "Selected branch")}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					{user?.role === "MERCHANT_ADMIN" && (
						<div className="min-w-[290px] rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background p-2.5 shadow-sm">
							<div className="mb-1.5 flex items-center justify-between px-1">
								<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
									Dashboard scope
								</span>
								<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
									{scope === "merchant" ? "Merchant-wide" : "Branch view"}
								</span>
							</div>
							<Select
								value={scope === "merchant" ? "ALL" : (branch?.id ?? "")}
								onValueChange={(value) => void changeDashboardScope(value)}
								disabled={switchingBranch}
							>
								<SelectTrigger className="h-10 border-primary/20 bg-background font-medium">
									<SelectValue placeholder="Choose dashboard branch" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">
										<span className="flex items-center gap-2">
											<Building2 className="size-4 text-primary" />
											All branches · {merchant?.tradeName ?? merchant?.legalName}
										</span>
									</SelectItem>
									{availableBranches.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											<span className="flex items-center gap-2">
												<Store className="size-4 text-muted-foreground" />
												{item.tradeName ?? item.name}
												{item.id === branch?.id && (
													<span className="text-xs text-muted-foreground">Current</span>
												)}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
								{scope === "merchant"
									? `Showing combined data from ${availableBranches.length} branches.`
									: `Showing only ${branch?.tradeName ?? branch?.name ?? "the selected branch"}.`}
							</p>
						</div>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={refresh}
						disabled={loading || switchingBranch}
						className="gap-2 h-9"
					>
						<RefreshCw className={cn("size-4", loading && "animate-spin")} />
						Refresh
					</Button>
				</div>
			</header>

			{/* ── Error state ───────────────────────────────────────────────── */}
			{error && (
				<div className="flex items-center gap-3 rounded-[12px] border border-destructive/20 bg-[#FEF2F2] px-4 py-3 text-sm text-destructive">
					Failed to load dashboard data: {error}
				</div>
			)}

			{/* ── Skeleton / loading ────────────────────────────────────────── */}
			{!data && !error && (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<div
							key={i}
							className="h-[120px] animate-pulse rounded-[16px] border border-border/60 bg-muted/40"
						/>
					))}
				</div>
			)}

			{data && (
				<>
					{/* ── KPI Cards ─────────────────────────────────────────────── */}
					<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<KpiCard
							label="Today's Revenue"
							value={money(data.today.revenue)}
							unit="ETB"
							sub={`${data.today.invoices} invoice${data.today.invoices === 1 ? "" : "s"} today`}
							icon={<TrendingUp className="size-4" />}
							variant="primary"
						/>
						<KpiCard
							label="Today's Collections"
							value={money(data.today.collected)}
							unit="ETB"
							sub={`${data.today.receipts} receipt${data.today.receipts === 1 ? "" : "s"} filed`}
							icon={<CircleDollarSign className="size-4" />}
							variant="accent"
						/>
						<KpiCard
							label="Outstanding Balance"
							value={money(data.outstanding.total)}
							unit="ETB"
							sub={`${data.outstanding.count} unpaid invoice${data.outstanding.count === 1 ? "" : "s"}`}
							icon={<Banknote className="size-4" />}
							variant={data.outstanding.total > 0 ? "warning" : "neutral"}
						/>
						<KpiCard
							label="Active Users"
							value={String(data.activeUsers)}
							sub="Across all roles"
							icon={<Users className="size-4" />}
							variant="neutral"
						/>
					</section>

					{/* ── Period comparison row ──────────────────────────────────── */}
					<section className="grid gap-4 md:grid-cols-2">
						<PeriodCompareCard
							title="This Month"
							current={data.thisMonth}
							previous={data.lastMonth}
						/>
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center gap-2">
									<span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
										<ChartColumn className="size-3.5" />
									</span>
									<div>
										<CardTitle className="text-[15px]">
											All-time Totals
										</CardTitle>
										<CardDescription className="text-xs">
											Since the system was set up
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<dl className="grid grid-cols-2 gap-x-6 gap-y-4">
									<Stat
										label="Invoices Issued"
										value={data.allTime.invoices.toLocaleString()}
									/>
									<Stat
										label="Total Revenue"
										value={`${money(data.allTime.revenue)} ETB`}
									/>
									<Stat
										label="Receipts Filed"
										value={data.allTime.receipts.toLocaleString()}
									/>
									<Stat
										label="Total Collected"
										value={`${money(data.allTime.collected)} ETB`}
									/>
								</dl>
							</CardContent>
						</Card>
					</section>

					{/* ── Recent activity ───────────────────────────────────────── */}
					<section className="grid gap-4 lg:grid-cols-2">
						{/* Recent Invoices */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
											<FileText className="size-3.5" />
										</span>
										<div>
											<CardTitle className="text-[15px]">
												Recent Invoices
											</CardTitle>
											<CardDescription className="text-xs">
												Latest 8 documents
											</CardDescription>
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										asChild
										className="h-8 gap-1.5 text-xs text-primary hover:text-primary"
									>
										<Link to="/invoices">
											View all
											<ArrowRight className="size-3.5" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="pt-2">
								{data.recentInvoices.length === 0 ? (
									<EmptyState
										icon={<FileText className="size-8" />}
										title="No invoices yet"
										description="Create your first invoice to get started."
										href="/sale"
										action="New Sale"
									/>
								) : (
									<Table>
										<TableBody>
											{data.recentInvoices.map((inv) => (
												<TableRow key={inv.id}>
													<TableCell>
														<div className="flex flex-col gap-0.5">
															<span className="text-[13px] font-medium text-foreground">
																{inv.buyer.legalName}
															</span>
															<span className="font-mono text-[11px] text-muted-foreground">
																#{inv.documentNumber}
																{inv.documentType !== "INV" &&
																	` · ${inv.documentType}`}
																{" · "}
																{inv.transactionType}
																{!isPlaceholderTin(inv.buyer.tin) &&
																	` · TIN ${inv.buyer.tin}`}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end gap-1">
															<span className="font-mono text-[13px] font-medium tabular-nums">
																{money(inv.totalValue)}{" "}
																<span className="text-muted-foreground">
																	{inv.currency}
																</span>
															</span>
															<PaymentBadge status={inv.paymentStatus} />
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>

						{/* Recent Receipts */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="flex size-7 items-center justify-center rounded-[8px] bg-accent/10 text-accent">
											<ReceiptText className="size-3.5" />
										</span>
										<div>
											<CardTitle className="text-[15px]">
												Recent Receipts
											</CardTitle>
											<CardDescription className="text-xs">
												Latest 8 collections
											</CardDescription>
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										asChild
										className="h-8 gap-1.5 text-xs text-primary hover:text-primary"
									>
										<Link to="/receipts">
											View all
											<ArrowRight className="size-3.5" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="pt-2">
								{data.recentReceipts.length === 0 ? (
									<EmptyState
										icon={<ReceiptText className="size-8" />}
										title="No receipts yet"
										description="Receipts appear here once payments are recorded."
									/>
								) : (
									<Table>
										<TableBody>
											{data.recentReceipts.map((r) => (
												<TableRow key={r.id}>
													<TableCell>
														<div className="flex items-center gap-2.5">
															<span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
																{r.kind === "WITHHOLD" ? (
																	<Percent className="size-3.5" />
																) : (
																	<ReceiptText className="size-3.5" />
																)}
															</span>
															<div className="flex flex-col gap-0.5">
																<span className="text-[13px] font-medium text-foreground">
																	Receipt {r.receiptCounter}
																</span>
																<span className="text-[11px] text-muted-foreground">
																	{r.kind === "WITHHOLD"
																		? "Withhold"
																		: (r.modeOfPayment ?? "—")}{" "}
																	· {timeAgo(receiptIssuedAt(r))}
																</span>
															</div>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<span className="font-mono text-[13px] font-medium tabular-nums">
															{money(r.collectedAmount)}{" "}
															<span className="text-muted-foreground">
																{r.receiptCurrency}
															</span>
														</span>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>

						{/* Inventory Alerts */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="flex size-7 items-center justify-center rounded-[8px] bg-warning/10 text-warning">
											<TriangleAlert className="size-3.5" />
										</span>
										<div>
											<CardTitle className="text-[15px]">
												Inventory Alerts
											</CardTitle>
											<CardDescription className="text-xs">
												Low stock items
											</CardDescription>
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										asChild
										className="h-8 gap-1.5 text-xs text-primary hover:text-primary"
									>
										<Link to="/inventory">
											View all
											<ArrowRight className="size-3.5" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="pt-2">
								{data.inventoryAlerts.length === 0 ? (
									<EmptyState
										icon={<Package className="size-8" />}
										title="Stock levels good"
										description="No items are below their low stock threshold."
									/>
								) : (
									<Table>
										<TableBody>
											{data.inventoryAlerts.slice(0, 5).map((item) => (
												<TableRow key={item.code}>
													<TableCell>
														<div className="flex flex-col gap-0.5">
															<span className="text-[13px] font-medium text-foreground">
																{item.description}
															</span>
															<span className="font-mono text-[11px] text-muted-foreground">
																{item.code}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<span className="font-mono text-[13px] font-medium text-warning tabular-nums">
															{item.onHand}{" "}
															<span className="text-muted-foreground text-[11px] font-normal">
																/ {item.lowStockThreshold}
															</span>
														</span>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>

						{/* EIRMS Compliance */}
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center gap-2">
									<span
										className={cn(
											"flex size-7 items-center justify-center rounded-[8px]",
											data.eirmsCompliance.configured
												? "bg-success/10 text-success"
												: "bg-destructive/10 text-destructive",
										)}
									>
										<ShieldCheck className="size-3.5" />
									</span>
									<div>
										<CardTitle className="text-[15px]">
											EIRMS Compliance
										</CardTitle>
										<CardDescription className="text-xs">
											Tax authority sync status
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4">
								<div className="flex flex-col gap-4">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">Status</span>
										{data.eirmsCompliance.configured ? (
											<Badge variant="success">Connected</Badge>
										) : (
											<Badge variant="destructive">Not Configured</Badge>
										)}
									</div>
									<div className="grid grid-cols-3 gap-2">
										<div className="flex flex-col items-center rounded-lg border bg-muted/30 p-2">
											<span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												Synced
											</span>
											<span className="text-lg font-semibold tabular-nums text-foreground mt-1">
												{data.eirmsCompliance.invoicesRegistered}
											</span>
										</div>
										<div className="flex flex-col items-center rounded-lg border bg-muted/30 p-2">
											<span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												Pending
											</span>
											<span className="text-lg font-semibold tabular-nums text-warning mt-1">
												{data.eirmsCompliance.pending}
											</span>
										</div>
										<div className="flex flex-col items-center rounded-lg border bg-destructive/5 p-2 border-destructive/20">
											<span className="text-[11px] text-destructive uppercase tracking-wider font-medium">
												Failed
											</span>
											<span className="text-lg font-semibold tabular-nums text-destructive mt-1">
												{data.eirmsCompliance.failed}
											</span>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</section>

					{/* ── Top Buyers ────────────────────────────────────────────── */}
					<Card>
						<CardHeader className="pb-2">
							<div className="flex items-center gap-2">
								<span className="flex size-7 items-center justify-center rounded-[8px] bg-success/10 text-success">
									<Crown className="size-3.5" />
								</span>
								<div>
									<CardTitle className="text-[15px]">Top Buyers</CardTitle>
									<CardDescription className="text-xs">
										Ranked by accepted-invoice total revenue
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="pt-2">
							{data.topBuyers.length === 0 ? (
								<EmptyState
									icon={<Users className="size-8" />}
									title="No buyer activity yet"
									description="Top buyers will appear here once invoices are accepted."
								/>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-10 text-center">#</TableHead>
											<TableHead>Buyer</TableHead>
											<TableHead className="text-right">Invoices</TableHead>
											<TableHead className="text-right">
												Revenue (ETB)
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{data.topBuyers.map((b, idx) => (
											<TableRow key={b.buyerId}>
												<TableCell className="text-center">
													<span
														className={cn(
															"inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
															idx === 0
																? "bg-warning/10 text-warning"
																: idx === 1
																	? "bg-muted text-muted-foreground"
																	: idx === 2
																		? "bg-primary/10 text-primary"
																		: "text-muted-foreground",
														)}
													>
														{idx + 1}
													</span>
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-0.5">
														<span className="text-[13px] font-medium">
															{b.legalName}
														</span>
														{!isPlaceholderTin(b.tin) && (
															<span className="font-mono text-[11px] text-muted-foreground">
																TIN {b.tin}
															</span>
														)}
													</div>
												</TableCell>
												<TableCell className="text-right tabular-nums">
													<span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium">
														{b.invoiceCount}
													</span>
												</TableCell>
												<TableCell className="text-right font-mono text-[13px] font-medium tabular-nums">
													{money(b.totalValue)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

// ── Helper components ─────────────────────────────────────────────────────────

type KpiVariant = "primary" | "accent" | "warning" | "neutral";

function KpiCard({
	label,
	value,
	unit,
	sub,
	icon,
	variant = "neutral",
}: {
	label: string;
	value: string;
	unit?: string;
	sub: string;
	icon: React.ReactNode;
	variant?: KpiVariant;
}) {
	const styles: Record<
		KpiVariant,
		{ card: string; icon: string; value: string }
	> = {
		primary: {
			card: "bg-card border-primary/25",
			icon: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
			value: "text-foreground",
		},
		accent: {
			card: "bg-card border-cyan-700/25",
			icon: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
			value: "text-foreground",
		},
		warning: {
			card: "bg-warning/10 border-warning/20",
			icon: "bg-warning/20 text-warning",
			value: "text-foreground",
		},
		neutral: {
			card: "bg-card border-border",
			icon: "bg-primary/10 text-primary",
			value: "text-foreground",
		},
	};

	const s = styles[variant];
	const isColored = false;

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-[16px] border p-5 shadow-sm transition-shadow hover:shadow-md",
				s.card,
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-3">
					<span
						className={cn(
							"text-[11px] font-semibold uppercase tracking-[0.1em]",
							isColored ? "text-white/80" : "text-muted-foreground",
						)}
					>
						{label}
					</span>
					<div className="flex items-baseline gap-1.5">
						<span
							className={cn(
								"text-[28px] font-semibold tabular-nums leading-none",
								s.value,
							)}
						>
							{value}
						</span>
						{unit && (
							<span
								className={cn(
									"text-[13px] font-medium",
									isColored ? "text-white/70" : "text-muted-foreground",
								)}
							>
								{unit}
							</span>
						)}
					</div>
					<span
						className={cn(
							"text-[12px]",
							isColored ? "text-white/70" : "text-muted-foreground",
						)}
					>
						{sub}
					</span>
				</div>
				<span
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-[10px]",
						s.icon,
					)}
				>
					{icon}
				</span>
			</div>
		</div>
	);
}

function PeriodCompareCard({
	title,
	current,
	previous,
}: {
	title: string;
	current: {
		invoices: number;
		revenue: number;
		receipts: number;
		collected: number;
	};
	previous: {
		invoices: number;
		revenue: number;
		receipts: number;
		collected: number;
	};
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center gap-2">
					<span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
						<TrendingUp className="size-3.5" />
					</span>
					<div>
						<CardTitle className="text-[15px]">{title}</CardTitle>
						<CardDescription className="text-xs">
							vs previous period
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-2 gap-x-6 gap-y-5">
					<CompareStat
						label="Invoices"
						current={current.invoices}
						previous={previous.invoices}
					/>
					<CompareStat
						label="Revenue"
						current={current.revenue}
						previous={previous.revenue}
						isMoney
					/>
					<CompareStat
						label="Receipts"
						current={current.receipts}
						previous={previous.receipts}
					/>
					<CompareStat
						label="Collected"
						current={current.collected}
						previous={previous.collected}
						isMoney
					/>
				</dl>
			</CardContent>
		</Card>
	);
}

function CompareStat({
	label,
	current,
	previous,
	isMoney,
}: {
	label: string;
	current: number;
	previous: number;
	isMoney?: boolean;
}) {
	const delta = current - previous;
	const pct =
		previous === 0
			? current === 0
				? 0
				: 100
			: ((current - previous) / previous) * 100;
	const up = delta >= 0;

	return (
		<div className="flex flex-col gap-1">
			<dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</dt>
			<dd className="text-[20px] font-semibold tabular-nums text-foreground">
				{isMoney ? money(current) : current.toLocaleString()}
			</dd>
			{previous !== 0 || current !== 0 ? (
				<span
					className={cn(
						"inline-flex items-center gap-1 text-[12px] font-medium",
						up ? "text-success" : "text-warning",
					)}
				>
					{up ? (
						<ArrowUpRight className="size-3.5" />
					) : (
						<ArrowDownRight className="size-3.5" />
					)}
					{up ? "+" : ""}
					{pct.toFixed(0)}% vs{" "}
					{isMoney ? money(previous) : previous.toLocaleString()}
				</span>
			) : (
				<span className="text-[12px] text-muted-foreground">No data yet</span>
			)}
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{label}
			</dt>
			<dd className="text-[18px] font-semibold tabular-nums text-foreground">
				{value}
			</dd>
		</div>
	);
}

function PaymentBadge({ status }: { status: "UNPAID" | "PARTIAL" | "PAID" }) {
	if (status === "PAID") return <Badge variant="success">Paid</Badge>;
	if (status === "PARTIAL") return <Badge variant="warning">Partial</Badge>;
	return <Badge variant="muted">Unpaid</Badge>;
}

function EmptyState({
	icon,
	title,
	description,
	href,
	action,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	href?: string;
	action?: string;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-8 text-center">
			<span className="flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted-foreground">
				{icon}
			</span>
			<div className="flex flex-col gap-1">
				<p className="text-[14px] font-medium text-foreground">{title}</p>
				<p className="text-[12px] text-muted-foreground">{description}</p>
			</div>
			{href && action && (
				<Button variant="default" size="sm" asChild>
					<Link to={href}>{action}</Link>
				</Button>
			)}
		</div>
	);
}

function money(n: number): string {
	return n.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function timeAgo(iso: string): string {
	const d = parseInvoiceDate(iso) ?? new Date(iso);
	const diffMs = Date.now() - d.getTime();
	const minutes = Math.round(diffMs / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	return d.toLocaleDateString();
}

function CashierDashboardPage() {
	const { user, branch } = useAuth();
	const [data, setData] = useState<CashierSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [scope, setScope] = useListScope("eirms:list-scope:dashboard");

	const displayName =
		user?.name?.trim() || user?.email?.split("@")[0] || "Cashier";

	useEffect(() => {
		void refresh();
	}, [scope, branch?.id]);

	async function refresh() {
		setLoading(true);
		setError(null);
		try {
			setData(await getCashierSummary({ scope }));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
			<header className="flex items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-[13px] font-medium text-muted-foreground">
						Welcome back,{" "}
						<span className="font-semibold text-foreground">{displayName}</span>
					</p>
					<h1 className="text-[28px] font-semibold tracking-tight text-foreground">
						Cashier Terminal
					</h1>
				</div>
				<div className="flex items-center gap-2.5">
					<ScopeToggle scope={scope} onChange={setScope} />
					<Button
						variant="outline"
						size="sm"
						onClick={refresh}
						disabled={loading}
						className="gap-2 h-9"
					>
						<RefreshCw className={cn("size-4", loading && "animate-spin")} />{" "}
						Refresh
					</Button>
					<Button
						size="sm"
						asChild
						className="gap-2 h-9 bg-primary text-primary-foreground"
					>
						<Link to="/sale">
							<ShoppingCart className="size-4" /> New Sale
						</Link>
					</Button>
				</div>
			</header>

			{error && (
				<div className="flex items-center gap-3 rounded-[12px] border border-destructive/20 bg-[#FEF2F2] px-4 py-3 text-sm text-destructive">
					Failed to load: {error}
				</div>
			)}

			{!data && !error && (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<div
							key={i}
							className="h-[120px] animate-pulse rounded-[16px] border bg-muted/40"
						/>
					))}
				</div>
			)}

			{data && (
				<>
					<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<KpiCard
							label="Today's Sales"
							value={money(data.today.sales)}
							unit="ETB"
							sub={`${data.today.transactions} transactions`}
							icon={<TrendingUp className="size-4" />}
							variant="primary"
						/>
						<KpiCard
							label="Items Sold"
							value={String(data.today.itemsSold)}
							sub="Total products today"
							icon={<Package className="size-4" />}
							variant="neutral"
						/>
						<KpiCard
							label="Cash Collected"
							value={money(data.paymentSummary.cash)}
							unit="ETB"
							sub="From cash sales"
							icon={<Banknote className="size-4" />}
							variant="accent"
						/>
						<KpiCard
							label="Credit Sales"
							value={money(data.paymentSummary.credit)}
							unit="ETB"
							sub="Pending collection"
							icon={<CircleDollarSign className="size-4" />}
							variant="neutral"
						/>
					</section>

					<Card>
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<span className="flex size-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
										<FileText className="size-3.5" />
									</span>
									<div>
										<CardTitle className="text-[15px]">
											My Recent Invoices
										</CardTitle>
										<CardDescription className="text-xs">
											Your latest transactions
										</CardDescription>
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									asChild
									className="h-8 text-xs text-primary"
								>
									<Link to="/invoices">
										View all <ArrowRight className="size-3.5 ml-1" />
									</Link>
								</Button>
							</div>
						</CardHeader>
						<CardContent className="pt-2">
							{data.recentInvoices.length === 0 ? (
								<EmptyState
									icon={<FileText className="size-8" />}
									title="No recent sales"
									description="Start a new sale to see it here."
									href="/sale"
									action="New Sale"
								/>
							) : (
								<Table>
									<TableBody>
										{data.recentInvoices.map((inv) => (
											<TableRow key={inv.id}>
												<TableCell>
													<div className="flex flex-col gap-0.5">
														<span className="text-[13px] font-medium">
															{inv.buyer.legalName}
														</span>
														<span className="font-mono text-[11px] text-muted-foreground">
															#{inv.documentNumber} · {inv.transactionType}
														</span>
													</div>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex flex-col items-end gap-1">
														<span className="font-mono text-[13px] font-medium">
															{money(inv.totalValue)} {inv.currency}
														</span>
														<PaymentBadge status={inv.paymentStatus} />
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

function AccountantDashboardPage() {
	const { user, branch } = useAuth();
	const [data, setData] = useState<AccountantSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [scope, setScope] = useListScope("eirms:list-scope:dashboard");

	const displayName =
		user?.name?.trim() || user?.email?.split("@")[0] || "Accountant";

	useEffect(() => {
		void refresh();
	}, [scope, branch?.id]);

	async function refresh() {
		setLoading(true);
		setError(null);
		try {
			setData(await getAccountantSummary({ scope }));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
			<header className="flex items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-[13px] font-medium text-muted-foreground">
						Welcome,{" "}
						<span className="font-semibold text-foreground">{displayName}</span>
					</p>
					<h1 className="text-[28px] font-semibold tracking-tight text-foreground">
						Financial Overview
					</h1>
				</div>
				<div className="flex items-center gap-2.5">
					<ScopeToggle scope={scope} onChange={setScope} />
					<Button
						variant="outline"
						size="sm"
						onClick={refresh}
						disabled={loading}
						className="gap-2 h-9"
					>
						<RefreshCw className={cn("size-4", loading && "animate-spin")} />{" "}
						Refresh
					</Button>
				</div>
			</header>

			{error && (
				<div className="flex items-center gap-3 rounded-[12px] border border-destructive/20 bg-[#FEF2F2] px-4 py-3 text-sm text-destructive">
					Failed to load: {error}
				</div>
			)}

			{!data && !error && (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<div
							key={i}
							className="h-[120px] animate-pulse rounded-[16px] border bg-muted/40"
						/>
					))}
				</div>
			)}

			{data && (
				<>
					<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<KpiCard
							label="Total Invoiced"
							value={money(data.invoiced)}
							unit="ETB"
							sub="All time accepted invoices"
							icon={<FileText className="size-4" />}
							variant="neutral"
						/>
						<KpiCard
							label="Total Collected"
							value={money(data.collected)}
							unit="ETB"
							sub="Confirmed receipts"
							icon={<CircleDollarSign className="size-4" />}
							variant="primary"
						/>
						<KpiCard
							label="Outstanding"
							value={money(data.outstanding)}
							unit="ETB"
							sub="Pending collections"
							icon={<Banknote className="size-4" />}
							variant={data.outstanding > 0 ? "warning" : "neutral"}
						/>
						<KpiCard
							label="Withholding Tax"
							value={money(data.withholding)}
							unit="ETB"
							sub="Total withheld by buyers"
							icon={<Percent className="size-4" />}
							variant="accent"
						/>
					</section>

					<section className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="flex size-7 items-center justify-center rounded-[8px] bg-warning/10 text-warning">
											<Banknote className="size-3.5" />
										</span>
										<div>
											<CardTitle className="text-[15px]">
												Outstanding Invoices
											</CardTitle>
											<CardDescription className="text-xs">
												Needs collection
											</CardDescription>
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										asChild
										className="h-8 text-xs text-primary"
									>
										<Link to="/invoices">
											View all <ArrowRight className="size-3.5 ml-1" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="pt-2">
								{data.outstandingInvoices.length === 0 ? (
									<EmptyState
										icon={<CheckCircle2 className="size-8" />}
										title="All clear"
										description="No outstanding invoices found."
									/>
								) : (
									<Table>
										<TableBody>
											{data.outstandingInvoices.map((inv) => (
												<TableRow key={inv.id}>
													<TableCell>
														<div className="flex flex-col gap-0.5">
															<span className="text-[13px] font-medium">
																{inv.buyerLegalName}
															</span>
															<span className="font-mono text-[11px] text-muted-foreground">
																#{inv.documentNumber}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<span className="font-mono text-[13px] font-medium tabular-nums text-warning">
															{money(inv.totalValue - inv.paidAmount)} ETB
														</span>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="flex size-7 items-center justify-center rounded-[8px] bg-accent/10 text-accent">
											<ReceiptText className="size-3.5" />
										</span>
										<div>
											<CardTitle className="text-[15px]">
												Recent Receipts
											</CardTitle>
											<CardDescription className="text-xs">
												Latest collections
											</CardDescription>
										</div>
									</div>
									<Button
										variant="ghost"
										size="sm"
										asChild
										className="h-8 text-xs text-primary"
									>
										<Link to="/receipts">
											View all <ArrowRight className="size-3.5 ml-1" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="pt-2">
								{data.recentReceipts.length === 0 ? (
									<EmptyState
										icon={<ReceiptText className="size-8" />}
										title="No receipts"
										description="Collections will appear here."
									/>
								) : (
									<Table>
										<TableBody>
											{data.recentReceipts.map((r) => (
												<TableRow key={r.id}>
													<TableCell>
														<div className="flex flex-col gap-0.5">
															<span className="text-[13px] font-medium">
																Receipt {r.receiptCounter}
															</span>
															<span className="text-[11px] text-muted-foreground">
																{r.kind === "WITHHOLD"
																	? "Withhold"
																	: (r.modeOfPayment ?? "—")}{" "}
																· {timeAgo(r.createdAt)}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<span className="font-mono text-[13px] font-medium tabular-nums">
															{money(r.collectedAmount)} {r.receiptCurrency}
														</span>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>
					</section>
				</>
			)}
		</div>
	);
}
