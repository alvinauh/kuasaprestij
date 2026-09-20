import { useEffect, useId, useState } from "react";

/**
 * Renders an LLM-authored Mermaid definition to an SVG diagram.
 * Mermaid is lazy-imported (large lib) so it only loads when a slide actually
 * has a diagram. Invalid definitions (LLMs sometimes emit them) render nothing
 * and fire `onError` so the caller can fall back to a photo / plain text.
 */
interface Props {
  code: string;
  className?: string;
  onError?: () => void;
  onReady?: () => void;
}

let initPromise: Promise<typeof import("mermaid").default> | null = null;

async function getMermaid() {
  if (!initPromise) {
    initPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        flowchart: { useMaxWidth: true, htmlLabels: false, curve: "basis" },
        themeVariables: { fontFamily: "inherit" },
      });
      return mermaid;
    });
  }
  return initPromise;
}

export function MermaidDiagram({ code, className, onError, onReady }: Props) {
  const [svg, setSvg] = useState("");
  const rawId = useId();
  const renderId = "mmd-" + rawId.replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    let cancelled = false;
    const trimmed = (code || "").trim();
    if (!trimmed) {
      setSvg("");
      onError?.();
      return;
    }
    (async () => {
      try {
        const mermaid = await getMermaid();
        const ok = await mermaid.parse(trimmed, { suppressErrors: true });
        if (!ok) throw new Error("invalid mermaid definition");
        const { svg: rendered } = await mermaid.render(renderId, trimmed);
        if (!cancelled) {
          setSvg(rendered);
          onReady?.();
        }
      } catch {
        if (!cancelled) {
          setSvg("");
          onError?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!svg) return null;
  return (
    <div
      className={className}
      // Mermaid output is sanitized by securityLevel:"strict"; htmlLabels are off.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
