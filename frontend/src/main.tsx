import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

/*
 * Confirms that the HTML mounting point exists before React starts.
 * This provides a clear startup error if index.html is misconfigured.
 */
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The root element could not be found.");
}

/*
 * StrictMode enables additional development checks while rendering
 * the main DevTrack application.
 */
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);