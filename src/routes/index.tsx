import { createFileRoute } from "@tanstack/react-router";

import { ArchVizStudioApp } from "@/features/studio/ArchVizStudioApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArchViz AI Studio" },
      {
        name: "description",
        content:
          "Professional AI render studio for architectural visualization and interior design.",
      },
      { property: "og:title", content: "ArchViz AI Studio" },
      {
        property: "og:description",
        content:
          "Project-based ArchViz rendering, prompt generation, version history and before-after review.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <ArchVizStudioApp />;
}
