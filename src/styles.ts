// Every stylesheet the app loads, in order. The GitHub-parity fixture test
// builds this same entry, so it checks the CSS users actually get
// (including Tailwind's reset), not just the shared preview.css.

// Bengali glyphs for the preview (unicode-range: only fetched when the
// document contains Bengali). The PDF renderer embeds the same font file.
import "@fontsource-variable/noto-sans-bengali";
import "@/shared/preview.css";
import "./index.css";
