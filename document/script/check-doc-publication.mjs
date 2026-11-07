import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import matter from 'gray-matter';

/**
 * 对真实文档服务检查公开页、草稿与发现入口。
 * 先验证公开介绍页和搜索正对照，避免未部署文档站时把统一 404 误判为草稿通过。
 */
export async function checkDocumentPublication({ baseUrl }) {
  const base = baseUrl.replace(/\/$/, '');
  const checks = [];
  const targets = [];
  const request = async (route, { status, label, localeCookie }) => {
    const response = await fetch(base + route, {
      signal: AbortSignal.timeout(60000),
      redirect: 'manual',
      ...(localeCookie ? { headers: { Cookie: `FD_LOCALE=${localeCookie}` } } : {})
    });
    assert.equal(response.status, status, `${label}: ${route}`);
    const body = await response.text();
    checks.push({ route, status: response.status, label, bytes: Buffer.byteLength(body), ...(localeCookie ? { localeCookie } : {}) });
    return body;
  };

  for (const locale of ['zh-CN', 'en']) {
    const suffix = locale === 'en' ? '.en' : '';
    const frontmatter = async (name) => matter(await readFile(new URL(`../content/openapi/${name}${suffix}.mdx`, import.meta.url), 'utf8')).data;
    const intro = await frontmatter('intro');
    const target = await frontmatter('best-practices/app-integration');
    const introRoute = `/${locale}/openapi/intro`;
    const targetRoute = `/${locale}/openapi/best-practices/app-integration`;
    const draft = target.draft === true;
    targets.push({ route: targetRoute, draft });

    const navigation = await request(introRoute, { status: 200, label: '公开介绍页' });
    assert.ok(navigation.includes('<main') && navigation.includes(intro.title), `公开介绍页正文缺失: ${introRoute}`);
    assert.equal(navigation.includes(targetRoute), !draft, `导航与发布状态不符: ${targetRoute}`);

    const page = await request(targetRoute, { status: draft ? 404 : 200, label: '教程发布状态' });
    if (!draft) assert.ok(page.includes(target.title), `已发布教程正文缺失: ${targetRoute}`);

    const toc = await request(`/${locale}/toc`, { status: 200, label: '公开目录页' });
    assert.equal(toc.includes(targetRoute), !draft, `目录与发布状态不符: ${targetRoute}`);

    const search = async (query) => {
      const route = '/api/search?' + new URLSearchParams({ locale, query });
      const body = await request(route, { status: 200, label: '站内搜索' });
      const results = JSON.parse(body);
      assert.ok(Array.isArray(results), `搜索未返回结果数组: ${route}`);
      return body;
    };
    assert.ok((await search(intro.title)).includes(introRoute), `公开介绍页未进入搜索: ${introRoute}`);
    assert.equal((await search(target.title)).includes(targetRoute), !draft, `搜索与发布状态不符: ${targetRoute}`);

    const llms = await request(`/${locale}/llms.txt`, { status: 200, label: 'LLM 文档导出' });
    assert.match(llms, /^file: /m);
    assert.ok(llms.includes('openapi/intro'), `LLM 导出缺少公开介绍页: ${locale}`);
    assert.equal(llms.includes('openapi/best-practices/app-integration'), !draft, `LLM 导出与发布状态不符: ${locale}`);
  }

  const sitemap = await request('/sitemap.xml', { status: 200, label: '站点地图' });
  assert.ok(sitemap.includes('<urlset') && sitemap.includes('/openapi/intro'), '站点地图缺少公开介绍页');
  const staticIndex = await request('/static.json', { status: 200, label: '静态搜索索引' });
  assert.ok(Array.isArray(JSON.parse(staticIndex)) && staticIndex.includes('/openapi/intro'), '静态索引缺少公开介绍页');
  for (const target of targets.filter((target) => target.draft)) {
    assert.ok(!sitemap.includes(target.route), `草稿进入站点地图: ${target.route}`);
    assert.ok(!staticIndex.includes(target.route), `草稿进入静态索引: ${target.route}`);
  }
  for (const localeCookie of ['zh-CN', 'en']) {
    const index = await request('/static.json', { status: 200, label: '静态索引不受语言 Cookie 重定向', localeCookie });
    assert.deepEqual(JSON.parse(index), JSON.parse(staticIndex));
  }
  return { baseUrl: base, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'base-url': { type: 'string' } } });
  const result = await checkDocumentPublication({
    baseUrl: values['base-url'] ?? process.env.DOCS_BASE_URL ?? 'http://127.0.0.1:3005'
  });
  console.log(JSON.stringify(result, null, 2));
}
