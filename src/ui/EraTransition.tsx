import { eraName, eraBlurb } from "../engine/eras";

interface Props {
  era: number;
  onDone: () => void;
}

/**
 * Era tentpole moment (GDD §5: "era transitions are full-screen events — the
 * hall re-skins, a satirical press release pops"). Fires when the lab crosses
 * into a new era. The room behind has already re-skinned; this announces it.
 */
export function EraTransition({ era, onDone }: Props) {
  return (
    <div className="modal-backdrop era-backdrop" onClick={onDone}>
      <div className="modal era-modal" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker">NEW ERA</div>
        <h2 className="era-title">{eraName(era)}</h2>
        <div className="era-press">
          <span className="era-press-tag">PRESS RELEASE</span>
          <p>{eraBlurb(era)}</p>
        </div>
        <button className="btn btn-primary" onClick={onDone}>
          Onwards &amp; upwards
        </button>
      </div>
    </div>
  );
}
