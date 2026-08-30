/**
 * The row shares the inbox row's two-line truncation problem with three
 * unbounded strings of its own (topic, subject, the chip run), so the
 * hostile cases are the same family: unbreakable tokens, bidi, markup as
 * text, and the chip cap doing its job at eleven and at four hundred. The
 * zero-counts case pins the pluralizer at the boundary the meta line
 * claims.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { LedgerRow, type LedgerRowGroup } from "./ledger-row.tsx";

const noop = () => {
  return;
};

const UNBREAKABLE = "x".repeat(2000);

function group(overrides: Partial<LedgerRowGroup>): LedgerRowGroup {
  return {
    chips: ["#348", "#358", "4e43d2a"],
    deltaSince: null,
    files: 9,
    lines: 319,
    regions: 12,
    subject: "feat(chat): the AI chat panel — chat, skills, and suggestions",
    topic: "chat-panel",
    ...overrides,
  };
}

export const ledgerRowEntry = defineEntry(LedgerRow, {
  "chip-flood": {
    props: {
      group: group({
        chips: Array.from({ length: 400 }, (_, i) => `#${i + 100}`),
      }),
      onOpen: noop,
      selected: false,
    },
  },
  "chips-capped": {
    props: {
      group: group({
        chips: [
          "#375",
          "#376",
          "#377",
          "#378",
          "#379",
          "#380",
          "#381",
          "5a76234",
          "d3535ff",
          "742bc3e",
          "#347",
        ],
      }),
      onOpen: noop,
      selected: false,
    },
  },
  delta: {
    props: {
      group: group({ deltaSince: "319aa0f" }),
      onOpen: noop,
      selected: false,
    },
  },
  "markup-as-text": {
    props: {
      group: group({
        subject: '<img src=x onerror="alert(1)"> stays text',
        topic: "<b>not-bold</b>",
      }),
      onOpen: noop,
      selected: false,
    },
  },
  "no-chips-no-subject": {
    props: {
      group: group({ chips: [], subject: "" }),
      onOpen: noop,
      selected: false,
    },
  },
  overflow: {
    props: {
      group: group({ subject: UNBREAKABLE, topic: UNBREAKABLE }),
      onOpen: noop,
      selected: true,
    },
  },
  selected: {
    props: { group: group({}), onOpen: noop, selected: true },
  },
  singular: {
    props: {
      group: group({ files: 1, lines: 1, regions: 1 }),
      onOpen: noop,
      selected: false,
    },
  },
  typical: {
    props: { group: group({}), onOpen: noop, selected: false },
  },
  unicode: {
    props: {
      group: group({
        subject: "藤本 さくら merged محمد الأمين's stack 👨‍👩‍👧‍👦🎉",
        topic: "国际化-rtl",
      }),
      onOpen: noop,
      selected: false,
    },
  },
  "zero-counts": {
    props: {
      group: group({ chips: [], files: 0, lines: 0, regions: 0 }),
      onOpen: noop,
      selected: false,
    },
  },
});
