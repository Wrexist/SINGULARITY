import { useState } from "react";
import { codexEntries, codexUnlockedCount, codexBalance, codexBody, codexUnlockHint } from "../engine/codex";
import { LockIcon, ChevronIcon } from "./Icons";
import type { GameState } from "../engine/types";

interface Props {
  game: GameState;
}

/**
 * Field Notes (Codex) — a collapsible satirical encyclopedia that fills in as you
 * hit milestones. Pure flavor + a low-key collection chase; collapsed by default
 * so it never gets in the way. Locked entries show what unlocks them.
 */
export function CodexPanel({ game }: Props) {
  const [open, setOpen] = useState(false);
  // The header count is cheap; the full entry list (with per-entry body templating)
  // is only built while the panel is actually open (this renders at 10Hz).
  const views = open ? codexEntries(game) : [];
  const got = codexUnlockedCount(game);
  const total = codexBalance.entries.length;

  return (
    <section className={`panel collapsible codex ${open ? "open" : ""}`}>
      {/* The same fold row as every other HQ board (Collapsible), not a third style. */}
      <button className="collapsible-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title" style={{ margin: 0 }}>Field Notes</span>
        <span className="collapsible-badge">{got}/{total}</span>
        <span className="chevron" aria-hidden="true"><ChevronIcon size={13} dir={open ? "up" : "down"} /></span>
      </button>
      {open && (
        <div className="codex-list">
          {got === total && (
            <p className="panel-capstone">Collection complete — the field notes are officially a memoir.</p>
          )}
          {views.map(({ entry, unlocked }) => (
            <div className={`codex-entry ${unlocked ? "" : "locked"}`} key={entry.id}>
              <div className="codex-entry-title">
                {unlocked ? entry.title : <><LockIcon size={12} /> Locked</>}
              </div>
              <div className="codex-entry-body">
                {unlocked ? codexBody(game, entry) : codexUnlockHint(entry)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
