import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const documentRoot = fileURLToPath(new URL('../', import.meta.url));
const escape = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
      })[char]
  );

/** Measure mixed Latin/CJK labels conservatively without relying on a build-host font. */
function textWidth(text, size) {
  return (
    [...text].reduce(
      (width, char) =>
        width +
        (/[^\u0000-\u00ff]/u.test(char)
          ? 1
          : /[MW@%]/.test(char)
            ? 0.9
            : /[ilI.,:; ']/.test(char)
              ? 0.3
              : 0.6),
      0
    ) * size
  );
}

/** Keep the source topology; only choose card positions and obstacle-free connector lanes. */
export function layoutDiagram(spec) {
  const sequence = spec.type === 'sequence';
  const sourceNodes = spec.nodes ?? spec.participants;
  assert.ok(sourceNodes?.length, 'A diagram needs nodes');
  assert.equal(
    new Set(sourceNodes.map(({ id }) => id)).size,
    sourceNodes.length,
    'Duplicate node ID'
  );
  const wide = spec.type === 'architecture' && Math.max(...sourceNodes.map(({ col }) => col)) >= 2;
  const singleColumn = !sequence && Math.max(...sourceNodes.map(({ col }) => col)) === 0;
  const nodes = sourceNodes.map((node, index) => {
    assert.match(node.id, /^[\w-]+$/, 'Invalid node ID');
    assert.match(node.illustration ?? '', /^[\w-]+$/, `Missing illustration: ${node.id}`);
    if (sequence) return { ...node, x: 80 + index * 290, y: 124, w: 230, h: 210 };
    const row = singleColumn ? Math.floor(index / 2) : node.row;
    const col = singleColumn ? (row % 2 ? 1 - (index % 2) : index % 2) : node.col;
    return {
      ...node,
      row,
      col,
      x: (wide ? 60 : 180) + col * (wide ? 260 : 500),
      y: 140 + row * (wide ? 330 : 250),
      w: wide ? 200 : 320,
      h: wide ? 230 : 140
    };
  });
  const width = Math.max(...nodes.map(({ x, w }) => x + w)) + (sequence ? 80 : wide ? 60 : 180);
  const height = sequence
    ? 430 + spec.messages.length * 76
    : Math.max(...nodes.map(({ y, h }) => y + h)) + 100;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let leftLane = 0;
  let rightLane = 0;
  const edges = (spec.edges ?? spec.messages).map(([from, to, label, kind], index) => {
    const a = byId.get(from);
    const b = byId.get(to);
    assert.ok(a && b, `Unknown endpoint: ${from} → ${to}`);
    assert.notEqual(from, to, 'Self edges require an explicit layout');
    const ax = a.x + a.w / 2;
    const bx = b.x + b.w / 2;
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    const points = (() => {
      if (sequence)
        return [
          [ax, 390 + index * 76],
          [bx, 390 + index * 76]
        ];
      if (
        a.row === b.row &&
        !nodes.some(
          (n) =>
            n.id !== from &&
            n.id !== to &&
            n.row === a.row &&
            n.x > Math.min(a.x, b.x) &&
            n.x < Math.max(a.x, b.x)
        )
      ) {
        return ax < bx
          ? [
              [a.x + a.w, ay],
              [b.x, by]
            ]
          : [
              [a.x, ay],
              [b.x + b.w, by]
            ];
      }
      if (Math.abs(a.row - b.row) === 1) {
        const down = by > ay;
        const sy = down ? a.y + a.h : a.y;
        const ty = down ? b.y : b.y + b.h;
        return ax === bx
          ? [
              [ax, sy],
              [bx, ty]
            ]
          : [
              [ax, sy],
              [ax, (sy + ty) / 2],
              [bx, (sy + ty) / 2],
              [bx, ty]
            ];
      }
      const left = a.col === 0 && b.col === 0;
      const lane = left ? 48 + leftLane++ * 30 : width - 48 - rightLane++ * 30;
      return [
        [left ? a.x : a.x + a.w, ay],
        [lane, ay],
        [lane, by],
        [left ? b.x : b.x + b.w, by]
      ];
    })();
    const longest = points
      .slice(1)
      .map((point, i) => ({
        a: points[i],
        b: point,
        length: Math.abs(point[0] - points[i][0]) + Math.abs(point[1] - points[i][1])
      }))
      .sort((a, b) => b.length - a.length)[0];
    return {
      from,
      to,
      label,
      kind,
      points,
      labelX: Math.max(88, Math.min(width - 88, (longest.a[0] + longest.b[0]) / 2)),
      labelY: (longest.a[1] + longest.b[1]) / 2,
      index
    };
  });
  return { nodes, edges, width, height, sequence, wide };
}

/** Render deterministic text and edges over embedded, alpha-preserving brand illustrations. */
export function renderDiagram(spec, { theme, illustrations }) {
  // Wrap CJK characters individually and keep Latin words intact at each line break.
  function wrap(text, { width, size }) {
    const lines = [''];
    for (const word of String(text).match(/[\u0000-\u00ff]+|[^\u0000-\u00ff]/gu) ?? []) {
      for (const part of word.match(/\S+\s*|\s+/g) ?? []) {
        const last = lines.length - 1;
        if (lines[last] && textWidth(lines[last] + part, size) > width)
          lines.push(part.trimStart());
        else lines[last] += part;
      }
    }
    return lines.map((line) => line.trim());
  }

  const layout = layoutDiagram(spec);
  const { nodes, edges, width, height, sequence, wide } = layout;
  const dark = theme === 'dark';
  const color = dark
    ? {
        bg: '#101B30',
        end: '#142744',
        panel: '#1A2D49',
        border: '#365478',
        text: '#F0F5FF',
        muted: '#BCCDE5',
        blue: '#76A7FF',
        grid: '#294767',
        shadow: '#07101F'
      }
    : {
        bg: '#FFFFFF',
        end: '#EEF5FF',
        panel: '#FFFFFF',
        border: '#C5D8F4',
        text: '#162B50',
        muted: '#4D6381',
        blue: '#3370FF',
        grid: '#C9DCF6',
        shadow: '#B1C9EA'
      };
  const used = [...new Set(nodes.map(({ illustration }) => illustration))];
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description" lang="${spec.lang}">`,
    `<title id="title">${escape(spec.title)}</title><desc id="description">${escape(nodes.map(({ label, sub }) => [label, sub].filter(Boolean).join(': ')).join('; '))}. ${escape(edges.map(({ from, to, label }) => `${from} → ${to}${label ? `: ${label}` : ''}`).join('; '))}</desc>`,
    `<defs><linearGradient id="canvas" x2="0.8" y2="1"><stop stop-color="${color.bg}"/><stop offset="1" stop-color="${color.end}"/></linearGradient><linearGradient id="card" x2="0" y2="1"><stop stop-color="${color.panel}"/><stop offset="1" stop-color="${color.end}"/></linearGradient><linearGradient id="brand"><stop stop-color="#3370FF"/><stop offset="1" stop-color="#245BDB"/></linearGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="skewY(-15)"><path d="M40 0H0V40" fill="none" stroke="${color.grid}" stroke-width="0.6"/></pattern><filter id="shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="${color.shadow}" flood-opacity="0.45"/></filter><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="${color.blue}"/></marker><clipPath id="clip"><rect width="${width}" height="${height}" rx="24"/></clipPath>`,
    ...used.map((name) => {
      assert.ok(illustrations[name], `Missing illustration asset: ${name}`);
      return `<image id="icon-${name}" width="256" height="256" href="data:image/webp;base64,${illustrations[name]}"/>`;
    }),
    `</defs><g clip-path="url(#clip)" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif"><rect width="${width}" height="${height}" fill="url(#canvas)"/><rect x="0" y="106" width="${width}" height="${height - 106}" fill="url(#grid)" opacity="0.35"/><rect x="38" y="40" width="18" height="27" rx="5" fill="url(#brand)"/><rect x="49" y="51" width="18" height="27" rx="5" fill="${color.blue}" opacity="0.5"/>`
  ];
  const text = ({
    value,
    x,
    y,
    size = 22,
    maxWidth = 280,
    fill = color.text,
    weight = 600,
    anchor = 'middle'
  }) => {
    const lines = wrap(value, { width: maxWidth, size });
    parts.push(
      `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.25 : 0}">${escape(line)}</tspan>`).join('')}</text>`
    );
    return lines.length;
  };
  text({
    value: spec.title,
    x: 86,
    y: 69,
    size: 32,
    maxWidth: width - 130,
    anchor: 'start',
    weight: 700
  });

  if (sequence) {
    for (const node of nodes)
      parts.push(
        `<path d="M${node.x + node.w / 2} ${node.y + node.h}V${height - 76}" stroke="${color.border}" stroke-width="2" stroke-dasharray="5 7"/>`
      );
  }
  for (const edge of edges) {
    const dashed = ['async', 'reply'].includes(edge.kind);
    parts.push(
      `<g class="edge" data-from="${edge.from}" data-to="${edge.to}" data-kind="${escape(edge.kind)}" data-label="${escape(edge.label)}"><path d="${edge.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')}" fill="none" stroke="${color.blue}" stroke-width="${edge.kind === 'primary' ? 3 : 2.3}" stroke-linejoin="round" stroke-linecap="round" ${dashed ? 'stroke-dasharray="7 6"' : ''} marker-end="url(#arrow)"/>`
    );
    if (edge.label) {
      const maxWidth = sequence
        ? Math.max(160, Math.abs(edge.points[0][0] - edge.points[1][0]) - 38)
        : 156;
      const size = sequence ? 19 : 17;
      const label = sequence && spec.numbered ? `${edge.index + 1}. ${edge.label}` : edge.label;
      const lines = wrap(label, { width: maxWidth, size });
      const badgeWidth = Math.max(...lines.map((line) => textWidth(line, size))) + 18;
      const badgeHeight = lines.length * size * 1.25 + 10;
      const y = edge.labelY - (sequence ? 12 : 0);
      parts.push(
        `<rect x="${edge.labelX - badgeWidth / 2}" y="${y - badgeHeight + 5}" width="${badgeWidth}" height="${badgeHeight}" rx="7" fill="${color.bg}" stroke="${color.border}" stroke-width="0.7"/>`
      );
      text({
        value: label,
        x: edge.labelX,
        y: y - (lines.length - 1) * size * 1.25 - 2,
        size,
        maxWidth,
        weight: 500
      });
    }
    parts.push('</g>');
  }
  for (const node of nodes) {
    parts.push(
      `<g class="node" data-node="${node.id}" data-label="${escape(node.label)}" data-sub="${escape(node.sub ?? '')}" data-illustration="${node.illustration}">`
    );
    if (wide || sequence) {
      const size = node.focal ? 192 : 166;
      parts.push(
        `<use href="#icon-${node.illustration}" transform="translate(${node.x + (node.w - size) / 2} ${node.y - (node.focal ? 12 : 0)}) scale(${size / 256})"/>`
      );
      const count = text({
        value: node.label,
        x: node.x + node.w / 2,
        y: node.y + 184,
        maxWidth: node.w + 16,
        size: 22,
        weight: 700
      });
      if (node.sub)
        text({
          value: node.sub,
          x: node.x + node.w / 2,
          y: node.y + 184 + count * 27,
          maxWidth: node.w + 20,
          size: 17,
          fill: color.muted,
          weight: 400
        });
    } else {
      parts.push(
        `<rect x="${node.x}" y="${node.y + 6}" width="${node.w}" height="${node.h}" rx="22" fill="${color.border}" opacity="0.6"/><rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="22" fill="url(#card)" stroke="${node.focal ? color.blue : color.border}" stroke-width="${node.focal ? 2.5 : 1.3}" filter="url(#shadow)"/><use href="#icon-${node.illustration}" transform="translate(${node.x + 6} ${node.y + 16}) scale(${108 / 256})"/>`
      );
      const labelLines = wrap(node.label, { width: 188, size: 21 });
      const subLines = node.sub ? wrap(node.sub, { width: 188, size: 16 }) : [];
      const block = labelLines.length * 26 + subLines.length * 20 + (subLines.length ? 8 : 0);
      const y = node.y + (node.h - block) / 2 + 21;
      text({
        value: node.label,
        x: node.x + 122,
        y,
        maxWidth: 188,
        size: 21,
        anchor: 'start',
        weight: 700
      });
      if (node.sub)
        text({
          value: node.sub,
          x: node.x + 122,
          y: y + labelLines.length * 26 + 6,
          maxWidth: 188,
          size: 16,
          fill: color.muted,
          anchor: 'start',
          weight: 400
        });
      if (node.shape === 'decision')
        parts.push(
          `<path d="M${node.x + node.w - 10} ${node.y - 8}l10 10-10 10-10-10Z" fill="${color.blue}" stroke="${color.bg}" stroke-width="2"/>`
        );
    }
    parts.push('</g>');
  }
  parts.push(`<path d="M38 ${height - 54}H${width - 38}" stroke="${color.border}"/>`);
  text({
    value:
      spec.lang === 'en'
        ? `${nodes.length} components · ${edges.length} connections`
        : `${nodes.length} 个节点 · ${edges.length} 条连线`,
    x: 40,
    y: height - 26,
    size: 15,
    maxWidth: width - 80,
    fill: color.muted,
    weight: 400,
    anchor: 'start'
  });
  parts.push('</g></svg>');
  return parts.join('\n');
}

/** Regenerate both languages and themes from checked-in sources and reusable illustrations. */
async function main() {
  const sources = path.join(documentRoot, 'diagrams');
  const destination = path.join(documentRoot, 'public/imgs/diagrams');
  await mkdir(destination, { recursive: true });
  const illustrations = {};
  for (const file of (await readdir(path.join(sources, 'illustrations'))).filter((file) =>
    file.endsWith('.webp')
  ))
    illustrations[file.slice(0, -5)] = (
      await readFile(path.join(sources, 'illustrations', file))
    ).toString('base64');
  for (const file of (await readdir(sources))
    .filter((file) => /\.(zh-CN|en)\.json$/.test(file))
    .sort()) {
    const spec = JSON.parse(await readFile(path.join(sources, file)));
    const stem = file.slice(0, -5);
    for (const theme of ['light', 'dark']) {
      const svg = renderDiagram(spec, { theme, illustrations });
      assert.ok(Buffer.byteLength(svg) <= 200000, `${file}: ${theme} exceeds 200,000 bytes`);
      await writeFile(path.join(destination, `${stem}.${theme}.svg`), svg);
    }
    await writeFile(
      path.join(sources, `${stem}.html`),
      `<!doctype html><html lang="${spec.lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(spec.title)}</title><style>body{margin:0;padding:24px;background:#eef5ff;font:16px system-ui;color:#162b50}main{max-width:1400px;margin:auto}button{padding:10px 16px;border:1px solid #3370ff;border-radius:8px;background:#3370ff;color:white;cursor:pointer}img{display:block;width:100%;height:auto;margin-top:20px}body.dark{background:#101b30;color:#f0f5ff}body:not(.dark) .dark-image,body.dark .light-image{display:none}</style><main><button type="button" aria-pressed="false">${spec.lang === 'en' ? 'Dark theme' : '暗色主题'}</button><img class="light-image" src="../public/imgs/diagrams/${stem}.light.svg" alt="${escape(spec.title)}"><img class="dark-image" src="../public/imgs/diagrams/${stem}.dark.svg" alt="${escape(spec.title)}"></main><script>const button=document.querySelector('button');function setTheme(dark){document.body.classList.toggle('dark',dark);button.setAttribute('aria-pressed',String(dark));}setTheme(matchMedia('(prefers-color-scheme:dark)').matches);button.addEventListener('click',()=>setTheme(!document.body.classList.contains('dark')));</script></html>\n`
    );
    console.log(`Rendered ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
