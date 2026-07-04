import { Portal } from "./Portal";

interface Props {
  kicker: string;
  title: string;
  body?: string;
  confirmLabel: string;
  /** Tint the confirm action for a destructive choice. */
  danger?: boolean;
  /** Info-style sheets (single acknowledge button) hide the cancel action. */
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app confirm dialog (same shell as ExpandConfirm) for destructive actions.
 *  Replaces `window.confirm`, which renders a jarring native panel on iOS and —
 *  being synchronous — freezes the game loop, so the next tick after dismissal
 *  advanced by the whole time the dialog sat open. */
export function ConfirmSheet({ kicker, title, body, confirmLabel, danger, hideCancel, onConfirm, onCancel }: Props) {
  return (
    <Portal>
      <div className="modal-backdrop" onClick={onCancel}>
        <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <div className="confirm-kicker">{kicker}</div>
          <h2>{title}</h2>
          {body && <p className="modal-sub">{body}</p>}
          <div className="confirm-actions">
            {!hideCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
            <button className={`btn btn-primary${danger ? " btn-danger" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
