/* Shared by the local catalog and the standalone HTML. Run catalog.mjs sync-reader after edits. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('js-yaml'));
  else root.FastGPTCases = factory(root.jsyaml);
})(globalThis, function (yaml) {
  'use strict';
  const enums = {
    types: ['api', 'ui', 'e2e', 'integration'],
    category: ['basic', 'abnormal', 'boundary'],
    scenario: ['success', 'failure', 'special'],
    priority: ['P0', 'P1', 'P2'],
    status: ['draft', 'ready', 'deprecated'],
    evidence: ['response', 'ui', 'database', 'log', 'trace', 'queue', 'storage', 'cache']
  };
  const sections = ['用例简介', '前置准备', '测试步骤', '预期结果'];

  /** 展开已确认的业务树；每层最多三个子业务，业务路径最多三层。 */
  function flattenBusinesses(tree) {
    const result = [];
    function walk(nodes, prefix, names) {
      if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes))
        throw new Error('业务分类必须为对象');
      if (prefix && Object.keys(nodes).length > 3)
        throw new Error(`${prefix} 的直接子业务超过 3 个`);
      for (const [key, node] of Object.entries(nodes)) {
        const path = prefix ? `${prefix}/${key}` : key;
        const name = typeof node === 'string' ? node : node?.name;
        if (
          !/^[a-z0-9-]+$/.test(key) ||
          typeof name !== 'string' ||
          !name.trim() ||
          path.split('/').length > 3
        )
          throw new Error(`无效业务分类：${path}`);
        const labels = [...names, name];
        result.push({ path, name, labels, depth: labels.length });
        if (node && typeof node === 'object' && node.children) walk(node.children, path, labels);
      }
    }
    walk(tree, '', []);
    return result;
  }

  /** 解析单个用例；不带版本标识的历史 Markdown 跳过，格式问题返回诊断而不中断扫描。 */
  function parseCase(content, path, businesses) {
    content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content);
    const looksLikeCase =
      /(?:^|\/)FG-[^/]+\.md$/i.test(path) || /^case_version\s*:/m.test(match ? match[1] : content);
    if (!match) return looksLikeCase ? { error: '缺少完整 YAML frontmatter' } : { skipped: true };
    if (!looksLikeCase) return { skipped: true };
    let meta;
    try {
      meta = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    } catch (error) {
      return { error: `YAML 解析失败：${error.message}` };
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta))
      return { error: 'frontmatter 必须为对象' };
    if (!Object.hasOwn(meta, 'case_version'))
      return looksLikeCase ? { error: '缺少 case_version: 1' } : { skipped: true };
    if (meta.case_version !== 1) return { error: '仅支持 case_version: 1' };

    const errors = [];
    const fields = new Set([
      'case_version',
      'id',
      'title',
      'business',
      'baseline',
      'types',
      'category',
      'scenario',
      'priority',
      'status',
      'tags',
      'evidence',
      'sources',
      'routes',
      'related'
    ]);
    for (const key of Object.keys(meta))
      if (!fields.has(key)) errors.push(`不支持的元数据字段：${key}`);
    for (const key of ['id', 'title', 'business', 'baseline']) {
      if (typeof meta[key] !== 'string' || !meta[key].trim())
        errors.push(`${key} 必须为非空字符串`);
    }
    if (typeof meta.id === 'string' && !/^FG-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(meta.id))
      errors.push('id 需使用 FG- 开头的大写字母、数字和连字符');
    for (const key of ['category', 'scenario', 'priority', 'status']) {
      if (!enums[key].includes(meta[key])) errors.push(`${key} 可选值：${enums[key].join(', ')}`);
    }
    for (const key of ['types', 'tags', 'evidence', 'sources', 'routes', 'related']) {
      if (
        !Array.isArray(meta[key]) ||
        meta[key].some((item) => typeof item !== 'string' || !item.trim())
      )
        errors.push(`${key} 必须为字符串数组`);
      else if (
        enums[key] &&
        (!meta[key].length || meta[key].some((item) => !enums[key].includes(item)))
      )
        errors.push(`${key} 为空或有不支持的值`);
    }
    const directory = path.split('/').slice(0, -1).join('/');
    if (meta.business !== directory) errors.push(`business 必须与目录一致：${directory}`);
    if (!businesses.some((item) => item.path === meta.business))
      errors.push(`业务分类未登记：${meta.business}`);
    if (typeof meta.id === 'string' && !path.split('/').pop().startsWith(`${meta.id}-`))
      errors.push('文件名需为 <ID>-<场景>.md');
    const body = content.slice(match[0].length).trim();
    // fenced code 中的示例标题不算正文结构。
    let fence = null;
    const headings = [];
    for (const line of body.split('\n')) {
      const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
          fence = null;
      } else if (!fence && /^##\s+/.test(line))
        headings.push(
          line
            .replace(/^##\s+/, '')
            .replace(/\s+#+\s*$/, '')
            .trim()
        );
    }
    for (const title of sections) if (!headings.includes(title)) errors.push(`缺少章节：${title}`);
    if (errors.length) return { error: errors.join('；') };
    return { case: { ...meta, path, body, content } };
  }

  /** 统一扫描结果、重复 ID 和跳过计数，供 HTTP 与离线目录两种模式共用。 */
  function buildCatalog(entries, tree) {
    const businesses = flattenBusinesses(tree);
    const cases = [];
    const errors = [];
    let skipped = 0;
    const ids = new Map();
    for (const entry of entries.slice().sort((a, b) => a.path.localeCompare(b.path))) {
      if (entry.error) {
        errors.push({ path: entry.path, message: entry.error });
        continue;
      }
      const result = parseCase(entry.content, entry.path, businesses);
      if (result.skipped) {
        skipped++;
        continue;
      }
      if (result.error) {
        errors.push({ path: entry.path, message: result.error });
        continue;
      }
      const item = result.case;
      if (ids.has(item.id))
        errors.push({
          path: item.path,
          message: `重复 ID ${item.id}，首次出现于 ${ids.get(item.id)}`
        });
      else ids.set(item.id, item.path);
      cases.push(item);
    }
    return { cases, businesses, errors, skipped, scannedAt: new Date().toISOString() };
  }

  /** 所有筛选条件按 AND 组合；业务前缀同时包含子业务，搜索覆盖元数据与正文。 */
  function filterCases(cases, filters = {}) {
    return cases.filter((item) => {
      if (
        filters.business &&
        item.business !== filters.business &&
        !item.business.startsWith(`${filters.business}/`)
      )
        return false;
      for (const [filter, field] of [
        ['type', 'types'],
        ['tag', 'tags'],
        ['evidence', 'evidence']
      ]) {
        if (filters[filter] && !item[field].includes(filters[filter])) return false;
      }
      for (const key of ['category', 'scenario', 'status', 'priority'])
        if (filters[key] && item[key] !== filters[key]) return false;
      if (filters.q) {
        const haystack = [
          item.id,
          item.title,
          item.business,
          item.body,
          ...item.tags,
          ...item.sources,
          ...item.routes
        ]
          .join('\n')
          .toLowerCase();
        if (
          !filters.q
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .every((word) => haystack.includes(word))
        )
          return false;
      }
      return true;
    });
  }
  return { enums, sections, flattenBusinesses, parseCase, buildCatalog, filterCases };
});
