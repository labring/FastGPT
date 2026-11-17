import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { buildSystemFrontendConfig } from '@fastgpt/service/common/system/systemInstanceConfig/frontend';

const state = vi.hoisted(() => ({ feConfigs: {} as any }));
const contexts = vi.hoisted(() => ({
  app: { appId: 'owned-app' },
  dataset: {
    paths: [],
    folderDetail: undefined,
    searchKey: '',
    listFilters: {},
    isBatchMode: false
  },
  chat: { chatSettings: {}, refreshChatSetting: async () => ({}) }
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ ...state, setShowProModal: vi.fn() })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: { tags: [], team: { permission: { hasDatasetCreatePer: true } } }
  })
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/dataset/list', push: vi.fn() })
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: false })
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, refetch: vi.fn() })
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (context: keyof typeof contexts, select: (value: unknown) => unknown) =>
    select(contexts[context])
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: 'app' }));
vi.mock('@/pageComponents/dataset/list/context', () => ({
  DatasetsContext: 'dataset',
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/web/core/chat/context/chatPageContext', () => ({ ChatPageContext: 'chat' }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@/components/ProTip/Tag', () => ({ default: () => null }));
vi.mock('@/components/ProTip/ProModal', () => ({ default: () => null }));
vi.mock('@/components/MyInput', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef<HTMLInputElement, { name?: string }>(function ConfigConsumerInput(
      { name },
      ref
    ) {
      return React.createElement('input', { ref, name });
    })
  };
});
vi.mock('@/pageComponents/chat/ChatSetting/ImageUpload', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatSetting/ToolSelectModal', () => ({ default: () => null }));
vi.mock('@/components/common/folder/Path', () => ({ default: () => null }));
vi.mock('@/components/common/folder/SlideCard', () => ({ default: () => null }));
vi.mock('@/pageComponents/dataset/list/List', () => ({ default: () => null }));
vi.mock('@/pageComponents/dataset/list/ListFilters', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@chakra-ui/icons', () => ({ AddIcon: () => null }));
vi.mock('@fastgpt/web/components/common/MyMenu/Multiple', () => ({
  default: ({ menuList }: { menuList: any[] }) => {
    const labels = (items: any[]): React.ReactNode[] =>
      items
        .flatMap((item) => [
          item.label,
          ...labels(item.children ?? []),
          ...labels(item.menuList ?? [])
        ])
        .filter(Boolean);
    return React.createElement('div', null, labels(menuList));
  }
}));
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  const component = React.forwardRef<HTMLDivElement, any>(({ children, onClick }, ref) =>
    React.createElement('div', { ref, onClick }, children)
  );
  component.displayName = 'ConfigConsumerLayout';
  return {
    ...Object.fromEntries(
      [
        'Box',
        'Flex',
        'Button',
        'HStack',
        'Grid',
        'InputGroup',
        'InputLeftElement',
        'Input',
        'Switch',
        'IconButton'
      ].map((name) => [name, component])
    ),
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});

import DatasetList from '@/pages/dataset/list';
import Publish from '@/pageComponents/app/detail/Publish';
import HomepageSetting from '@/pageComponents/chat/ChatSetting/HomepageSetting';

/** 父组件真实计算条件/选项；目录、发布子面板和网络留在边界外。 */
describe('projected feature options in production components', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  const publish = (feature: Partial<ReturnType<typeof resolveSystemInstanceConfig>['feature']>) => {
    state.feConfigs = buildSystemFrontendConfig(
      resolveSystemInstanceConfig({
        feature: {
          hideChatCopyrightSetting: false,
          showDatasetFeishu: false,
          showDatasetYuque: false,
          showDatasetDingtalk: false,
          showPublishFeishu: false,
          showPublishDingtalk: false,
          showPublishWecom: false,
          showPublishOffiaccount: false,
          showPublishWechat: false,
          ...feature
        }
      }),
      { commercialService: true }
    );
  };
  const render = async (node: React.ReactNode) => {
    await act(async () => root.render(node));
  };
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('independently includes the three configured data source choices', async () => {
    const choices = [
      ['showDatasetFeishu', 'dataset:feishu_dataset'],
      ['showDatasetYuque', 'dataset:yuque_dataset'],
      ['showDatasetDingtalk', 'dataset:dingtalk_dataset']
    ] as const;
    for (const selected of [null, ...choices.map(([field]) => field), null]) {
      publish(selected ? { [selected]: true } : {});
      await render(React.createElement(DatasetList));
      for (const [field, text] of choices)
        expect(container.textContent?.includes(text)).toBe(selected === field);
    }
  });
  it('independently includes the five configured publish channels', async () => {
    const choices = [
      ['showPublishFeishu', 'publish:feishu_bot'],
      ['showPublishDingtalk', 'publish:dingtalk.bot'],
      ['showPublishWecom', 'publish:wecom.bot'],
      ['showPublishOffiaccount', 'publish:official_account.name'],
      ['showPublishWechat', 'publish:wechat.bot']
    ] as const;
    for (const selected of [null, ...choices.map(([field]) => field), null]) {
      publish(selected ? { [selected]: true } : {});
      await render(React.createElement(Publish));
      for (const [field, text] of choices)
        expect(container.textContent?.includes(text)).toBe(selected === field);
    }
  });
  it('removes copyright controls only when the hide setting is enabled', async () => {
    for (const alternate of [false, true, false]) {
      publish({ hideChatCopyrightSetting: alternate });
      await render(
        React.createElement(HomepageSetting, {
          Header: ({ children }) => children,
          onDiagramShow: () => undefined
        })
      );
      expect(
        container.textContent?.includes('chat:setting.copyright.copyright_configuration')
      ).toBe(!alternate);
    }
  });
});
