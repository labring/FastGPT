// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import type { GetMarketplaceToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { useToolDetail } from '../../../../../components/core/plugin/tool/ToolDetail/hooks';

const { fetchRemoteMarkdownMock, languageState } = vi.hoisted(() => ({
  fetchRemoteMarkdownMock: vi.fn(async (url: string) => url),
  languageState: { language: 'en' }
}));

vi.mock('@fastgpt/web/components/common/Markdown/utils', () => ({
  fetchRemoteMarkdown: fetchRemoteMarkdownMock
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ i18n: languageState, t: (key: string) => key })
}));

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

type ToolDetailHookSnapshot = {
  readmeContent: string;
  inputLabel?: string;
};

describe('useToolDetail locale snapshots', () => {
  it('reselects and reloads the README when the UI locale changes', async () => {
    fetchRemoteMarkdownMock.mockClear();
    languageState.language = 'en';
    const detail: GetMarketplaceToolDetailResponseType = {
      tools: [
        {
          type: 'tool',
          id: 'search-record',
          toolId: 'search',
          pluginId: 'search',
          version: '1.0.0',
          etag: 'etag',
          isToolset: false,
          name: { en: 'Document search', 'zh-CN': '文档搜索' },
          description: { en: 'Search summary', 'zh-CN': '搜索简介' },
          icon: 'search.svg',
          downloadCount: 0,
          readme: 'https://example.com/legacy.md',
          readmeUrl: 'https://example.com/legacy.md',
          readmeUrls: {
            en: 'https://example.com/en.md',
            'zh-CN': 'https://example.com/zh.md'
          },
          isLatestVersion: true,
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                'x-i18n': {
                  title: { en: 'Query', 'zh-CN': '查询' },
                  description: { en: 'Search text', 'zh-CN': '检索文本' }
                }
              }
            }
          },
          outputSchema: { type: 'object', properties: {} },
          secretSchema: { type: 'object', properties: {} }
        }
      ],
      downloadCount: 0,
      downloadUrl: 'https://example.com/search.pkg'
    };
    const onFetchDetail = vi.fn(async () => detail);
    let latestSnapshot: ToolDetailHookSnapshot | undefined;
    const Harness = () => {
      const detailState = useToolDetail({ toolId: 'search', onFetchDetail });
      latestSnapshot = {
        readmeContent: detailState.readmeContent,
        inputLabel: detailState.parentTool?.versionList?.[0]?.inputs[0]?.label
      };
      return React.createElement('div', null, detailState.readmeContent);
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)));
    });
    const initialDetailRequest = onFetchDetail.mock.results[0]?.value;
    expect(initialDetailRequest).toBeDefined();
    await act(async () => {
      await initialDetailRequest;
    });
    await act(async () => {});

    expect(latestSnapshot).toEqual({
      readmeContent: 'https://example.com/en.md',
      inputLabel: 'Query'
    });
    expect(fetchRemoteMarkdownMock).toHaveBeenCalledWith('https://example.com/en.md');

    languageState.language = 'zh-CN';
    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)));
    });
    await act(async () => {});

    expect(latestSnapshot).toEqual({
      readmeContent: 'https://example.com/zh.md',
      inputLabel: '查询'
    });
    expect(fetchRemoteMarkdownMock).toHaveBeenCalledWith('https://example.com/zh.md');
    expect(fetchRemoteMarkdownMock).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
    container.remove();
  });

  it('normalizes team tool details as system tool metadata', async () => {
    fetchRemoteMarkdownMock.mockClear();
    languageState.language = 'en';
    const detail: GetTeamToolDetailResponseType = {
      id: 'search',
      version: '1.0.0',
      status: PluginStatusEnum.Normal,
      source: 'system',
      isToolSet: false,
      avatar: 'search.svg',
      name: { en: 'Document search', 'zh-CN': '文档搜索' },
      intro: { en: 'Search summary', 'zh-CN': '搜索简介' },
      author: 'FastGPT',
      tags: [],
      currentCost: 0,
      systemKeyCost: 0,
      hasTokenFee: false,
      hasSystemSecret: false,
      systemSecretStatus: SystemToolSystemSecretStatusEnum.none,
      readmeUrl: 'https://example.com/team-legacy.md',
      readmeUrls: {
        en: 'https://example.com/team-en.md',
        'zh-CN': 'https://example.com/team-zh.md'
      },
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            'x-i18n': { title: { en: 'Query', 'zh-CN': '查询' } }
          }
        }
      },
      outputSchema: { type: 'object', properties: {} },
      secretSchema: { type: 'object', properties: {} }
    };
    const onFetchDetail = vi.fn(async () => detail);
    let latestSnapshot: ToolDetailHookSnapshot | undefined;
    const Harness = () => {
      const detailState = useToolDetail({ toolId: 'search', onFetchDetail });
      latestSnapshot = {
        readmeContent: detailState.readmeContent,
        inputLabel: detailState.parentTool?.versionList?.[0]?.inputs[0]?.label
      };
      return React.createElement('div', null, detailState.readmeContent);
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)));
    });
    const initialDetailRequest = onFetchDetail.mock.results[0]?.value;
    expect(initialDetailRequest).toBeDefined();
    await act(async () => {
      await initialDetailRequest;
    });
    await act(async () => {});

    expect(latestSnapshot).toEqual({
      readmeContent: 'https://example.com/team-en.md',
      inputLabel: 'Query'
    });
    expect(fetchRemoteMarkdownMock).toHaveBeenCalledWith('https://example.com/team-en.md');

    await act(async () => root.unmount());
    container.remove();
  });
});
