/**
 * Runtime Issue 规则的常驻语料测试。
 *
 * 集中验证有特殊规则的默认模板、诊断的最小场景和一份完整工作流。
 */
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration/schema';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { getExecutionBranchKeys } from '@fastgpt/workflow-core/edge/validation';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import { migrateStoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';
import type { WorkflowEnvironment } from '@fastgpt/global/core/workflow/editor/types';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { uiWorkflow2StoreWorkflow } from '@/web/core/workflow/editor/codec';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { AssignedAnswerModule } from '@fastgpt/global/core/workflow/template/system/assignedAnswer';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/index';
import { ContextExtractModule } from '@fastgpt/global/core/workflow/template/system/contextExtract/index';
import { DatasetConcatModule } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { IfElseNode } from '@fastgpt/global/core/workflow/template/system/ifElse/index';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import { UserSelectNode } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import { LoopRunNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunStartNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunStart';
import { LoopRunBreakNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunBreak';
import { CodeNode } from '@fastgpt/global/core/workflow/template/system/sandbox';
import { VariableUpdateNode } from '@fastgpt/global/core/workflow/template/system/variableUpdate';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';

/** identity t：Issue 只带 code 与 params，文案在渲染层解析，语料不需要真实翻译。 */
const t = ((key: string) => key) as any;

const MODELS = [
  { modelId: 'llm-1', legacyModel: 'llm-1', type: ModelTypeEnum.llm },
  { modelId: 'rerank-1', legacyModel: 'rerank-1', type: ModelTypeEnum.rerank },
  { modelId: 'tts-1', legacyModel: 'tts-1', type: ModelTypeEnum.tts },
  { modelId: 'index-1', legacyModel: 'index-1', type: ModelTypeEnum.embedding }
];

type Fixture = {
  name: string;
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges?: Edge[];
  chatConfig?: any;
  environment?: Partial<WorkflowEnvironment>;
  /** 直接改 canonical 文档：覆盖保存路径会裁剪的输入。 */
  mutate?: (canonical: CanonicalWorkflowData) => void;
};

const flowNode = (
  template: FlowNodeTemplateType,
  patch?: (node: Node<FlowNodeItemType, string | undefined>) => void
) => {
  const created = nodeTemplate2FlowNode({ template, position: { x: 0, y: 0 }, t });
  patch?.(created);
  return created;
};

const named = (template: FlowNodeTemplateType, nodeId: string) =>
  flowNode(template, (node) => {
    node.data.nodeId = nodeId;
  });

const edge = ({
  source,
  target,
  index,
  handles
}: {
  source: string;
  target: string;
  index: number;
  handles?: Partial<Edge>;
}): Edge =>
  ({
    id: `edge-${index}`,
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    ...handles
  }) as Edge;

const toolEdge = ({ source, target, index }: { source: string; target: string; index: number }) =>
  edge({
    source,
    target,
    index,
    handles: {
      sourceHandle: NodeOutputKeyEnum.selectedTools,
      targetHandle: NodeOutputKeyEnum.selectedTools
    }
  });

const startNode = () => named(WorkflowStart, 'start');

const connectedNode = (template: FlowNodeTemplateType, nodeId: string) => ({
  nodes: [startNode(), named(template, nodeId)],
  edges: [edge({ source: 'start', target: nodeId, index: 0 })]
});

const nodeOf = (canonical: CanonicalWorkflowData, nodeId: string) => {
  const found = canonical.nodes.find((node) => node.nodeId === nodeId);
  if (!found) throw new Error(`missing node ${nodeId}`);
  return found;
};

const inputOf = ({
  canonical,
  nodeId,
  key
}: {
  canonical: CanonicalWorkflowData;
  nodeId: string;
  key: string;
}) => {
  const found = nodeOf(canonical, nodeId).inputs.find((input) => input.key === key);
  if (!found) throw new Error(`missing input ${nodeId}.${key}`);
  return found;
};

const setValue = ({
  canonical,
  nodeId,
  key,
  value
}: {
  canonical: CanonicalWorkflowData;
  nodeId: string;
  key: string;
  value: unknown;
}) => {
  inputOf({ canonical, nodeId, key }).value = value as any;
};

const setManualValue = ({
  canonical,
  nodeId,
  key,
  value
}: {
  canonical: CanonicalWorkflowData;
  nodeId: string;
  key: string;
  value: unknown;
}) => {
  const input = inputOf({ canonical, nodeId, key });
  input.selectedType = FlowNodeInputTypeEnum.textarea;
  input.value = value as any;
};

const defaultEnvironment: WorkflowEnvironment = {
  models: MODELS,
  sandbox: { configured: true, planSupported: true }
};

/** 用同一份 canonical 文档 hydrate runtime，只读 Issue View。 */
const runRuntime = (canonical: CanonicalWorkflowData, environment = defaultEnvironment) => {
  const editor = createWorkflowEditor(canonical, { getEnvironment: () => environment });
  editor.refreshIssues('all');
  const { issues, chatConfigIssues } = editor.getWorkflowIssues();
  editor.dispose();
  return {
    nodes: new Set(issues.map((issue) => `${issue.nodeId}|${issue.code}|${issue.inputKey ?? ''}`)),
    config: new Set(chatConfigIssues.map((issue) => `${issue.code}|${issue.inputKey ?? ''}`))
  };
};

const sorted = (set: ReadonlySet<string>) => [...set].sort();

/**
 * 语料的期望 Issue 集合：`nodeId|code|inputKey`（节点桶）与 `code|inputKey`（chatConfig 桶），均已排序。
 * 由 runtime 规则与旧 app checker 全量对拍零差异后固化，之后任何规则改动都会在这里显形。
 * 新增语料必须补一条期望；缺条目直接抛错，避免“空集合”被当成通过。
 */
const EXPECTED_ISSUES: Record<string, { nodes: string[]; config?: string[] }> = {
  'template:pluginInput:workflow:plugin_input': {
    nodes: ['pluginInput|isolated_node|']
  },
  'template:loopStart:workflow:loop_start': { nodes: [] },
  'template:loopRunStart:workflow:loop_run_start': { nodes: [] },
  'template:toolSet:app:toolType_mcp': {
    nodes: ['toolSet|no_upstream|', 'toolSet|tool_set_not_configured|']
  },
  'template:toolSet:app:toolType_http': {
    nodes: ['toolSet|no_upstream|', 'toolSet|tool_set_not_configured|']
  },
  'code:required_input_empty': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput']
  },
  'code:no_upstream': {
    nodes: [
      'chat|model_required|modelId',
      'chat|no_upstream|',
      'chat|required_input_empty|userChatInput',
      'start|isolated_node|'
    ]
  },
  'code:isolated_node': { nodes: ['start|isolated_node|'] },
  'code:unreachable_from_start': {
    nodes: [
      'a|model_required|modelId',
      'a|no_upstream|',
      'a|required_input_empty|userChatInput',
      'b|model_required|modelId',
      'b|required_input_empty|userChatInput',
      'b|unreachable_from_start|',
      'start|isolated_node|'
    ]
  },
  'code:invalid_reference': { nodes: ['answer|invalid_reference|text'] },
  'code:unreachable_reference': {
    nodes: [
      'answer|unreachable_reference|text',
      'other|model_required|modelId',
      'other|required_input_empty|userChatInput'
    ]
  },
  'code:invalid_reference_type': {
    nodes: [
      'chat|invalid_reference_type|history',
      'chat|model_required|modelId',
      'chat|required_input_empty|userChatInput'
    ]
  },
  'code:if_else_incomplete': { nodes: ['if|if_else_incomplete|ifElseList'] },
  'code:loop_run_missing_break': {
    nodes: ['loop|loop_run_missing_break|']
  },
  'code:loop_run_with_break': {
    nodes: ['loopBreak|no_upstream|']
  },
  'code:user_select_empty': { nodes: ['select|user_select_empty|userSelectOptions'] },
  'code:user_select_value_empty': {
    nodes: ['select|user_select_value_empty|userSelectOptions']
  },
  'code:user_select_reference': { nodes: [] },
  'code:form_input_empty': { nodes: ['form|form_input_empty|userInputForms'] },
  'code:classify_question_empty': {
    nodes: [
      'classify|classify_question_empty|agents',
      'classify|model_required|modelId',
      'classify|required_input_empty|modelId',
      'classify|required_input_empty|userChatInput'
    ]
  },
  'code:classify_question_value_empty': {
    nodes: [
      'classify|classify_question_value_empty|agents',
      'classify|model_required|modelId',
      'classify|required_input_empty|modelId',
      'classify|required_input_empty|userChatInput'
    ]
  },
  'code:code_input_incomplete': { nodes: ['code|code_input_incomplete|'] },
  'code:http_url_empty': { nodes: ['http|http_url_empty|system_httpReqUrl'] },
  'code:context_extract_empty': {
    nodes: [
      'extract|context_extract_empty|extractKeys',
      'extract|model_required|modelId',
      'extract|required_input_empty|content',
      'extract|required_input_empty|modelId'
    ]
  },
  'code:tool_call_empty': {
    nodes: [
      'tool|model_required|modelId',
      'tool|required_input_empty|userChatInput',
      'tool|tool_call_empty|useAgentSandbox'
    ]
  },
  'code:tool_waiting_config': {
    nodes: [
      'agent|model_required|modelId',
      'agent|tool_waiting_config|system_input_config',
      'httpTool|http_url_empty|system_httpReqUrl',
      'httpTool|no_upstream|'
    ]
  },
  'code:tool_offline': { nodes: ['http|tool_offline|'] },
  'code:tool_no_permission': { nodes: ['http|resource_no_permission|'] },
  'code:tool_missing': { nodes: ['http|tool_missing|'] },
  'code:plugin_missing': { nodes: ['http|tool_missing|'] },
  'code:tool_load_failed': { nodes: ['http|tool_load_failed|'] },
  'code:resource_state': {
    nodes: [
      'agent|agent_tool_abnormal|agent_selectedTools',
      `agent|resource_missing|${NodeInputKeyEnum.datasetParams}`,
      'agent|resource_missing|skills',
      `agent|resource_no_permission|${NodeInputKeyEnum.datasetParams}`,
      'agent|sandbox_skill_unavailable|skills'
    ]
  },
  'code:dataset_model_requires_selection': { nodes: [] },
  'code:model_required': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput']
  },
  'code:model_unavailable': {
    nodes: ['chat|model_unavailable|modelId', 'chat|required_input_empty|userChatInput']
  },
  'code:sandbox_not_configured': {
    nodes: [
      'tool|model_required|modelId',
      'tool|required_input_empty|userChatInput',
      'tool|sandbox_not_configured|useAgentSandbox'
    ]
  },
  'code:sandbox_plan_not_supported': {
    nodes: [
      'tool|model_required|modelId',
      'tool|required_input_empty|userChatInput',
      'tool|sandbox_plan_not_supported|useAgentSandbox'
    ]
  },
  'code:variable_update_empty': { nodes: ['update|required_input_empty|updateList'] },
  'code:variable_update_reference': {
    nodes: [
      'update|invalid_reference|updateList[0].value',
      'update|invalid_reference|updateList[0].variable'
    ]
  },
  'code:if_else_reference': {
    nodes: ['if|invalid_reference|ifElseList[0].list[0].variable']
  },
  'code:dataset_concat': {
    nodes: ['concat|required_input_empty|system_datasetQuoteList']
  },
  'code:dataset_valid': { nodes: [] },
  'code:dataset_model_unavailable': {
    nodes: ['dataset|model_unavailable|rerankModelId']
  },
  'code:model_unavailable_short': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput'],
    config: ['model_unavailable_short|common:core.app.Question Guide']
  },
  'code:model_required_chat_config': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput'],
    config: ['model_required|common:core.app.tts.Speech model']
  },
  'real:multi-node': {
    nodes: [
      'chat|required_input_empty|userChatInput',
      'concat|required_input_empty|system_datasetQuoteList',
      'if|if_else_incomplete|ifElseList',
      'loopCode|code_input_incomplete|',
      'loopCode|no_upstream|',
      'loop|loop_run_missing_break|',
      'update|required_input_empty|updateList'
    ]
  }
};

const expectedIssues = (name: string) => {
  const expected = EXPECTED_ISSUES[name];
  if (!expected) throw new Error(`missing pinned expectation for fixture ${name}`);
  return expected;
};

const check = (fixture: Fixture) => {
  const store = uiWorkflow2StoreWorkflow({
    nodes: fixture.nodes,
    edges: fixture.edges ?? []
  });
  const canonical = migrateStoreWorkflow({
    nodes: store.nodes,
    edges: store.edges,
    // uiWorkflow2StoreWorkflow 只输出 nodes 与 edges，chatConfig 直接用 fixture 的原始配置。
    chatConfig: fixture.chatConfig ?? {}
  });
  fixture.mutate?.(canonical);

  const environment = { ...defaultEnvironment, ...fixture.environment };
  const runtime = runRuntime(canonical, environment);
  const expected = expectedIssues(fixture.name);
  expect({ nodes: sorted(runtime.nodes), config: sorted(runtime.config) }, fixture.name).toEqual({
    nodes: expected.nodes,
    config: expected.config ?? []
  });
};

/** 保留入口、循环隐藏字段和内联工具集的默认模板诊断。 */
const templateFixtures: Fixture[] = Object.keys(EXPECTED_ISSUES)
  .filter((name) => name.startsWith('template:'))
  .map((name) => {
    const template = moduleTemplatesFlat.find(
      ({ flowNodeType, name: templateName }) => name === `template:${flowNodeType}:${templateName}`
    );
    if (!template) throw new Error(`missing workflow template for fixture ${name}`);
    return { name, nodes: [named(template, template.flowNodeType)] };
  });

/** 语料 B：每个 code 一份最小用例。 */
const codeFixtures: Fixture[] = [
  {
    name: 'code:required_input_empty',
    ...connectedNode(AiChatModule, 'chat')
  },
  {
    name: 'code:no_upstream',
    nodes: [startNode(), named(AiChatModule, 'chat')]
  },
  {
    name: 'code:isolated_node',
    nodes: [startNode()]
  },
  {
    name: 'code:unreachable_from_start',
    nodes: [startNode(), named(AiChatModule, 'a'), named(AiChatModule, 'b')],
    edges: [edge({ source: 'a', target: 'b', index: 0 })]
  },
  {
    name: 'code:invalid_reference',
    ...connectedNode(AssignedAnswerModule, 'answer'),
    mutate: (canonical) => {
      const input = inputOf({ canonical, nodeId: 'answer', key: NodeInputKeyEnum.answerText });
      input.selectedType = FlowNodeInputTypeEnum.reference;
      input.value = ['missing', 'gone'];
    }
  },
  {
    name: 'code:unreachable_reference',
    nodes: [startNode(), named(AssignedAnswerModule, 'answer'), named(AiChatModule, 'other')],
    edges: [
      edge({ source: 'start', target: 'answer', index: 0 }),
      edge({ source: 'start', target: 'other', index: 1 })
    ],
    mutate: (canonical) => {
      const input = inputOf({ canonical, nodeId: 'answer', key: NodeInputKeyEnum.answerText });
      input.selectedType = FlowNodeInputTypeEnum.reference;
      input.value = ['other', 'answerText'];
    }
  },
  {
    // history 是 number，userChatInput 是 string：类型不匹配由模板 valueType 决定，
    // 不能改 canonical 上的 valueType，旧路径物化时会用模板值覆盖。
    name: 'code:invalid_reference_type',
    ...connectedNode(AiChatModule, 'chat'),
    mutate: (canonical) => {
      const input = inputOf({ canonical, nodeId: 'chat', key: NodeInputKeyEnum.history });
      input.selectedType = FlowNodeInputTypeEnum.reference;
      input.value = ['start', NodeOutputKeyEnum.userChatInput];
    }
  },
  {
    name: 'code:if_else_incomplete',
    ...connectedNode(IfElseNode, 'if')
  },
  {
    name: 'code:loop_run_missing_break',
    nodes: [
      startNode(),
      named(LoopRunNode, 'loop'),
      flowNode(LoopRunStartNode, (node) => {
        node.data.nodeId = 'loopStart';
        node.data.parentNodeId = 'loop';
      })
    ],
    edges: [edge({ source: 'start', target: 'loop', index: 0 })],
    mutate: (canonical) => {
      setValue({
        canonical,
        nodeId: 'loop',
        key: NodeInputKeyEnum.loopRunMode,
        value: LoopRunModeEnum.conditional
      });
      setValue({
        canonical,
        nodeId: 'loop',
        key: NodeInputKeyEnum.childrenNodeIdList,
        value: ['loopStart']
      });
    }
  },
  {
    name: 'code:loop_run_with_break',
    nodes: [
      startNode(),
      named(LoopRunNode, 'loop'),
      flowNode(LoopRunStartNode, (node) => {
        node.data.nodeId = 'loopStart';
        node.data.parentNodeId = 'loop';
      }),
      flowNode(LoopRunBreakNode, (node) => {
        node.data.nodeId = 'loopBreak';
        node.data.parentNodeId = 'loop';
      })
    ],
    edges: [edge({ source: 'start', target: 'loop', index: 0 })],
    mutate: (canonical) => {
      setValue({
        canonical,
        nodeId: 'loop',
        key: NodeInputKeyEnum.loopRunMode,
        value: LoopRunModeEnum.conditional
      });
      setValue({
        canonical,
        nodeId: 'loop',
        key: NodeInputKeyEnum.childrenNodeIdList,
        value: ['loopStart', 'loopBreak']
      });
    }
  },
  {
    name: 'code:user_select_empty',
    ...connectedNode(UserSelectNode, 'select'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'select', key: NodeInputKeyEnum.userSelectOptions, value: [] })
  },
  {
    name: 'code:user_select_value_empty',
    ...connectedNode(UserSelectNode, 'select'),
    mutate: (canonical) =>
      setValue({
        canonical,
        nodeId: 'select',
        key: NodeInputKeyEnum.userSelectOptions,
        value: [{ key: 'a', value: '' }]
      })
  },
  {
    name: 'code:user_select_reference',
    ...connectedNode(UserSelectNode, 'select'),
    mutate: (canonical) => {
      const input = inputOf({
        canonical,
        nodeId: 'select',
        key: NodeInputKeyEnum.userSelectOptions
      });
      input.selectedType = FlowNodeInputTypeEnum.reference;
      input.value = ['start', NodeOutputKeyEnum.userChatInput];
    }
  },
  {
    name: 'code:form_input_empty',
    ...connectedNode(FormInputNode, 'form'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'form', key: NodeInputKeyEnum.userInputForms, value: [] })
  },
  {
    name: 'code:classify_question_empty',
    ...connectedNode(ClassifyQuestionModule, 'classify'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'classify', key: NodeInputKeyEnum.agents, value: [] })
  },
  {
    name: 'code:classify_question_value_empty',
    ...connectedNode(ClassifyQuestionModule, 'classify'),
    mutate: (canonical) =>
      setValue({
        canonical,
        nodeId: 'classify',
        key: NodeInputKeyEnum.agents,
        value: [{ key: 'a', value: '' }]
      })
  },
  {
    name: 'code:code_input_incomplete',
    ...connectedNode(CodeNode, 'code'),
    mutate: (canonical) =>
      nodeOf(canonical, 'code').inputs.push({
        key: 'dynamic',
        label: 'dynamic',
        canEdit: true,
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        valueType: WorkflowIOValueTypeEnum.string,
        value: ['', '']
      } as any)
  },
  {
    name: 'code:http_url_empty',
    ...connectedNode(HttpNode468, 'http'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'http', key: NodeInputKeyEnum.httpReqUrl, value: '' })
  },
  {
    name: 'code:context_extract_empty',
    ...connectedNode(ContextExtractModule, 'extract'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'extract', key: NodeInputKeyEnum.extractKeys, value: [] })
  },
  {
    name: 'code:tool_call_empty',
    ...connectedNode(ToolCallNode, 'tool'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'tool', key: NodeInputKeyEnum.useAgentSandbox, value: false })
  },
  {
    name: 'code:tool_waiting_config',
    nodes: [
      startNode(),
      named(AgentNode, 'agent'),
      flowNode(HttpNode468, (node) => {
        node.data.nodeId = 'httpTool';
        node.data.isTool = true;
      })
    ],
    edges: [
      edge({ source: 'start', target: 'agent', index: 0 }),
      toolEdge({ source: 'httpTool', target: 'agent', index: 1 })
    ],
    mutate: (canonical) =>
      nodeOf(canonical, 'agent').inputs.push({
        key: NodeInputKeyEnum.systemInputConfig,
        label: 'system_input_config',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: undefined
      } as any)
  },
  ...(
    [
      ['tool_offline', { status: PluginStatusEnum.Offline }],
      ['tool_no_permission', { error: PluginErrEnum.unAuth }],
      ['tool_missing', { error: AppErrEnum.unExist }],
      ['plugin_missing', { error: PluginErrEnum.unExist }],
      ['tool_load_failed', { error: 'boom' }]
    ] as const
  ).map(
    ([name, pluginData]): Fixture => ({
      name: `code:${name}`,
      ...connectedNode(HttpNode468, 'http'),
      mutate: (canonical) => {
        setValue({
          canonical,
          nodeId: 'http',
          key: NodeInputKeyEnum.httpReqUrl,
          value: 'https://example.com'
        });
        nodeOf(canonical, 'http').pluginData = pluginData as any;
      }
    })
  ),
  {
    name: 'code:resource_state',
    ...connectedNode(AgentNode, 'agent'),
    mutate: (canonical) => {
      setValue({ canonical, nodeId: 'agent', key: NodeInputKeyEnum.aiModelId, value: 'llm-1' });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.userChatInput,
        value: ['start', NodeOutputKeyEnum.userChatInput]
      });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.datasetSelectList,
        value: [{ datasetId: 'denied', error: 'resource_no_permission' }]
      });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.skills,
        value: [{ skillId: 'missing', error: 'resource_missing' }]
      });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.selectedTools,
        value: [{ inputs: [], pluginData: { error: 'missing' } }]
      });
      nodeOf(canonical, 'agent').inputs.push({
        key: NodeInputKeyEnum.datasetParams,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: {
          datasets: [
            { datasetId: 'missing', error: 'resource_missing' },
            { datasetId: 'denied', error: 'resource_no_permission' }
          ]
        }
      } as any);
    }
  },
  {
    name: 'code:dataset_model_requires_selection',
    ...connectedNode(AgentNode, 'agent'),
    mutate: (canonical) => {
      setValue({ canonical, nodeId: 'agent', key: NodeInputKeyEnum.aiModelId, value: 'llm-1' });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.userChatInput,
        value: ['start', NodeOutputKeyEnum.userChatInput]
      });
      setValue({ canonical, nodeId: 'agent', key: NodeInputKeyEnum.datasetSelectList, value: [] });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
        value: true
      });
      setValue({
        canonical,
        nodeId: 'agent',
        key: NodeInputKeyEnum.datasetSearchExtensionModelId,
        value: 'gone'
      });
      nodeOf(canonical, 'agent').inputs.push({
        key: NodeInputKeyEnum.datasetParams,
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: {
          datasets: [],
          [NodeInputKeyEnum.datasetSearchUsingReRank]: true,
          [NodeInputKeyEnum.datasetSearchRerankModelId]: 'gone'
        }
      } as any);
    }
  },
  {
    name: 'code:model_required',
    ...connectedNode(AiChatModule, 'chat'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'chat', key: NodeInputKeyEnum.aiModelId, value: '' })
  },
  {
    name: 'code:model_unavailable',
    ...connectedNode(AiChatModule, 'chat'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'chat', key: NodeInputKeyEnum.aiModelId, value: 'gone-model' })
  },
  {
    name: 'code:sandbox_not_configured',
    ...connectedNode(ToolCallNode, 'tool'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'tool', key: NodeInputKeyEnum.useAgentSandbox, value: true }),
    environment: { sandbox: { configured: false, planSupported: true } }
  },
  {
    name: 'code:sandbox_plan_not_supported',
    ...connectedNode(ToolCallNode, 'tool'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'tool', key: NodeInputKeyEnum.useAgentSandbox, value: true }),
    environment: { sandbox: { configured: true, planSupported: false } }
  },
  {
    name: 'code:variable_update_empty',
    ...connectedNode(VariableUpdateNode, 'update'),
    mutate: (canonical) =>
      setValue({ canonical, nodeId: 'update', key: NodeInputKeyEnum.updateList, value: [] })
  },
  {
    name: 'code:variable_update_reference',
    ...connectedNode(VariableUpdateNode, 'update'),
    mutate: (canonical) =>
      setValue({
        canonical,
        nodeId: 'update',
        key: NodeInputKeyEnum.updateList,
        value: [
          {
            variable: ['missing', 'gone'],
            value: ['missing', 'gone'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ]
      })
  },
  {
    name: 'code:if_else_reference',
    ...connectedNode(IfElseNode, 'if'),
    mutate: (canonical) =>
      setValue({
        canonical,
        nodeId: 'if',
        key: NodeInputKeyEnum.ifElseList,
        value: [
          {
            condition: 'and',
            list: [
              {
                variable: ['missing', 'gone'],
                value: 'x',
                valueType: 'input',
                condition: 'equal'
              }
            ]
          }
        ]
      })
  },
  {
    name: 'code:dataset_concat',
    ...connectedNode(DatasetConcatModule, 'concat')
  },
  {
    name: 'code:dataset_valid',
    ...connectedNode(DatasetSearchModule, 'dataset'),
    mutate: (canonical) => {
      setValue({
        canonical,
        nodeId: 'dataset',
        key: NodeInputKeyEnum.datasetSelectList,
        value: [{ datasetId: 'valid-dataset', name: 'valid' }]
      });
      setManualValue({
        canonical,
        nodeId: 'dataset',
        key: NodeInputKeyEnum.datasetSearchInput,
        value: 'query'
      });
    }
  },
  {
    name: 'code:dataset_model_unavailable',
    ...connectedNode(DatasetSearchModule, 'dataset'),
    mutate: (canonical) => {
      setValue({
        canonical,
        nodeId: 'dataset',
        key: NodeInputKeyEnum.datasetSelectList,
        value: [{ datasetId: 'valid-dataset', name: 'valid' }]
      });
      setManualValue({
        canonical,
        nodeId: 'dataset',
        key: NodeInputKeyEnum.datasetSearchInput,
        value: 'query'
      });
      setValue({
        canonical,
        nodeId: 'dataset',
        key: NodeInputKeyEnum.datasetSearchUsingReRank,
        value: true
      });
      setValue({
        canonical,
        nodeId: 'dataset',
        key: NodeInputKeyEnum.datasetSearchRerankModelId,
        value: 'gone-rerank'
      });
    }
  },
  {
    name: 'code:model_unavailable_short',
    ...connectedNode(AiChatModule, 'chat'),
    chatConfig: { questionGuide: { open: true, modelId: 'gone' } } as any
  },
  {
    name: 'code:model_required_chat_config',
    ...connectedNode(AiChatModule, 'chat'),
    chatConfig: { ttsConfig: { type: 'model' } } as any
  }
];

const realWorldIfNode = named(IfElseNode, 'if');
const [ifBranchKey] = getExecutionBranchKeys(realWorldIfNode.data);

/** 语料 C：一份接近真实导出的多节点工作流。 */
const realWorldFixture: Fixture = {
  name: 'real:multi-node',
  nodes: [
    startNode(),
    named(DatasetConcatModule, 'concat'),
    named(AiChatModule, 'chat'),
    named(AssignedAnswerModule, 'answer'),
    realWorldIfNode,
    named(HttpNode468, 'http'),
    named(LoopRunNode, 'loop'),
    flowNode(LoopRunStartNode, (node) => {
      node.data.nodeId = 'loopStart';
      node.data.parentNodeId = 'loop';
    }),
    flowNode(CodeNode, (node) => {
      node.data.nodeId = 'loopCode';
      node.data.parentNodeId = 'loop';
    }),
    named(VariableUpdateNode, 'update')
  ],
  edges: [
    edge({ source: 'start', target: 'concat', index: 0 }),
    edge({ source: 'concat', target: 'chat', index: 1 }),
    edge({ source: 'chat', target: 'if', index: 2 }),
    edge({
      source: 'if',
      target: 'http',
      index: 3,
      handles: { sourceHandle: getHandleId('if', 'source', ifBranchKey) }
    }),
    edge({
      source: 'if',
      target: 'loop',
      index: 4,
      handles: { sourceHandle: getHandleId('if', 'source', IfElseResultEnum.ELSE) }
    }),
    edge({ source: 'loop', target: 'update', index: 5 }),
    edge({ source: 'update', target: 'answer', index: 6 })
  ],
  chatConfig: { questionGuide: { open: true, modelId: 'llm-1' } } as any,
  mutate: (canonical) => {
    setValue({ canonical, nodeId: 'chat', key: NodeInputKeyEnum.aiModelId, value: 'llm-1' });
    setValue({
      canonical,
      nodeId: 'answer',
      key: NodeInputKeyEnum.answerText,
      value: ['chat', 'history']
    });
    setValue({
      canonical,
      nodeId: 'http',
      key: NodeInputKeyEnum.httpReqUrl,
      value: '{{start.userChatInput}}/api/{{chat.history}}'
    });
    setValue({
      canonical,
      nodeId: 'loop',
      key: NodeInputKeyEnum.loopRunMode,
      value: LoopRunModeEnum.conditional
    });
    setValue({
      canonical,
      nodeId: 'loop',
      key: NodeInputKeyEnum.childrenNodeIdList,
      value: ['loopStart', 'loopCode']
    });
  }
};

const corpus = [...templateFixtures, ...codeFixtures, realWorldFixture];

describe('workflow issue rules', () => {
  it.each([undefined, null])('treats a cleared update target (%s) as required', (clearedOutput) => {
    const store = uiWorkflow2StoreWorkflow(connectedNode(VariableUpdateNode, 'update'));
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    const runtime = createWorkflowEditor(canonical, { getEnvironment: () => defaultEnvironment });
    const field = runtime.getFieldHandle({
      nodeId: 'update',
      fieldKey: NodeInputKeyEnum.updateList
    });
    const selectTarget = (output: string | null | undefined) =>
      field?.setValue([
        {
          variable: ['start', output],
          value: ['', 'updated value'],
          renderType: FlowNodeInputTypeEnum.input
        }
      ]);
    const targetIssues = () =>
      runtime.getWorkflowIssues().issues.filter((issue) => issue.params?.field === 'variable');

    expect(selectTarget(NodeOutputKeyEnum.userChatInput)?.ok).toBe(true);
    expect(targetIssues()).toEqual([]);

    expect(selectTarget(clearedOutput)?.ok).toBe(true);
    expect(targetIssues()).toEqual([
      expect.objectContaining({
        code: 'required_input_empty',
        params: { field: 'variable', inputNameKey: 'common:core.workflow.variable' }
      })
    ]);

    expect(selectTarget('deleted-output')?.ok).toBe(true);
    expect(targetIssues()).toEqual([expect.objectContaining({ code: 'invalid_reference' })]);
    runtime.dispose();
  });

  it.each([0, 2])('reports both missing update fields with %i rows', (rowCount) => {
    const store = uiWorkflow2StoreWorkflow(connectedNode(VariableUpdateNode, 'update'));
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    setValue({
      canonical,
      nodeId: 'update',
      key: NodeInputKeyEnum.updateList,
      value: Array.from({ length: rowCount }, () => ({
        variable: ['', ''],
        value: ['', ''],
        renderType: FlowNodeInputTypeEnum.input
      }))
    });
    const runtime = createWorkflowEditor(canonical, { getEnvironment: () => defaultEnvironment });
    const { issues } = runtime.getWorkflowIssues();
    runtime.dispose();

    expect(
      issues
        .filter(
          ({ nodeId, code, inputKey }) =>
            nodeId === 'update' &&
            code === 'required_input_empty' &&
            inputKey === NodeInputKeyEnum.updateList
        )
        .map(({ params }) => params?.inputNameKey)
    ).toEqual(['common:core.workflow.variable', 'common:value']);
  });

  it('checks chat model defaults separately from stable IDs and legacy names', () => {
    const dialog = migrateStoreWorkflow({
      nodes: [],
      edges: [],
      chatConfig: {
        questionGuide: { open: true },
        ttsConfig: { type: 'model', modelId: 'old-tts' }
      }
    });
    const environment: WorkflowEnvironment = {
      sandbox: defaultEnvironment.sandbox,
      models: [
        { modelId: 'team-model', type: ModelTypeEnum.llm },
        { modelId: 'tts-id', type: ModelTypeEnum.tts, legacyModel: 'old-tts' }
      ]
    };
    const runtime = createWorkflowEditor(dialog, { getEnvironment: () => environment });
    expect(runtime.getWorkflowIssues().chatConfigIssues.map(({ code }) => code)).toEqual([
      'model_required',
      'model_unavailable_short'
    ]);
    environment.defaultModelIds = { [ModelTypeEnum.llm]: 'default-llm' };
    expect(
      runtime.dispatch({
        type: 'updateChatConfig',
        chatConfig: {
          questionGuide: { open: true },
          ttsConfig: { type: 'model', model: 'old-tts' }
        }
      }).ok
    ).toBe(true);
    expect(runtime.getWorkflowIssues().chatConfigIssues).toEqual([]);
    runtime.dispose();
  });
  it('opens a legacy IfElse branch with a missing condition list and reports it as incomplete', () => {
    const store = uiWorkflow2StoreWorkflow(connectedNode(IfElseNode, 'if'));
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    setValue({
      canonical,
      nodeId: 'if',
      key: NodeInputKeyEnum.ifElseList,
      value: [{ condition: 'AND' }]
    });
    expect(runRuntime(canonical).nodes).toContain('if|if_else_incomplete|ifElseList');
  });

  it('marks agent resources with their kind for the shared presentation', () => {
    const store = uiWorkflow2StoreWorkflow({
      ...connectedNode(AgentNode, 'agent')
    });
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    setValue({
      canonical,
      nodeId: 'agent',
      key: NodeInputKeyEnum.skills,
      value: [{ skillId: 'missing', error: 'resource_missing' }]
    });
    const runtime = createWorkflowEditor(canonical, {
      getEnvironment: () => defaultEnvironment
    });
    runtime.refreshIssues('all');
    expect(runtime.getWorkflowIssues().issues).toContainEqual(
      expect.objectContaining({
        code: 'resource_missing',
        inputKey: NodeInputKeyEnum.skills,
        params: { resourceKind: 'skill' }
      })
    );
    runtime.dispose();
  });
  it('reports an unconfigured tool set', () => {
    const template = moduleTemplatesFlat.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    if (!template) throw new Error('missing tool set template');
    const store = uiWorkflow2StoreWorkflow({
      ...connectedNode(template, 'tool')
    });
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    nodeOf(canonical, 'tool').toolConfig = { mcpToolSet: { url: '', toolList: [] } };
    const result = runRuntime(canonical);
    expect(result.nodes).toContain('tool|tool_set_not_configured|');
  });
  it('checks empty dynamic options and ignores stale manual form references', () => {
    const store = uiWorkflow2StoreWorkflow({
      nodes: [startNode(), named(UserSelectNode, 'select'), named(FormInputNode, 'form')],
      edges: [
        edge({ source: 'start', target: 'select', index: 0 }),
        edge({ source: 'select', target: 'form', index: 1 })
      ]
    });
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    const options = inputOf({
      canonical,
      nodeId: 'select',
      key: NodeInputKeyEnum.userSelectOptions
    });
    options.selectedType = FlowNodeInputTypeEnum.reference;
    options.value = [];
    setValue({
      canonical,
      nodeId: 'form',
      key: NodeInputKeyEnum.userInputForms,
      value: [
        {
          key: 'choice',
          type: FlowNodeInputTypeEnum.select,
          listInputType: FlowNodeInputTypeEnum.input,
          listReference: ['deleted', 'output']
        }
      ]
    });
    const result = runRuntime(canonical);
    expect(result.nodes).toContain('select|user_select_empty|userSelectOptions');
    expect(result.nodes).not.toContain('form|invalid_reference|userInputForms');
    setValue({
      canonical,
      nodeId: 'form',
      key: NodeInputKeyEnum.userInputForms,
      value: [
        {
          key: 'choice',
          type: FlowNodeInputTypeEnum.select,
          listInputType: FlowNodeInputTypeEnum.reference,
          listReference: []
        }
      ]
    });
    const dynamicResult = runRuntime(canonical);
    expect(dynamicResult.nodes).toContain('form|required_input_empty|userInputForms');
  });
  it('requires sandbox when an agent has skills', () => {
    const store = uiWorkflow2StoreWorkflow({
      ...connectedNode(AgentNode, 'agent')
    });
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    setValue({
      canonical,
      nodeId: 'agent',
      key: NodeInputKeyEnum.skills,
      value: [{ skillId: 'skill' }]
    });
    setValue({ canonical, nodeId: 'agent', key: NodeInputKeyEnum.useAgentSandbox, value: false });
    const result = runRuntime(canonical);
    expect(result.nodes).toContain('agent|sandbox_skill_unavailable|skills');
  });
  it('checks an inactive sequential tool and an empty model reference', () => {
    const store = uiWorkflow2StoreWorkflow({
      nodes: [startNode(), named(HttpNode468, 'http'), named(AiChatModule, 'chat')],
      edges: [
        edge({ source: 'start', target: 'http', index: 0 }),
        edge({ source: 'http', target: 'chat', index: 1 })
      ]
    });
    const canonical = migrateStoreWorkflow({ ...store, chatConfig: {} });
    nodeOf(canonical, 'http').inputs.push({
      key: NodeInputKeyEnum.systemInputConfig,
      label: 'system_input_config',
      renderTypeList: [FlowNodeInputTypeEnum.input],
      value: undefined
    } as any);
    setValue({ canonical, nodeId: 'chat', key: NodeInputKeyEnum.aiModelId, value: [] });
    const result = runRuntime(canonical);
    expect(result.nodes).toContain('http|tool_waiting_config|system_input_config');
    expect(result.nodes).toContain('chat|model_required|modelId');
  });
  it.each(corpus)('$name', (fixture) => {
    check(fixture);
  });
});
