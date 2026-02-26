import { createI18nMiddleware } from 'fumadocs-core/i18n';
import { i18n } from '@/lib/i18n';
import { NextRequest, NextResponse } from 'next/server';

// Old path redirects mapping
const exactMap: Record<string, string> = {
  '/docs': '/docs/introduction',
  '/docs/intro': '/docs/introduction',
  '/docs/guide/dashboard/workflow/coreferenceresolution':
    '/docs/introduction/guide/dashboard/workflow/coreferenceResolution',
  '/docs/guide/admin/sso_dingtalk':
    '/docs/introduction/guide/admin/sso#/docs/introduction/guide/admin/sso#钉钉',
  '/docs/guide/knowledge_base/rag': '/docs/introduction/guide/knowledge_base/RAG',
  '/docs/commercial/intro/': '/docs/introduction/commercial',
  '/docs/upgrading/intro/': '/docs/upgrading',
  '/docs/introduction/shopping_cart/intro/': '/docs/introduction/commercial'
};

const prefixMap: Record<string, string> = {
  '/docs/development': '/docs/introduction/development',
  '/docs/FAQ': '/docs/faq',
  '/docs/guide': '/docs/introduction/guide',
  '/docs/shopping_cart': '/docs/introduction/shopping_cart',
  '/docs/agreement': '/docs/protocol',
  '/docs/introduction/development/openapi': '/docs/openapi'
};

const i18nMiddleware = createI18nMiddleware(i18n);

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

  // Check exact match redirects
  if (exactMap[pathWithoutLang]) {
    const newUrl = new URL(`/${lang}${exactMap[pathWithoutLang]}`, request.url);
    return NextResponse.redirect(newUrl, 301);
  }

  // Check prefix match redirects
  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    if (pathWithoutLang.startsWith(oldPrefix)) {
      const rest = pathWithoutLang.slice(oldPrefix.length);
      const newUrl = new URL(`/${lang}${newPrefix}${rest}`, request.url);
      return NextResponse.redirect(newUrl, 301);
    }
  }

  // Continue with i18n middleware
  return i18nMiddleware(request);
}
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|deploy/.*).*)']
};
