/**
 * LLM GROWTH INTELLIGENCE — entry.
 *   /                 redirects to the written overview of the whole project
 *   /?scene=<code>    one interactive scene alone, with its controls
 */
import "./scenes";
import { Harness } from "./harness/Harness";

export default function App() {
  const code = new URLSearchParams(window.location.search).get("scene");
  if (!code) {
    window.location.replace("/guide/overview.html");
    return null;
  }
  return <Harness code={code} />;
}
