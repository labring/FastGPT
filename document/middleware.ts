import { createI18nMiddleware } from 'fumadocs-core/i18n';
import { i18n } from '@/lib/i18n';
import { type NextRequest, NextResponse } from 'next/server';

// Old path redirects mapping. Keys/values are POST-strip (no /docs prefix).
// Old links like /docs/foo are first stripped to /foo, then matched here.
const exactMap: Record<string, string> = {
  '': '/introduction',
  '/intro': '/introduction',
  '/guide/dashboard/workflow/coreferenceresolution':
    '/introduction/guide/dashboard/workflow/coreferenceResolution',
  '/guide/admin/sso_dingtalk':
    '/introduction/guide/admin/sso#/introduction/guide/admin/sso#钉钉',
  '/guide/knowledge_base/rag': '/introduction/guide/knowledge_base/RAG',
  '/commercial/intro': '/introduction/commercial',
  '/upgrading/intro': '/self-host/upgrading/upgrade-intruction',
  '/upgrading': '/self-host/upgrading/upgrade-intruction',
  '/introduction/shopping_cart/intro/': '/introduction/commercial',
  '/introduction/cloud': '/introduction/cloud/intro',
  '/protocol/terms': '/introduction/cloud/terms',
  '/protocol/privacy': '/introduction/cloud/privacy',
  '/introduction/development/docker': '/self-host/deploy/docker',
  '/introduction/development/sealos': '/self-host/deploy/sealos',
  '/introduction/development/intro': '/self-host/dev',
  '/introduction/development/object-storage': '/self-host/config/object-storage'
};

const prefixMap: Record<string, string> = {
  '/FAQ': '/faq',
  '/guide': '/introduction/guide',
  '/shopping_cart': '/introduction/shopping_cart',
  '/upgrading': '/self-host/upgrading',
  '/development': '/self-host',
  '/introduction/development/openapi': '/openapi',
  '/introduction/development': '/self-host'
};

const i18nMiddleware = createI18nMiddleware(i18n);

function applyRedirectMaps(path: string): string | null {
  if (path in exactMap) return exactMap[path];
  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    if (path.startsWith(oldPrefix)) {
      return newPrefix + path.slice(oldPrefix.length);
    }
  }
  return null;
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
    return NextResponse.redirect(
      new URL(`/${lang}${finalPath || '/'}`, request.url),
      301
    );
  }

  // Non-/docs paths still consult the same maps so that direct hits on old
  // canonical paths (e.g. /upgrading) get redirected to their new home.
  const mapped = applyRedirectMaps(pathWithoutLang);
  if (mapped !== null && mapped !== pathWithoutLang) {
    return NextResponse.redirect(new URL(`/${lang}${mapped || '/'}`, request.url), 301);
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
