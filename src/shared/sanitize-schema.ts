import { defaultSchema } from "rehype-sanitize";
import { ALERT_TYPES } from "./alerts";

type Schema = typeof defaultSchema;

/**
 * GitHub's sanitize schema, extended for README idioms we support:
 * `<details>/<summary>`, alignment attributes, image sizing, and alerts.
 * Scripts/event handlers stay stripped.
 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "align"],
    details: ["open"],
    // GitHub alerts (see alerts.ts) — only these exact class names
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", "markdown-alert", ...ALERT_TYPES.map((t) => `markdown-alert-${t}`)],
    ],
    p: [...(defaultSchema.attributes?.p ?? []), ["className", "markdown-alert-title"]],
  },
};
