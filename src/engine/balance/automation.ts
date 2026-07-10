/**
 * Automation (IDEAS #C) — mid/late-game "let the AI run the lab" toggles. Each is unlocked
 * by ship count (you earn the right to automate a chore once you've mastered it), then
 * switched on/off freely. When on, the store applies it each tick, removing the tedium of
 * a loop you already understand.
 *
 * CURVE-SAFE: every toggle defaults OFF and the balance sim never turns one on (it ships
 * `deploy` and does its own greedy thing), so automation is invisible to the tuned curve.
 */
export interface AutomationDef {
  id: string;
  name: string;
  desc: string;
  /** Icon registry key (resolved to an SVG in the UI — see iconRegistry). */
  icon: string;
  /** Ships required before this automation can be switched on. */
  unlockShips: number;
}

export const automation = {
  enabled: true,
  list: [
    { id: "auto_objectives", name: "Objective Autopilot", desc: "Met Lab Objectives are claimed the instant they complete.", icon: "target", unlockShips: 2 },
    { id: "auto_launch", name: "Launch Autopilot", desc: "A freshly-shipped model is commercialised into any free product slot.", icon: "rocket", unlockShips: 3 },
    { id: "auto_assign", name: "HR Autopilot", desc: "New specialists are posted to a product they synergize with.", icon: "hr", unlockShips: 4 },
    { id: "auto_upgrade", name: "Version Autopilot", desc: "A product that falls behind rivals starts its next version when you can afford it.", icon: "wrench", unlockShips: 5 },
    { id: "auto_contracts", name: "Contract Autopilot", desc: "Met contracts are claimed for their Reputation automatically.", icon: "doc", unlockShips: 6 },
  ] as AutomationDef[],
  /** The whole panel reveals with the first automation. */
  revealAtShips: 2,
  /** Names for auto-launched products, cycled by launch count. */
  names: ["Nimbus", "Oracle", "Cortex", "Lumen", "Vertex", "Sage", "Atlas", "Echo", "Prism", "Nova", "Helix", "Quasar", "Onyx", "Cirrus"],
};
