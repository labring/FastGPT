import { defaultHomePath, i18n } from '@/lib/i18n';
import { type NextRequest, NextResponse } from 'next/server';
import { getHostLocalePath, getSiteDefaultLocale } from '@/lib/site';

// Old path redirects mapping. Keys/values are POST-strip (no /docs prefix).
// Old links like /docs/foo are first stripped to /foo, then matched here.
const exactMap: Record<string, string> = {
  '': defaultHomePath,
  '/intro': defaultHomePath,

  // Version / home.
  '/commercial/intro': '/guide/version/commercial',
  '/introduction': defaultHomePath,
  '/introduction/shopping_cart/intro': '/guide/version/commercial',
  '/introduction/cloud': '/guide/version/cloud/intro',
  '/protocol/terms': '/guide/version/cloud/terms',
  '/protocol/privacy': '/guide/version/cloud/privacy',

  // Self-host.
  '/upgrading/intro': '/self-host/upgrading/upgrade-instruction',
  '/upgrading': '/self-host/upgrading/upgrade-instruction',
  // Pre-rename misspellings of the upgrade page keep resolving.
  '/self-host/upgrading/upgrade-intruction': '/self-host/upgrading/upgrade-instruction',
  '/upgrading/upgrade-intruction': '/self-host/upgrading/upgrade-instruction',
  '/introduction/development/docker': '/self-host/deploy/docker',
  '/introduction/development/sealos': '/self-host/deploy/sealos',
  '/introduction/development/intro': '/self-host/dev',
  '/introduction/development/object-storage': '/self-host/config/object-storage',

  // General config / getting started.
  '/introduction/guide/course/quick-start': '/guide/getting-started/quick-start',
  '/introduction/guide/course/ai_settings': '/guide/build/general/ai_settings',
  '/introduction/guide/course/chat_input_guide': '/guide/build/general/chat_input_guide',
  '/introduction/guide/course/fileinput': '/guide/build/general/fileInput',
  '/introduction/guide/course/fileInput': '/guide/build/general/fileInput',

  // Knowledge base third-party pages moved under dataset/third-party.
  '/introduction/guide/knowledge_base/api_dataset': '/guide/dataset/third-party/api_dataset',
  '/introduction/guide/knowledge_base/lark_dataset': '/guide/dataset/third-party/lark_dataset',
  '/introduction/guide/knowledge_base/feishu_dataset': '/guide/dataset/third-party/lark_dataset',
  '/introduction/guide/knowledge_base/yuque_dataset':
    '/guide/dataset/third-party/yuque_dataset',
  '/introduction/guide/knowledge_base/dingtalk_dataset':
    '/guide/dataset/third-party/dingtalk_dataset',
  '/introduction/guide/knowledge_base/third_dataset':
    '/guide/dataset/third-party/third_dataset',
  '/introduction/guide/knowledge_base/RAG': '/guide/dataset/rag',

  // Dashboard pages that moved to different build sub-sections.
  '/introduction/guide/dashboard/evaluation': '/guide/build/evaluation',
  '/introduction/guide/dashboard/intro': '/guide/build/workflow/intro',
  '/introduction/guide/dashboard/mcp_server': '/guide/build/publish/mcp_server',
  '/introduction/guide/dashboard/mcp_tools': '/guide/build/tools/mcp_tools',
  '/guide/build/tools/system-plugins/dev_system_tool': '/plugin/system-tool-development',

  // Workspace.
  '/introduction/commercial': '/guide/version/commercial',

  // Navbar redirects.
  '/guide': defaultHomePath,
  '/use-cases': defaultHomePath,
  '/self-host': '/self-host/deploy/docker',
  '/openapi': '/openapi/intro',
  '/openapi/share': '/guide/build/publish/link',
  '/faq': '/faq/chat'
};

// Prefix redirects for groups that kept the same slug after moving.
const prefixMap: Record<string, string> = {
  '/FAQ': '/faq',
  '/shopping_cart': '/guide/version/commercial',
  '/upgrading': '/self-host/upgrading',
  '/development': '/self-host',

  // Project code in PR 6880 changed these three old groups.
  '/use-cases/external-integration': '/guide/build/publish',
  '/introduction/guide/dashboard/workflow': '/guide/build/workflow/nodes',
  '/introduction/guide/knowledge_base': '/guide/dataset',

  // Other moved documentation groups.
  '/introduction/guide/plugins': '/guide/build/tools/system-plugins',
  '/introduction/guide/team_permissions': '/guide/workspace/team',
  '/introduction/guide/DialogBoxes': '/guide/chat',
  '/introduction/guide/admin': '/guide/admin',

  '/introduction/development/openapi': '/openapi',
  '/introduction/development': '/self-host',
  '/introduction/version': '/guide/version',
  '/introduction/cloud': '/guide/version/cloud',
  '/introduction/opensource': '/guide/version/opensource',
  '/introduction': '/guide'
};

// Per-domain default locale (io -> en, cn -> zh-CN), fixed at build time.
// Like fastgpt-home, the default locale is served WITHOUT a prefix; the other locale keeps it.
const siteDefaultLocale = getSiteDefaultLocale();
const documentCacheControl = 'public, max-age=0, must-revalidate';

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function applyRedirectMaps(path: string): string | null {
  if (path in exactMap) return exactMap[path];
  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    if (path.startsWith(oldPrefix)) {
      return newPrefix + path.slice(oldPrefix.length);
    }
  }
  return null;
}

function createRedirectUrl(target: string, request: NextRequest, lang: string) {
  if (/^https?:\/\//i.test(target)) {
    return new URL(target);
  }

  const url = new URL(getHostLocalePath(lang, target || '/'), request.url);
  url.search = request.nextUrl.search;
  return url;
}

function getPathLocale(pathname: string): string | undefined {
  const first = pathname.split('/')[1];
  return first && i18n.languages.includes(first) ? first : undefined;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathLocale = getPathLocale(pathname);
  const lang: string = pathLocale ?? siteDefaultLocale;
  const pathWithoutLang = pathLocale ? pathname.slice(`/${pathLocale}`.length) : pathname;

  // Static public files (images, etc.) are served as-is.
  if (!pathLocale && /\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith('/llms.txt')) {
    return NextResponse.next();
  }

  // Root path: permanent redirect to the default-locale landing page (no cookie /
  // Accept-Language sniffing, matching fastgpt-home). There is no docs index page.
  if (pathname === '/') {
    return NextResponse.redirect(createRedirectUrl(defaultHomePath, request, lang), 301);
  }

  // Legacy /docs/* URLs: strip the /docs prefix and run redirect-match.
  // Always 301 to the canonical (no-/docs) path, even if no map entry matches.
  if (pathWithoutLang === '/docs' || pathWithoutLang.startsWith('/docs/')) {
    const stripped = normalizePath(pathWithoutLang).slice('/docs'.length); // '' for /docs, /foo for /docs/foo
    const mapped = applyRedirectMaps(stripped);
    const finalPath = mapped ?? stripped;
    return NextResponse.redirect(createRedirectUrl(finalPath, request, lang), 301);
  }

  // Non-/docs paths still consult the same maps so that direct hits on old
  // canonical paths (e.g. /upgrading) get redirected to their new home.
  const normalizedPath = normalizePath(pathWithoutLang);
  const mapped = applyRedirectMaps(normalizedPath);
  if (mapped !== null && mapped !== pathWithoutLang) {
    return NextResponse.redirect(createRedirectUrl(mapped, request, lang), 301);
  }

  // Old prefixed URLs of the domain's default locale (io /en/*, cn /zh-CN/*) -> unprefixed.
  if (pathLocale === siteDefaultLocale) {
    return NextResponse.redirect(createRedirectUrl(pathWithoutLang || '/', request, lang), 301);
  }

  // Internal path always carries the locale segment ([lang] route).
  const internalPath = pathLocale ? pathname : `/${siteDefaultLocale}${pathname}`;

  // Build enhanced request headers so server components (e.g. (docs)/layout)
  // can read the current pathname via `headers().get('x-pathname')`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', internalPath);

  const response = pathLocale
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.rewrite(new URL(`${internalPath}${request.nextUrl.search}`, request.url), {
        request: { headers: requestHeaders }
      });
  // Static HTML references build-hashed chunks. Reusing HTML across image rollouts can
  // point the browser at chunks that only exist in the previous deployment.
  response.headers.set('Cache-Control', documentCacheControl);
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon(?:\\.ico|/)|robots\\.txt|sitemap.*\\.xml|.*\\.svg|.*\\.png|deploy/.*).*)'
  ]
};
