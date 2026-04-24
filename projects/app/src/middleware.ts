import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
const isDev = process.env.NODE_ENV === 'development';

export function middleware(request: NextRequest) {
  const proxyTarget = process.env.PROXY_API_TARGET?.trim().replace(/\/$/, '');

  if (proxyTarget && request.nextUrl.pathname.startsWith('/api/') && isDev) {
    const targetUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, proxyTarget);
    console.log(
      `[Dev Proxy] ${request.method} ${request.nextUrl.pathname}${request.nextUrl.search} → ${targetUrl.href}`
    );
    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
