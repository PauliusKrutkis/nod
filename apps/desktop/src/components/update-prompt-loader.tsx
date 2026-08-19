import { UpdatePrompt as UpdatePromptCard } from "@nod/ui/update-prompt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import {
  useLicenseState,
  useSetLicenseState,
} from "../hooks/use-license-state.ts";
import { api } from "../lib/api.ts";
import { queryKeys } from "../lib/query-client.ts";

/**
 * Container for the "update available" card. Checks the release feed on
 * launch, then every few hours and on window focus (best-effort — silent when
 * the feed is unreachable), so a long-running app still notices new releases.
 * The license state is part of the query key, so any transition — in-card
 * purchase, deep-link activation, trial expiring mid-session — re-derives
 * eligibility on its own; an install rejected by the backend gate also
 * invalidates, so the card recovers instead of retrying into the same error.
 *
 * In trialExpired the ineligible face yields entirely: PurchasePrompt owns
 * that state, and two differently-worded cards selling the same license would
 * race each other. That gate is here rather than in the card because it is a
 * decision about which of two surfaces the app is showing.
 *
 * `selfInstallable` comes off the backend's update info and rides through to
 * the card, which drops the install button when it is false. Opening the
 * downloads page is a shell call, so it stays here too.
 */

const RECHECK_MS = 4 * 60 * 60 * 1000;
const FOCUS_STALE_MS = 30 * 60 * 1000;
const PRICE = "$59";
function openDownloads() {
  openUrl(DOWNLOADS_URL).catch(() => undefined);
}

const DOWNLOADS_URL = "https://nodreview.com/downloads";

export function UpdatePromptLoader() {
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const license = useLicenseState();
  const setLicenseState = useSetLicenseState();
  const queryClient = useQueryClient();

  const licenseKey = license
    ? `${license.status}:${license.status === "licensed" ? license.updatesUntil : ""}`
    : "unknown";

  const { data: available } = useQuery({
    queryFn: () => api.checkForUpdate().catch(() => null),
    queryKey: queryKeys.appUpdate(licenseKey),
    refetchInterval: RECHECK_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: FOCUS_STALE_MS,
  });

  const update = dismissed ? null : (available ?? null);

  const install = async () => {
    setInstalling(true);
    setError(null);
    try {
      await api.installUpdate();
    } catch (e) {
      setError(String(e));
      setInstalling(false);
      await queryClient.invalidateQueries({ queryKey: ["app-update"] });
    }
  };

  const buyLicense = async () => {
    setPurchasing(true);
    setError(null);
    try {
      setLicenseState(await api.activateLicense());
    } catch (e) {
      setError(String(e));
    }
    setPurchasing(false);
  };

  if (!update) {
    return null;
  }
  if (!update.eligible && license?.status === "trialExpired") {
    return null;
  }

  return (
    <UpdatePromptCard
      currentVersion={update.currentVersion}
      eligible={update.eligible}
      error={error}
      installedAs={update.installedAs}
      installing={installing}
      notes={update.notes}
      onBuyLicense={buyLicense}
      onDismiss={() => setDismissed(true)}
      onInstall={install}
      onOpenDownloads={openDownloads}
      price={PRICE}
      purchasing={purchasing}
      selfInstallable={update.selfInstallable}
      updateCommand={update.updateCommand}
      version={update.version}
    />
  );
}
