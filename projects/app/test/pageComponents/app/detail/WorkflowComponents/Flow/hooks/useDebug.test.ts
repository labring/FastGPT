import { JSDOM } from 'jsdom';
import React, { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDebugNodeVariables } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebug';
import { useDebug } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebug';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowDebugContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowDebugContext';
import { WorkflowBufferDataContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { WorkflowUtilsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { VARIABLE_NODE_ID, VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  getMCPTools: vi.fn(),
  getClientToolPreviewNode: vi.fn(),
  toast: vi.fn(),
  onStartNodeDebug: vi.fn(),
  setDebugChatId: vi.fn(),
  contextValues: new Map<unknown, unknown>(),
  toolLists: [] as { label: string; value: number }[][]
}));

vi.mock('use-context-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('use-context-selector')>()),
  useContextSelector: (context: unknown, selector: (value: any) => unknown) =>
    selector(mocks.contextValues.get(context))
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', async () => {
  const react = await import('react');
  const wrapper = ({ children }: { children?: ReactNode }) =>
    react.createElement('div', null, children);

  return {
    Box: wrapper,
    Flex: wrapper,
    Button: wrapper,
    useToast: () => ({ toast: mocks.toast })
  };
});
vi.mock('@fastgpt/web/components/common/MyDrawer/MyRightDrawer', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/Tabs/LightRowTabs', async () => {
  const react = await import('react');
  return { default: () => react.createElement('div') };
});
vi.mock('@fastgpt/web/components/common/MySelect', async () => {
  const react = await import('react');
  return {
    default: ({ list }: { list: { label: string; value: number }[] }) => {
      mocks.toolLists.push(list);
      return react.createElement('div');
    }
  };
});
vi.mock('@/components/core/app/formRender/LabelAndForm', async () => {
  const react = await import('react');
  const { Controller } = await import('react-hook-form');

  return {
    default: ({ form, fieldName }: { form: any; fieldName: string }) =>
      react.createElement(Controller, {
        control: form.control,
        name: fieldName,
        render: ({ field }: any) =>
          react.createElement('input', {
            'data-field': fieldName,
            value: field.value ?? '',
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              field.onChange(event.target.value)
          })
      })
  };
});
vi.mock('@/web/common/file/hooks/useFileUploadLimits', () => ({
  useFileUploadLimits: () => ({ maxUploadFileCount: 10 })
}));
vi.mock('@/web/core/app/api/mcpTools', () => ({ getMCPTools: mocks.getMCPTools }));
vi.mock('@/web/core/app/api/tool', () => ({
  getClientToolPreviewNode: mocks.getClientToolPreviewNode
}));

describe('resetDebugNodeVariables', () => {
  it('only resets node inputs so global variables survive tool switching', () => {
    const resetField = vi.fn();

    resetDebugNodeVariables({
      resetField,
      inputs: [
        {
          key: 'query',
          label: 'Query',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: 'new tool default'
        }
      ]
    } as any);

    expect(resetField).toHaveBeenCalledTimes(1);
    expect(resetField).toHaveBeenCalledWith('nodeVariables', {
      defaultValue: expect.objectContaining({ query: 'new tool default' })
    });
  });
});

describe('useDebug tool discovery', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;

  const Harness = () => {
    const { DebugInputModal, openDebugNode } = useDebug();

    useEffect(() => {
      void openDebugNode({ entryNodeId: 'mcp-set' });
    }, [openDebugNode]);

    return React.createElement(DebugInputModal);
  };

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', {
      url: 'https://fastgpt.example',
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.contextValues.clear();
    mocks.toolLists = [];
    mocks.getMCPTools.mockReset().mockImplementation(async ({ headerSecret }) => {
      const token = headerSecret.Authorization.value;
      return [
        {
          name: `tool-${token}`,
          description: '',
          inputSchema: { type: 'object', properties: {} }
        }
      ];
    });
    mocks.getClientToolPreviewNode.mockReset();
    mocks.setDebugChatId.mockReset();
    mocks.onStartNodeDebug.mockReset();
    mocks.toast.mockReset();

    const storeNode = {
      nodeId: 'mcp-set',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'MCP tool set',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          headerSecret: {
            Authorization: { ref: [VARIABLE_NODE_ID, 'token'] }
          },
          toolList: [{ name: 'search', description: '' }]
        }
      }
    };
    mocks.contextValues.set(WorkflowBufferDataContext, {
      setNodes: vi.fn(),
      edges: [],
      getNodeById: () => undefined,
      childrenNodeIdListMap: {}
    });
    mocks.contextValues.set(WorkflowUtilsContext, {
      flowData2StoreDataAndCheck: vi.fn(async () => ({ nodes: [storeNode], edges: [] }))
    });
    mocks.contextValues.set(WorkflowDebugContext, {
      onStartNodeDebug: mocks.onStartNodeDebug,
      setDebugChatId: mocks.setDebugChatId
    });
    mocks.contextValues.set(AppContext, {
      appDetail: {
        chatConfig: {
          variables: [
            {
              key: 'token',
              label: 'Token',
              description: '',
              type: VariableInputEnum.input,
              defaultValue: 'first-token'
            }
          ]
        }
      }
    });
    mocks.contextValues.set(WorkflowRuntimeContext, { fileUploading: false });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('discovers tools again after a nested variable is edited', async () => {
    await act(async () => {
      root.render(React.createElement(Harness));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.getMCPTools.mock.calls.at(-1)?.[0].headerSecret).toEqual({
      Authorization: { value: 'first-token' }
    });

    const tokenInput = container.querySelector<HTMLInputElement>(
      'input[data-field="variables.token"]'
    );
    expect(tokenInput).not.toBeNull();

    await act(async () => {
      tokenInput!.value = 'second-token';
      Simulate.change(tokenInput!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.getMCPTools.mock.calls.at(-1)?.[0].headerSecret).toEqual({
      Authorization: { value: 'second-token' }
    });
    expect(mocks.toolLists.at(-1)).toEqual([{ label: 'tool-second-token', value: 0 }]);
  });
});
