import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const proxyUrl = process.env.PROXY_API_TARGET?.trim().replace(/\/$/, '');

  if (proxyUrl && request.nextUrl.pathname.startsWith('/api/')) {
    console.log(
      `[Dev Proxy] ${request.method} ${request.nextUrl.pathname}${request.nextUrl.search} → ${proxyUrl}${request.nextUrl.pathname}`
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
