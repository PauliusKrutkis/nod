/**
 * The card's contract is what it says and when it says it. Two things are
 * load-bearing: it stays absent until the trial has actually expired, and
 * once visible it tells an existing owner that the button labelled with a
 * price will restore rather than charge — the server treats buying and
 * re-activating as one flow (functions/auth/github/callback.ts), and without
 * that sentence nobody who has already paid will press a price to find out.
 *
 * The license hooks are mocked rather than wrapped in a QueryClientProvider:
 * the card's own behaviour is the subject, and its query key's cadence is
 * pinned by the hook's own tests.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LicenseState } from "../types.ts";

const BUY_BUTTON = /Buy Nod — \$59/;
const RESTORE_NOTE =
  /signing in restores your license instead of charging you/i;

const licenseState = vi.hoisted(() => ({
  current: undefined as LicenseState | undefined,
}));

vi.mock("../hooks/use-license-state.ts", () => ({
  useLicenseState: () => licenseState.current,
  useSetLicenseState: () => vi.fn(),
}));

vi.mock("../lib/api.ts", () => ({
  api: { activateLicense: vi.fn() },
}));

const { PurchasePrompt } = await import("./purchase-prompt.tsx");

afterEach(() => {
  cleanup();
  licenseState.current = undefined;
});

function renderWith(state: LicenseState | undefined) {
  licenseState.current = state;
  return render(<PurchasePrompt />);
}

describe("PurchasePrompt", () => {
  it("renders nothing while the trial is still running", () => {
    const { container } = renderWith({ status: "trial", daysLeft: 3 });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for someone who already holds a license", () => {
    const { container } = renderWith({
      status: "licensed",
      updatesUntil: "2027-08-07",
    });
    expect(container.innerHTML).toBe("");
  });

  it("tells an existing owner the price button restores instead of charging", () => {
    renderWith({ status: "trialExpired" });

    expect(screen.getByRole("button", { name: BUY_BUTTON })).toBeDefined();
    expect(screen.getByText(RESTORE_NOTE)).toBeDefined();
  });
});
