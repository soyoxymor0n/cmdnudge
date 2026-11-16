import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Overlay from "./Overlay";
import "./app.css";

// The same bundle serves the main window and the hold-Command overlay window (#44).
const isOverlay = new URLSearchParams(window.location.search).get("view") === "overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <Overlay /> : <App />}</React.StrictMode>,
);
