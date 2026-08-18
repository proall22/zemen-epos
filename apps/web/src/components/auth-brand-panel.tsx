import { FileCheck2, LockKeyhole, Store } from "lucide-react";

import { ZemenEPosLogo } from "@/components/brand/zemen-epos-logo";

export function AuthBrandPanel({
  registration = false,
}: {
  registration?: boolean;
}) {
  return (
    <aside className="hidden min-h-svh bg-[#111827] text-white lg:flex lg:flex-col">
      <div className="flex flex-1 flex-col justify-between p-10 xl:p-12">
        <ZemenEPosLogo mono className="h-8 w-auto self-start text-white" />

        <div className="max-w-sm space-y-7">
          <div>
            <p className="text-sm font-medium text-white/65">
              E-invoicing, quietly handled.
            </p>
            <p className="mt-3 text-xl font-semibold leading-8 tracking-tight">
              Manage sales, inventory, payments, and business operations from
              one place.
            </p>
          </div>

          <ul className="space-y-4 text-sm leading-6 text-white/75">
            <li className="flex gap-3">
              <Store className="mt-0.5 size-4 shrink-0 text-white" />
              <span>Manage branches, users, and daily transactions.</span>
            </li>
            <li className="flex gap-3">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-white" />
              <span>
                Secure access with email verification and two-step sign-in.
              </span>
            </li>
            {registration && (
              <li className="flex gap-3">
                <FileCheck2 className="mt-0.5 size-4 shrink-0 text-white" />
                <span>
                  Registration documents are reviewed before account activation.
                </span>
              </li>
            )}
          </ul>
        </div>

        <p className="text-xs text-white/45">
          © {new Date().getFullYear()} Zemen ePOS
        </p>
      </div>
    </aside>
  );
}
