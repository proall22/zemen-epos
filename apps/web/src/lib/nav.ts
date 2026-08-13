import {
  Banknote,
  Building2,
  CalendarClock,
  FileText,
  History,
  Languages,
  LayoutDashboard,
  MailCheck,
  Package,
  PackagePlus,
  Percent,
  Receipt,
  ScrollText,
  Settings,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import type { UserRole } from "./types";

/**
 * Every authenticated route, with the permission that opens it.
 *
 * One list, two consumers: the sidebar renders from it and the router guards
 * from it. They used to be separate — nav carried the permission and routes
 * carried none — which meant a page could be hidden from the menu and still
 * reachable by typing its URL, and a permission change could silently leave
 * the two disagreeing.
 */
export interface NavRoute {
  to: string;
  labelKey: string;
  icon: typeof Receipt;
  /** Permission required to open the page. */
  perm: string;
  /** Extra codes that also open it, OR-ed with `perm`. Used where one screen
   *  serves two audiences — the dashboard is `dashboard.view` for merchant
   *  users and `dashboard.system` for a platform admin. */
  anyOf?: string[];
  /** Section heading in the sidebar. Omit to keep the route out of the menu
   *  while still guarding it (detail and print pages). */
  sectionKey?: string;
  /** Overrides the label for a SUPER_ADMIN, who sees the platform framing. */
  superAdminLabelKey?: string;
  /** Whether the route should match exactly (used for NavLink 'end' prop). */
  end?: boolean;
  /** Keep the SaaS operator shell focused on platform operations. Merchant
   *  catalogue/POS routes remain available only inside consented sessions. */
  hideForPlatformAdmin?: boolean;
  /** Platform-specific section heading. */
  superAdminSectionKey?: string;
  /** Optional sidebar audience. Permissions still guard direct navigation;
   *  this keeps each role's daily menu focused on its actual job. */
  sidebarRoles?: UserRole[];
}

export const NAV_ROUTES: NavRoute[] = [
  {
    to: "/dashboard",
    labelKey: "nav.dashboard",
    superAdminLabelKey: "nav.systemDashboard",
    icon: LayoutDashboard,
    perm: "dashboard.view",
    anyOf: ["dashboard.system"],
    sectionKey: "nav.insights",
    superAdminSectionKey: "nav.platform",
  },
  {
    to: "/reports",
    labelKey: "nav.reports",
    icon: CalendarClock,
    perm: "report.view",
    sectionKey: "nav.insights",
    superAdminSectionKey: "nav.operations",
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT"],
  },

  {
    to: "/sale",
    labelKey: "nav.newSale",
    icon: Receipt,
    perm: "invoice.create",
    sectionKey: "nav.workflow",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "CASHIER"],
  },
  {
    to: "/invoices",
    labelKey: "nav.invoices",
    icon: FileText,
    perm: "invoice.view",
    sectionKey: "nav.workflow",
    superAdminSectionKey: "nav.operations",
    sidebarRoles: ["SUPER_ADMIN", "MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "CASHIER", "SUPPORT"],
  },
  { to: "/invoices/:id", labelKey: "nav.invoices", icon: FileText, perm: "invoice.view" },
  {
    to: "/receipts",
    labelKey: "nav.receipts",
    icon: Banknote,
    perm: "receipt.view",
    sectionKey: "nav.workflow",
    superAdminSectionKey: "nav.operations",
    sidebarRoles: ["SUPER_ADMIN", "MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "CASHIER", "SUPPORT"],
  },
  { to: "/receipts/:id", labelKey: "nav.receipts", icon: Banknote, perm: "receipt.view" },
  {
    to: "/withholding",
    labelKey: "nav.withholding",
    icon: Percent,
    perm: "withholding.view",
    sectionKey: "nav.workflow",
    superAdminSectionKey: "nav.operations",
    sidebarRoles: ["SUPER_ADMIN", "MERCHANT_ADMIN", "ACCOUNTANT", "SUPPORT"],
  },

  {
    to: "/inventory",
    labelKey: "nav.inventory",
    icon: Package,
    perm: "inventory.view",
    sectionKey: "nav.catalogue",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
    end: true,
  },
  {
    to: "/inventory/stores",
    labelKey: "nav.stores",
    icon: Warehouse,
    perm: "store.view",
    sectionKey: "nav.catalogue",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
  },
  {
    to: "/inventory/movements",
    labelKey: "nav.movements",
    icon: History,
    perm: "inventory.view",
    sectionKey: "nav.catalogue",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
  },
  {
    to: "/inventory/vendors",
    labelKey: "nav.vendors",
    icon: Truck,
    perm: "vendor.view",
    sectionKey: "nav.catalogue",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
  },
  {
    to: "/inventory/purchases",
    labelKey: "nav.purchases",
    icon: PackagePlus,
    perm: "purchase.view",
    sectionKey: "nav.catalogue",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
  },
  {
    to: "/inventory/harmonization",
    labelKey: "nav.harmonization",
    icon: Percent,
    perm: "inventory.view",
    sectionKey: "nav.catalogue",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN", "BRANCH_ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
  },

  {
    to: "/merchants/:merchantId/branches/new",
    labelKey: "nav.merchants",
    icon: Building2,
    perm: "branch.create",
  },
  {
    to: "/users",
    labelKey: "nav.users",
    icon: Users,
    perm: "user.view",
    sectionKey: "nav.access",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN"],
  },
  {
    to: "/merchants",
    labelKey: "nav.merchants",
    superAdminLabelKey: "nav.merchantManagement",
    icon: Building2,
    perm: "merchant.view",
    sectionKey: "nav.access",
    superAdminSectionKey: "nav.platform",
    sidebarRoles: ["SUPER_ADMIN", "MERCHANT_ADMIN"],
  },
  {
    to: "/branch-approvals",
    labelKey: "nav.branchApprovals",
    icon: Building2,
    perm: "merchant.create",
    sectionKey: "nav.access",
    superAdminSectionKey: "nav.platform",
    sidebarRoles: ["SUPER_ADMIN"],
  },
  {
    to: "/account",
    labelKey: "nav.accountExport",
    icon: Settings,
    perm: "merchant.export",
    sectionKey: "nav.access",
    hideForPlatformAdmin: true,
    sidebarRoles: ["MERCHANT_ADMIN"],
  },
  {
    to: "/audit",
    labelKey: "nav.audit",
    icon: ScrollText,
    perm: "audit.view",
    sectionKey: "nav.access",
    superAdminSectionKey: "nav.administration",
    sidebarRoles: ["SUPER_ADMIN", "MERCHANT_ADMIN"],
  },
  {
    to: "/deliverability",
    labelKey: "nav.emailDeliverability",
    icon: MailCheck,
    perm: "deliverability.view",
    sectionKey: "nav.access",
    superAdminSectionKey: "nav.administration",
    sidebarRoles: ["SUPER_ADMIN"],
  },
  {
    to: "/admin/translations",
    labelKey: "nav.translations",
    icon: Languages,
    perm: "translation.manage",
    sectionKey: "nav.access",
    superAdminSectionKey: "nav.administration",
    sidebarRoles: ["SUPER_ADMIN"],
  },
];

/** Sidebar section order. A section with no permitted routes is dropped. */
export const NAV_SECTIONS = [
  "nav.platform",
  "nav.operations",
  "nav.administration",
  "nav.insights",
  "nav.workflow",
  "nav.catalogue",
  "nav.access",
] as const;

export function routeAllows(
  route: Pick<NavRoute, "perm" | "anyOf">,
  can: (code: string) => boolean,
): boolean {
  return can(route.perm) || (route.anyOf?.some((p) => can(p)) ?? false);
}

/** Permission for a path, or undefined when the path isn't guarded. */
export function routeFor(path: string): NavRoute | undefined {
  return NAV_ROUTES.find((r) => r.to === path);
}

/**
 * Where to send someone who lands on "/". Derived from what they can actually
 * open rather than hard-coded per role — a role switch drifts the moment
 * permissions change, and silently redirects people to a page that 403s.
 */
export function landingRoute(
  can: (code: string) => boolean,
): string | undefined {
  const preferred = ["/dashboard", "/sale", "/invoices", "/inventory", "/merchants"];
  for (const path of preferred) {
    const route = routeFor(path);
    if (route && routeAllows(route, can)) return path;
  }
  const first = NAV_ROUTES.find(
    (r) => r.sectionKey && routeAllows(r, can),
  );
  return first?.to;
}
