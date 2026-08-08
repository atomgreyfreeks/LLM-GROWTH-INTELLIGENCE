import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// global reset — black ground, Helvetica, canvas owns the viewport
const css = document.createElement("style");
css.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; height: 100%; background: #000; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #fff; overflow: hidden; }
  a { color: inherit; }
  input[type=range] { -webkit-appearance: none; height: 2px; background: rgba(255,255,255,.16); outline: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 9px; height: 9px; background: #7df9ff; cursor: pointer; }
  button:hover { border-color: #7df9ff !important; }
  canvas { display: block; }
`;
document.head.appendChild(css);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
