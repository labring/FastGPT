# Documentation diagrams

Edit the localized JSON specifications and regenerate with the installed SeeCode plugin:

```sh
pnpm --dir document render:diagrams /absolute/path/to/seecode/scripts/seecode.mjs
pnpm --dir document test:checks
```

Run from the repository root so SeeCode loads `.seecode/config.json`. The project configuration embeds the FastGPT palette and uses system fonts. SeeCode 0.6.2 produced the checked-in assets.

Each specification has a Chinese and English version with matching topology. Its `evidence` entries point to the implementation or interface contract used to check the diagram. Remote Plugin Server/Gateway and SSO internals are represented at their documented contract boundary.

The renderer produces interactive HTML beside each specification and light/dark SVG variants in `public/imgs/diagrams`. Edit JSON only; regenerate HTML and SVG through SeeCode. Each SVG must stay within 200,000 bytes. Markdown references the light variant; the shared MDX image renderer chooses the theme and retains click-to-zoom behavior.

The original 17 diagram groups become 18 specifications after consolidating the shared deployment topology and splitting the deployment services and remote debugging sequence. Product screenshots, directory trees, and Mermaid/ECharts code examples retain their original roles. `originals.json` protects replaced raster sources and their optimized copies during image cleanup.
