import { DiagramCanvas } from "./DiagramCanvas";

/** Back-compat wrapper: markdown ```mermaid blocks render on the agent canvas. */
import { memo } from "react";

function MermaidImpl({ chart }: { chart: string }) {
  return <DiagramCanvas chart={chart} label="MERMAID" />;
}

export const Mermaid = memo(MermaidImpl, (a, b) => a.chart === b.chart);
