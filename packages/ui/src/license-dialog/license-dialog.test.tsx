/**
 * The derived catalog suite proves the fixtures render; what needs naming out
 * loud is the behavior a redesign could paraphrase away: the action label is
 * "I already bought this" (the reader's own words, not "Activate"), it is
 * wired and disappears entirely once licensed, an unparseable updatesUntil is
 * shown verbatim rather than as "Invalid Date", and the singular day does not
 * read "1 days".
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicenseDialog } from "./license-dialog.tsx";

const BOUGHT_BUTTON = /I already bought this/;
const WAITING_BUTTON = /Waiting for the browser/;

afterEach(cleanup);

const noop = () => {
  return;
};

const base = {
  busy: false,
  error: null,
  onActivate: noop,
  onOpenChange: noop,
  open: true,
};

describe("LicenseDialog", () => {
  it("offers the bought-this action in evaluation and wires it", () => {
    const onActivate = vi.fn();
    render(
      <LicenseDialog
        {...base}
        daysLeft={9}
        onActivate={onActivate}
        status="trial"
      />
    );

    expect(
      screen.getByText("9 days left. Nod is free to evaluate.")
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: BOUGHT_BUTTON }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("uses the singular on the last evaluation day", () => {
    render(<LicenseDialog {...base} daysLeft={1} status="trial" />);
    expect(
      screen.getByText("1 day left. Nod is free to evaluate.")
    ).toBeDefined();
  });

  it("hides the action once licensed and answers the check instead", () => {
    render(
      <LicenseDialog {...base} status="licensed" updatesUntil="2027-03-12" />
    );

    expect(screen.getByText("License active")).toBeDefined();
    expect(screen.queryByRole("button", { name: BOUGHT_BUTTON })).toBeNull();
  });

  it("shows an unparseable updatesUntil verbatim", () => {
    render(
      <LicenseDialog {...base} status="licensed" updatesUntil="whenever" />
    );
    expect(screen.getByText("Updates until whenever.")).toBeDefined();
  });

  it("degrades an unseen status to a readable sentence with the action", () => {
    render(<LicenseDialog {...base} status="teamSeat" />);

    expect(screen.getByText("License state unknown")).toBeDefined();
    expect(
      screen.getByText('This build does not recognize the state "teamSeat".')
    ).toBeDefined();
    expect(screen.getByRole("button", { name: BOUGHT_BUTTON })).toBeDefined();
  });

  it("disables the action while the browser wait runs", () => {
    render(<LicenseDialog {...base} busy status="trialExpired" />);
    const button = screen.getByRole("button", { name: WAITING_BUTTON });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
