import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (
  import.meta.env.PROD &&
  import.meta.env.VITE_DESKTOP !== "1" &&
  "serviceWorker" in navigator
)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
