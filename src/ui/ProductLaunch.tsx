interface Props {
  name: string;
  typeName: string;
  onDone: () => void;
}

/** A short, randomized satirical launch blurb. Pure (no Date.now/Math.random in
 *  the engine — this is UI flavor only, so a render-time pick is fine). */
const BLURBS = [
  "is now in general availability. Analysts are calling it \"a product that exists.\"",
  "ships today. The roadmap is a vibe, but the launch is real.",
  "is live. Three competitors quietly updated their pitch decks.",
  "enters the market. Twitter has Opinions. The waitlist is, regrettably, gone.",
  "is GA. A VC has already asked if it's \"AI-native enough.\" It is.",
  "launches to a grateful and slightly confused public.",
];

export function ProductLaunch({ name, typeName, onDone }: Props) {
  // Stable per-mount pick without engine-forbidden randomness: hash the name.
  const blurb = BLURBS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % BLURBS.length]!;
  return (
    <div className="modal-backdrop era-backdrop" onClick={onDone}>
      <div className="modal era-modal" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker">PRODUCT LAUNCH</div>
        <h2 className="era-title">{name}</h2>
        <div className="era-press">
          <span className="era-press-tag">{typeName.toUpperCase()}</span>
          <p><b>{name}</b> {blurb}</p>
        </div>
        <button className="btn btn-primary" onClick={onDone}>
          Ship it 🚀
        </button>
      </div>
    </div>
  );
}
