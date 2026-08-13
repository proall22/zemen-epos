import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronLeft,
  LogOut,
  Menu,
  ShieldCheck,
} from "lucide-react";

import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";
import { BranchSwitcherCard } from "@/components/layout/branch-switcher-card";
import { ThemeCustomizer } from "@/components/theme-customizer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { NAV_ROUTES, NAV_SECTIONS, routeAllows } from "@/lib/nav";
import { listLanguagesPublic, type Language } from "@/lib/resources";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "eirms:sidebar:collapsed";

export function AppShell() {
  const { t } = useTranslation();
  const { can, merchant, user, consentSession, branch } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const sidebarRole = user?.role === "ADMIN" ? "BRANCH_ADMIN" : user?.role;

  // ── Collapsible sidebar state ───────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // ── Visible nav groups ──────────────────────────────────────────────────
  const visibleGroups = NAV_SECTIONS.map((sectionKey) => ({
    sectionKey,
    items: NAV_ROUTES.filter(
      (r) =>
        (isSuperAdmin
          ? (r.superAdminSectionKey ?? r.sectionKey) === sectionKey &&
            !r.hideForPlatformAdmin
          : r.sectionKey === sectionKey) &&
        (!r.sidebarRoles || (!!sidebarRole && r.sidebarRoles.includes(sidebarRole))) &&
        routeAllows(r, can),
    ),
  })).filter((g) => g.items.length > 0);

  // ── Merchant status banners ─────────────────────────────────────────────
  const rejected = merchant !== null && merchant.rejectedAt !== null;
  const pendingApproval =
    merchant !== null && merchant.approvedAt === null && !rejected;
  const disabledAfterApproval =
    merchant !== null && merchant.approvedAt !== null && !merchant.active;

  return (
    <div className="flex h-svh bg-background text-foreground print:block print:h-auto print:bg-white">
      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "group/sidebar relative flex shrink-0 flex-col border-r border-border/60 bg-card transition-[width] duration-200 ease-out print:hidden",
          collapsed ? "w-[68px]" : "w-[280px]",
        )}
      >
        {/* Brand */}
        <Brand collapsed={collapsed} onToggle={toggleSidebar} />

        {/* Branch switcher — hidden in icon-only mode */}
        {!collapsed && <BranchSwitcherCard />}

        {/* Navigation */}
        <nav
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2.5 py-4"
          aria-label="Main navigation"
        >
          {visibleGroups.map((group) => (
            <div key={group.sectionKey} className="mb-4 flex flex-col gap-0.5">
              {/* Section label — hide when collapsed */}
              {!collapsed && (
                <span className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                  {t(group.sectionKey)}
                </span>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={
                    collapsed
                      ? t(
                        isSuperAdmin && item.superAdminLabelKey
                          ? item.superAdminLabelKey
                          : item.labelKey,
                      )
                      : undefined
                  }
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-[10px] transition-all duration-150",
                      collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                      isActive
                        ? "bg-[var(--sidebar-active)] text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "size-[18px] shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                          collapsed && "mx-auto",
                        )}
                      />
                      {!collapsed && (
                        <span className="text-[13.5px] leading-none">
                          {t(
                            isSuperAdmin && item.superAdminLabelKey
                              ? item.superAdminLabelKey
                              : item.labelKey,
                          )}
                        </span>
                      )}
                      {/* Active indicator bar */}
                      {isActive && !collapsed && (
                        <span className="ml-auto h-4 w-[3px] rounded-full bg-primary opacity-70" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <Footer collapsed={collapsed} />

        {/* Collapse toggle — floating button at bottom of sidebar */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "absolute -right-3 top-20 z-30 flex size-6 items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground shadow-card transition-all duration-200 hover:bg-muted hover:text-foreground",
          )}
        >
          <ChevronLeft
            className={cn(
              "size-3.5 transition-transform duration-200",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </aside>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <main className="flex flex-1 min-w-0 flex-col overflow-auto bg-background print:overflow-visible print:bg-white">
        {consentSession && <ConsentBanner />}
        {rejected && (
          <div className="flex items-start gap-3 border-b border-destructive/20 bg-[#FEF2F2] px-6 py-3 print:hidden">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-destructive">
                {t("appShell.rejectedTitle")}
              </p>
              <p className="text-xs text-destructive/80">
                {merchant?.rejectionReason
                  ? t("appShell.rejectedBodyWithReason", {
                    reason: merchant.rejectionReason,
                  })
                  : t("appShell.rejectedBodyNoReason")}
              </p>
            </div>
          </div>
        )}
        {(pendingApproval || disabledAfterApproval) && (
          <div className="flex items-start gap-3 border-b border-warning/20 bg-[#FFFBEB] px-6 py-3 print:hidden">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-foreground">
                {t(
                  pendingApproval
                    ? "appShell.pendingTitle"
                    : "appShell.disabledTitle",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  pendingApproval
                    ? "appShell.pendingBody"
                    : "appShell.disabledBody",
                )}
              </p>
            </div>
          </div>
        )}
        <Outlet key={branch?.id ?? "no-branch"} />
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Brand({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex h-[64px] shrink-0 items-center border-b border-border/60",
        collapsed ? "justify-center px-3" : "gap-3 px-5",
      )}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="flex size-9 items-center justify-center rounded-[10px] text-foreground hover:bg-muted transition-colors"
        >
          <Menu className="size-5" />
        </button>
      ) : (
        <>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
            <ZemenEPosLogo className="h-4 w-auto" />
          </div>
          <div className="flex min-w-0 flex-col leading-none">
            <span className="text-[14px] font-semibold tracking-tight text-foreground">
              Zemen-ePos
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              MOR · EIRMS
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Sticky consent banner — shown when a SUPER_ADMIN is acting inside a
 *  merchant under an active consent grant. */
function ConsentBanner() {
  const { t } = useTranslation();
  const { consentSession, exitMerchant } = useAuth();
  const [remaining, setRemaining] = useState(() =>
    consentSession
      ? Math.max(0, new Date(consentSession.expiresAt).getTime() - Date.now())
      : 0,
  );

  useEffect(() => {
    if (!consentSession) return;
    const tick = () =>
      setRemaining(
        Math.max(0, new Date(consentSession.expiresAt).getTime() - Date.now()),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [consentSession]);

  if (!consentSession) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const countdown =
    hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-primary/20 bg-[#EEF2FF] px-6 py-2.5 print:hidden">
      <div className="flex items-center gap-2 text-sm">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span className="font-medium text-foreground">
          {t("consent.bannerActing", {
            merchant: consentSession.merchantName,
          })}
        </span>
        <span className="text-muted-foreground">
          · {t("consent.bannerExpiresIn")}{" "}
          <span className="font-mono tabular-nums">{countdown}</span>
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={exitMerchant}
        className="h-8 gap-1.5 text-xs"
      >
        <LogOut className="size-3.5" />
        {t("consent.bannerExit")}
      </Button>
    </div>
  );
}

function Footer({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { user, logout, language, setLanguage, merchant, branch } = useAuth();
  const [enabledLanguages, setEnabledLanguages] = useState<Language[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listLanguagesPublic()
      .then((list) => {
        if (!cancelled) setEnabledLanguages(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const switcherLanguages: Language[] =
    enabledLanguages.length > 0
      ? enabledLanguages
      : [
        {
          code: "en",
          name: "English",
          nativeName: "EN",
          active: true,
          ordering: 10,
          createdAt: "",
          updatedAt: "",
        },
        {
          code: "am",
          name: "Amharic",
          nativeName: "አማ",
          active: true,
          ordering: 20,
          createdAt: "",
          updatedAt: "",
        },
      ];

  const display =
    user?.name?.trim() || user?.email?.split("@")[0] || t("common.signedIn");
  const roleLabel = user?.role ? user.role.replace("_", " ").toLowerCase() : "";
  const tin = merchant?.tin?.trim() ?? "";
  const systemNumber = branch?.systemNumber?.trim() ?? "";

  if (collapsed) {
    // Icon-only footer: just the logout button
    return (
      <div className="flex flex-col items-center gap-2 border-t border-border/60 px-2 py-3">
        <button
          type="button"
          onClick={logout}
          aria-label={t("common.signOut")}
          title={t("common.signOut")}
          className="flex size-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-border/60 px-4 py-4">
      {/* TIN / POS identifiers */}
      {(tin || systemNumber) && (
        <p className="font-mono text-[10px] text-muted-foreground/70">
          {tin && <>TIN&nbsp;{tin}</>}
          {tin && systemNumber && " · "}
          {systemNumber && <>POS&nbsp;{systemNumber}</>}
        </p>
      )}

      {/* Language switcher */}
      <div
        className="flex items-center gap-1 rounded-[10px] border border-border/60 bg-muted/50 p-1"
        role="group"
        aria-label={t("language.switcherLabel")}
      >
        {switcherLanguages.map((lang) => (
          <LangButton
            key={lang.code}
            active={language === lang.code}
            onClick={() => void setLanguage(lang.code)}
            label={lang.nativeName}
          />
        ))}
      </div>

      {/* User identity + logout */}
      {user && (
        <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border/60 bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium text-foreground">
              {display}
            </span>
            <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {roleLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeCustomizer />
            <button
              type="button"
              onClick={logout}
              aria-label={t("common.signOut")}
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LangButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-[8px] px-2 py-1 text-[11px] font-medium transition-all duration-150",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
