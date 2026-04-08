import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // When a new SW takes over, prompt user to reload
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          // Show a non-blocking banner instead of an alert
          const banner = document.createElement("div");
          banner.id = "guber-update-banner";
          banner.style.cssText = [
            "position:fixed", "bottom:80px", "left:50%", "transform:translateX(-50%)",
            "z-index:99999", "background:#000", "border:1px solid rgba(255,255,255,0.15)",
            "border-radius:16px", "padding:12px 20px", "display:flex", "align-items:center",
            "gap:12px", "box-shadow:0 4px 24px rgba(0,0,0,0.6)", "font-family:Oxanium,sans-serif",
            "font-size:13px", "color:#fff", "max-width:calc(100vw - 32px)",
          ].join(";");
          banner.innerHTML = `
            <span>GUBER updated</span>
            <button onclick="window.location.reload()" style="
              background:#22C55E;color:#000;border:none;border-radius:8px;
              padding:5px 14px;font-weight:700;font-family:Oxanium,sans-serif;
              font-size:12px;cursor:pointer;white-space:nowrap;
            ">Reload</button>
            <button onclick="this.parentNode.remove()" style="
              background:transparent;border:none;color:rgba(255,255,255,0.4);
              font-size:18px;cursor:pointer;padding:0 2px;line-height:1;
            ">×</button>
          `;
          document.body.appendChild(banner);
        });

        // Check for updates every 5 minutes while the app is open
        setInterval(() => registration.update(), 5 * 60 * 1000);
      })
      .catch(() => {});
  });
}
