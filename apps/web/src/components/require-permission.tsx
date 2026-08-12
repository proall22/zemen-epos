import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { landingRoute, routeAllows, type NavRoute } from "@/lib/nav";

/**
 * Route guard. Without it a hidden nav entry was only hidden — the page still
 * rendered for anyone who typed the URL, kept a bookmark, or pressed back, and
 * then filled with 403s from every request it made.
 *
 * The server is still the authority; this exists so the refusal is a clear
 * message instead of a broken screen.
 */
export function RequirePermission({
  route,
  children,
}: {
  route: Pick<NavRoute, "perm" | "anyOf">;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (routeAllows(route, can)) return <>{children}</>;
  return <NoAccess />;
}

export function NoAccess() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const home = landingRoute(can);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
        <Lock className="size-5" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          {t("access.deniedTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("access.deniedBody")}
        </p>
      </div>
      {home && (
        <Button asChild variant="outline" size="sm">
          <Link to={home}>{t("access.backToWork")}</Link>
        </Button>
      )}
    </div>
  );
}
