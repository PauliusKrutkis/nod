/**
 * Drawer mode for the review screen: one slot, two faces. `a` opens the Ask
 * panel when an AI key is configured and falls through to the setup dialog
 * when it isn't (docs/AI.md — the keybind is the discovery point). `i` always
 * means the info panel: pressed while Ask is showing it switches the mode in
 * place instead of toggling the drawer shut.
 */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { useAppStore } from "../store/app-store.ts";
import { useLatest } from "./use-latest.ts";

export function useAskPanel(args: {
  rightOpenRef: RefObject<boolean>;
  setRightOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const [panelMode, setPanelMode] = useState<"info" | "ask">("info");
  const panelModeRef = useLatest(panelMode);

  const askAi = () => {
    api
      .getAiConfig()
      .then((aiInfo) => {
        if (!aiInfo.configured) {
          useAppStore.getState().openAiSetup();
          return;
        }
        setPanelMode("ask");
        args.setRightOpen(true);
      })
      .catch(() => useAppStore.getState().openAiSetup());
  };

  const setInfoOpenFromKey: Dispatch<SetStateAction<boolean>> = (update) => {
    if (args.rightOpenRef.current && panelModeRef.current === "ask") {
      setPanelMode("info");
      return;
    }
    setPanelMode("info");
    args.setRightOpen(update);
  };

  return { askAi, panelMode, setInfoOpenFromKey };
}
