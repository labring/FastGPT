/*
    校验 content/ 下所有 mdx/md 中图片与站内链接引用是否存在。
    存在不可解析的引用时，进程退出码 1。

    参数：
      可选传入若干 mdx/md 文件路径（用于 lint-staged）；不传则扫描全部 content/。

    支持的引用形式：
      Markdown:
        ![alt](url)
        [text](url)
      JSX/HTML 属性:
        src|href|to = "url" | 'url' | {"url"}

    URL 解析规则：
      /imgs/foo.png               → public/imgs/foo.png
      /any/asset.svg              → public/any/asset.svg
      /en/faq/app | /zh/faq/app   → content/faq/app(.en.mdx | .mdx | /index.*)
      /faq/app                    → content/faq/app(.mdx | ...)
      ../foo/bar.png              → 相对当前 mdx 解析为文件
      ../foo/bar.mdx              → 相对当前 mdx 解析为路由
      ../foo/bar                  → 相对当前 mdx 解析为路由
      page#section / page?x=1     → 仅校验 page

    跳过：http(s)://, mailto:, tel:, data:, ftp:, ws(s)://, # 纯锚点。
*/

const fs = require('fs');
const path = require('path');

const DOCUMENT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(DOCUMENT_ROOT, 'content');
const PUBLIC_DIR = path.join(DOCUMENT_ROOT, 'public');

const MDX_EXTS = ['.mdx', '.md'];
const FILE_LIKE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp',
  '.pdf', '.zip', '.json', '.yaml', '.yml', '.txt'
]);

function getAllMdxFiles(dir) {
  const out = [];
  (function walk(p) {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (MDX_EXTS.includes(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  })(dir);
  return out;
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function routeExists(basePath) {
  const candidates = [
    basePath + '.mdx',
    basePath + '.en.mdx',
    basePath + '.md',
    path.join(basePath, 'index.mdx'),
    path.join(basePath, 'index.en.mdx'),
    path.join(basePath, 'index.md')
  ];
  return candidates.some(fileExists);
}

function isExternal(url) {
  return /^(https?:|mailto:|tel:|data:|ftp:|ws:|wss:)/i.test(url) || url.startsWith('#');
}

function stripFragment(url) {
  return url.split('#')[0].split('?')[0];
}

function normalizeRoutePath(p) {
  return p.replace(/\/+$/, '').replace(/\.(en\.)?(mdx|md)$/i, '');
}

function extractRefs(content) {
  // 去除 ``` 代码块和 ` 行内代码，避免误报
  const stripped = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');

  const refs = [];
  const push = (url, type, index) => {
    if (typeof url === 'string' && url.length > 0) refs.push({ url, type, index });
  };

  const imgRe = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const linkRe = /(^|[^!])\[(?:[^\]]*?)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const attrRe = /\b(?:src|href|to)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g;

  let m;
  while ((m = imgRe.exec(stripped))) push(m[1], 'image', m.index);
  while ((m = linkRe.exec(stripped))) push(m[2], 'link', m.index);
  while ((m = attrRe.exec(stripped))) push(m[1] || m[2] || m[3], 'attr', m.index);

  return refs;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function isValidRef(url, mdxPath) {
  if (isExternal(url)) return { ok: true };
  const target = stripFragment(url);
  if (!target) return { ok: true };

  // 绝对路径
  if (target.startsWith('/')) {
    if (target.startsWith('/imgs/')) {
      const p = path.join(PUBLIC_DIR, target);
      return fileExists(p) ? { ok: true } : { ok: false, expected: p };
    }
    const ext = path.extname(target).toLowerCase();
    if (ext && !MDX_EXTS.includes(ext)) {
      const p = path.join(PUBLIC_DIR, target);
      return fileExists(p) ? { ok: true } : { ok: false, expected: p };
    }
    const langMatch = target.match(/^\/(en|zh)\/(.+)$/);
    const subRaw = langMatch ? langMatch[2] : target.slice(1);
    const sub = normalizeRoutePath(subRaw);
    const base = path.join(CONTENT_DIR, sub);
    return routeExists(base)
      ? { ok: true }
      : { ok: false, expected: `${base}(.mdx | .en.mdx | /index.mdx)` };
  }
  // 相对路径
  const ext = path.extname(target).toLowerCase();
  if (ext && !MDX_EXTS.includes(ext)) {
    const resolved = path.resolve(path.dirname(mdxPath), target);
    if (FILE_LIKE_EXTS.has(ext)) {
      return fileExists(resolved) ? { ok: true } : { ok: false, expected: resolved };
    }
    return fileExists(resolved) ? { ok: true } : { ok: false, expected: resolved };
  }
  const normalized = normalizeRoutePath(target);
  const resolved = path.resolve(path.dirname(mdxPath), normalized);
  return routeExists(resolved)
    ? { ok: true }
    : { ok: false, expected: `${resolved}(.mdx | .en.mdx | /index.mdx)` };
}

function isMetaFile(name) {
  return /^meta(\.en)?\.json$/.test(name);
}

function isIndexFile(name) {
  return /^index(\.en)?\.mdx?$/i.test(name);
}

function slugFromFile(name) {
  return name.replace(/\.(en\.)?mdx?$/i, '');
}

function dirHasMeta(dir) {
  return fileExists(path.join(dir, 'meta.json')) || fileExists(path.join(dir, 'meta.en.json'));
}

// 收集 dir 下所有「应被父级 meta 引用」的 slug。
// - 子目录若有自己的 meta，则父级只需引用目录名，不下钻
// - 子目录若无 meta，则父级须以 `subdir/file` 形式列出每个文件
function collectExpectedSlugs(dir, prefix = '') {
  const out = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (isMetaFile(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isFile()) {
      if (!/\.mdx?$/i.test(entry.name)) continue;
      if (isIndexFile(entry.name)) continue;
      const slug = slugFromFile(entry.name);
      out.add(prefix ? `${prefix}/${slug}` : slug);
    } else if (entry.isDirectory()) {
      const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (dirHasMeta(full)) {
        out.add(childPrefix);
      } else {
        for (const s of collectExpectedSlugs(full, childPrefix)) out.add(s);
      }
    }
  }
  return out;
}

function checkMetaCoverage() {
  const errors = [];

  (function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !isMetaFile(entry.name)) continue;
      const metaPath = path.join(dir, entry.name);
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch (e) {
        errors.push({ file: metaPath, missing: [], parseError: e.message });
        continue;
      }
      const pages = Array.isArray(meta.pages) ? meta.pages : [];

      const declared = new Set();
      const wildcards = new Set();
      for (const p of pages) {
        if (typeof p !== 'string') continue;
        if (/^---.*---$/.test(p)) continue;
        if (p.startsWith('...')) {
          wildcards.add(p.slice(3));
          continue;
        }
        declared.add(p);
      }

      const expected = collectExpectedSlugs(dir);
      const missing = [];
      for (const slug of expected) {
        const topLevel = slug.split('/')[0];
        if (wildcards.has(topLevel)) continue;
        if (declared.has(slug)) continue;
        missing.push(slug);
      }
      if (missing.length > 0) errors.push({ file: metaPath, missing });
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(path.join(dir, entry.name));
      }
    }
  })(CONTENT_DIR);

  return errors;
}

function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const targetFiles = args.length
    ? args
        .map((p) => path.resolve(p))
        .filter((p) => MDX_EXTS.includes(path.extname(p).toLowerCase()) && fileExists(p))
    : getAllMdxFiles(CONTENT_DIR);

  const refErrors = [];
  for (const mdx of targetFiles) {
    const content = fs.readFileSync(mdx, 'utf-8');
    const refs = extractRefs(content);
    for (const { url, type, index } of refs) {
      const result = isValidRef(url, mdx);
      if (!result.ok) {
        refErrors.push({
          file: mdx,
          line: lineOf(content, index),
          url,
          type,
          expected: result.expected
        });
      }
    }
  }

  // meta 覆盖校验始终全量执行（与 args 无关）
  const metaErrors = checkMetaCoverage();

  const total = refErrors.length + metaErrors.length;
  if (total === 0) {
    console.log(`✅ 已校验 ${targetFiles.length} 个 mdx 文件 + 全部 meta.json，未发现问题`);
    process.exit(0);
  }

  if (refErrors.length > 0) {
    console.error(`❌ 发现 ${refErrors.length} 处无效引用：\n`);
    for (const e of refErrors) {
      const src = path.relative(DOCUMENT_ROOT, e.file);
      console.error(`  ${src}:${e.line}`);
      console.error(`    [${e.type}] ${e.url}`);
      console.error(`    ↳ 不存在: ${e.expected}`);
      console.error('');
    }
  }

  if (metaErrors.length > 0) {
    console.error(`❌ 发现 ${metaErrors.length} 个 meta 文件存在问题：\n`);
    for (const e of metaErrors) {
      const src = path.relative(DOCUMENT_ROOT, e.file);
      if (e.parseError) {
        console.error(`  ${src}`);
        console.error(`    ↳ JSON 解析失败: ${e.parseError}`);
      } else {
        console.error(`  ${src}`);
        console.error(`    ↳ pages 中遗漏 ${e.missing.length} 项:`);
        for (const m of e.missing) console.error(`        - ${m}`);
      }
      console.error('');
    }
  }

  process.exit(1);
}

main();
