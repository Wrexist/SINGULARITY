import { useRef } from "react";
import type { FiredWorldEvent } from "../state/store";
import { useDialog } from "./useDialog";
import { MegaphoneIcon, AlertTriangleIcon } from "./Icons";

interface Props {
  event: FiredWorldEvent;
  onDismiss: () => void;
  onChoose: (choiceIndex: number) => void;
}

/** The satire layer (GDD Phase 1): a breaking-news card when a world event fires.
 *  Faction events (Phase 2) present two choices; simple events just dismiss. */
export function WorldEventCard({ event, onDismiss, onChoose }: Props) {
  const hasChoices = !!event.choices && event.choices.length > 0;
  // A decision is required: with choices on the table Escape does nothing (the
  // backdrop doesn't dismiss either). A plain news card escapes like a tap.
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose: hasChoices ? undefined : onDismiss, labelledBy: "world-event-headline" });
  return (
    <div className="modal-backdrop" onClick={hasChoices ? undefined : onDismiss}>
      <div
        ref={ref}
        className={`modal world-modal world-${event.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="world-event-headline"
        aria-describedby="world-event-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="world-kicker">
          {event.tone === "good" ? <MegaphoneIcon size={15} /> : <AlertTriangleIcon size={15} />}
          BREAKING
        </div>
        <h2 id="world-event-headline" className="world-headline" tabIndex={-1}>{event.headline}</h2>
        <p id="world-event-body" className="world-body">{event.body}</p>

        {hasChoices ? (
          <div className="world-choices">
            {event.choices!.map((c, i) => (
              <button key={i} className="btn btn-ghost world-choice" onClick={() => onChoose(i)}>
                <span className="world-choice-label">{c.label}</span>
                <span className="world-choice-effect">{c.summary}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className={`world-effect ${event.tone}`}>{event.summary}</div>
            <button className="btn btn-primary" onClick={onDismiss}>
              {event.tone === "good" ? "Let's gooo" : "Deal with it"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
