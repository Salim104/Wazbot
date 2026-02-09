import { describe, it, expect } from "vitest";
import { PLANS } from "../constants/plans";

describe("WazBot Plan Limits", () => {
  it("should have correct FREE plan limits", () => {
    expect(PLANS.FREE.MAX_CONTACTS).toBe(20);
    expect(PLANS.FREE.MAX_ANNOUNCEMENTS).toBe(2);
  });

  it("should have correct PRO plan limits", () => {
    expect(PLANS.PRO.MAX_CONTACTS).toBe(500);
    expect(PLANS.PRO.MAX_ANNOUNCEMENTS).toBe(20);
  });
});
