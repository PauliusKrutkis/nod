import { PurchasePrompt as PurchasePromptCard } from "@nod/ui/purchase-prompt";
import { useState } from "react";
import {
  useLicenseState,
  useSetLicenseState,
} from "../hooks/use-license-state.ts";
import { api } from "../lib/api.ts";

/**
 * Container for the purchase card: the license subscription, the activation
 * command, and the once-per-launch dismissal. The card itself is props-pure
 * in @nod/ui and decides on its own that only "trialExpired" paints — this
 * side only has to hand it a status, so a license state nobody here has seen
 * yet still fails closed.
 *
 * Buy opens checkout in the browser and the backend command stays pending
 * until the activation listener receives a verified token, so success lands
 * here as the resolved license state and is written straight into the shared
 * license-state query. Later stays enabled during the wait (checkout can take
 * many minutes, and abandoning it must not trap the card on screen); a
 * dismissed card's pending activation still resolves into the shared query.
 */

const PRICE = "$59";

export function PurchasePromptLoader() {
  const [dismissed, setDismissed] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const license = useLicenseState();
  const setLicenseState = useSetLicenseState();

  if (dismissed) {
    return null;
  }

  const buy = async () => {
    setPurchasing(true);
    setError(null);
    try {
      setLicenseState(await api.activateLicense());
    } catch (e) {
      setError(String(e));
    }
    setPurchasing(false);
  };

  return (
    <PurchasePromptCard
      busy={purchasing}
      error={error}
      onBuy={buy}
      onDismiss={() => setDismissed(true)}
      price={PRICE}
      status={license?.status ?? "unknown"}
    />
  );
}
