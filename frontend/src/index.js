// ── Suppress ResizeObserver loop warnings (multi-chart resize, harmless) ──
const _RO = "ResizeObserver loop";
window.addEventListener("error", (e) => {
  if (e.message?.includes(_RO)) { e.stopImmediatePropagation(); e.preventDefault(); return false; }
}, true);
const _origErr = console.error;
console.error = (...args) => {
  if (typeof args[0] === "string" && args[0].includes(_RO)) return;
  _origErr.apply(console, args);
};
window.onerror = function(msg) { if (typeof msg === "string" && msg.includes(_RO)) return true; };

import React from 'react';
import ReactDOM from 'react-dom/client';
import AnalyticalTerminal from "./analytical_terminal";

// Quantum Terminal is free and open source: no sign-in, straight to the terminal.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AnalyticalTerminal />);
