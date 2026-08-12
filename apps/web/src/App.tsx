import { useEffect, useState } from "react";
import * as Sentry from "@sentry/react";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { setRegionBlockedHandler } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { landingRoute, routeFor } from "@/lib/nav";
import { NoAccess, RequirePermission } from "@/components/require-permission";
import { AccountPage } from "@/pages/account";
import { AdminTranslationsPage } from "@/pages/admin-translations";
import { AuditPage } from "@/pages/audit";
import { EmailDeliverabilityPage } from "@/pages/email-deliverability";
import { DashboardPage } from "@/pages/dashboard";
import { InventoryPage } from "@/pages/inventory";
import { ScheduledReportsPage } from "@/pages/scheduled-reports";
import { InventoryPurchasesPage } from "@/pages/inventory-purchases";
import { InventoryMovementsPage } from "@/pages/inventory-movements";
import { InventoryStoresPage } from "@/pages/inventory-stores";
import { InventoryHarmonizationPage } from "@/pages/inventory-harmonization";
import { InventoryVendorsPage } from "@/pages/inventory-vendors";
import { InvoicePrintPage } from "@/pages/invoice-print";
import { InvoicesPage } from "@/pages/invoices";
import { BranchOnboardingPage } from "@/pages/branch-onboarding";
import { ConsentDecisionPage } from "@/pages/consent-decision";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { LoginPage } from "@/pages/login";
import { MerchantsPage } from "@/pages/merchants";
import { PublicInvoicePage } from "@/pages/public-invoice";
import { PublicReceiptPage } from "@/pages/public-receipt";
import { RegionBlockedPage } from "@/pages/region-blocked";
import { ResetPasswordPage } from "@/pages/reset-password";
import { SignupPage } from "@/pages/signup";
import { StatusPage } from "@/pages/status";
import { ReceiptPrintPage } from "@/pages/receipt-print";
import { ReceiptsPage } from "@/pages/receipts";
import { SalePage } from "@/pages/sale";
import { UsersPage } from "@/pages/users";
import { WithholdingPage } from "@/pages/withholding";

// Wraps Routes so Sentry names transactions by matched route path.
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

/** Looks the path up in the nav manifest and refuses if the user can't open
 *  it. Fails closed: an unlisted path is treated as forbidden rather than
 *  quietly public. */
function Guarded({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const route = routeFor(path);
  if (!route) return <NoAccess />;
  return <RequirePermission route={route}>{children}</RequirePermission>;
}

function HomeRedirect() {
  const { can } = useAuth();
  // Derived from what the user can actually open. The old role switch sent
  // SUPPORT to /sale, which they have no permission to use.
  const home = landingRoute(can);
  // Nothing is permitted — redirecting would bounce back here forever.
  if (!home) return <NoAccess />;
  return <Navigate to={home} replace />;
}

export default function App() {
  const [regionBlock, setRegionBlock] = useState<{
    detail?: string;
  } | null>(null);

  useEffect(() => {
    setRegionBlockedHandler((body) => {
      const parsed =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};
      const arr = Array.isArray(parsed.userMessages)
        ? (parsed.userMessages as unknown[]).filter(
            (s): s is string => typeof s === "string",
          )
        : [];
      setRegionBlock({ detail: arr[0] });
    });
    return () => setRegionBlockedHandler(null);
  }, []);

  if (regionBlock) {
    return <RegionBlockedPage detail={regionBlock.detail} />;
  }

  return (
    <Router>
      <AuthProvider>
        <SentryRoutes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Public merchant self-signup */}
          <Route path="/signup" element={<SignupPage />} />
          {/* Public, login-free SLA status page */}
          <Route path="/status" element={<StatusPage />} />
          {/* Public, login-free buyer link from notification email/SMS */}
          <Route path="/p/invoices/:id" element={<PublicInvoicePage />} />
          <Route path="/p/receipts/:id" element={<PublicReceiptPage />} />

          <Route element={<ProtectedRoute />}>
            {/* Full-screen branch onboarding wizard — outside AppShell so it
                gets the same immersive treatment as merchant signup. */}
            <Route
                path="/merchants/:merchantId/branches/new"
                element={
                  <Guarded path="/merchants/:merchantId/branches/new"><BranchOnboardingPage /></Guarded>
                }
              />
            {/* Consent decision — magic-link target. Inside ProtectedRoute so
                the merchant admin must be logged in; standalone (no AppShell)
                for a focused approve/decline screen. */}
            <Route path="/consent/:token" element={<ConsentDecisionPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route
                path="/dashboard"
                element={
                  <Guarded path="/dashboard"><DashboardPage /></Guarded>
                }
              />
              <Route
                path="/reports"
                element={
                  <Guarded path="/reports"><ScheduledReportsPage /></Guarded>
                }
              />
              <Route
                path="/sale"
                element={
                  <Guarded path="/sale"><SalePage /></Guarded>
                }
              />
              <Route
                path="/invoices"
                element={
                  <Guarded path="/invoices"><InvoicesPage /></Guarded>
                }
              />
              <Route
                path="/invoices/:id"
                element={
                  <Guarded path="/invoices/:id"><InvoicePrintPage /></Guarded>
                }
              />
              <Route
                path="/receipts"
                element={
                  <Guarded path="/receipts"><ReceiptsPage /></Guarded>
                }
              />
              <Route
                path="/receipts/:id"
                element={
                  <Guarded path="/receipts/:id"><ReceiptPrintPage /></Guarded>
                }
              />
              <Route
                path="/withholding"
                element={
                  <Guarded path="/withholding"><WithholdingPage /></Guarded>
                }
              />
              <Route
                path="/inventory"
                element={
                  <Guarded path="/inventory"><InventoryPage /></Guarded>
                }
              />
              <Route
                path="/inventory/stores"
                element={
                  <Guarded path="/inventory/stores"><InventoryStoresPage /></Guarded>
                }
              />
              <Route
                path="/inventory/movements"
                element={
                  <Guarded path="/inventory/movements"><InventoryMovementsPage /></Guarded>
                }
              />
              <Route
                path="/inventory/vendors"
                element={
                  <Guarded path="/inventory/vendors"><InventoryVendorsPage /></Guarded>
                }
              />
              <Route
                path="/inventory/purchases"
                element={
                  <Guarded path="/inventory/purchases"><InventoryPurchasesPage /></Guarded>
                }
              />
              <Route
                path="/inventory/harmonization"
                element={
                  <Guarded path="/inventory/harmonization"><InventoryHarmonizationPage /></Guarded>
                }
              />
              <Route
                path="/users"
                element={
                  <Guarded path="/users"><UsersPage /></Guarded>
                }
              />
              <Route
                path="/merchants"
                element={
                  <Guarded path="/merchants"><MerchantsPage /></Guarded>
                }
              />
              <Route
                path="/account"
                element={
                  <Guarded path="/account"><AccountPage /></Guarded>
                }
              />
              <Route
                path="/audit"
                element={
                  <Guarded path="/audit"><AuditPage /></Guarded>
                }
              />
              <Route
                path="/deliverability"
                element={
                  <Guarded path="/deliverability"><EmailDeliverabilityPage /></Guarded>
                }
              />
              <Route
                path="/admin/translations"
                element={
                  <Guarded path="/admin/translations"><AdminTranslationsPage /></Guarded>
                }
              />
              <Route path="*" element={<HomeRedirect />} />
            </Route>
          </Route>
        </SentryRoutes>
      </AuthProvider>
    </Router>
  );
}
