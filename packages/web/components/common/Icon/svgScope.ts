const svgUrlReferenceReg = /url\((['"]?)#([^)'" ]+)\1\)/g;
const hashOnlyReferenceReg = /^#(.+)$/;
const spaceSeparatedReferenceAttrs = new Set(['aria-labelledby', 'aria-describedby']);

const toScopedSvgId = (scopeId: string, id: string) => {
  const prefix = `${scopeId}__`;

  return id.startsWith(prefix) ? id : `${prefix}${id}`;
};

export const createScopedSvgIdMap = (ids: string[], scopeId: string) => {
  const idMap = new Map<string, string>();

  ids.forEach((id) => {
    if (!id) return;
    idMap.set(id, toScopedSvgId(scopeId, id));
  });

  return idMap;
};

export const scopeSvgReferenceValue = (value: string, idMap: Map<string, string>) => {
  let nextValue = value.replace(svgUrlReferenceReg, (match, quote: string, id: string) => {
    const scopedId = idMap.get(id);

    return scopedId ? `url(${quote}#${scopedId}${quote})` : match;
  });

  const hashOnlyMatch = nextValue.match(hashOnlyReferenceReg);
  if (hashOnlyMatch) {
    const scopedId = idMap.get(hashOnlyMatch[1]);
    if (scopedId) {
      nextValue = `#${scopedId}`;
    }
  }

  return nextValue;
};

export const scopeSpaceSeparatedSvgReferenceValue = (value: string, idMap: Map<string, string>) => {
  return value
    .split(/\s+/)
    .map((id) => idMap.get(id) || id)
    .join(' ');
};

/**
 * 为单个内联 SVG 实例生成独立 id 作用域，避免多个相同系统 icon 同屏渲染时
 * `url(#id)`、`href="#id"` 等 DOM 级引用串到其他 SVG 实例。
 */
export const scopeSvgElementIds = (svg: SVGSVGElement, scopeId: string, scopeKey = scopeId) => {
  if (svg.dataset.fastgptIconScoped === scopeKey) return;

  const elements = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const rawIds = elements
    .map((element) => element.getAttribute('id'))
    .filter((id): id is string => !!id);
  const idMap = createScopedSvgIdMap(rawIds, scopeId);

  if (idMap.size === 0) {
    svg.dataset.fastgptIconScoped = scopeKey;
    return;
  }

  elements.forEach((element) => {
    const id = element.getAttribute('id');
    const scopedId = id ? idMap.get(id) : undefined;
    if (scopedId) {
      element.setAttribute('id', scopedId);
    }
  });

  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name === 'id') return;

      const nextValue = spaceSeparatedReferenceAttrs.has(attr.name)
        ? scopeSpaceSeparatedSvgReferenceValue(attr.value, idMap)
        : scopeSvgReferenceValue(attr.value, idMap);

      if (nextValue !== attr.value) {
        element.setAttribute(attr.name, nextValue);
      }
    });
  });

  svg.dataset.fastgptIconScoped = scopeKey;
};
