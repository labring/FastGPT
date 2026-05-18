import { describe, expect, it } from 'vitest';
import type { ServerResponse } from 'http';
import { renderSandboxProxyErrorPage, sendSandboxProxyErrorPage } from '../src/errorPage';

describe('renderSandboxProxyErrorPage', () => {
  it('renders a readable iframe error page with refresh action', () => {
    const html = renderSandboxProxyErrorPage({
      statusCode: 502,
      message: '页面服务暂时不可用，请稍后刷新重试。'
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('页面暂时无法打开');
    expect(html).toContain('页面服务暂时不可用，请稍后刷新重试。');
    expect(html).toContain('502');
    expect(html).toContain('onclick="refreshPage()"');
    expect(html).toContain('window.parent.postMessage');
    expect(html).toContain('sandboxProxyRefreshPage');
    expect(html).toContain('window.location.reload()');
    expect(html).toContain('刷新页面');
  });

  it('escapes dynamic message before injecting into html', () => {
    const html = renderSandboxProxyErrorPage({
      statusCode: 500,
      message: '页面加载失败：<script>alert("xss")</script>，请刷新重试'
    });

    expect(html).toContain(
      '页面加载失败：&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;，请刷新重试'
    );
    expect(html).not.toContain('<script>alert("xss")</script>');
  });
});

describe('sendSandboxProxyErrorPage', () => {
  it('sends html response headers and body', () => {
    const written: { statusCode?: number; headers?: Record<string, string>; body?: string } = {};
    const res = {
      writeHead: (statusCode: number, headers: Record<string, string>) => {
        written.statusCode = statusCode;
        written.headers = headers;
      },
      end: (body: string) => {
        written.body = body;
      }
    } as unknown as ServerResponse;

    sendSandboxProxyErrorPage(res, {
      statusCode: 401,
      message: '当前访问已失效，请回到应用页面后重新打开。'
    });

    expect(written.statusCode).toBe(401);
    expect(written.headers).toMatchObject({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    expect(written.body).toContain('当前访问已失效，请回到应用页面后重新打开。');
    expect(written.body).toContain('onclick="refreshPage()"');
  });
});
