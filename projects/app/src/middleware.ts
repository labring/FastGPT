import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // 检查是否启用了代理
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) {
    return NextResponse.next();
  }

  // 只代理特定的 API 路径
  const shouldProxy = request.nextUrl.pathname.startsWith('/api/');

  if (shouldProxy) {
    const url = request.nextUrl.clone();

    // 解析代理 URL
    try {
      const proxyUrlObj = new URL(proxyUrl);
      url.protocol = proxyUrlObj.protocol;
      url.host = proxyUrlObj.host;
      url.port = proxyUrlObj.port;
      url.pathname = request.nextUrl.pathname;
      url.search = request.nextUrl.search;

      console.log(
        `代理请求: ${request.nextUrl.pathname} -> ${proxyUrl}${request.nextUrl.pathname}`
      );
      return NextResponse.rewrite(url);
    } catch (error) {
      console.error('代理 URL 解析失败:', error);
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
