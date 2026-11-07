// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box } from '@chakra-ui/react';
import NextLink from 'next/link';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

describe('Link deployment prefix', () => {
  beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllEnvs());

  it.each(['', '/fastgpt'])(
    'normalizes internal hrefs with base URL "%s" and preserves other URL forms',
    async (baseUrl) => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', baseUrl);
      vi.resetModules();
      const { default: Link } = await import('../../../../components/common/Link');

      const cases = [
        ['/app/detail?appId=1#top', `${baseUrl}/app/detail?appId=1#top`],
        ['/', `${baseUrl}/`],
        ['/fastgpt-other/detail', `${baseUrl}/fastgpt-other/detail`],
        ...[
          '/fastgpt',
          '/fastgpt/app/detail',
          '/fastgpt?appId=1',
          '/fastgpt#top',
          'https://example.com/app',
          '//cdn.example.com/file',
          'mailto:support@example.com',
          'tel:12345',
          '#section',
          '?page=2',
          './detail',
          '',
          undefined
        ].map((href) => [href, href])
      ];

      for (const [href, expected] of cases) {
        const host = document.createElement('div');
        host.innerHTML = renderToStaticMarkup(React.createElement(Link, { href }, 'resource'));
        expect(host.querySelector('a')?.getAttribute('href'), String(href)).toBe(expected ?? null);
      }
    }
  );

  it('forwards the anchor ref, click handler and native link props', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '/fastgpt');
    vi.resetModules();
    const { default: Link } = await import('../../../../components/common/Link');
    const host = document.createElement('div');
    const root = createRoot(host);
    const ref = createRef<HTMLAnchorElement>();
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());

    try {
      await act(async () => {
        root.render(
          React.createElement(
            Link,
            {
              ref,
              href: '/download',
              download: 'file.txt',
              isExternal: true,
              rel: 'noopener noreferrer',
              onClick
            },
            'download'
          )
        );
      });

      const anchor = host.querySelector('a');
      expect(ref.current).toBe(anchor);
      expect(anchor?.getAttribute('href')).toBe('/fastgpt/download');
      expect(anchor?.getAttribute('download')).toBe('file.txt');
      expect(anchor?.getAttribute('target')).toBe('_blank');
      expect(anchor?.getAttribute('rel')?.split(' ')).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer'])
      );
      expect(anchor?.classList.contains('chakra-link')).toBe(true);

      await act(async () => anchor?.click());
      expect(onClick).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('supports Chakra and NextLink composition without duplicating the deployment prefix', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '/fastgpt');
    vi.resetModules();
    const { default: Link } = await import('../../../../components/common/Link');
    const host = document.createElement('div');
    for (const element of [
      React.createElement(Link, { as: NextLink, href: '/fastgpt/app/detail' }, 'resource'),
      React.createElement(Box, { as: Link, href: '/app/detail' }, 'resource')
    ]) {
      host.innerHTML = renderToStaticMarkup(element);
      expect(host.querySelector('a')?.getAttribute('href')).toBe('/fastgpt/app/detail');
    }
  });
});
