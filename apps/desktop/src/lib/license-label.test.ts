import { describe, expect, it } from "vitest";
import { licenseCommandLabel } from "./license-label.ts";

describe("licenseCommandLabel", () => {
  it("offers activation during a trial, when nothing is licensed yet", () => {
    expect(licenseCommandLabel({ status: "trial", daysLeft: 9 })).toBe(
      "Activate my license"
    );
  });

  it("offers activation once the trial has expired", () => {
    expect(licenseCommandLabel({ status: "trialExpired" })).toBe(
      "Activate my license"
    );
  });

  it("offers activation before the first state has loaded", () => {
    expect(licenseCommandLabel(undefined)).toBe("Activate my license");
  });

  it("answers with the update window for a holder", () => {
    const label = licenseCommandLabel({
      status: "licensed",
      updatesUntil: "2027-08-07T00:00:00.000Z",
    });
    expect(label).toContain("License active. Updates until");
    expect(label).toContain("2027");
  });

  it("shows an unparseable date verbatim rather than Invalid Date", () => {
    expect(
      licenseCommandLabel({ status: "licensed", updatesUntil: "whenever" })
    ).toBe("License active. Updates until whenever");
  });
});
