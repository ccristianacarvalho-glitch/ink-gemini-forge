import { createFileRoute } from "@tanstack/react-router";
import { AnnotationCanvas } from "@/components/AnnotationCanvas";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Render Studio — Annotation Canvas" },
      {
        name: "description",
        content:
          "Premium GoodNotes-style annotation canvas with pen, highlighter, eraser, text, arrow and rectangle tools.",
      },
      { property: "og:title", content: "Render Studio — Annotation Canvas" },
      {
        property: "og:description",
        content: "Annotate images with a precise, high-contrast Swiss-styled canvas.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <AnnotationCanvas />;
}
