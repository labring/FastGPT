import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ChannelInfoType } from '@fastgpt/global/core/ai/model/channel';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/model/channel/api';

const mocks = vi.hoisted(() => ({
  getModelDetail: vi.fn(),
  getChannelList: vi.fn(),
  postUpdateModelChannels: vi.fn(),
  toast: vi.fn(),
  editChannelProps: undefined as
    | undefined
    | {
        defaultConfig: ChannelInfoType;
        channelType: 'system' | 'team';
        onClose: () => void;
        onSuccess: () => Promise<unknown> | unknown;
      }
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const src = loader.toString();
    if (src.includes('EditChannelModal')) {
      return function MockEditChannelModal(props: NonNullable<typeof mocks.editChannelProps>) {
        mocks.editChannelProps = props;
        return React.createElement('div', { 'data-testid': 'edit-channel-modal' });
      };
    }
    return function MockDynamicFallback() {
      return null;
    };
  }
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin/resources/model', query: {}, push: vi.fn() })
}));
vi.mock('@/web/core/ai/model/api', () => ({
  getModelDetail: mocks.getModelDetail,
  postUpdateModelChannels: mocks.postUpdateModelChannels
}));
vi.mock('@/web/core/ai/model/channel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/web/core/ai/model/channel')>()),
  getChannelList: mocks.getChannelList
}));
vi.mock('@/pageComponents/model/useModelChannelTest', () => ({
  useModelChannelTest: () => ({
    testingChannelIds: new Set<number>(),
    testModelChannel: vi.fn()
  })
}));
vi.mock('@/pageComponents/model/ModelConfigForm', () => ({
  default: ({ channelSection }: { channelSection?: { content: React.ReactNode } }) =>
    React.createElement('div', null, channelSection?.content)
}));
vi.mock('@/pageComponents/model/ChannelStatusTag', () => ({
  default: ({ status }: { status: number }) => React.createElement('span', null, String(status))
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: () => vi.fn(), ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: () => Promise<unknown>) => {
    const [data, setData] = React.useState<unknown>(undefined);
    const [loading, setLoading] = React.useState(false);
    const fnRef = React.useRef(fn);
    React.useEffect(() => {
      fnRef.current = fn;
    }, [fn]);
    const runAsync = React.useCallback(async () => {
      setLoading(true);
      try {
        const res = await fnRef.current();
        setData(res);
        return res;
      } finally {
        setLoading(false);
      }
    }, []);
    React.useEffect(() => {
      void runAsync();
    }, [runAsync]);
    return { data, loading, runAsync };
  }
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  HStack: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('button', { onClick }, children),
  Table: ({ children }: React.PropsWithChildren) => React.createElement('table', null, children),
  Thead: ({ children }: React.PropsWithChildren) => React.createElement('thead', null, children),
  Tbody: ({ children }: React.PropsWithChildren) => React.createElement('tbody', null, children),
  Tr: ({ children }: React.PropsWithChildren) => React.createElement('tr', null, children),
  Th: ({ children }: React.PropsWithChildren) => React.createElement('th', null, children),
  Td: ({ children }: React.PropsWithChildren) => React.createElement('td', null, children)
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children)
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: ({ renderBody }: { renderBody: () => React.ReactNode }) => renderBody()
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({ Trigger }: { Trigger: React.ReactNode }) => Trigger
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({
  default: ({ icon, tip, onClick }: { icon: string; tip?: string; onClick?: () => void }) =>
    React.createElement('button', { 'data-icon': icon, 'aria-label': tip, onClick }, icon)
}));

import ModelEditModal from '@/pageComponents/model/ModelEditModal';

describe('ModelEditModal linked channel edit action', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editChannelProps = undefined;
    mocks.getModelDetail.mockResolvedValue({
      model: {
        modelId: 'm-1',
        model: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        type: 'llm'
      },
      channels: [
        {
          id: 31,
          name: '词元跳动',
          protocol: { name: { 'zh-CN': '词元跳动', en: 'TokenDance' }, avatar: 'model/td' },
          status: 1,
          isAssociated: true
        }
      ]
    });

    const channelListItem: ChannelListItem = {
      id: 31,
      name: '词元跳动',
      type: 59,
      status: 1,
      keyConfigured: true,
      models: ['gpt-4o'],
      model_mapping: { 'gpt-4o': 'gpt-4o-upstream' },
      base_url: 'https://tokendance.space/gateway/v1',
      priority: 10,
      created_at: 1700000000000,
      relatedModelCount: 1
    };
    mocks.getChannelList.mockResolvedValue([channelListItem]);

    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('opens EditChannelModal with full channel config and refreshes after saving', async () => {
    const onSuccess = vi.fn();
    const targetModel: ModelConfigListItem = {
      modelId: 'm-1',
      model: 'gpt-4o',
      name: 'GPT-4o',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      scope: ModelScopeEnum.system,
      isActive: true,
      config: { maxContext: 8192, maxResponse: 4096, quoteMaxToken: 2048 },
      channels: []
    };

    await act(async () => {
      root.render(
        React.createElement(ModelEditModal, {
          model: targetModel,
          providers: [],
          channelType: 'system',
          onSuccess,
          onClose: vi.fn()
        })
      );
    });

    const editBtn = container.querySelector('button[data-icon="common/settingLight"]');
    expect(editBtn).not.toBeNull();

    await act(async () => {
      editBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.getChannelList).toHaveBeenCalledWith({
      search: '词元跳动',
      channelType: 'system'
    });
    expect(mocks.editChannelProps?.defaultConfig).toMatchObject({
      id: 31,
      name: '词元跳动',
      type: 59,
      key: '',
      keyConfigured: true,
      models: ['gpt-4o'],
      model_mapping: { 'gpt-4o': 'gpt-4o-upstream' },
      base_url: 'https://tokendance.space/gateway/v1'
    });
    expect(mocks.editChannelProps?.defaultConfig).not.toHaveProperty('relatedModelCount');

    await act(async () => {
      await mocks.editChannelProps?.onSuccess();
      mocks.editChannelProps?.onClose();
    });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(mocks.getModelDetail).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="edit-channel-modal"]')).toBeNull();
  });
});
