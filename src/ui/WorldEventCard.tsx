import type { FiredWorldEvent } from "../state/store";

interface Props {
  event: FiredWorldEvent;
  onDismiss: () => void;
}

/** The satire layer (GDD Phase 1): a breaking-news card when a world event fires. */
export function WorldEventCard({ event, onDismiss }: Props) {
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className={`modal world-modal world-${event.tone}`} onClick={(e) => e.stopPropagation()}>
        <div className="world-kicker">{event.tone === "good" ? "📣 BREAKING" : "⚠️ BREAKING"}</div>
        <h2 className="world-headline">{event.headline}</h2>
        <p className="world-body">{event.body}</p>
        <div className={`world-effect ${event.tone}`}>{event.summary}</div>
        <button className="btn btn-primary" onClick={onDismiss}>
          {event.tone === "good" ? "Let's gooo" : "Deal with it"}
        </button>
      </div>
    </div>
  );
}
