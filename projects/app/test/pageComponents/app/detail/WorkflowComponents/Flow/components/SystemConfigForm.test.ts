import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { hydrateWorkflowEditor } from '@fastgpt/global/common/workflow/editor/protocol';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/output';
import { SystemConfigForm } from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/SystemConfigForm';

const mocks = vi.hoisted(() => ({ runtime: null as WorkflowRuntimePort | null }));

vi.mock('@chakra-ui/react', () => ({ Box: ({ children }: { children: ReactNode }) => children }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return { AppContext: createContext({ appDetail: { chatConfig: {} } }) };
});
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => mocks.runtime,
  useWorkflowSnapshot: () => mocks.runtime?.getWorkflow()
}));
vi.mock('@/components/core/app/QGConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/TTSSelect', () => ({ default: () => null }));
vi.mock('@/components/core/app/WhisperConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/InputGuideConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/ScheduledTriggerConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/VariableEdit', () => ({ default: () => null }));
vi.mock('@/components/core/app/WelcomeTextConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/AutoExecConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/WelcomeQuestionsConfig', () => ({ default: () => null }));
vi.mock('@/components/core/app/FileSelect', () => ({
  default: ({ onChange }: { onChange: (config: AppFileSelectConfigType) => void }) =>
    [true, false].map((enabled) =>
      React.createElement(
        'button',
        {
          key: String(enabled),
          'data-enabled': enabled,
          onClick: () => onChange({ ...defaultAppSelectFileConfig, canSelectImg: enabled })
        },
        enabled ? 'Enable upload' : 'Disable upload'
      )
    )
}));

it.each([false, true])(
  'lets Runtime fill and revert file references in the upload transaction (existing output: %s)',
  async (hasFileOutput) => {
    const { userChatInput, fileUrlList, datasetSearchInput } = NodeInputKeyEnum;
    const userQuestionRef = ['start', NodeOutputKeyEnum.userChatInput];
    const fileRef = ['start', NodeOutputKeyEnum.userFiles];
    const manualRef = [VARIABLE_NODE_ID, 'customQuestion'];
    const referenceInput = (key: string, value?: unknown) => ({
      key,
      label: key,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      value
    });
    const runtime = hydrateWorkflowEditor({
      nodes: [
        {
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
          inputs: [],
          outputs: [
            {
              id: NodeOutputKeyEnum.userChatInput,
              key: NodeOutputKeyEnum.userChatInput,
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            },
            ...(hasFileOutput ? [userFilesInput] : [])
          ]
        },
        {
          nodeId: 'chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [referenceInput(userChatInput, manualRef), referenceInput(fileUrlList)],
          outputs: []
        },
        {
          nodeId: 'dataset',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          name: 'Dataset',
          inputs: [referenceInput(datasetSearchInput)],
          outputs: []
        }
      ],
      edges: [
        { source: 'start', target: 'chat' },
        { source: 'chat', target: 'dataset' }
      ].map(({ source, target }) => ({
        source,
        target,
        sourceHandle: getHandleId(source, 'source', 'right'),
        targetHandle: getHandleId(target, 'target', 'left')
      })),
      chatConfig: {}
    });
    mocks.runtime = runtime;
    const dispatch = vi.spyOn(runtime, 'dispatch');
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.getElementById('root')!;
    const root = createRoot(container);
    const click = (enabled: boolean) =>
      act(async () =>
        container.querySelector<HTMLButtonElement>(`[data-enabled="${enabled}"]`)!.click()
      );
    const inputValue = (nodeId: string, key: string) =>
      runtime.getNode(nodeId)?.inputs.find((input) => input.key === key)?.value;

    try {
      await act(async () =>
        root.render(React.createElement(SystemConfigForm, { setAppDetail: vi.fn() }))
      );
      await click(true);
      expect(dispatch).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ type: 'updateChatConfig' }),
        expect.objectContaining({
          type: 'updateNode',
          nodeId: 'start',
          patch: {
            outputs: [
              expect.objectContaining({ key: NodeOutputKeyEnum.userChatInput }),
              userFilesInput
            ]
          }
        })
      ]);
      expect(runtime.getWorkflow().chatConfig.fileSelectConfig?.canSelectImg).toBe(true);
      expect(inputValue('chat', fileUrlList)).toEqual([fileRef]);
      expect(inputValue('chat', userChatInput)).toEqual(manualRef);
      expect(inputValue('dataset', datasetSearchInput)).toEqual([userQuestionRef, fileRef]);

      dispatch.mockClear();
      await click(false);
      expect(dispatch).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ type: 'updateChatConfig' }),
        expect.objectContaining({
          type: 'updateNode',
          nodeId: 'start',
          patch: { outputs: [expect.objectContaining({ key: NodeOutputKeyEnum.userChatInput })] }
        })
      ]);
      expect(runtime.getWorkflow().chatConfig.fileSelectConfig?.canSelectImg).toBe(false);
      expect(inputValue('chat', fileUrlList)).toBeUndefined();
      expect(inputValue('chat', userChatInput)).toEqual(manualRef);
      expect(inputValue('dataset', datasetSearchInput)).toEqual([userQuestionRef]);

      expect(runtime.undo().ok).toBe(true);
      expect(runtime.getWorkflow().chatConfig.fileSelectConfig?.canSelectImg).toBe(true);
      expect(inputValue('chat', fileUrlList)).toEqual([fileRef]);
    } finally {
      await act(async () => root.unmount());
      runtime.dispose();
      dom.window.close();
      vi.unstubAllGlobals();
      mocks.runtime = null;
    }
  }
);
