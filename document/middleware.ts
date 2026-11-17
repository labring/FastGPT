import { createI18nMiddleware } from 'fumadocs-core/i18n';
import { defaultHomePath, i18n } from '@/lib/i18n';
import { getFastGPTDocsOriginForLocale, resolveDocsSiteVariant } from '@/lib/docs-locale';
import docLastModifiedData from '@/data/doc-last-modified.json';
import { type NextRequest, NextResponse } from 'next/server';

// Old path redirects mapping. Keys/values are POST-strip (no /docs prefix).
// Old links like /docs/foo are first stripped to /foo, then matched here.
const exactMap: Record<string, string> = {
  '': defaultHomePath,
  '/': defaultHomePath,
  '/intro': defaultHomePath,

  // Version / home.
  '/commercial': '/guide/version/commercial',
  '/commercial/intro': '/guide/version/commercial',
  '/pricing': '/guide/version/commercial',
  '/introduction': defaultHomePath,
  '/introduction/community': defaultHomePath,
  '/introduction/cloud': '/guide/version/cloud/intro',
  '/introduction/opensource': '/guide/version/opensource/intro',
  '/introduction/version': '/guide/version/commercial',
  '/agreement': '/guide/version/cloud/terms',
  '/agreement/terms': '/guide/version/cloud/terms',
  '/agreement/privacy': '/guide/version/cloud/privacy',
  '/agreement/disclaimer': '/guide/version/cloud/terms',
  '/protocol': '/guide/version/opensource/license',
  '/protocol/open-source': '/guide/version/opensource/license',
  '/protocol/terms': '/guide/version/cloud/terms',
  '/protocol/privacy': '/guide/version/cloud/privacy',

  // Self-host.
  '/installation': '/self-host/deploy/docker',
  '/installation/docker': '/self-host/deploy/docker',
  '/installation/sealos': '/self-host/deploy/sealos',
  '/installation/one-api': '/self-host/config/model/intro',
  '/installation/reference': '/self-host/config/env',
  '/installation/reference/models': '/self-host/config/model/intro',
  '/installation/upgrading': '/self-host/upgrading/upgrade-instruction',
  '/upgrading/intro': '/self-host/upgrading/upgrade-instruction',
  '/upgrading': '/self-host/upgrading/upgrade-instruction',
  '/self-host/upgrading': '/self-host/upgrading/upgrade-instruction',
  '/self-host/upgrading/intro': '/self-host/upgrading/upgrade-instruction',
  // Pre-rename misspellings of the upgrade page keep resolving.
  '/self-host/upgrading/upgrade-intruction': '/self-host/upgrading/upgrade-instruction',
  '/upgrading/upgrade-intruction': '/self-host/upgrading/upgrade-instruction',
  '/self-host/upgrading/4-12': '/self-host/upgrading/4-12/4124',
  '/self-host/upgrading/4-12/4125': '/self-host/upgrading/4-12/4124',
  '/self-host/upgrading/4-13': '/self-host/upgrading/4-13/4132',
  '/self-host/upgrading/4-14': '/self-host/upgrading/4-14/41431',
  '/self-host/upgrading/4-14/41930': '/self-host/upgrading/4-14/4143',
  '/self-host/upgrading/4-15': '/self-host/upgrading/4-15/4158',
  '/self-host/upgrading/4-15/4150': '/self-host/upgrading/4-15/41500',
  '/self-host/upgrading/4-16': '/self-host/upgrading/4-16/4162',
  '/self-host/upgrading/4-16/4163': '/self-host/upgrading/4-17/4170',
  '/self-host/upgrading/4-17': '/self-host/upgrading/4-17/4175',
  '/self-host/upgrading/4-18': '/self-host/upgrading/4-18/4180',
  '/self-host/upgrading/outdated': '/self-host/upgrading/outdated/4111',
  '/self-host/upgrading/outdated/4112': '/self-host/upgrading/outdated/4111',
  '/development/docker': '/self-host/deploy/docker',
  '/development/sealos': '/self-host/deploy/sealos',
  '/development/intro': '/self-host/dev',
  '/self-host/quick-start': '/self-host/deploy/docker',
  '/self-host/community': defaultHomePath,
  '/self-host/custom-models': '/self-host/config/model/intro',
  '/self-host/custom-models/bge-rerank': '/self-host/custom-models/legacy/bge-rerank',
  '/self-host/custom-models/chatglm2-m3e': '/self-host/custom-models/legacy/chatglm2-m3e',
  '/self-host/custom-models/chatglm2': '/self-host/custom-models/legacy/chatglm2',
  '/self-host/custom-models/m3e': '/self-host/custom-models/legacy/m3e',
  '/self-host/custom-models/marker': '/self-host/custom-models/legacy/marker',
  '/self-host/config': '/self-host/config/model/intro',
  '/self-host/config/sandbox': '/self-host/config/sandbox/opensandbox',
  '/self-host/deploy': '/self-host/deploy/docker',
  '/self-host/design': '/self-host/design/dataset',
  '/self-host/migration': '/self-host/migration/docker_db',
  '/self-host/troubleshooting': '/self-host/troubleshooting/attention',
  '/self-host/object-storage': '/self-host/config/object-storage',
  '/self-host/configuration': '/self-host/config/env',
  '/self-host/signoz': '/self-host/config/signoz',
  '/self-host/config/json': '/self-host/config/env',
  '/self-host/config/sandbox/common': '/self-host/config/sandbox/opensandbox',
  '/self-host/config/model/ai-proxy': '/self-host/config/model/intro',
  '/self-host/config/model/one-api': '/self-host/config/model/intro',
  '/development/one-api': '/self-host/config/model/intro',
  '/development/modelConfig': '/self-host/config/model/intro',
  '/self-host/modelConfig': '/self-host/config/model/intro',
  '/self-host/config/model': '/self-host/config/model/intro',
  '/self-host/config/model/ppio': '/self-host/config/model/intro',
  '/self-host/design/design_plugin': '/plugin/intro',
  '/self-host/faq': '/self-host/troubleshooting/faq',

  // General config / getting started.
  '/course': '/guide/getting-started/quick-start',
  '/course/quick-start': '/guide/getting-started/quick-start',
  '/course/ai_settings': '/guide/build/general/ai_settings',
  '/course/chat_input_guide': '/guide/build/general/chat_input_guide',
  '/course/custom_link': '/guide/build/publish/link',
  '/course/feishu': '/guide/build/publish/feishu',
  '/course/official_account': '/guide/build/publish/official_account',
  '/course/onwechat': '/guide/build/publish/wechat',
  '/course/wecom': '/guide/build/publish/wecom',
  '/course/dingtalk': '/guide/build/publish/dingtalk',
  '/course/websync': '/guide/dataset/websync',
  '/course/fileinput': '/guide/build/general/fileInput',
  '/course/welcomeText': '/guide/build/general/welcomeText',
  '/course/voiceInput': '/guide/build/general/voiceInput',
  '/course/collection_tags': '/guide/dataset/collection_tags',
  '/guide/course': '/guide/getting-started/quick-start',
  '/guide/course/quick-start': '/guide/getting-started/quick-start',
  '/guide/course/ai_settings': '/guide/build/general/ai_settings',
  '/guide/course/chat_input_guide': '/guide/build/general/chat_input_guide',
  '/guide/course/fileinput': '/guide/build/general/fileInput',
  '/guide/course/fileInput': '/guide/build/general/fileInput',
  '/guide/course/welcomeText': '/guide/build/general/welcomeText',
  '/guide/course/voiceInput': '/guide/build/general/voiceInput',
  '/guide/course/collection_tags': '/guide/dataset/collection_tags',

  // Knowledge base third-party pages moved under dataset/third-party.
  '/guide/knowledge_base': '/guide/dataset/rag',
  '/guide/dataset/externalFile': '/guide/dataset/third-party/third_dataset',
  '/guide/knowledge_base/api_dataset': '/guide/dataset/third-party/api_dataset',
  '/guide/knowledge_base/lark_dataset': '/guide/dataset/third-party/lark_dataset',
  '/guide/knowledge_base/feishu_dataset': '/guide/dataset/third-party/lark_dataset',
  '/guide/knowledge_base/yuque_dataset': '/guide/dataset/third-party/yuque_dataset',
  '/guide/knowledge_base/dingtalk_dataset': '/guide/dataset/third-party/dingtalk_dataset',
  '/guide/knowledge_base/third_dataset': '/guide/dataset/third-party/third_dataset',
  '/guide/knowledge_base/RAG': '/guide/dataset/rag',

  // Dashboard pages that moved to different build sub-sections.
  '/workflow': '/guide/build/workflow/intro',
  '/workflow/intro': '/guide/build/workflow/intro',
  '/workflow/modules': '/guide/build/workflow/nodes/ai_chat',
  '/workflow/modules/coreferenceresolution': '/guide/build/workflow/nodes/coreferenceResolution',
  '/guide/dashboard': '/guide/build/workflow/intro',
  '/guide/workbench': '/guide/build/workflow/intro',
  '/guide/dashboard/workflow': '/guide/build/workflow/intro',
  '/guide/workbench/workflow': '/guide/build/workflow/intro',
  '/guide/dashboard/evaluation': '/guide/build/evaluation',
  '/guide/dashboard/intro': '/guide/build/workflow/intro',
  '/guide/workbench/intro': '/guide/build/workflow/intro',
  '/guide/dashboard/basic-mode': '/guide/build/chat-agent',
  '/guide/workbench/basic-mode': '/guide/build/chat-agent',
  '/guide/dashboard/gapier': '/guide/build/tools/http_tools',
  '/guide/workbench/gapier': '/guide/build/tools/http_tools',
  '/guide/dashboard/mcp_server': '/guide/build/publish/mcp_server',
  '/guide/dashboard/mcp_tools': '/guide/build/tools/mcp_tools',
  '/guide/build/agentv2/startup': '/guide/build/agentv2/vm',
  '/guide/build/workflow/nodes/sandbox': '/guide/build/workflow/nodes/sandbox-v2',
  '/guide/build/workflow/nodes/laf': '/guide/build/workflow/nodes/sandbox-v2',
  '/guide/plugins': '/plugin/team-installation',
  '/guide/plugins/design_plugin': '/plugin/intro',
  '/guide/plugins/dev_system_tool': '/plugin/system-tool-development',
  '/guide/build/tools/system-plugins/dev_system_tool': '/plugin/system-tool-development',
  '/guide/build/tools/system-plugins/how_to_submit_system_plugin': '/plugin/system-tool-development',
  '/guide/build/tools/system-plugins/bing_search_plugin': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/doc2x_plugin_guide': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/google_search_plugin_guide': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/searxng_plugin_guide': '/plugin/team-installation',
  '/guide/build/publish/iframe_integration': '/guide/build/publish/link',
  '/guide/build/publish/onwechat': '/guide/build/publish/wechat',

  // Section folder landings.
  '/guide/build': '/guide/build/chat-agent',
  '/guide/build/agentv2': '/guide/build/agentv2/settings',
  '/guide/build/general': '/guide/build/general/ai_settings',
  '/guide/build/publish': '/guide/build/publish/versions',
  '/guide/build/skill': '/guide/build/skill/intro',
  '/guide/build/tools': '/guide/build/tools/overview',
  '/guide/build/tools/system-plugins': '/guide/build/tools/system-plugins/upload_system_tool',
  '/guide/build/workflow': '/guide/build/workflow/intro',
  '/guide/build/workflow/nodes': '/guide/build/workflow/nodes/ai_chat',
  '/guide/chat': '/guide/chat/html',
  '/guide/dataset': '/guide/dataset/lifecycle',
  '/guide/dataset/third-party': '/guide/dataset/third-party/api_dataset',
  '/guide/getting-started/examples': '/guide/getting-started/examples/email-assistant',
  '/guide/version': '/guide/version/cloud/intro',
  '/guide/version/cloud': '/guide/version/cloud/intro',
  '/guide/version/opensource': '/guide/version/opensource/intro',
  '/guide/workspace': '/guide/workspace/team/team_roles_permissions',
  '/guide/workspace/team': '/guide/workspace/team/team_roles_permissions',

  // Workspace.
  '/introduction/commercial': '/guide/version/commercial',
  '/guide/team_permissions': '/guide/workspace/team/team_roles_permissions',
  '/guide/workspace/team/customDomain': '/guide/workspace/customDomain',
  '/guide/DialogBoxes': '/guide/chat/html',
  '/guide/admin': '/guide/admin/platform-console',

  // Historical FAQ subpages.
  '/faq/app': '/guide/build/faq',
  '/faq/dataset': '/guide/dataset/faq',
  '/faq/external_channel_integration': '/guide/build/publish/versions',
  '/use-cases/external-integration': '/guide/build/publish/versions',
  '/use-cases/ai_settings': '/guide/build/general/ai_settings',
  '/use-cases/datasetengine': '/guide/dataset/rag',
  '/use-cases/feishu-bot': '/guide/build/publish/feishu',
  '/use-cases/wecom-bot': '/guide/build/publish/wecom',
  '/use-cases/dingtalk-bot': '/guide/build/publish/dingtalk',
  '/use-cases/official_account': '/guide/build/publish/official_account',
  '/use-cases/onwechat': '/guide/build/publish/wechat',
  '/use-cases/app-cases': '/guide/getting-started/examples/email-assistant',
  '/use-cases/app-cases/english_essay_correction_bot': '/guide/getting-started/first-agent',
  '/use-cases/app-cases/multi_turn_translation_bot': '/guide/getting-started/first-workflow',
  '/use-cases/app-cases/feishu_webhook': '/guide/build/publish/feishu',
  '/use-cases/app-cases/google_search': '/plugin/team-installation',
  '/use-cases/app-cases/lab_appointment': '/guide/build/workflow/nodes/form_input',
  '/use-cases/app-cases/submit_application_template': '/guide/build/workflow/nodes/form_input',
  '/faq/other': '/guide/version/cloud/faq',
  '/faq/points_consumption': '/guide/version/cloud/faq',
  '/faq/attention': '/self-host/troubleshooting/attention',
  '/faq/docker': '/self-host/troubleshooting/faq',
  '/faq/error': '/self-host/troubleshooting/faq',
  '/faq/privateDeploy': '/self-host/troubleshooting/faq',

  // Navbar redirects.
  '/guide': defaultHomePath,
  '/use-cases': defaultHomePath,
  '/openapi': '/openapi/intro',
  // 应用调用与会话教程改由最佳实践承接，保留旧书签的直达入口。
  '/openapi/app': '/openapi/best-practices/app-integration',
  '/openapi/chat': '/openapi/best-practices/app-integration',
  '/openapi/best-practices': '/openapi/intro',
  '/openapi/swagger': '/openapi/intro',
  '/openapi/share': '/guide/build/publish/link',
  '/plugin': '/plugin/intro',
  '/faq': '/faq/chat'
};

// Standalone historical showcases retired with no active replacement return HTTP 410 Gone.
const retiredTopicPaths = new Set([
  '/use-cases/app-cases/dalle3',
  '/use-cases/app-cases/fixingevidence',
  '/use-cases/app-cases/translate-subtitle-using-gpt'
]);

// Prefix redirects for groups that kept the same slug after moving.
const prefixMap: Record<string, string> = {
  '/introduction/FAQ': '/faq',
  '/FAQ': '/faq',
  '/installation/upgrading': '/self-host/upgrading',
  '/installation': '/self-host',
  '/upgrading': '/self-host/upgrading',
  '/introduction/openapi': '/openapi',
  '/introduction/guide': '/guide',
  '/introduction/development': '/development',
  '/development/openapi': '/openapi',
  '/development/modelConfig': '/self-host/config/model',
  '/development': '/self-host',

  // Project code in PR 6880 changed these three old groups.
  '/use-cases/external-integration': '/guide/build/publish',
  '/workflow/modules': '/guide/build/workflow/nodes',
  '/workflow': '/guide/build/workflow',
  '/course': '/guide/course',
  '/guide/dashboard/workflow': '/guide/build/workflow/nodes',
  '/guide/workbench/workflow': '/guide/build/workflow/nodes',
  '/guide/knowledge_base': '/guide/dataset',

  // Other moved documentation groups.
  '/guide/plugins': '/guide/build/tools/system-plugins',
  '/guide/team_permissions': '/guide/workspace/team',
  '/guide/DialogBoxes': '/guide/chat',

  '/self-host/modelConfig': '/self-host/config/model',
  '/introduction/version': '/guide/version',
  '/introduction/cloud': '/guide/version/cloud',
  '/introduction/opensource': '/guide/version/opensource',
  '/introduction': '/guide'
};

const exactMapLower = new Map<string, string>(
  Object.entries(exactMap).map(([key, value]) => [key.toLowerCase(), value])
);
const prefixEntries = Object.entries(prefixMap).map(([oldPrefix, newPrefix]) => ({
  oldPrefixLower: oldPrefix.toLowerCase(),
  length: oldPrefix.length,
  newPrefix
}));

// Build O(1) case-insensitive slug lookup and automatic upgrading folder fallbacks from content metadata.
const lowercaseSlugMap = new Map<string, string>();
const upgradingFolderFallbackMap = new Map<string, string>();
const knownSlugsByLocale: Record<'zh-CN' | 'en', Set<string>> = {
  'zh-CN': new Set<string>(),
  en: new Set<string>()
};
for (const rawKey of Object.keys(docLastModifiedData)) {
  if (!rawKey.startsWith('content/')) continue;
  const isEnFile = rawKey.endsWith('.en.mdx');
  const slug = rawKey
    .slice('content'.length)
    .replace(/(?:\.en)?\.mdx$/, '')
    .replace(/\/index$/, '');
  if (slug) {
    knownSlugsByLocale[isEnFile ? 'en' : 'zh-CN'].add(slug);
  }
  if (isEnFile) continue;
  if (slug && slug !== '/toc') {
    lowercaseSlugMap.set(slug.toLowerCase(), slug);
  }
  const minorMatch = slug.match(/^(\/self-host\/upgrading\/4-\d+)\/(\d+)$/);
  if (minorMatch) {
    const [, folderPath] = minorMatch;
    const folderLower = folderPath.toLowerCase();
    const previous = upgradingFolderFallbackMap.get(folderLower);
    if (previous === undefined || slug.localeCompare(previous, undefined, { numeric: true }) > 0) {
      upgradingFolderFallbackMap.set(folderLower, slug);
    }
  }
}

const i18nMiddleware = createI18nMiddleware(i18n);
const documentCacheControl = 'public, max-age=0, must-revalidate';
const previewRobotsTag = 'noindex, nofollow';
const PRODUCTION_HOST_LOCALES: Record<string, 'zh-CN' | 'en'> = {
  'doc.fastgpt.cn': 'zh-CN',
  'doc.fastgpt.in': 'zh-CN',
  'doc.fastgpt.io': 'en',
  'doc.tryfastgpt.ai': 'en'
};
const CANONICAL_PRODUCTION_HOSTS = new Set(['doc.fastgpt.cn', 'doc.fastgpt.io']);

function resolveContainerOwnerLocale(): 'zh-CN' | 'en' | undefined {
  const variant = resolveDocsSiteVariant({
    siteVariant: process.env.NEXT_PUBLIC_DOCS_SITE_VARIANT ?? process.env.DOCS_SITE_VARIANT,
    homeOrigin: process.env.NEXT_PUBLIC_FASTGPT_HOME_DOMAIN ?? process.env.FASTGPT_HOME_DOMAIN
  });
  if (variant === 'cn') {
    return 'zh-CN';
  }
  if (variant === 'io') {
    return 'en';
  }
  return undefined;
}

/** Strip trailing slashes and /index suffixes from non-root paths. */
function normalizePath(path: string) {
  if (path.length <= 1) return path;
  const trimmed = path.replace(/\/+$/, '');
  return /\/index$/i.test(trimmed) ? trimmed.slice(0, -'/index'.length) || '/' : trimmed;
}

function applyRedirectMaps(path: string): string | null {
  const pathLower = path.toLowerCase();
  const matchesPrefixLower = (prefixLower: string) =>
    pathLower === prefixLower || pathLower.startsWith(`${prefixLower}/`);

  if (path in exactMap) return exactMap[path];
  const exactCi = exactMapLower.get(pathLower);
  if (exactCi !== undefined) return exactCi;

  const upgradingFallback = upgradingFolderFallbackMap.get(pathLower);
  if (upgradingFallback !== undefined) return upgradingFallback;

  if (matchesPrefixLower('/use-cases/app-cases')) return '/guide/getting-started';
  if (matchesPrefixLower('/shopping_cart') || matchesPrefixLower('/introduction/shopping_cart')) {
    return '/guide/version/commercial';
  }
  if (
    matchesPrefixLower('/introduction/development/proxy') ||
    matchesPrefixLower('/self-host/proxy')
  ) {
    return '/self-host/deploy/docker';
  }
  const outdatedUpgradeMatch = pathLower.match(
    /^\/self-host\/upgrading\/(?:4-(?:8|9|10|11)\/)?(4(?:[0-9]|1[01])\d*)$/
  );
  if (outdatedUpgradeMatch) {
    return `/self-host/upgrading/outdated/${outdatedUpgradeMatch[1]}`;
  }
  for (const { oldPrefixLower, length, newPrefix } of prefixEntries) {
    if (matchesPrefixLower(oldPrefixLower)) {
      return newPrefix + path.slice(length);
    }
  }
  const canonicalCaseSlug = lowercaseSlugMap.get(pathLower);
  if (canonicalCaseSlug !== undefined && canonicalCaseSlug !== path) {
    return canonicalCaseSlug;
  }
  return null;
}

/** Resolve legacy chains before issuing a single permanent redirect. */
function resolveLegacyPath(path: string): string {
  let target = path;
  for (let step = 0; step < 10; step++) {
    const next = applyRedirectMaps(target);
    if (next === null || next === target) return target;
    target = next;
  }
  return target;
}

function createRedirectUrl(params: {
  target: string;
  request: NextRequest;
  lang: string;
  ownerLocale?: 'zh-CN' | 'en';
}) {
  const { target, request, lang, ownerLocale } = params;
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  const resolvedLang: 'zh-CN' | 'en' = lang === 'en' ? 'en' : 'zh-CN';
  const isProductionHost = host !== undefined && host in PRODUCTION_HOST_LOCALES;
  const isOwnerMode = ownerLocale !== undefined;

  const origin = (() => {
    if (isProductionHost || (isOwnerMode && resolvedLang !== ownerLocale)) {
      return getFastGPTDocsOriginForLocale(resolvedLang);
    }
    return request.url;
  })();

  const targetPath = target !== '' ? target : '/';
  const destinationPath = isOwnerMode ? targetPath : `/${resolvedLang}${targetPath}`;
  const url = new URL(destinationPath, origin);
  url.search = request.nextUrl.search;
  return url;
}

function createRootRedirectUrl({
  pathname,
  request,
  lang,
  ownerLocale
}: {
  pathname: string;
  request: NextRequest;
  lang: string;
  ownerLocale?: 'zh-CN' | 'en';
}) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  const resolvedLang: 'zh-CN' | 'en' = lang === 'en' ? 'en' : 'zh-CN';
  const isProductionHost = host !== undefined && host in PRODUCTION_HOST_LOCALES;
  const origin = (() => {
    if (isProductionHost || (ownerLocale !== undefined && resolvedLang !== ownerLocale)) {
      return getFastGPTDocsOriginForLocale(resolvedLang);
    }
    return request.url;
  })();
  const url = new URL(pathname, origin);
  url.search = request.nextUrl.search;
  return url;
}

function createRewriteUrl(pathname: string, request: NextRequest): URL {
  const url = new URL(pathname, request.url);
  url.search = request.nextUrl.search;
  return url;
}

function applyDiscoveryHeaders(params: {
  response: NextResponse;
  lang: string;
  isOwnerMode: boolean;
}): NextResponse {
  const { response, lang, isOwnerMode } = params;
  response.headers.set('Content-Language', lang === 'en' ? 'en' : 'zh-CN');
  if (!isOwnerMode) {
    response.headers.set('X-Robots-Tag', previewRobotsTag);
  }
  return response;
}

function permanentRedirect(url: URL | string): NextResponse {
  const response = NextResponse.redirect(url, 301);
  response.headers.set('Cache-Control', 'public, max-age=3600');
  return response;
}

function createGoneResponse(params: { lang: string; isOwnerMode: boolean }): NextResponse {
  const { lang, isOwnerMode } = params;
  const isEn = lang === 'en';
  const resolvedLocale = isEn ? 'en' : 'zh-CN';
  const homeHref = isOwnerMode ? defaultHomePath : `/${resolvedLocale}${defaultHomePath}`;
  const title = isEn ? '410 — Documentation Topic Retired' : '410 — 历史案例已下线';
  const message = isEn
    ? 'This historical showcase has been retired. Explore maintained tutorials and workflow guides from the documentation home.'
    : '该早期应用案例已归档下线，请前往文档首页查看现行快速上手教程与工作流实操案例。';
  const cta = isEn ? 'Open FastGPT Documentation Home' : '前往 FastGPT 文档首页';
  const html = `<!DOCTYPE html><html lang="${resolvedLocale}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>${title} | FastGPT</title></head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;text-align:center;line-height:1.6"><h1>${title}</h1><p>${message}</p><p><a href="${homeHref}">${cta}</a></p></body></html>`;

  return new NextResponse(html, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': resolvedLocale,
      'X-Robots-Tag': 'noindex'
    }
  });
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass static CLI skill specification straight through without locale routing.
  if (pathname === '/cli/skill.md') {
    return NextResponse.next();
  }

  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  const hostLocale = host !== undefined ? PRODUCTION_HOST_LOCALES[host] : undefined;
  const isLegacyProductionHost = Boolean(
    host !== undefined && hostLocale !== undefined && !CANONICAL_PRODUCTION_HOSTS.has(host)
  );
  const ownerLocale = hostLocale ?? resolveContainerOwnerLocale();
  const isOwnerMode = ownerLocale !== undefined;

  // Redirect root discovery and search index endpoints on legacy domains to their canonical owner host,
  // while passing canonical and preview root endpoints straight through untouched.
  if (
    /^\/(?:robots\.txt|sitemap[^/]*\.xml|llms(?:-(?:full|guide|openapi|self-host))?\.txt|pricing\.md|static\.json(?:\/.*)?)$/i.test(
      pathname
    )
  ) {
    const canonicalRootPath = /^\/static\.json/i.test(pathname)
      ? pathname
      : pathname.toLowerCase();
    if (isLegacyProductionHost && hostLocale !== undefined) {
      return permanentRedirect(
        createRootRedirectUrl({
          pathname: canonicalRootPath,
          request,
          lang: hostLocale,
          ownerLocale
        })
      );
    }
    if (pathname !== canonicalRootPath && ownerLocale !== undefined) {
      return permanentRedirect(
        createRootRedirectUrl({
          pathname: canonicalRootPath,
          request,
          lang: ownerLocale,
          ownerLocale
        })
      );
    }
    return NextResponse.next();
  }

  const cookieLocale = request.cookies.get('FD_LOCALE')?.value;
  const previewDefaultLang =
    cookieLocale !== undefined && i18n.languages.includes(cookieLocale)
      ? cookieLocale
      : i18n.defaultLanguage;

  let lang = ownerLocale ?? previewDefaultLang;
  let pathWithoutLang = pathname;
  let hasLangPrefix = false;
  let hasLegacyLocalePrefix = false;

  for (const language of i18n.languages) {
    if (pathname === `/${language}` || pathname.startsWith(`/${language}/`)) {
      lang = language;
      pathWithoutLang = pathname.slice(`/${language}`.length);
      hasLangPrefix = true;
      break;
    }
  }
  if (!hasLangPrefix) {
    const legacyLocaleMatch = pathname.match(/^\/(zh-cn|zh|en)(?=\/|$)(.*)$/i);
    if (legacyLocaleMatch !== null) {
      lang = legacyLocaleMatch[1].toLowerCase() === 'en' ? 'en' : 'zh-CN';
      pathWithoutLang = legacyLocaleMatch[2];
      hasLegacyLocalePrefix = true;
    }
  }

  // Redirect locale-prefixed discovery endpoints on production hosts to their root owner paths.
  if (
    /^\/(?:robots\.txt|sitemap[^/]*\.xml|llms(?:-(?:full|guide|openapi|self-host))?\.txt)$/i.test(
      pathWithoutLang
    )
  ) {
    const canonicalDiscoveryPath = pathWithoutLang.toLowerCase();
    if (
      isOwnerMode &&
      (hasLangPrefix ||
        hasLegacyLocalePrefix ||
        isLegacyProductionHost ||
        lang !== ownerLocale ||
        pathname !== canonicalDiscoveryPath)
    ) {
      return permanentRedirect(
        createRootRedirectUrl({ pathname: canonicalDiscoveryPath, request, lang, ownerLocale })
      );
    }
  }

  // Standalone single-page Markdown endpoint (`/{...slug}.md` on owner hosts, `/{lang}/{...slug}.md` on preview).
  if (/\.md$/i.test(pathWithoutLang)) {
    const rawBase = pathWithoutLang.slice(0, -3);
    const hasDocsPrefix = /^\/docs(?=\/|$)/i.test(rawBase);
    const strippedBase = hasDocsPrefix ? normalizePath(rawBase).slice('/docs'.length) : rawBase;
    const normalizedBase = normalizePath(strippedBase);
    if (normalizedBase.toLowerCase() === '/pricing') {
      return permanentRedirect(
        createRootRedirectUrl({ pathname: '/pricing.md', request, lang, ownerLocale })
      );
    }
    if (retiredTopicPaths.has(normalizedBase.toLowerCase())) {
      return createGoneResponse({ lang, isOwnerMode });
    }
    const mappedBase = resolveLegacyPath(normalizedBase);
    const isSameOwnerLocale = isOwnerMode && !isLegacyProductionHost && lang === ownerLocale;
    const hasKnownOwnerMdTarget =
      ownerLocale !== undefined &&
      mappedBase !== '/toc' &&
      knownSlugsByLocale[ownerLocale].has(mappedBase);
    const requiresOwnerMdRedirect =
      isOwnerMode &&
      (!isSameOwnerLocale || hasKnownOwnerMdTarget) &&
      (hasLangPrefix ||
        hasLegacyLocalePrefix ||
        hasDocsPrefix ||
        mappedBase !== rawBase ||
        isLegacyProductionHost ||
        lang !== ownerLocale);
    const requiresPreviewMdRedirect =
      !isOwnerMode &&
      (!hasLangPrefix || hasLegacyLocalePrefix || hasDocsPrefix || mappedBase !== rawBase);

    if (
      requiresOwnerMdRedirect ||
      requiresPreviewMdRedirect
    ) {
      return permanentRedirect(
        createRedirectUrl({ target: `${mappedBase}.md`, request, lang, ownerLocale })
      );
    }

    const targetLocale = ownerLocale ?? lang;
    return applyDiscoveryHeaders({
      response: NextResponse.rewrite(
        createRewriteUrl(`/api/doc-markdown/${targetLocale}${mappedBase}`, request)
      ),
      lang: targetLocale,
      isOwnerMode
    });
  }

  // Legacy /docs/* URLs: strip the /docs prefix and run redirect-match.
  // Always 301 to the canonical (no-/docs) path, even if no map entry matches.
  if (/^\/docs(?=\/|$)/i.test(pathWithoutLang)) {
    const stripped = normalizePath(pathWithoutLang).slice('/docs'.length);
    if (retiredTopicPaths.has(stripped.toLowerCase())) {
      return createGoneResponse({ lang, isOwnerMode });
    }
    const finalPath = resolveLegacyPath(stripped);
    if (
      isOwnerMode &&
      !isLegacyProductionHost &&
      lang === ownerLocale &&
      !knownSlugsByLocale[ownerLocale].has(finalPath)
    ) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-pathname', pathname);
      return applyDiscoveryHeaders({
        response: NextResponse.rewrite(
          createRewriteUrl(`/${ownerLocale}${finalPath}`, request),
          { request: { headers: requestHeaders } }
        ),
        lang: ownerLocale,
        isOwnerMode: true
      });
    }
    return permanentRedirect(
      createRedirectUrl({ target: finalPath, request, lang, ownerLocale })
    );
  }

  // Non-/docs paths still consult the same maps so that direct hits on old
  // canonical paths (e.g. /upgrading) get redirected to their new home.
  const normalizedPath = normalizePath(pathWithoutLang);
  if (retiredTopicPaths.has(normalizedPath.toLowerCase())) {
    return createGoneResponse({ lang, isOwnerMode });
  }
  const mapped = resolveLegacyPath(normalizedPath);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  const acceptHeader = request.headers.get('accept') ?? '';
  const prefersMarkdown =
    acceptHeader.includes('text/markdown') &&
    !acceptHeader.includes('text/html') &&
    normalizedPath.length > 1;

  // Production owner mode serves unprefixed canonical URLs and 301-redirects any locale prefix.
  if (isOwnerMode) {
    const requiresCrossHostRedirect = isLegacyProductionHost || lang !== ownerLocale;
    const requiresSameHostRedirect =
      (hasLangPrefix || hasLegacyLocalePrefix || mapped !== pathWithoutLang) &&
      knownSlugsByLocale[ownerLocale].has(mapped);

    if (
      requiresCrossHostRedirect ||
      requiresSameHostRedirect
    ) {
      return permanentRedirect(
        createRedirectUrl({ target: mapped, request, lang, ownerLocale })
      );
    }

    if (prefersMarkdown) {
      const markdownResponse = NextResponse.rewrite(
        createRewriteUrl(`/api/doc-markdown/${ownerLocale}${mapped}`, request)
      );
      markdownResponse.headers.append('Vary', 'Accept');
      return applyDiscoveryHeaders({
        response: markdownResponse,
        lang: ownerLocale,
        isOwnerMode: true
      });
    }

    const rewriteResponse = NextResponse.rewrite(
      createRewriteUrl(`/${ownerLocale}${mapped}`, request),
      { request: { headers: requestHeaders } }
    );
    rewriteResponse.headers.set('Cache-Control', documentCacheControl);
    rewriteResponse.headers.append('Vary', 'Accept');
    if (cookieLocale !== undefined && cookieLocale !== ownerLocale) {
      rewriteResponse.cookies.set('FD_LOCALE', ownerLocale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      });
    }
    return applyDiscoveryHeaders({
      response: rewriteResponse,
      lang: ownerLocale,
      isOwnerMode: true
    });
  }

  if (mapped !== pathWithoutLang || hasLegacyLocalePrefix) {
    return permanentRedirect(createRedirectUrl({ target: mapped, request, lang }));
  }

  if (hasLangPrefix) {
    if (prefersMarkdown) {
      const rewriteResponse = NextResponse.rewrite(
        createRewriteUrl(`/api/doc-markdown/${lang}${normalizedPath}`, request)
      );
      rewriteResponse.headers.append('Vary', 'Accept');
      return applyDiscoveryHeaders({
        response: rewriteResponse,
        lang,
        isOwnerMode: false
      });
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Cache-Control', documentCacheControl);
    response.headers.append('Vary', 'Accept');
    if (cookieLocale !== undefined && cookieLocale !== lang) {
      response.cookies.set('FD_LOCALE', lang, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      });
    }
    return applyDiscoveryHeaders({
      response,
      lang,
      isOwnerMode: false
    });
  }

  // Preview mode without a locale prefix checks cookie preference before Accept-Language fallback.
  if (cookieLocale !== undefined && i18n.languages.includes(cookieLocale)) {
    const newUrl = new URL(`/${cookieLocale}${pathname}`, request.url);
    newUrl.search = request.nextUrl.search;
    const response = NextResponse.redirect(newUrl, 301);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // @ts-expect-error - Fumadocs middleware signature mismatch
  const fallbackResponse = i18nMiddleware(request) as NextResponse;
  fallbackResponse.headers.set('X-Robots-Tag', previewRobotsTag);
  return fallbackResponse;
}

// Keep static search index, sitemaps, and public assets unprefixed without locale redirects.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon(?:\\.ico|/)|cli/skill\\.md$|.*\\.(?:svg|png|jpe?g|webp)|deploy/.*|examples/.*).*)'
  ]
};
