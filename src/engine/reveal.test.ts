import { describe, it, expect } from "vitest";
import { Big } from "./math/Big";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { labReveal } from "./reveal";
import { advisorItems } from "./advisor";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/** A lab that can Ship: the capability node owned and a run's worth of earnings. */
function shippable(): GameState {
  const s = createInitialState();
  s.research = [balance.research[0]!.id, balance.prestige.capabilityResearch];
  s.resources = { compute: Big.of(1e6), data: Big.of(1e5), money: Big.of(1e6) };
  s.lifetimeMoney = Big.of(1e9);
  return s;
}

describe("Lab reveal gates", () => {
  it("a first-generation lab still reveals in waves", () => {
    const fresh = createInitialState();
    expect(labReveal(fresh)).toEqual({ research: false, prestige: false, market: false, staff: false });

    const paid = { ...fresh, resources: { ...fresh.resources, data: Big.of(5) } };
    expect(labReveal(paid)).toEqual({ research: true, prestige: false, market: false, staff: false });

    const researched = { ...paid, research: [balance.research[0]!.id] };
    expect(labReveal(researched)).toEqual({ research: true, prestige: true, market: true, staff: true });
  });

  it("a Ship keeps every surface the lab has already opened", () => {
    // A Ship zeroes Data and research. Keyed on those alone, HQ and Research vanished
    // at the start of every generation until the first payout — and the Ship panel,
    // home of Lab Reputation, the Endowment and Legacy Investments, until the first
    // research node — right when the first Ship's toast says to spend weights there.
    const post = prestige(shippable());
    expect(post.prestige.ships).toBe(1);
    expect(post.research).toEqual([]);
    expect(post.resources.data.eq(0)).toBe(true);
    expect(labReveal(post)).toEqual({ research: true, prestige: true, market: true, staff: true });
  });

  it("never sends an advisor chip to a Team tab that isn't drawn", () => {
    // Staff survive the Ship and keep drawing wages; the fresh lab earns nothing yet,
    // so the payroll warning fires with tab "employees". The Team tab was hidden until
    // the first research, so tapping the chip landed nowhere.
    const s = shippable();
    s.employees = [{
      id: "emp-1", name: "E", roleId: balance.staff.roles[0]!.id, level: 1, trait: null,
      assignedProductId: null, training: null,
    }];
    const post = prestige(s);
    const teamItems = advisorItems(post).filter((it) => it.tab === "employees");
    expect(teamItems.length).toBeGreaterThan(0);
    expect(labReveal(post).staff).toBe(true);
  });
});
