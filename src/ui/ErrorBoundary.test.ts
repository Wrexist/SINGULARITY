import { describe, it, expect } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// No jsdom/RTL in this project, so we can't mount+throw; but the load-bearing logic
// is the static catch → state mapping (render is a trivial conditional over it).
describe("ErrorBoundary", () => {
  it("captures a thrown error into state (getDerivedStateFromError)", () => {
    const err = new Error("boom");
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });

  it("starts with no error", () => {
    // A fresh instance renders its children (error === null) until one is caught.
    const inst = new ErrorBoundary({ children: null });
    expect(inst.state.error).toBeNull();
  });
});
