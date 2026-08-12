import { Globe2, MailQuestion } from "lucide-react";

import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";

export interface RegionBlockedPageProps {
  /** Optional support address from env (`VITE_SUPPORT_EMAIL`). */
  supportEmail?: string;
  /** Extra explanation from the server, when present. */
  detail?: string;
}

export function RegionBlockedPage({
  supportEmail = "support@e-pay.et",
  detail,
}: RegionBlockedPageProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-br from-[#5700FF]/5 via-fuchsia-50/40 to-transparent px-6 dark:from-[#5700FF]/15 dark:via-fuchsia-950/30">
      <div className="max-w-lg text-center">
        <ZemenEPosLogo className="mx-auto mb-6 h-6 w-auto text-foreground" />
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-[#5700FF]/10 text-[#5700FF]">
          <Globe2 className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Service unavailable in your region
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {detail
            ? detail
            : "Access to EIRMS×Zemen-ePos isn't available for your current network location. If you believe this is a mistake — for instance you're behind a corporate VPN — please contact support and we'll help sort it out."}
        </p>
        <a
          href={`mailto:${supportEmail}?subject=${encodeURIComponent(
            "Region access issue",
          )}`}
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <MailQuestion className="size-4" />
          Contact {supportEmail}
        </a>
      </div>
    </div>
  );
}
