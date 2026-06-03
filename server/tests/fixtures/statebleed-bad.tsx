// Fixture for the contextual logic auditor regression test.
// This deliberately reproduces the state-bleed bug class: a string-literal mode
// selector whose per-mode fields are NOT reset when the mode changes.
// It lives outside the scanned source dirs so it only runs when targeted.
import { useState } from "react";

export default function BadModeForm() {
  const [mode, setMode] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");

  return (
    <div>
      <button type="button" onClick={() => setMode("alpha")}>alpha</button>
      <button type="button" onClick={() => setMode("beta")}>beta</button>
      <button type="button" onClick={() => setMode("gamma")}>gamma</button>

      {mode === "alpha" && (
        <input value={a} onChange={(e) => setA(e.target.value)} />
      )}
      {mode === "beta" && (
        <input value={b} onChange={(e) => setB(e.target.value)} />
      )}
      {mode === "gamma" && (
        <input value={c} onChange={(e) => setC(e.target.value)} />
      )}
    </div>
  );
}
