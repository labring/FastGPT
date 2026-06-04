import { createI18nMiddleware } from 'fumadocs-core/i18n';
import { defaultHomePath, i18n } from '@/lib/i18n';
import { type NextRequest, NextResponse } from 'next/server';

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
  '/upgrading/intro': '/self-host/upgrading/upgrade-intruction',
  '/upgrading': '/self-host/upgrading/upgrade-intruction',
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

  // Workspace.
  '/introduction/commercial': '/guide/version/commercial',

  // Navbar redirects.
  '/guide': defaultHomePath,
  '/use-cases': defaultHomePath,
  '/self-host': '/self-host/deploy/docker',
  '/openapi': '/openapi/intro',
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

const i18nMiddleware = createI18nMiddleware(i18n);

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

  return new URL(`/${lang}${target || '/'}`, request.url);
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Extract language from pathname
  let lang = i18n.defaultLanguage;
  let pathWithoutLang = pathname;

  for (const language of i18n.languages) {
    if (pathname.startsWith(`/${language}`)) {
      lang = language;
      pathWithoutLang = pathname.slice(`/${language}`.length);
      break;
    }
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
    const currentCookie = request.cookies.get('FD_LOCALE')?.value;
    if (currentCookie !== lang) {
      response.cookies.set('FD_LOCALE', lang, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      });
    }
    return response;
  }

  // No language prefix — check cookie for user's language preference
  const cookieLocale = request.cookies.get('FD_LOCALE')?.value;
  if (cookieLocale && i18n.languages.includes(cookieLocale)) {
    const newUrl = new URL(`/${cookieLocale}${pathname}`, request.url);
    newUrl.search = request.nextUrl.search;
    return NextResponse.redirect(newUrl);
  }

  // Fall back to fumadocs i18n (Accept-Language detection / redirect)
  // @ts-expect-error - Fumadocs middleware signature mismatch
  return i18nMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap.*\\.xml|.*\\.svg|.*\\.png|deploy/.*).*)'
  ]
};
