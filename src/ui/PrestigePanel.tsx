import { useState } from "react";
import { canPrestige, legacyWeightsGain, legacyWeightsForMode, ascensionMultiplier, shipPath, nextRunMultiplier, shipWouldAscend, productSlotsAfterShip, type ShipMode } from "../engine/prestige";
import { legacyMultiplier } from "../engine/derive";
import { currentEra } from "../engine/eras";
import { reputationAvailable, nextRecordProgress } from "../engine/reputation";
import { legacyUnplugged } from "../engine/trials";
import { legacyTreeBalance, legacyAvailable, canBuyLegacyPerk } from "../engine/legacyTree";
import { productsUnlocked } from "../engine/products";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";
import { fmt, fmtMoney } from "./format";
import { Big } from "../engine/math/Big";
import { ReputationModal } from "./ReputationModal";
import { ConfirmSheet } from "./ConfirmSheet";
import { LandmarkIcon, RocketIcon, GlobeIcon, CoinIcon, SwordsIcon, MegaphoneIcon, ChevronIcon } from "./Icons";
import type { ReactNode } from "react";

/** Per-ship-mode icon (keyed by mode id; matches the engine's shipModes). */
const SHIP_MODE_ICON: Record<string, ReactNode> = {
  deploy: <RocketIcon size={20} />,
  open_source: <GlobeIcon size={20} />,
  sell: <CoinIcon size={20} />,
  hard: <SwordsIcon size={20} />,
  splash: <MegaphoneIcon size={20} />,
};

interface Props {
  game: GameState;
  onPrestige: (mode: ShipMode) => void;
  onBuyReputationPerk: (id: string) => void;
  onBuyEndowment: () => void;
  onPickDirective: (id: string) => void;
  onRespecDirective?: (id: string) => void;
  onBuyLegacyPerk: (id: string) => void;
}

/** A multiplier for display: two decimals while small, the compact format once big. */
const fmtMult = (m: Big) => (m.lt(100) ? m.toNumber().toFixed(2) : fmt(m));

/**
 * What a give-away ship (Open-source, Sell) pays "in exchange" for the model, as the
 * confirm sheet lists it — read from the numbers prestige() applies: the weights this
 * mode banks, the cash a Sell hands the fresh lab, Reputation, momentum, an ascension.
 * The cash used to be missing, so the Sell confirm offered "+10 Legacy weights" and
 * nothing else while the chooser card above it promised "+ $1200 cash".
 */
export function giveAwayTerms(game: GameState, mode: ShipMode): string {
  const m = balance.prestige.shipModes[mode];
  const kickstart = m.moneyKickstartPerShip * (game.prestige.ships + 1);
  return [
    `+${fmt(legacyWeightsForMode(game, mode))} Legacy weights`,
    kickstart > 0 ? `+${fmtMoney(Big.of(kickstart))} cash` : "",
    m.reputationBonus > 0 ? `+${m.reputationBonus} Reputation` : "",
    m.momentum ? "a momentum boost next run" : "",
    shipWouldAscend(game, mode) ? `an AGI ascension (+${Math.round(balance.eras.agi.bonusPerAscension * 100)}%)` : "",
  ].filter(Boolean).join(", ");
}

/** Smallest next-weight step, relative to the lifetime money it is measured against,
 *  that the timing bar can still resolve to about a percent (Big keeps ~15 digits). */
const TIMING_MIN_REL_STEP = 1e-12;

const legacyPerkName = (id?: string) => legacyTreeBalance.perks.find((p) => p.id === id)?.name ?? "a prerequisite";

export function PrestigePanel({ game, onPrestige, onBuyReputationPerk, onBuyEndowment, onPickDirective, onRespecDirective, onBuyLegacyPerk }: Props) {
  const [confirming, setConfirming] = useState(false);
  // A ship mode that discards the post-ship product draft gets an explicit
  // confirm (QW3) — the 4-word tag alone let players give the model away
  // without realising they'd land in the next run with nothing to launch.
  const [pendingMode, setPendingMode] = useState<ShipMode | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  // null = follow the default (open only while something in it is affordable).
  const [legacyOpen, setLegacyOpen] = useState<boolean | null>(null);
  const repPoints = reputationAvailable(game);
  const repOwned = game.reputation.perks.length;
  const ready = canPrestige(game);
  const gain = legacyWeightsGain(game);
  const have = game.prestige.legacyWeights;
  // The research the Ship actually needs, not the whole tree (see shipPath).
  const path = shipPath(game);
  const progress = path.total > 0 ? Math.min(100, (path.done / path.total) * 100) : 100;

  // AGI ascension (Post-Singularity era): a ship here past the Legacy floor is an
  // ascension — a permanent compounding boost. Judged per ship mode with prestige()'s
  // own gate (shipWouldAscend: mode multiplier × conviction), because near the floor
  // the modes disagree — Sell can fall short where Open-source clears it. The header
  // only promises an ascension every way to ship delivers; when they split, each
  // mode that ascends says so on its own button.
  const ascensions = game.stats.ascensions;
  const ascBoost = balance.eras.agi.bonusPerAscension;
  const inAgiEra = currentEra(game) >= 5;
  const shipModes = Object.values(balance.prestige.shipModes).filter((m) => game.prestige.ships >= m.unlockShips);
  const ascendingModes = new Set(shipModes.filter((m) => shipWouldAscend(game, m.id as ShipMode)).map((m) => m.id));
  const willAscend = ascendingModes.size > 0 && ascendingModes.size === shipModes.length;
  const mayAscend = ascendingModes.size > 0 && !willAscend;

  return (
    <section className="panel prestige">
      <h2 className="panel-title">Ship the Model</h2>
      {/* The explainer is first-run scaffolding — hide it once the player has shipped
          at least once (a veteran knows; the stats + mode buttons carry the numbers).
          2026-07 noise sweep. */}
      {game.prestige.ships === 0 && (
        <p className="prestige-blurb">
          Ship your flagship model to reset the lab and bank <b>Legacy Weights</b> —
          a permanent boost to everything, bigger the longer this run goes.
        </p>
      )}

      <div className="prestige-stats">
        {/* The multiplier derive() actually applies: diminishing in weights, and only
            the uninvested ones count. This used to show the linear 1 + 1.8% × weights. */}
        <span>Held weights: <b>{fmt(have)}</b> (×{fmtMult(legacyMultiplier(legacyAvailable(game)))}{legacyUnplugged(game) ? " · unplugged this run" : ""})</span>
        <span>Models shipped: <b>{game.prestige.ships}</b></span>
      </div>

      {(inAgiEra || ascensions > 0) && (
        <div className="agi-banner">
          <span className="agi-mark">✦</span>
          <div>
            <div className="agi-title">Post-Singularity · AGI</div>
            <div className="agi-sub">
              {ascensions} ascension{ascensions === 1 ? "" : "s"} · permanent ×{ascensionMultiplier(game).toFixed(2)} to all output
              {willAscend && <> · <b>next ship ascends (+{Math.round(ascBoost * 100)}%)</b></>}
              {mayAscend && <> · <b>next ship can ascend (+{Math.round(ascBoost * 100)}%)</b></>}
            </div>
          </div>
        </div>
      )}

      {!ready && (
        <>
          {/* The sentence sits above a slim bar, not inside it: at phone width it
              wrapped to two lines inside a 24px track and was clipped. */}
          <p className="ship-gate-label">
            <span>Build the Inference API to ship</span>
            <span className="ship-gate-count">{path.done}/{path.total} on the path</span>
          </p>
          <div className="progress slim">
            <div className="progress-fill money" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}

      {(repPoints > 0 || repOwned > 0) && (
        <button className="rep-strip" onClick={() => setRepOpen(true)}>
          <span className="rep-strip-mark rec-ring" style={{ ["--pct" as string]: nextRecordProgress(game) }}><LandmarkIcon size={16} /></span>
          <span className="rep-strip-text">Lab Reputation — <b>{repPoints}</b> point{repPoints === 1 ? "" : "s"} to spend{repOwned > 0 ? ` · ${repOwned} perk${repOwned === 1 ? "" : "s"} owned` : ""}</span>
          <span className="rep-strip-go">open ▸</span>
        </button>
      )}

      {/* Timing guidance (the classic idle "ship now or keep going?" decision): the
          weights you'd bank RIGHT NOW, and how close lifetime earnings are to the next
          whole weight — so the reset is an informed choice, not a shot in the dark.
          Pure display over legacyWeightsGain; weights diminish (exponent < 1), which the
          progress-to-next visibly encodes. */}
      {ready && !confirming && (() => {
        const exp = balance.prestige.exponent;
        const lAt = Big.of(balance.prestige.scale).mul(gain.pow(1 / exp));
        const lNext = Big.of(balance.prestige.scale).mul(gain.add(1).pow(1 / exp));
        const span = lNext.sub(lAt);
        // One weight's worth of money is ~2/gain of the lifetime figure, and Big keeps
        // ~15 significant digits: once a ship banks trillions of weights the step is
        // rounding noise (the bar read 0/50/100% at random, then pinned at 100% with
        // "you're close" for good). There is no honest progress to show, so no row.
        if (!span.gt(lNext.mul(TIMING_MIN_REL_STEP))) return null;
        const pct = Math.max(0, Math.min(1, game.lifetimeMoney.sub(lAt).div(span).toNumber()));
        return (
          <div className="prestige-timing">
            {/* Owns only the hold-vs-ship timing; the actual weight count is quoted
                authoritatively by the mode buttons below, so it's not restated here
                (2026-07 noise sweep). */}
            <div className="prestige-timing-row">
              <span>Progress to next Legacy Weight</span>
              <span className="prestige-timing-next">{Math.floor(pct * 100)}%</span>
            </div>
            <div className="prestige-timing-bar"><div className="prestige-timing-fill" style={{ width: `${pct * 100}%` }} /></div>
            {/* Only the ACTIONABLE half of this note survives (2026-08 noise sweep):
                "you're close, hold a moment" is advice the bar can't give on its own.
                The generic "weights have diminishing returns" paragraph was a
                restatement of the bar directly above it, shown on every single ship. */}
            {/* Always laid out, only shown at ≥80%: late-game weights arrive about once
                a second, and mounting/unmounting this line made the Ship button below
                jump ~30px every time the bar wrapped. */}
            <p className="prestige-timing-note" style={pct >= 0.8 ? undefined : { visibility: "hidden" }} aria-hidden={pct < 0.8}>
              You're close to your next weight — a little longer banks more.
            </p>
          </div>
        );
      })()}

      {!confirming ? (
        <button className={`btn btn-ship${willAscend ? " btn-ascend" : ""}`} disabled={!ready} onClick={() => setConfirming(true)}>
          {!ready ? "Locked — deploy a model first" : willAscend ? `✦ Ascend — choose how to ship` : `Ship — choose how`}
        </button>
      ) : (
        <div className="ship-choose">
          <div className="ship-choose-head">
            <span>How do you ship it?</span>
            <button className="link-btn" onClick={() => setConfirming(false)}>cancel</button>
          </div>
          <p className="ship-choose-tip">Resets Compute, Data, $, racks and research. Your team, products, achievements and Reputation stay.</p>
          {/* When the portfolio is already full, a kept draft can't be launched until a
              slot frees up — so the "keeps a product" perk is deferred, not immediate.
              Surfacing this stops the mature-portfolio trap where Deploy looks strictly
              better but its one edge (the draft) is parked while give-it-away modes bank
              legacy + Rep + momentum right now. */}
          {(() => {
            // Counted AFTER the Ship: a Trial it banks can pay a slot (Unplugged I), and a
            // draft the Ship itself makes room for is not parked.
            const slotsAfter = productSlotsAfterShip(game);
            const slotsFull = productsUnlocked(game) && game.products.active.length >= slotsAfter;
            return shipModes.map((m) => {
            const banked = legacyWeightsForMode(game, m.id as ShipMode);
            const kickstart = m.moneyKickstartPerShip * (game.prestige.ships + 1);
            return (
              <button key={m.id} className="ship-mode" onClick={() => {
                if (m.keepsDraft) { onPrestige(m.id as ShipMode); setConfirming(false); }
                else setPendingMode(m.id as ShipMode);
              }}>
                <span className="ship-mode-ic">{SHIP_MODE_ICON[m.id]}</span>
                <div className="ship-mode-text">
                  <div className="ship-mode-top">
                    <span className="ship-mode-label">{m.label}</span>
                    <span className="ship-mode-gain">+{fmt(banked)} weights</span>
                  </div>
                  <div className="ship-mode-next">
                    Legacy boost ×{fmtMult(legacyMultiplier(legacyAvailable(game)))} → ×{fmtMult(nextRunMultiplier(game, m.id as ShipMode))}
                  </div>
                  <span className="ship-mode-blurb">{m.blurb}</span>
                  <div className="ship-mode-tags">
                    {m.keepsDraft
                      ? (slotsFull
                          ? <span className="ship-tag warn">⧗ Draft parked — portfolio full ({game.products.active.length}/{slotsAfter})</span>
                          : <span className="ship-tag good">✓ Product to sell in Products</span>)
                      : <span className="ship-tag warn">✗ No product — you gave the model away</span>}
                    {kickstart > 0 && <span className="ship-tag good">+ {fmtMoney(Big.of(kickstart))} cash</span>}
                    {m.reputationBonus > 0 && <span className="ship-tag good">+ {m.reputationBonus} Reputation</span>}
                    {m.momentum && <span className="ship-tag good">+ momentum boost next run</span>}
                    {mayAscend && ascendingModes.has(m.id) && <span className="ship-tag good">✦ Ascends (+{Math.round(ascBoost * 100)}%)</span>}
                  </div>
                </div>
              </button>
            );
          });
          })()}
        </div>
      )}

      {pendingMode && (() => {
        const m = Object.values(balance.prestige.shipModes).find((x) => x.id === pendingMode);
        if (!m) return null;
        const perks = giveAwayTerms(game, pendingMode);
        return (
          <ConfirmSheet
            kicker="SHIP THE MODEL"
            title={`${m.label} — give the model away?`}
            body={`You will start the next generation with NO product draft to launch. In exchange: ${perks}.`}
            confirmLabel={m.label}
            danger
            onConfirm={() => { onPrestige(pendingMode); setPendingMode(null); setConfirming(false); }}
            onCancel={() => setPendingMode(null)}
          />
        );
      })()}
      {/* Legacy Investments sit BELOW the ship decision and fold: ten rows above the
          Ship button put the panel's primary action ~1.5 screens down. The fold opens
          by itself whenever something in it is affordable. */}
      {have.gt(0) && legacyTreeBalance.enabled && (() => {
        const buyable = legacyTreeBalance.perks.some((p) => canBuyLegacyPerk(game, p.id));
        const open = legacyOpen ?? buyable;
        return (
          <div className={`legacy-tree${open ? " open" : ""}`}>
            <button className="legacy-tree-head legacy-tree-toggle" onClick={() => setLegacyOpen(!open)} aria-expanded={open}>
              <span>Legacy Investments — <b>{fmt(legacyAvailable(game))}</b> weights free</span>
              <span className="chevron" aria-hidden="true"><ChevronIcon size={12} dir={open ? "up" : "down"} /></span>
            </button>
            {open && (
              <>
                <p className="legacy-tree-note">Invest to specialise a lane — but invested weights stop feeding your global boost.</p>
                {legacyTreeBalance.perks.map((p) => {
                  const owned = game.legacyInvestments.includes(p.id);
                  const can = canBuyLegacyPerk(game, p.id);
                  const lockedByReq = !!p.requires && !game.legacyInvestments.includes(p.requires);
                  return (
                    <button key={p.id} className={`legacy-perk ${owned ? "owned" : ""}`} disabled={owned || !can} onClick={() => { setLegacyOpen(true); onBuyLegacyPerk(p.id); }}>
                      {/* Pin the fold open on a buy, so spending the last affordable
                          weight doesn't snap the list shut under the player's thumb. */}
                      <div className="legacy-perk-main">
                        <span className="legacy-perk-name">{p.name}{owned ? " ✓" : ""}</span>
                        <span className="legacy-perk-desc">{p.desc}</span>
                        {lockedByReq && <span className="legacy-perk-req">needs {legacyPerkName(p.requires)}</span>}
                      </div>
                      <span className="legacy-perk-cost">{owned ? "owned" : `${p.cost} wt`}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        );
      })()}

      {repOpen && <ReputationModal game={game} onBuy={onBuyReputationPerk} onBuyEndowment={onBuyEndowment} onPickDirective={onPickDirective} {...(onRespecDirective ? { onRespecDirective } : {})} onClose={() => setRepOpen(false)} />}
    </section>
  );
}
