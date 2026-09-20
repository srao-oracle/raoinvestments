import { describe, it, expect } from "vitest";
import { validateRecommendation, type RecommendationInput } from "./guardrails";

const base = (over: Partial<RecommendationInput>): RecommendationInput => ({
  structure: "long_call",
  legs: [],
  net_debit: 100,
  max_loss: 100,
  sizing: { shares_or_contracts: 1, collateral_required: 0 },
  ...over,
});

describe("validateRecommendation", () => {
  it("passes a long call (debit, bounded loss)", () => {
    const r = validateRecommendation(
      base({
        structure: "long_call",
        legs: [{ right: "call", action: "buy_to_open", strike: 250, expiry: "2026-12-18" }],
        net_debit: 500,
        max_loss: 500,
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("passes a covered call (credit ok; not a debit structure)", () => {
    const r = validateRecommendation(
      base({
        structure: "covered_call",
        legs: [{ right: "call", action: "sell_to_open", strike: 260, expiry: "2026-12-18" }],
        net_debit: -300,
        max_loss: 10000,
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("passes a fully cash-secured put", () => {
    const r = validateRecommendation(
      base({
        structure: "cash_secured_put",
        legs: [{ right: "put", action: "sell_to_open", strike: 100, expiry: "2026-12-18" }],
        net_debit: -150,
        max_loss: 10000,
        sizing: { shares_or_contracts: 1, collateral_required: 10000 },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a naked short call", () => {
    const r = validateRecommendation(
      base({
        structure: "long_call",
        legs: [{ right: "call", action: "sell_to_open", strike: 250, expiry: "2026-12-18" }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.violations.map((x) => x.code)).toContain("naked_short_call");
  });

  it("rejects an under-collateralized cash-secured put", () => {
    const r = validateRecommendation(
      base({
        structure: "cash_secured_put",
        legs: [{ right: "put", action: "sell_to_open", strike: 100, expiry: "2026-12-18" }],
        sizing: { shares_or_contracts: 1, collateral_required: 5000 },
      }),
    );
    expect(r.violations.map((x) => x.code)).toContain("insufficient_collateral");
  });

  it("rejects a short put outside a CSP", () => {
    const r = validateRecommendation(
      base({
        structure: "long_put",
        legs: [{ right: "put", action: "sell_to_open", strike: 100, expiry: "2026-12-18" }],
      }),
    );
    expect(r.violations.map((x) => x.code)).toContain("uncollateralized_short_put");
  });

  it("rejects a debit structure that is a net credit", () => {
    const r = validateRecommendation(base({ structure: "long_call", net_debit: -50 }));
    expect(r.violations.map((x) => x.code)).toContain("unexpected_credit");
  });
});
