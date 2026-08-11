/**
 * What the card says is its contract, and one sentence carries the whole
 * risk: the button is labelled with a price, and someone who has already
 * paid will not press a price unless the card tells them signing in restores
 * instead of charging (the server treats buying and re-activating as one
 * flow — functions/auth/github/callback.ts). The derived catalog suite proves
 * the fixtures render; only copy this specific needs naming out loud, so it
 * cannot be paraphrased away in a redesign.
 *
 * When the card stays silent is proved by the rendersNothing fixtures, not
 * here.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PurchasePrompt } from "./purchase-prompt.tsx";

const BUY_BUTTON = /Buy Nod · \$59/;
const RESTORE_NOTE =
  /Signing in restores your license instead of charging you/i;

afterEach(cleanup);

const noop = () => {
  return;
};

describe("PurchasePrompt", () => {
  it("tells an existing owner the price button restores instead of charging", () => {
    render(
      <PurchasePrompt
        busy={false}
        error={null}
        onBuy={noop}
        onDismiss={noop}
        price="$59"
        status="trialExpired"
      />
    );

    expect(screen.getByRole("button", { name: BUY_BUTTON })).toBeDefined();
    expect(screen.getByText(RESTORE_NOTE)).toBeDefined();
  });
});
