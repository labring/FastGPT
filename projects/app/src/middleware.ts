import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const baseUrl = '/api/proxy/apm';
const API_URL: string = process.env.ELASTIC_APM_SERVER_URL || '';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  let suffix_path = '';
  const regex = new RegExp(`${baseUrl}/(.*)`); // 匹配 /api/proxy/apm/ 后的任意字符
  const match = request.url.match(regex);
  if (match) {
    suffix_path = match[1]; // 提取匹配的部分
  } else {
    console.log('未找到匹配的部分');
  }
  return NextResponse.rewrite(new URL(`${API_URL}/${suffix_path}`, request.url));
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/api/proxy/apm/:path*'
};
