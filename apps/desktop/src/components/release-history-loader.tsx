import { ReleaseHistory as ReleaseHistoryView } from "@nod/ui/release-history";
import { useArmedRing } from "@nod/ui/use-armed-ring";
import { useQuery } from "@tanstack/react-query";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { api } from "../lib/api.ts";
import { compareVersions, releasesQuery } from "../lib/releases.ts";
import { Markdown } from "./markdown-loader.tsx";

/**
 * Query, hotkey and armed-ring wiring for the version timeline; the view is
 * release-history, catalogued in @nod/ui. Which release is "current" is a
 * version comparison, not a string match — the running version reports as
 * "1.4.0" while releases are tagged "v1.4.0" — so the tag is resolved here
 * and handed over already decided. Notes are rendered through the app's
 * Markdown, which needs the Tauri opener for links and a sanitiser for
 * embedded HTML; both stay on this side of the boundary.
 */

const ARM_ORDER: (null | "close")[] = [null, "close"];

function renderNotes(notes: string) {
  return <Markdown>{notes}</Markdown>;
}

export function ReleaseHistoryLoader({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { armed, cycle } = useArmedRing(ARM_ORDER, null);

  useHotkeys(
    "release-history",
    [
      {
        description: "Previous action",
        hidden: true,
        keys: "shift+tab",
        run: () => cycle(-1),
      },
      {
        description: "Next action",
        hidden: true,
        keys: "tab",
        run: () => cycle(1),
      },
      {
        description: "Activate",
        hidden: true,
        keys: "enter",
        run: () => {
          if (armed === "close") {
            onClose();
          }
        },
      },
      { description: "Close", hidden: true, keys: "esc", run: () => onClose() },
    ],
    { enabled: open }
  );

  const { data: releases } = useQuery({ ...releasesQuery, enabled: open });
  const { data: version } = useQuery({
    enabled: open,
    queryFn: () => api.getAppVersion(),
    queryKey: ["app-version"],
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  const currentTag =
    version === undefined
      ? null
      : (releases?.find((r) => compareVersions(r.tag, version) === 0)?.tag ??
        null);

  return (
    <ReleaseHistoryView
      closeArmed={armed === "close"}
      currentTag={currentTag}
      onOpenChange={onOpenChange}
      open={open}
      releases={releases}
      renderNotes={renderNotes}
    />
  );
}
