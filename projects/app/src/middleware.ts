import { addLog } from '@fastgpt/service/common/system/log';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  addLog.info(`Request URL: ${request.url}`, {
    body: request.body
  });

  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/api/:path*'
};
