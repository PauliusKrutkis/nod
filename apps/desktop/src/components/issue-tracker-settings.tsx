import { IssueTrackerDialog as IssueTrackerDialogView } from "@nod/ui/issue-tracker-dialog";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { useAppStore } from "../store/app-store.ts";

/**
 * Store and hotkey wiring for tracker configuration; the view is
 * issue-tracker-dialog, catalogued in @nod/ui. The tracker URL is per
 * account, so the view is keyed on the account plus its saved value: when
 * either changes the field remounts with the right starting text instead of
 * showing the previous account's URL.
 */
export function IssueTrackerSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const current = useAppStore((s) =>
    s.activeAccountId ? (s.issueTrackers[s.activeAccountId] ?? "") : ""
  );
  const setIssueTracker = useAppStore((s) => s.setIssueTracker);

  useHotkeys(
    "issue-tracker",
    [{ description: "Close", hidden: true, keys: "esc", run: () => onClose() }],
    { enabled: open }
  );

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  const onSave = (url: string) => {
    if (activeAccountId) {
      setIssueTracker(activeAccountId, url);
    }
  };

  return (
    <IssueTrackerDialogView
      key={`${activeAccountId ?? "none"}:${current}`}
      onOpenChange={onOpenChange}
      onSave={onSave}
      open={open}
      value={current}
    />
  );
}
