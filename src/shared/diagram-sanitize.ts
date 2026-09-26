/**
 * DOMPurify settings for Mermaid's SVG output, shared by the web preview
 * and the export API so both scrub diagrams identically. Mermaid output is
 * inserted after rehype-sanitize (it's SVG the sanitizer would strip), so
 * this is the only filter between a diagram label and the page: strict
 * mode is Mermaid's own defence, this is the second one.
 *
 * Labels are HTML inside <foreignObject>, so the html profile and that
 * integration point must stay allowed or every diagram renders without
 * text (tests/mermaid in the web app guards this). Embedding elements are
 * forbidden outright: an <iframe> in a PDF render could reach internal URLs.
 */
export const DIAGRAM_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ["foreignObject"],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
  FORBID_TAGS: ["iframe", "frame", "object", "embed", "form", "input", "button", "textarea"],
};
