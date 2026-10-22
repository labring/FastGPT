import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ProviderMetasResponse,
  ChannelListItem
} from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getChannelProviders } from '@/web/core/ai/model/channel';

const mocks = vi.hoisted(() => ({
  metadata: {} as ProviderMetasResponse,
  list: [] as ChannelListItem[],
  loading: false
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { username: 'member' } })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: unknown) => ({
    data: request === getChannelProviders ? mocks.metadata : undefined,
    loading: request === getChannelProviders && mocks.loading,
    runAsync: vi.fn()
  })
}));
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: () => ({
    data: mocks.list,
    total: mocks.list.length,
    pageSize: 20,
    refresh: vi.fn(),
    isLoading: false
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(), ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/hooks/useTableMultipleSelect', () => ({
  useTableMultipleSelect: () => ({
    selectedItems: [],
    isSelected: () => false,
    setSelectedItems: vi.fn()
  })
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: ({ renderBody }: { renderBody: () => React.ReactNode }) => renderBody()
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) =>
    React.createElement('div', { 'data-loading': isLoading }, children)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src }: { src: string }) => React.createElement('img', { src })
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Input/NumberInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Input/SearchInput', () => ({ default: () => null }));
vi.mock('@/components/core/ai/ModelTabHeader', () => ({ default: () => null }));

import ChannelTable from '@/pageComponents/model/Channel';

describe('ChannelTable protocol display', () => {
  beforeEach(() => {
    mocks.loading = false;
    mocks.metadata = {
      1: {
        name: 'Upstream',
        displayName: { en: 'Protocol', 'zh-CN': '渠道协议' },
        avatar: 'protocol.svg',
        defaultBaseUrl: '',
        keyHelp: '',
        canCreate: false
      },
      2: { name: 'Name Only', defaultBaseUrl: '', keyHelp: '', canCreate: false }
    };
    mocks.list = [1, 2, 99].map((type) => ({
      id: type,
      type,
      name: `Channel ${type}`,
      models: [],
      status: 1,
      priority: 1,
      relatedModelCount: 0
    }));
  });

  const render = (channelType: 'system' | 'team') =>
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(ChannelTable, { Tab: null, channelType })
      )
    );

  it.each(['system', 'team'] as const)(
    'renders %s channel protocols from metadata with legacy and unknown-type fallbacks',
    (channelType) => {
      const html = render(channelType);
      expect(html).toContain('渠道协议');
      expect(html).toContain('protocol.svg');
      expect(html).toContain('Name Only');
      expect(html).toContain('Invalid provider');
      expect(html).toContain('model/huggingface');
    }
  );

  it('waits for metadata even when the channel list has finished loading', () => {
    mocks.loading = true;
    expect(render('team')).toContain('data-loading="true"');
  });
});
