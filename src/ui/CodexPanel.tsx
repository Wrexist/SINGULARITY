import { useState } from "react";
import { codexEntries, codexUnlockedCount, codexBalance } from "../engine/codex";
import { BookIcon, LockIcon } from "./Icons";
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
  const views = codexEntries(game);
  const got = codexUnlockedCount(game);
  const total = codexBalance.entries.length;

  return (
    <section className="panel codex">
      <button className="codex-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="codex-title"><BookIcon size={15} /> Field Notes</span>
        <span className="codex-count">{got}/{total}</span>
        <span className="codex-toggle">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="codex-list">
          {views.map(({ entry, unlocked }) => (
            <div className={`codex-entry ${unlocked ? "" : "locked"}`} key={entry.id}>
              <div className="codex-entry-title">
                {unlocked ? entry.title : <><LockIcon size={12} /> Locked</>}
              </div>
              <div className="codex-entry-body">
                {unlocked ? entry.body : `Unlocks as your lab grows.`}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
