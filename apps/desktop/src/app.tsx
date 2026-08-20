import { Kbd } from "@nod/ui/kbd";
import { Spinner } from "@nod/ui/spinner";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { AiSetupLoader } from "./components/ai-setup-loader.tsx";
import { CannedCommentsLoader } from "./components/canned-comments-loader.tsx";
import { CommandPaletteCommands } from "./components/command-palette-commands.tsx";
import { GlobalSearch } from "./components/global-search.tsx";
import { Inbox } from "./components/inbox/inbox.tsx";
import { IssueTrackerSettings } from "./components/issue-tracker-settings.tsx";
import { KeyboardHelp } from "./components/keyboard-help.tsx";
import { Ledger } from "./components/ledger/ledger.tsx";
import { LicenseDialogLoader } from "./components/license-dialog-loader.tsx";
import { NotificationCenterLoader } from "./components/notification-center-loader.tsx";
import { OfflineBarLoader } from "./components/offline-bar-loader.tsx";
import { PurchasePromptLoader } from "./components/purchase-prompt-loader.tsx";
import { ReleaseHistoryLoader } from "./components/release-history-loader.tsx";
import { ReviewScreen } from "./components/review/review-screen.tsx";
import { ReviewNotifier } from "./components/review-notifier.tsx";
import { TokenGateFlow } from "./components/token-gate-flow.tsx";
import { UpdatePromptLoader } from "./components/update-prompt-loader.tsx";
import { WhatsNewLoader } from "./components/whats-new-loader.tsx";
import { takeLaunchPrTarget, useDeepLinkPr } from "./hooks/use-deep-link-pr.ts";
import { useGlobalBindings } from "./keyboard/use-global-bindings.ts";
import { api } from "./lib/api.ts";
import { applyZoom, loadZoom } from "./lib/zoom.ts";
import { loadLastRoute, type Route, useAppStore } from "./store/app-store.ts";

const CHROME_ROUTES: ReadonlySet<Route["name"]> = new Set([
  "inbox",
  "ledger",
  "review",
]);

function baseScopeFor(name: Route["name"]): "inbox" | "ledger" | "review" {
  return name === "review" || name === "ledger" ? name : "inbox";
}

export default function App() {
  const route = useAppStore((s) => s.route);
  const ledgerSessionOpen = useAppStore((s) => s.ledgerSessionOpen);
  const setRoute = useAppStore((s) => s.setRoute);
  const setAccounts = useAppStore((s) => s.setAccounts);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const inboxPaneVisible = useAppStore((s) => s.inboxPaneVisible);
  const aiSetupOpen = useAppStore((s) => s.aiSetupOpen);
  const closeAiSetup = useAppStore((s) => s.closeAiSetup);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);

  const dismissToast = () => {
    setToast(null);
  };
  const openTracker = () => {
    setTrackerOpen(true);
  };
  const closeTracker = () => {
    setTrackerOpen(false);
  };
  const openHistory = () => {
    setHistoryOpen(true);
  };
  const closeHistory = () => {
    setHistoryOpen(false);
  };
  const openLicense = () => {
    setLicenseOpen(true);
  };
  const closeLicense = () => {
    setLicenseOpen(false);
  };
  const closeNotifications = () => {
    setNotificationsOpen(false);
  };
  const toggleNotifications = () => {
    setNotificationsOpen((v) => !v);
  };
  const openCannedDialog = () => {
    setCannedOpen(true);
  };
  const closeCanned = () => {
    setCannedOpen(false);
  };
  const runToastAction = () => {
    toast?.action?.();
    setToast(null);
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const z = loadZoom();
    if (z !== 1) {
      applyZoom(z);
    }
  }, []);

  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    function onScroll(e: Event) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) {
        return;
      }
      el.classList.add("is-scrolling");
      const t = timers.get(el);
      if (t) {
        window.clearTimeout(t);
      }
      timers.set(
        el,
        window.setTimeout(() => el.classList.remove("is-scrolling"), 800)
      );
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, []);

  useEffect(() => {
    api
      .hasToken()
      .then(async (has) => {
        if (!has) {
          setRoute({ name: "token" });
          return;
        }
        const launch = await takeLaunchPrTarget();
        if (launch) {
          useAppStore
            .getState()
            .openReview(launch.owner, launch.repo, launch.number);
          return;
        }
        setRoute(loadLastRoute() ?? { name: "inbox" });
      })
      .catch(() => setRoute({ name: "token" }));
    api
      .listAccounts()
      .then(setAccounts)
      .catch(() => undefined);
  }, [setRoute, setAccounts]);

  useDeepLinkPr();

  useGlobalBindings({
    openCanned: openCannedDialog,
    openHistory,
    openLicense,
    openTracker,
    toggleNotifications,
  });

  const baseScope =
    route.name === "ledger" && ledgerSessionOpen
      ? "ledger-session"
      : baseScopeFor(route.name);
  const showRouteChrome = CHROME_ROUTES.has(route.name);

  const isMac = navigator.userAgent.includes("Macintosh");

  return (
    <div
      className="q-canvas flex h-full flex-col"
      data-pane={inboxPaneVisible ? "detail" : "none"}
      data-route={route.name}
    >
      {isMac && <div className="q-titlebar shrink-0" data-tauri-drag-region />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {route.name === "loading" && (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading…" />
          </div>
        )}
        {route.name === "token" && <TokenGateFlow />}
        {route.name === "inbox" && <Inbox />}
        {route.name === "ledger" && <Ledger />}
        {route.name === "review" && (
          <ReviewScreen
            key={`${route.owner}/${route.repo}#${route.number}`}
            routeKey={`${route.owner}/${route.repo}#${route.number}`}
          />
        )}
      </div>

      <div aria-live="polite" className="qb-stack qb-stack-host">
        {showRouteChrome ? (
          <>
            <UpdatePromptLoader />
            <WhatsNewLoader onShowHistory={openHistory} />
            <ReviewNotifier />
            <PurchasePromptLoader />
            <OfflineBarLoader />
          </>
        ) : null}
        {!!toast && (
          <div className="qb-toast" role="alert">
            <span aria-hidden className="qb-toast-rail" />
            <div className="qb-toast-body">
              <div className="qb-toast-head">
                <span className="qb-toast-title">{toast.title}</span>
                <button
                  aria-label="Dismiss"
                  className="qb-x"
                  onClick={dismissToast}
                  type="button"
                >
                  <X aria-hidden size={14} />
                </button>
              </div>
              <div className="qb-toast-sub break-words">{toast.message}</div>
              {!!(toast.action || toast.note) && (
                <div className="qb-toast-actions">
                  {!!toast.action && (
                    <button
                      className="qb-toast-open"
                      onClick={runToastAction}
                      type="button"
                    >
                      {toast.actionLabel ?? "Undo"} <Kbd combo="z" />
                    </button>
                  )}
                  {!!toast.note && (
                    <span className="text-faint text-xs">{toast.note}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <CannedCommentsLoader onClose={closeCanned} open={cannedOpen} />
      <IssueTrackerSettings onClose={closeTracker} open={trackerOpen} />
      <AiSetupLoader onClose={closeAiSetup} open={aiSetupOpen} />
      <LicenseDialogLoader onClose={closeLicense} open={licenseOpen} />
      <ReleaseHistoryLoader onClose={closeHistory} open={historyOpen} />
      <NotificationCenterLoader
        onClose={closeNotifications}
        open={notificationsOpen}
      />
      <CommandPaletteCommands baseScope={baseScope} />
      <KeyboardHelp baseScope={baseScope} />
      {showRouteChrome ? <GlobalSearch /> : null}
    </div>
  );
}
