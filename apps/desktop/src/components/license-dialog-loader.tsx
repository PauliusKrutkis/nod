import { LicenseDialog as LicenseDialogView } from "@nod/ui/license-dialog";
import { useState } from "react";
import {
  useLicenseState,
  useSetLicenseState,
} from "../hooks/use-license-state.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { api } from "../lib/api.ts";
import type { LicenseState } from "../types.ts";

/**
 * The destination behind both palette entries ("Activate my license" and
 * "Check my license"); the view is license-dialog, catalogued in @nod/ui.
 * Nothing renders until the license query resolves — the read is a local
 * file plus a signature check, and a dialog that opened on the fallback face
 * for one frame would flash "state unknown" at everyone.
 *
 * Activation runs the same backend command as the purchase card: the
 * loopback listener and token verification are already built, and the call
 * stays pending for as long as the browser sign-in takes. Success is written
 * straight into the shared license-state query, so the open dialog flips to
 * "License active" the moment the listener resolves — that flip is the whole
 * confirmation. Closing during the wait must stay possible (checkout can
 * take many minutes), and a dismissed dialog's pending activation still
 * resolves into the shared query.
 */
export function LicenseDialogLoader({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const license = useLicenseState();

  if (!(open && license)) {
    return null;
  }

  return <LicenseDialogLoaderContent license={license} onClose={onClose} />;
}

function LicenseDialogLoaderContent({
  license,
  onClose,
}: {
  license: LicenseState;
  onClose: () => void;
}) {
  const setLicenseState = useSetLicenseState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useHotkeys(
    "license",
    [{ description: "Close", hidden: true, keys: "esc", run: onClose }],
    { enabled: true }
  );

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      setLicenseState(await api.activateLicense());
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  };

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  return (
    <LicenseDialogView
      busy={busy}
      daysLeft={license.status === "trial" ? license.daysLeft : undefined}
      error={error}
      onActivate={activate}
      onOpenChange={onOpenChange}
      open
      status={license.status}
      updatesUntil={
        license.status === "licensed" ? license.updatesUntil : undefined
      }
    />
  );
}
