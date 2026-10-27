import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { getToolInputDisplayRenderTypeList } from '@fastgpt/global/core/app/formEdit/utils';

const mocks = vi.hoisted(() => ({
  isTool: true,
  inputs: [] as any[],
  renderInputCalls: [] as any[],
  onChangeNode: vi.fn()
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useCallback: <T>(callback: T) => callback,
    useMemo: <T>(factory: () => T) => factory()
  };
});

vi.mock('next/dynamic', () => ({
  default: () => () => null
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children?: ReactNode }) => children;
  return {
    Box: Container,
    Button: Container,
    Flex: Container,
    Grid: Container,
    HStack: Container,
    Switch: Container,
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});

vi.mock('use-context-selector', () => ({
  useContextSelector: (context: { __value: any }, selector: (value: any) => unknown) =>
    selector(context.__value)
}));

vi.mock('@/pageComponents/app/detail/context', () => ({
  AppContext: { __value: { appDetail: { chatConfig: {} } } }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: { __value: { onChangeNode: mocks.onChangeNode } }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowBufferDataContext: { __value: { getNodeById: vi.fn(), edges: [] } }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext', () => ({
  WorkflowUtilsContext: {
    __value: {
      splitToolInputs: () => ({ isTool: mocks.isTool, commonInputs: mocks.inputs }),
      splitOutput: () => ({ successOutputs: [], errorOutputs: [] })
    }
  }
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: {} })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ teamPlanStatus: undefined, isTeamAdmin: false })
}));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: <T>(factory: () => T) => factory()
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(), ConfirmModal: () => null })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflowQuoteLimit', () => ({
  useWorkflowQuoteLimit: () => 0
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/utils', () => ({
  getEditorVariables: () => []
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeAgent/useAgentSkillManager',
  () => ({
    useAgentSkillManager: () => ({
      selectedTools: [],
      skillOption: undefined,
      selectedSkills: [],
      selectedAgentSkills: [],
      canUploadFile: true,
      onClickSkill: vi.fn(),
      onConfigTool: vi.fn(),
      onRemoveSkill: vi.fn(),
      onUpdateOrAddTool: vi.fn(),
      onDeleteTool: vi.fn(),
      onAddAgentSkill: vi.fn(),
      onRemoveAgentSkill: vi.fn(),
      SkillModal: () => null
    })
  })
);

vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children?: ReactNode }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/Container', () => ({
  default: ({ children }: { children?: ReactNode }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/IOTitle', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput', () => ({
  default: (props: any) => {
    mocks.renderInputCalls.push(props);
    return null;
  }
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/Label',
  () => ({
    default: () => null
  })
);
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderOutput', () => ({
  default: () => null
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderOutput/CatchError',
  () => ({ default: () => null })
);
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderToolInput', () => ({
  default: () => null,
  hasDynamicToolInput: () => false
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/components/WorkflowSandboxConfig',
  () => ({ default: () => null, createSandboxEntrypointInput: vi.fn() })
);
vi.mock('@/components/core/app/DatasetCard', () => ({ default: () => null }));
vi.mock('@/components/core/app/SelectedToolCard', () => ({ default: () => null }));
vi.mock('@/components/core/app/SkillCard', () => ({ default: () => null }));
vi.mock('@/components/support/wallet/NotSufficientModal', () => ({ RechargeModal: () => null }));
vi.mock('@/components/common/PromptEditor/OptimizerPopover', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: { children?: ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

import NodeAgent from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeAgent';

const createChatInput = (selectedType: FlowNodeInputTypeEnum) => ({
  key: NodeInputKeyEnum.userChatInput,
  label: 'workflow:user_question',
  renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
  selectedType,
  value: selectedType === FlowNodeInputTypeEnum.reference ? ['start', 'userChatInput'] : ''
});

const renderNode = () => {
  const Component = (NodeAgent as unknown as { type: (props: any) => ReactElement }).type;

  renderToStaticMarkup(
    Component({
      data: {
        nodeId: 'agent-1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        avatar: '',
        inputs: mocks.inputs,
        outputs: [],
        catchError: false
      },
      selected: false
    })
  );
};

const getChatInputCall = () =>
  mocks.renderInputCalls.find((props) =>
    props.flowInputList?.some((input: any) => input.key === NodeInputKeyEnum.userChatInput)
  );

describe('NodeAgent userChatInput tool mode', () => {
  beforeEach(() => {
    mocks.renderInputCalls.length = 0;
  });

  it.each([FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea])(
    'keeps agentGenerated selectable after switching the tool question to %s',
    (selectedType) => {
      mocks.isTool = true;
      mocks.inputs = [createChatInput(selectedType)];

      renderNode();

      const chatInputCall = getChatInputCall();
      expect(chatInputCall?.isTool).toBe(true);

      const renderTypeList = getToolInputDisplayRenderTypeList({
        input: chatInputCall!.flowInputList[0],
        showAgentGenerated: !!chatInputCall!.isTool
      });
      expect(renderTypeList).toContain(FlowNodeInputTypeEnum.agentGenerated);
    }
  );

  it('does not expose agentGenerated when the node is not used as a tool', () => {
    mocks.isTool = false;
    mocks.inputs = [createChatInput(FlowNodeInputTypeEnum.reference)];

    renderNode();

    const chatInputCall = getChatInputCall();
    expect(chatInputCall?.isTool).toBe(false);

    const renderTypeList = getToolInputDisplayRenderTypeList({
      input: chatInputCall!.flowInputList[0],
      showAgentGenerated: !!chatInputCall!.isTool
    });
    expect(renderTypeList).not.toContain(FlowNodeInputTypeEnum.agentGenerated);
  });
});
