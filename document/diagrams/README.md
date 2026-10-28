# Documentation diagrams

Edit the localized JSON specifications and regenerate the brand-blue illustrations:

```sh
pnpm --dir document render:diagrams
pnpm --dir document test:checks
```

The renderer combines reusable 2.5D illustrations with deterministic SVG text and connectors. The primary brand colors are `#3370FF` and `#245BDB`. Dark diagrams use a navy canvas, light text, and lighter blue connectors for contrast. Labels use system fonts. No external rendering service or plugin is needed to regenerate the assets.

Each specification has a Chinese and English version with matching topology. Its `evidence` entries point to the implementation or interface contract used to check the diagram. Remote Plugin Server/Gateway and SSO internals are represented at their documented contract boundary.

The renderer produces an HTML theme preview beside each specification and light/dark SVG variants in `public/imgs/diagrams`. Edit JSON and regenerate HTML/SVG rather than editing generated output. Each SVG stays within 200,000 bytes, embeds each used WebP illustration once, and preserves vector labels and arrows. Markdown references the light variant; the shared MDX image renderer chooses the theme, retains click-to-zoom behavior, and allows horizontal scrolling at small viewport widths.

`illustrations/` contains the alpha-preserving WebP assets generated with imagegen and their prompts. Each node's `illustration` field selects an asset matching its role; distinct roles within each diagram use distinct icons. Reuse the same icon across diagrams for the same meaning. The source nodes, edge order, edge kinds, branch labels, and localized text remain authoritative. Layout coordinates may change without changing connectivity. Tests check source/output parity, icon assignments, regeneration, theme size budgets, and connector intersections with unrelated nodes. SVG viewers must support embedded WebP; browsers used by the documentation site do.

The original 17 diagram groups become 18 specifications after consolidating the shared deployment topology and splitting the deployment services and remote debugging sequence. Product screenshots, directory trees, and Mermaid/ECharts code examples retain their original roles. `originals.json` protects replaced raster sources and their optimized copies during image cleanup.
