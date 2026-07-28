import { DiagramCanvas } from "./DiagramCanvas";

/** Back-compat wrapper: markdown ```mermaid blocks render on the agent canvas. */
export function Mermaid({ chart }: { chart: string }) {
  return <DiagramCanvas chart={chart} label="MERMAID" />;
}
