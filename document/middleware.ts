import { createI18nMiddleware } from 'fumadocs-core/i18n';
import { defaultHomePath, i18n } from '@/lib/i18n';
import { type NextRequest, NextResponse } from 'next/server';

// Old path redirects mapping. Keys/values are POST-strip (no /docs prefix).
// Old links like /docs/foo are first stripped to /foo, then matched here.
const exactMap: Record<string, string> = {
  '': defaultHomePath,
  '/intro': defaultHomePath,
  '/guide/dashboard/workflow/coreferenceresolution':
    '/guide/build/workflow/nodes/coreferenceResolution',
  '/guide/admin/sso_dingtalk': '/guide/admin/sso#钉钉',
  '/guide/knowledge_base/rag': '/guide/dataset/rag',
  '/commercial/intro': '/guide/version/commercial',
  '/upgrading/intro': '/self-host/upgrading/upgrade-intruction',
  '/upgrading': '/self-host/upgrading/upgrade-intruction',
  '/introduction/shopping_cart/intro': '/guide/version/commercial',
  '/introduction/cloud': '/guide/version/cloud/intro',
  '/protocol/terms': '/guide/version/cloud/terms',
  '/protocol/privacy': '/guide/version/cloud/privacy',
  '/introduction/development/docker': '/self-host/deploy/docker',
  '/introduction/development/sealos': '/self-host/deploy/sealos',
  '/introduction/development/intro': '/self-host/dev',
  '/introduction/development/object-storage': '/self-host/config/object-storage',
  '/introduction': defaultHomePath,
  '/guide/getting-started/video-tutorial': 'https://video.fastgpt.cn/videos',

  // navbar 重定向
  '/guide': defaultHomePath,
  '/use-cases': '/use-cases/app-cases/submit_application_template',
  '/self-host': '/self-host/deploy/docker',
  '/openapi': '/openapi/intro',
  '/faq': '/faq/app'
};

// 前缀匹配
const prefixMap: Record<string, string> = {
  '/FAQ': '/faq',
  '/shopping_cart': '/guide/version/commercial',
  '/upgrading': '/self-host/upgrading',
  '/development': '/self-host',
  '/introduction/development/openapi': '/openapi',
  '/introduction/development': '/self-host',
  '/introduction/version': '/guide/version',
  '/introduction/cloud': '/guide/version/cloud',
  '/introduction/opensource': '/guide/version/opensource',
  '/introduction': '/guide',
  '/version': '/guide/version'
};

const i18nMiddleware = createI18nMiddleware(i18n);

function applyRedirectMaps(path: string): string | null {
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;

  if (normalizedPath in exactMap) return exactMap[normalizedPath];
  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    if (normalizedPath.startsWith(oldPrefix)) {
      return newPrefix + normalizedPath.slice(oldPrefix.length);
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
    const stripped = pathWithoutLang.slice('/docs'.length); // '' for /docs, /foo for /docs/foo
    const mapped = applyRedirectMaps(stripped);
    const finalPath = mapped ?? stripped;
    return NextResponse.redirect(createRedirectUrl(finalPath, request, lang), 301);
  }

  // Non-/docs paths still consult the same maps so that direct hits on old
  // canonical paths (e.g. /upgrading) get redirected to their new home.
  const mapped = applyRedirectMaps(pathWithoutLang);
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
