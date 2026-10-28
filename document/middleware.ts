import { createI18nMiddleware } from 'fumadocs-core/i18n';
import { defaultHomePath, i18n } from '@/lib/i18n';
import { getFastGPTDocsOriginForLocale } from '@/lib/docs-locale';
import { type NextRequest, NextResponse } from 'next/server';

// Old path redirects mapping. Keys/values are POST-strip (no /docs prefix).
// Old links like /docs/foo are first stripped to /foo, then matched here.
const exactMap: Record<string, string> = {
  '': defaultHomePath,
  '/': defaultHomePath,
  '/intro': defaultHomePath,

  // Version / home.
  '/commercial/intro': '/guide/version/commercial',
  '/shopping_cart/intro': '/guide/version/commercial',
  '/introduction': defaultHomePath,
  '/introduction/community': defaultHomePath,
  '/introduction/shopping_cart/intro': '/guide/version/commercial',
  '/introduction/cloud': '/guide/version/cloud/intro',
  '/introduction/opensource': '/guide/version/opensource/intro',
  '/introduction/version': '/guide/version/commercial',
  '/protocol/terms': '/guide/version/cloud/terms',
  '/protocol/privacy': '/guide/version/cloud/privacy',

  // Self-host.
  '/upgrading/intro': '/self-host/upgrading/upgrade-instruction',
  '/upgrading': '/self-host/upgrading/upgrade-instruction',
  '/self-host/upgrading/intro': '/self-host/upgrading/upgrade-instruction',
  // Pre-rename misspellings of the upgrade page keep resolving.
  '/self-host/upgrading/upgrade-intruction': '/self-host/upgrading/upgrade-instruction',
  '/upgrading/upgrade-intruction': '/self-host/upgrading/upgrade-instruction',
  '/self-host/upgrading/4-15/4150': '/self-host/upgrading/4-15/41500',
  '/self-host/upgrading/4-16/4163': '/self-host/upgrading/4-17/4170',
  '/development/docker': '/self-host/deploy/docker',
  '/development/sealos': '/self-host/deploy/sealos',
  '/development/intro': '/self-host/dev',
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
  '/guide/knowledge_base/api_dataset': '/guide/dataset/third-party/api_dataset',
  '/guide/knowledge_base/lark_dataset': '/guide/dataset/third-party/lark_dataset',
  '/guide/knowledge_base/feishu_dataset': '/guide/dataset/third-party/lark_dataset',
  '/guide/knowledge_base/yuque_dataset': '/guide/dataset/third-party/yuque_dataset',
  '/guide/knowledge_base/dingtalk_dataset': '/guide/dataset/third-party/dingtalk_dataset',
  '/guide/knowledge_base/third_dataset': '/guide/dataset/third-party/third_dataset',
  '/guide/knowledge_base/RAG': '/guide/dataset/rag',

  // Dashboard pages that moved to different build sub-sections.
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
  '/guide/build/tools/system-plugins/bing_search_plugin': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/doc2x_plugin_guide': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/google_search_plugin_guide': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/searxng_plugin_guide': '/plugin/team-installation',

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
  '/openapi/share': '/guide/build/publish/link',
  '/plugin': '/plugin/intro',
  '/faq': '/faq/chat'
};

// Prefix redirects for groups that kept the same slug after moving.
const prefixMap: Record<string, string> = {
  '/introduction/FAQ': '/faq',
  '/FAQ': '/faq',
  '/shopping_cart': '/guide/version/commercial',
  '/upgrading': '/self-host/upgrading',
  '/introduction/guide': '/guide',
  '/introduction/development': '/development',
  '/development/openapi': '/openapi',
  '/development/modelConfig': '/self-host/config/model',
  '/development': '/self-host',

  // Project code in PR 6880 changed these three old groups.
  '/use-cases/external-integration': '/guide/build/publish',
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

const i18nMiddleware = createI18nMiddleware(i18n);
const documentCacheControl = 'public, max-age=0, must-revalidate';

/** Strip trailing slashes and /index suffixes from non-root paths. */
function normalizePath(path: string) {
  if (path.length <= 1) return path;
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.endsWith('/index') ? trimmed.slice(0, -'/index'.length) || '/' : trimmed;
}

function applyRedirectMaps(path: string): string | null {
  const matchesPrefix = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (path in exactMap) return exactMap[path];
  if (matchesPrefix('/use-cases/app-cases')) return '/guide/getting-started';
  if (matchesPrefix('/introduction/development/proxy') || matchesPrefix('/self-host/proxy')) {
    return '/self-host/deploy/docker';
  }
  const outdatedUpgradeMatch = path.match(
    /^\/self-host\/upgrading\/(?:4-(?:8|9|10|11)\/)?(4(?:[0-9]|1[01])\d*)$/
  );
  if (outdatedUpgradeMatch) {
    return `/self-host/upgrading/outdated/${outdatedUpgradeMatch[1]}`;
  }
  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    if (matchesPrefix(oldPrefix)) {
      return newPrefix + path.slice(oldPrefix.length);
    }
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

function createRedirectUrl(target: string, request: NextRequest, lang: string) {
  const host = request.headers.get('host')?.split(':')[0];
  const origin = host === 'doc.fastgpt.cn' || host === 'doc.fastgpt.io'
    ? getFastGPTDocsOriginForLocale(lang === 'en' ? 'en' : 'zh-CN')
    : request.url;
  const url = new URL(`/${lang}${target || '/'}`, origin);
  url.search = request.nextUrl.search;
  return url;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Extract language from pathname
  const host = request.headers.get('host')?.split(':')[0];
  const hostLocale = host === 'doc.fastgpt.cn' ? 'zh-CN' : host === 'doc.fastgpt.io' ? 'en' : undefined;
  let lang = hostLocale ?? i18n.defaultLanguage;
  let pathWithoutLang = pathname;
  let hasLegacyLocalePrefix = false;

  for (const language of i18n.languages) {
    if (pathname === `/${language}` || pathname.startsWith(`/${language}/`)) {
      lang = language;
      pathWithoutLang = pathname.slice(`/${language}`.length);
      break;
    }
  }
  if (pathWithoutLang === pathname) {
    const legacyZhMatch = pathname.match(/^\/(?:zh-cn|zh)(?=\/|$)(.*)$/i);
    if (legacyZhMatch) {
      lang = 'zh-CN';
      pathWithoutLang = legacyZhMatch[1];
      hasLegacyLocalePrefix = true;
    }
  }

  // Legacy /docs/* URLs: strip the /docs prefix and run redirect-match.
  // Always 301 to the canonical (no-/docs) path, even if no map entry matches.
  if (pathWithoutLang === '/docs' || pathWithoutLang.startsWith('/docs/')) {
    const stripped = normalizePath(pathWithoutLang).slice('/docs'.length); // '' for /docs, /foo for /docs/foo
    const finalPath = resolveLegacyPath(stripped);
    return NextResponse.redirect(createRedirectUrl(finalPath, request, lang), 301);
  }

  // Non-/docs paths still consult the same maps so that direct hits on old
  // canonical paths (e.g. /upgrading) get redirected to their new home.
  const normalizedPath = normalizePath(pathWithoutLang);
  const mapped = resolveLegacyPath(normalizedPath);
  if (mapped !== pathWithoutLang || hasLegacyLocalePrefix) {
    return NextResponse.redirect(createRedirectUrl(mapped, request, lang), 301);
  }

  if (hostLocale && lang !== hostLocale) {
    return NextResponse.redirect(createRedirectUrl(normalizedPath, request, lang), 301);
  }

  // Build enhanced request headers so server components (e.g. (docs)/layout)
  // can read the current pathname via `headers().get('x-pathname')`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  // Check if URL has a language prefix
  const hasLangPrefix = i18n.languages.some(
    (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
  );

  if (hasLangPrefix) {
    // Pass through with x-pathname; sync FD_LOCALE cookie if mismatched.
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Static HTML references build-hashed chunks. Reusing HTML across image rollouts can
    // point the browser at chunks that only exist in the previous deployment.
    response.headers.set('Cache-Control', documentCacheControl);
    const currentCookie = request.cookies.get('FD_LOCALE')?.value;
    if (currentCookie !== lang) {
      response.cookies.set('FD_LOCALE', lang, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      });
    }
    return response;
  }

  if (hostLocale) {
    return NextResponse.redirect(createRedirectUrl(normalizedPath, request, hostLocale), 301);
  }

  // No language prefix — check cookie for user's language preference
  const cookieLocale = request.cookies.get('FD_LOCALE')?.value;
  if (cookieLocale && i18n.languages.includes(cookieLocale)) {
    const newUrl = new URL(`/${cookieLocale}${pathname}`, request.url);
    newUrl.search = request.nextUrl.search;
    return NextResponse.redirect(newUrl, 301);
  }

  // Fall back to fumadocs i18n (Accept-Language detection / redirect)
  // @ts-expect-error - Fumadocs middleware signature mismatch
  return i18nMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon(?:\\.ico|/)|robots\\.txt|sitemap.*\\.xml|static\\.json|.*\\.(?:svg|png|jpe?g|webp)|deploy/.*|examples/.*).*)'
  ]
};
