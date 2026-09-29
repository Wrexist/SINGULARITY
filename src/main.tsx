import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import "./ui/styles.css";
import { startAppearance } from "./ui/appearance";

// Before the first render, so a Dark player never sees a light flash.
startAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
