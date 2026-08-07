/**
 * The palette's license entry, assembled as one binding.
 *
 * It is a hook rather than an inline binding in app.tsx because it needs the
 * license query and the toast store, and App is already at the size React
 * Doctor complains about.
 *
 * One entry covers both readings. A holder has nothing to activate, so the
 * label states their update window and running it repeats that as a toast
 * instead of opening a browser. Everyone else gets the activation flow, which
 * blocks in Rust for as long as checkout takes, so it announces itself on the
 * way out: without that a user who missed the browser opening has no signal it
 * fired, runs it again, and collides with the listener already waiting.
 */
import { KeyRound } from "lucide-react";
import type { Binding } from "../keyboard/types.ts";
import { api } from "../lib/api.ts";
import { licenseCommandLabel } from "../lib/license-label.ts";
import { useAppStore } from "../store/app-store.ts";
import { useLicenseState, useSetLicenseState } from "./use-license-state.ts";

export function useLicenseCommand(): Binding {
  const license = useLicenseState();
  const setLicenseState = useSetLicenseState();
  const setToast = useAppStore((s) => s.setToast);

  const run = async () => {
    if (license?.status === "licensed") {
      setToast({ message: licenseCommandLabel(license), title: "License" });
      return;
    }
    setToast({
      message: "Finish in the browser window that just opened.",
      title: "Waiting for activation",
    });
    try {
      setLicenseState(await api.activateLicense());
      setToast({
        message: "Nod is licensed on this machine.",
        title: "Activated",
      });
    } catch (e) {
      setToast({ message: String(e), title: "Activation failed" });
    }
  };

  return {
    description: licenseCommandLabel(license),
    global: true,
    group: "General",
    icon: KeyRound,
    keys: [],
    run,
  };
}
