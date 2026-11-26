import type { AppProps } from 'next/app';
import React, { type ReactNode } from 'react';
import ReactDOMServer from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../../next.config';
import NextHead from '@/components/common/NextHead';
import devApiHandler from '@/pages/api/apidoc/devapi.json';
import systemOpenApiHandler from '@/pages/api/apidoc/systemopenapi.json';
import AppShell from '@/web/context/AppShell';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: true,
    pathname: '/apidoc/systemopenapi',
    query: {} as Record<string, string>
  }
}));

vi.mock('next/head', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@/web/context/QueryClient', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@/web/context/ChakraUI', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@fastgpt/web/context/useSystem', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@/web/context/useInitApp', () => ({
  useInitApp: () => ({ feConfigs: {}, scripts: [], title: 'FastGPT' })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@fastgpt/web/common/system/utils', () => ({ getWebReqUrl: (url: string) => url }));
vi.mock('@/web/common/utils/errorLogger', () => ({ errorLogger: { init: vi.fn() } }));
vi.mock('@fastgpt/web/i18n/ClientI18nBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@fastgpt/web/i18n/ClientI18nGate', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } })
}));

type MockApiResponse = {
  headers: Record<string, string>;
  statusCode: number;
  jsonPayload: unknown;
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

const createMockRes = (): MockApiResponse => {
  const res: MockApiResponse = {
    headers: {},
    statusCode: 0,
    jsonPayload: undefined,
    setHeader: vi.fn((key: string, value: string) => {
      res.headers[key] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.jsonPayload = payload;
      return res;
    })
  };

  return res;
};

describe('apidoc noindex hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.router.pathname = '/apidoc/systemopenapi';
  });

  it.each([
    { name: '/api/apidoc/systemopenapi.json', handler: systemOpenApiHandler },
    { name: '/api/apidoc/devapi.json', handler: devApiHandler }
  ])('$name returns 200 and sets X-Robots-Tag before sending JSON', ({ handler }) => {
    const res = createMockRes();

    handler({} as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow');
    expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(res.setHeader.mock.invocationCallOrder[0]).toBeLessThan(
      res.json.mock.invocationCallOrder[0]
    );
    expect(res.jsonPayload).toMatchObject({
      openapi: '3.1.0',
      paths: expect.any(Object)
    });
  });

  it('configures X-Robots-Tag noindex, nofollow for /apidoc/* and /api/apidoc/* in next.config.ts', async () => {
    const headerRules = (await nextConfig.headers?.()) ?? [];

    expect(headerRules).toEqual(
      expect.arrayContaining([
        {
          source: '/apidoc/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
        },
        {
          source: '/api/apidoc/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
        }
      ])
    );
  });

  it('renders robots meta tag in NextHead only when robots prop is provided', () => {
    const withRobots = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NextHead, {
        title: 'FastGPT OpenAPI',
        robots: 'noindex, nofollow'
      })
    );
    const withoutRobots = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NextHead, {
        title: 'FastGPT'
      })
    );
    const withEmptyRobots = ReactDOMServer.renderToStaticMarkup(
      React.createElement(NextHead, {
        title: 'FastGPT',
        robots: ''
      })
    );

    expect(withRobots).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(withoutRobots).not.toContain('name="robots"');
    expect(withEmptyRobots).not.toContain('name="robots"');
  });

  it.each(['/apidoc/systemopenapi', '/apidoc/devapi'])(
    'passes robots="noindex, nofollow" from AppShell to NextHead on %s',
    (pathname) => {
      mocks.router.pathname = pathname;
      const Page = () => React.createElement('div', null, 'scalar-docs');

      const markup = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AppShell, {
          Component: Page,
          pageProps: {},
          router: mocks.router as unknown as AppProps['router'],
          clientOnly: false
        })
      );

      expect(markup).toContain('<meta name="robots" content="noindex, nofollow"/>');
      expect(markup).toContain('scalar-docs');
    }
  );

  it('does not inject robots meta tag from AppShell on regular application routes', () => {
    mocks.router.pathname = '/dashboard/agent';
    const Page = () => React.createElement('div', null, 'agent-page');

    const markup = ReactDOMServer.renderToStaticMarkup(
      React.createElement(AppShell, {
        Component: Page,
        pageProps: {},
        router: mocks.router as unknown as AppProps['router'],
        clientOnly: false
      })
    );

    expect(markup).not.toContain('name="robots"');
    expect(markup).toContain('agent-page');
  });
});
