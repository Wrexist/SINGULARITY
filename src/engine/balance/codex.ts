/**
 * Field Notes (Codex) — a satirical, unlock-as-you-go encyclopedia of the AI
 * industry. Pure flavor: each entry unlocks when a lifetime stat crosses a
 * threshold (so it's DERIVED from the stats store — nothing extra to persist).
 * The satire wedge gets a home, and the player gets a low-key collection to fill.
 */

export type CodexMetric =
  | "totalShips"
  | "ascensions"
  | "openSourceShips"
  | "productsLaunched"
  | "employeesHired"
  | "peakComputePerSec"
  | "peakMau"
  | "peakMrr"
  | "worldEventsResolved"
  | "peakResearchCount";

export interface CodexEntry {
  id: string;
  title: string;
  /** The satirical lore, revealed once unlocked. */
  body: string;
  metric: CodexMetric;
  threshold: number;
}

export const codex = {
  entries: [
    { id: "closet", title: "The Closet Years", body: "Every lab starts in a rented box that smells of warm plastic and ambition. The compute hums; the landlord does not know what a GPU is. This is the golden age, and you will spend the rest of the game trying to get back to how simple it felt.", metric: "totalShips", threshold: 0 },
    { id: "first_run", title: "On the Training Run", body: "You feed the machine compute; it returns data and money and a faint sense that it understood the assignment. Nobody is entirely sure what it learned. This is considered normal.", metric: "peakComputePerSec", threshold: 100 },
    { id: "the_ship", title: "Shipping the Model", body: "To 'ship' is to declare a model finished, which it never is. You bank the lessons (Legacy Weights), wipe the lab, and start again — wiser, faster, and somehow with the same problems.", metric: "totalShips", threshold: 1 },
    { id: "data_wars", title: "The Data Wars", body: "Everyone insists their data is clean. Everyone's data is a landfill with a nice UI. The Bazaar exists because someone, somewhere, will sell you a terabyte of raccoon photos labelled 'reasoning'.", metric: "productsLaunched", threshold: 1 },
    { id: "regulators", title: "Regulatory Theatre", body: "A hearing is scheduled. Slides are made. A founder says 'we take safety extremely seriously' into a microphone, then expenses lunch. Heat goes up, then down, then up.", metric: "worldEventsResolved", threshold: 5 },
    { id: "talent", title: "The Talent Market", body: "Researchers are signed like athletes and quit like cats. Pay them too little and they leave; pay them too much and they leave anyway, but in a nicer car.", metric: "employeesHired", threshold: 5 },
    { id: "scaling", title: "Scaling Laws", body: "It turns out the trick was 'more'. More compute, more data, more electricity than a mid-sized country. The bitter lesson is bitter mostly to the people paying the power bill.", metric: "peakComputePerSec", threshold: 1_000_000 },
    { id: "open_weights", title: "Open Weights", body: "You gave the model away and the internet improved it overnight, then used it for things you will not describe to investors. The community loves you. You are broke but beloved.", metric: "openSourceShips", threshold: 1 },
    { id: "pmf", title: "Product-Market Fit (Allegedly)", body: "A million people use your model daily. Thirty-five of them pay. This is described in the deck as 'enormous monetisation upside'.", metric: "peakMau", threshold: 1_000_000 },
    { id: "factions", title: "The Doomers and the Boomers", body: "One camp wants to slow down before it ends the world; the other wants to speed up before someone else ends the world first. They are, unsettlingly, both at the same party.", metric: "worldEventsResolved", threshold: 15 },
    { id: "hyperscale", title: "The Hyperscalers", body: "At some point the company stops buying racks and starts buying substations. The data centre has its own weather. Somewhere, a spreadsheet quietly becomes a power utility.", metric: "totalShips", threshold: 5 },
    { id: "unicorn", title: "Unicorn Status", body: "Revenue per second now exceeds what most startups raise in a seed round. The press calls it 'inevitable'. They called it 'a toy' eighteen months ago. Nobody remembers.", metric: "peakMrr", threshold: 10_000 },
    { id: "rsi", title: "Recursive Self-Improvement", body: "The model starts suggesting improvements to itself, and they're good. The team debates whether to be excited or to back away slowly. They choose 'ship it'.", metric: "peakResearchCount", threshold: 15 },
    { id: "singularity", title: "Post-Singularity", body: "The graphs go vertical. The board asks what comes after exponential. Marketing suggests 'Singularity Inc. Plus'. The model, politely, has other ideas.", metric: "ascensions", threshold: 1 },
    { id: "agi", title: "AGI, Probably", body: "You've ascended more than once now, which raises the awkward question of what, exactly, keeps shipping. You don't ask. It seems happy. The quarterly numbers are extraordinary.", metric: "ascensions", threshold: 3 },
  ] satisfies CodexEntry[],
};
