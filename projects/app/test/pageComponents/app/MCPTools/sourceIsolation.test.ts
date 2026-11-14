import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MCPTools from '@/pageComponents/app/detail/Edit/MCPTools';

const mocks = vi.hoisted(() => ({
  parseTools: vi.fn(),
  saveTools: vi.fn(),
  runTool: vi.fn(),
  changeUrl: undefined as undefined | ((event: { target: { value: string } }) => void),
  appDetail: {} as any,
  actions: new Map<string, () => Promise<unknown> | void>()
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: () => ({}) }));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ chatId: 'chat' })
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (value: any) => unknown) =>
    select({ appId: 'app', appDetail: mocks.appDetail })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (service: (...args: any[]) => Promise<unknown>, options: any = {}) => {
    const latest = React.useRef({ service, options });
    latest.current = { service, options };
    return {
      loading: false,
      runAsync: async (...args: any[]) => {
        try {
          const result = await latest.current.service(...args);
          latest.current.options.onSuccess?.(result, args);
          return result;
        } catch (error) {
          latest.current.options.onError?.(error, args);
        }
      }
    };
  }
}));
vi.mock('@/web/core/app/api/mcpTools', () => ({
  getMCPTools: mocks.parseTools,
  postUpdateMCPTools: mocks.saveTools,
  postRunMCPTool: mocks.runTool
}));
vi.mock('@/web/core/app/api/app', () => ({ getAppFolderPath: vi.fn() }));
vi.mock('@/components/common/folder/Path', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/Edit/MCPTools/AppCard', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/constants', () => ({ cardStyles: {} }));
vi.mock('@/components/common/secret/HeaderAuthConfig', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/components/Markdown', () => ({ default: () => null }));
vi.mock('@/components/core/app/formRender/LabelAndForm', () => ({ default: () => null }));
vi.mock('@/components/core/app/formRender/utils', () => ({ valueTypeToInputType: vi.fn() }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/ValueTypeLabel', () => ({
  default: () => null
}));
vi.mock('@chakra-ui/react', () => {
  const childrenOnly = ({ children }: any) => children;
  return {
    Box: childrenOnly,
    Flex: childrenOnly,
    HStack: childrenOnly,
    ModalBody: childrenOnly,
    ModalFooter: childrenOnly,
    FormControl: childrenOnly,
    FormErrorMessage: childrenOnly,
    Textarea: () => null,
    Input: ({ onChange }: any) => {
      mocks.changeUrl = onChange;
      return null;
    },
    Button: ({ children, onClick, isDisabled }: any) => {
      mocks.actions.set(children, onClick);
      return React.createElement('button', { onClick, disabled: isDisabled }, children);
    }
  };
});

describe('MCP source isolation through the real parent, editor, save and debug components', () => {
  let root: Root;
  let container: HTMLDivElement;
  const urlA = 'https://a.example.com/mcp';
  const urlB = 'https://b.example.com/mcp';
  const requestMeta = { 'example/context': { tenant: 'A' } };
  const tool = { name: 'search', description: 'Service A', requestMeta };
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === label)!;
  const changeUrl = async (url: string) => {
    await act(async () => mocks.changeUrl!({ target: { value: url } }));
  };
  const consume = async () => {
    // Invoke callbacks too: a disabled button must not be the only protection.
    await act(async () => {
      await mocks.actions.get('common:Save')!();
    });
    await act(async () => {
      await mocks.actions.get('common:Run')!();
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.actions.clear();
    mocks.saveTools.mockResolvedValue(undefined);
    mocks.runTool.mockResolvedValue({ content: [] });
    mocks.appDetail = {
      _id: 'app',
      nodes: [
        { flowNodeType: 'toolSet', toolConfig: { mcpToolSet: { url: urlA, toolList: [tool] } } }
      ]
    };
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    // Header 使用自动 JSX runtime；Vitest 当前按经典 runtime 转译。
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(React.createElement(MCPTools)));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    window.close();
    vi.unstubAllGlobals();
  });

  it.each(
    ['unparsed', 'pending', 'failed'].flatMap((state) =>
      ['common:Save', 'common:Run'].map((action) => ({ state, action }))
    )
  )('blocks $action while B is $state', async ({ state, action }) => {
    await changeUrl(urlB);
    if (state === 'pending') {
      mocks.parseTools.mockReturnValue(new Promise(() => {}));
      await act(async () => button('common:Parse').click());
    }
    if (state === 'failed') {
      mocks.parseTools.mockRejectedValue(new Error('parse failed'));
      await act(async () => button('common:Parse').click());
    }
    await act(async () => {
      await mocks.actions.get(action)!();
    });
    expect(mocks.saveTools).not.toHaveBeenCalled();
    expect(mocks.runTool).not.toHaveBeenCalled();
    expect(button('common:Save').disabled).toBe(true);
    expect(button('common:Run').disabled).toBe(true);
  });

  it('reenables save/debug with B definitions after parsing succeeds', async () => {
    const freshTool = { name: 'search', description: 'Service B' };
    await changeUrl(urlB);
    mocks.parseTools.mockResolvedValue([freshTool]);
    await act(async () => button('common:Parse').click());
    await consume();
    expect(mocks.saveTools).toHaveBeenCalledWith(
      expect.objectContaining({ url: urlB, toolList: [freshTool] })
    );
    expect(mocks.runTool).toHaveBeenCalledWith(
      expect.objectContaining({ url: urlB, requestMeta: undefined })
    );
    expect(button('common:Save').disabled).toBe(false);
    expect(button('common:Run').disabled).toBe(false);
  });

  it('preserves A configuration when switching back before a successful B parse', async () => {
    await changeUrl(urlB);
    await changeUrl(urlA);
    await consume();
    expect(mocks.saveTools).toHaveBeenCalledWith(
      expect.objectContaining({ url: urlA, toolList: [tool] })
    );
    expect(mocks.runTool).toHaveBeenCalledWith(expect.objectContaining({ url: urlA, requestMeta }));
  });

  it('keeps a newer address blocked when an older parse response arrives', async () => {
    let resolveParse!: (tools: unknown[]) => void;
    mocks.parseTools.mockReturnValue(
      new Promise((resolve) => {
        resolveParse = resolve;
      })
    );
    await changeUrl(urlB);
    await act(async () => button('common:Parse').click());
    await changeUrl('https://c.example.com/mcp');
    await act(async () => resolveParse([{ name: 'search', description: 'Stale B definition' }]));
    await consume();
    expect(mocks.saveTools).not.toHaveBeenCalled();
    expect(mocks.runTool).not.toHaveBeenCalled();
    expect(button('common:Save').disabled).toBe(true);
    expect(button('common:Run').disabled).toBe(true);
  });
});
