import { ComputeIcon, DataIcon, MoneyIcon } from "./Icons";

interface Props {
  onDone: () => void;
}

const STEPS = [
  { cssVar: "--compute", icon: <ComputeIcon />, name: "Compute", desc: "Your racks make it for free. Spend it to start training runs." },
  { cssVar: "--data", icon: <DataIcon />, name: "Data", desc: "Runs produce it. It fuels the research tree." },
  { cssVar: "--money", icon: <MoneyIcon />, name: "$", desc: "Runs and products earn it. Buy more racks. Repeat." },
];

/** One-screen first-run welcome. Skippable, shown exactly once (clean-to-play). */
export function Onboarding({ onDone }: Props) {
  return (
    <div className="modal-backdrop">
      <div className="modal onboard" onClick={(e) => e.stopPropagation()}>
        <h2>Welcome to Singularity Inc.</h2>
        <p className="modal-sub">
          You raised a seed round and rented a server closet. Time to build God —
          or at least a profitable API. Three resources, one loop:
        </p>
        <div className="onboard-steps">
          {STEPS.map((s) => (
            <div key={s.name} className="onboard-step" style={{ ["--c" as string]: `var(${s.cssVar})` }}>
              <span className="onboard-icon">{s.icon}</span>
              <div>
                <b>{s.name}</b>
                <span>{s.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="onboard-foot">
          Climb the research tree, then <b>Ship the Model</b> to reset with permanent boosts.
          New panels reveal themselves as you grow — no manual required.
        </p>
        <button className="btn btn-primary" onClick={onDone}>
          Start the grind
        </button>
      </div>
    </div>
  );
}
