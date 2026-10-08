/**
 * Runtime Issue 规则的常驻语料测试。
 *
 * 三份语料：每个节点模板的默认节点、每个 issue code 一份最小用例、一份接近真实导出的多节点工作流。
 * 期望集合来自 runtime 规则与旧 app checker 的全量对拍（零差异后固化）；旧 checker 已删除，
 * 这里是规则行为的唯一回归防线，任何判定变化都必须显式改期望表。
 */
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from 'reactflow';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration/schema';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { createWorkflowEditor } from '@fastgpt/global/core/workflow/editor/runtime/runtime';
import { migrateStoreWorkflow } from '@fastgpt/global/core/workflow/editor/protocol';
import { WorkflowIssueCode } from '@fastgpt/global/core/workflow/editor/issueCode';
import type { WorkflowEnvironment } from '@fastgpt/global/core/workflow/editor/types';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { uiWorkflow2StoreWorkflow } from '@/web/core/workflow/editor/codec';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { AssignedAnswerModule } from '@fastgpt/global/core/workflow/template/system/assignedAnswer';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/index';
import { ContextExtractModule } from '@fastgpt/global/core/workflow/template/system/contextExtract/index';
import { DatasetConcatModule } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { IfElseNode } from '@fastgpt/global/core/workflow/template/system/ifElse/index';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import { UserSelectNode } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import {
  LoopRunModeEnum,
  LoopRunNode
} from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
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
  { modelId: 'llm-1', model: 'llm-1', type: ModelTypeEnum.llm },
  { modelId: 'rerank-1', model: 'rerank-1', type: ModelTypeEnum.rerank },
  { modelId: 'tts-1', model: 'tts-1', type: ModelTypeEnum.tts },
  { modelId: 'index-1', model: 'index-1', type: ModelTypeEnum.embedding }
];

type Fixture = {
  name: string;
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges?: Edge[];
  chatConfig?: any;
  environment?: Partial<WorkflowEnvironment>;
  /** 直接改 canonical 文档：绕过保存路径的字段裁剪，保证两边读到完全相同的数据。 */
  mutate?: (canonical: CanonicalWorkflowData) => void;
  expectCodes?: string[];
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

const edge = (source: string, target: string, index: number, handles?: Partial<Edge>): Edge =>
  ({
    id: `edge-${index}`,
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    ...handles
  }) as Edge;

const toolEdge = (source: string, target: string, index: number) =>
  edge(source, target, index, {
    sourceHandle: NodeOutputKeyEnum.selectedTools,
    targetHandle: NodeOutputKeyEnum.selectedTools
  });

const startNode = () => named(WorkflowStart, 'start');

const nodeOf = (canonical: CanonicalWorkflowData, nodeId: string) => {
  const found = canonical.nodes.find((node) => node.nodeId === nodeId);
  if (!found) throw new Error(`missing node ${nodeId}`);
  return found;
};

const inputOf = (canonical: CanonicalWorkflowData, nodeId: string, key: string) => {
  const found = nodeOf(canonical, nodeId).inputs.find((input) => input.key === key);
  if (!found) throw new Error(`missing input ${nodeId}.${key}`);
  return found;
};

const setValue = (
  canonical: CanonicalWorkflowData,
  nodeId: string,
  key: string,
  value: unknown
) => {
  inputOf(canonical, nodeId, key).value = value as any;
};

/** 用同一份 canonical 文档 hydrate runtime，只读 Issue View。 */
const runRuntime = (canonical: CanonicalWorkflowData, environment: WorkflowEnvironment) => {
  const editor = createWorkflowEditor(canonical, { getEnvironment: () => environment });
  editor.refreshIssues('all');
  const { issues, chatConfigIssues } = editor.getWorkflowIssues();
  editor.dispose();
  return {
    codes: [...issues.map((issue) => issue.code), ...chatConfigIssues.map((issue) => issue.code)],
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
const EXPECTED_ISSUES: Record<string, { nodes: string[]; config: string[] }> = {
  'template:workflowStart:workflow:template.workflow_start': {
    nodes: ['n0|isolated_node|'],
    config: []
  },
  'template:chatNode:workflow:template.ai_chat': {
    nodes: [
      'n1|model_required|modelId',
      'n1|no_upstream|',
      'n1|required_input_empty|userChatInput'
    ],
    config: []
  },
  'template:textEditor:workflow:text_concatenation': {
    nodes: ['n2|no_upstream|', 'n2|required_input_empty|system_textareaInput'],
    config: []
  },
  'template:answerNode:workflow:assigned_reply': {
    nodes: ['n3|no_upstream|', 'n3|required_input_empty|text'],
    config: []
  },
  'template:datasetSearchNode:workflow:template.dataset_search': {
    nodes: [
      'n4|no_upstream|',
      'n4|required_input_empty|datasetSearchInput',
      'n4|required_input_empty|datasets'
    ],
    config: []
  },
  'template:classifyQuestion:workflow:question_classification': {
    nodes: [
      'n5|model_required|modelId',
      'n5|no_upstream|',
      'n5|required_input_empty|modelId',
      'n5|required_input_empty|userChatInput'
    ],
    config: []
  },
  'template:contentExtract:workflow:text_content_extraction': {
    nodes: [
      'n6|context_extract_empty|extractKeys',
      'n6|model_required|modelId',
      'n6|no_upstream|',
      'n6|required_input_empty|content',
      'n6|required_input_empty|modelId'
    ],
    config: []
  },
  'template:datasetConcatNode:workflow:knowledge_base_search_merge': {
    nodes: ['n7|no_upstream|', 'n7|required_input_empty|system_datasetQuoteList'],
    config: []
  },
  'template:tools:workflow:template.agent': {
    nodes: [
      'n8|model_required|modelId',
      'n8|no_upstream|',
      'n8|required_input_empty|userChatInput',
      'n8|tool_call_empty|useAgentSandbox'
    ],
    config: []
  },
  'template:toolParams:workflow:tool_custom_field': { nodes: ['n9|no_upstream|'], config: [] },
  'template:stopTool:workflow:tool_call_termination': { nodes: ['n10|no_upstream|'], config: [] },
  'template:agent:workflow:template.agent_module': {
    nodes: [
      'n11|model_required|modelId',
      'n11|no_upstream|',
      'n11|required_input_empty|userChatInput'
    ],
    config: []
  },
  'template:readFiles:app:workflow.read_files': {
    nodes: ['n12|no_upstream|', 'n12|required_input_empty|fileUrlList'],
    config: []
  },
  'template:httpRequest468:workflow:http_request': {
    nodes: ['n13|http_url_empty|system_httpReqUrl', 'n13|no_upstream|'],
    config: []
  },
  'template:ifElseNode:workflow:condition_checker': {
    nodes: ['n14|if_else_incomplete|ifElseList', 'n14|no_upstream|'],
    config: []
  },
  'template:variableUpdate:workflow:variable_update': {
    nodes: ['n15|no_upstream|', 'n15|required_input_empty|updateList'],
    config: []
  },
  'template:code:workflow:code_execution': {
    nodes: ['n16|code_input_incomplete|', 'n16|no_upstream|'],
    config: []
  },
  'template:parallelRun:workflow:parallel_run': {
    nodes: ['n17|no_upstream|', 'n17|required_input_empty|loopInputArray'],
    config: []
  },
  'template:loopRun:workflow:loop_run': {
    nodes: ['n18|no_upstream|', 'n18|required_input_empty|loopRunInputArray'],
    config: []
  },
  'template:loopRunBreak:workflow:loop_run_break': { nodes: ['n19|no_upstream|'], config: [] },
  'template:customFeedback:workflow:custom_feedback': {
    nodes: ['n20|no_upstream|', 'n20|required_input_empty|system_textareaInput'],
    config: []
  },
  'template:userSelect:app:workflow.user_select': { nodes: ['n21|no_upstream|'], config: [] },
  'template:formInput:app:workflow.form_input': {
    nodes: ['n22|form_input_empty|userInputForms', 'n22|no_upstream|'],
    config: []
  },
  'template:pluginInput:workflow:plugin_input': { nodes: ['n23|isolated_node|'], config: [] },
  'template:pluginOutput:workflow:template.plugin_output': {
    nodes: ['n24|no_upstream|'],
    config: []
  },
  'template:emptyNode:': { nodes: [], config: [] },
  'template:pluginModule:': { nodes: ['n26|no_upstream|'], config: [] },
  'template:appModule:': { nodes: ['n27|no_upstream|'], config: [] },
  'template:app:workflow:application_call': {
    nodes: [
      'n28|no_upstream|',
      'n28|required_input_empty|app',
      'n28|required_input_empty|userChatInput'
    ],
    config: []
  },
  'template:loop:workflow:loop': {
    nodes: ['n29|no_upstream|', 'n29|required_input_empty|loopInputArray'],
    config: []
  },
  'template:loopStart:workflow:loop_start': { nodes: ['n30|isolated_node|'], config: [] },
  'template:loopEnd:workflow:loop_end': {
    nodes: ['n31|no_upstream|', 'n31|required_input_empty|loopEndInput'],
    config: []
  },
  'template:loopRunStart:workflow:loop_run_start': { nodes: ['n32|isolated_node|'], config: [] },
  'template:tool:': { nodes: ['n33|no_upstream|'], config: [] },
  'template:toolSet:': { nodes: ['n34|no_upstream|'], config: [] },
  'template:cfr:workflow:question_optimization': {
    nodes: [
      'n35|model_required|modelId',
      'n35|no_upstream|',
      'n35|required_input_empty|modelId',
      'n35|required_input_empty|userChatInput'
    ],
    config: []
  },
  'code:required_input_empty': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput'],
    config: []
  },
  'code:no_upstream': {
    nodes: [
      'chat|model_required|modelId',
      'chat|no_upstream|',
      'chat|required_input_empty|userChatInput',
      'start|isolated_node|'
    ],
    config: []
  },
  'code:isolated_node': { nodes: ['start|isolated_node|'], config: [] },
  'code:unreachable_from_start': {
    nodes: [
      'a|model_required|modelId',
      'a|no_upstream|',
      'a|required_input_empty|userChatInput',
      'b|model_required|modelId',
      'b|required_input_empty|userChatInput',
      'b|unreachable_from_start|',
      'start|isolated_node|'
    ],
    config: []
  },
  'code:invalid_reference': { nodes: ['answer|invalid_reference|text'], config: [] },
  'code:unreachable_reference': {
    nodes: [
      'answer|unreachable_reference|text',
      'other|model_required|modelId',
      'other|required_input_empty|userChatInput'
    ],
    config: []
  },
  'code:invalid_reference_type': {
    nodes: [
      'chat|invalid_reference_type|history',
      'chat|model_required|modelId',
      'chat|required_input_empty|userChatInput'
    ],
    config: []
  },
  'code:if_else_incomplete': { nodes: ['if|if_else_incomplete|ifElseList'], config: [] },
  'code:loop_run_missing_break': {
    nodes: ['loopStart|isolated_node|', 'loop|loop_run_missing_break|'],
    config: []
  },
  'code:loop_run_with_break': {
    nodes: ['loopBreak|no_upstream|', 'loopStart|isolated_node|'],
    config: []
  },
  'code:user_select_empty': { nodes: ['select|user_select_empty|userSelectOptions'], config: [] },
  'code:user_select_value_empty': {
    nodes: ['select|user_select_value_empty|userSelectOptions'],
    config: []
  },
  'code:form_input_empty': { nodes: ['form|form_input_empty|userInputForms'], config: [] },
  'code:classify_question_empty': {
    nodes: [
      'classify|classify_question_empty|agents',
      'classify|model_required|modelId',
      'classify|required_input_empty|modelId',
      'classify|required_input_empty|userChatInput'
    ],
    config: []
  },
  'code:classify_question_value_empty': {
    nodes: [
      'classify|classify_question_value_empty|agents',
      'classify|model_required|modelId',
      'classify|required_input_empty|modelId',
      'classify|required_input_empty|userChatInput'
    ],
    config: []
  },
  'code:code_input_incomplete': { nodes: ['code|code_input_incomplete|'], config: [] },
  'code:http_url_empty': { nodes: ['http|http_url_empty|system_httpReqUrl'], config: [] },
  'code:context_extract_empty': {
    nodes: [
      'extract|context_extract_empty|extractKeys',
      'extract|model_required|modelId',
      'extract|required_input_empty|content',
      'extract|required_input_empty|modelId'
    ],
    config: []
  },
  'code:tool_call_empty': {
    nodes: [
      'tool|model_required|modelId',
      'tool|required_input_empty|userChatInput',
      'tool|tool_call_empty|useAgentSandbox'
    ],
    config: []
  },
  'code:tool_waiting_config': {
    nodes: [
      'agent|model_required|modelId',
      'agent|tool_waiting_config|system_input_config',
      'httpTool|http_url_empty|system_httpReqUrl',
      'httpTool|no_upstream|'
    ],
    config: []
  },
  'code:tool_offline': { nodes: ['http|tool_offline|'], config: [] },
  'code:tool_no_permission': { nodes: ['http|tool_no_permission|'], config: [] },
  'code:tool_missing': { nodes: ['http|tool_missing|'], config: [] },
  'code:tool_load_failed': { nodes: ['http|tool_load_failed|'], config: [] },
  'code:model_required': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput'],
    config: []
  },
  'code:model_unavailable': {
    nodes: ['chat|model_unavailable|modelId', 'chat|required_input_empty|userChatInput'],
    config: []
  },
  'code:sandbox_not_configured': {
    nodes: [
      'tool|model_required|modelId',
      'tool|required_input_empty|userChatInput',
      'tool|sandbox_not_configured|useAgentSandbox'
    ],
    config: []
  },
  'code:sandbox_plan_not_supported': {
    nodes: [
      'tool|model_required|modelId',
      'tool|required_input_empty|userChatInput',
      'tool|sandbox_plan_not_supported|useAgentSandbox'
    ],
    config: []
  },
  'code:variable_update_empty': { nodes: ['update|required_input_empty|updateList'], config: [] },
  'code:variable_update_reference': {
    nodes: [
      'update|invalid_reference|updateList',
      'update|invalid_reference|updateList[0].value',
      'update|invalid_reference|updateList[0].variable'
    ],
    config: []
  },
  'code:if_else_reference': {
    nodes: [
      'if|invalid_reference|ifElseList',
      'if|invalid_reference|ifElseList[0].list[0].variable'
    ],
    config: []
  },
  'code:dataset_concat': {
    nodes: ['concat|required_input_empty|system_datasetQuoteList'],
    config: []
  },
  'code:model_unavailable_short': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput'],
    config: ['model_unavailable_short|common:core.app.Question Guide']
  },
  'code:model_required_chat_config': {
    nodes: ['chat|model_required|modelId', 'chat|required_input_empty|userChatInput'],
    config: []
  },
  'real:multi-node': {
    nodes: [
      'chat|required_input_empty|userChatInput',
      'concat|required_input_empty|system_datasetQuoteList',
      'if|if_else_incomplete|ifElseList',
      'loopCode|code_input_incomplete|',
      'loopCode|no_upstream|',
      'loopStart|isolated_node|',
      'loop|loop_run_missing_break|',
      'update|required_input_empty|updateList'
    ],
    config: []
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

  const environment: WorkflowEnvironment = {
    models: MODELS,
    sandbox: { configured: true, planSupported: true },
    ...fixture.environment
  };
  const runtime = runRuntime(canonical, environment);
  const expected = expectedIssues(fixture.name);
  expect({ fixture: fixture.name, nodes: sorted(runtime.nodes) }).toEqual({
    fixture: fixture.name,
    nodes: expected.nodes
  });
  expect({ fixture: fixture.name, config: sorted(runtime.config) }).toEqual({
    fixture: fixture.name,
    config: expected.config
  });
  const produced = [...new Set(runtime.codes)].sort();
  (fixture.expectCodes ?? []).forEach((code) => {
    expect({ fixture: fixture.name, code, produced }).toEqual({
      fixture: fixture.name,
      code,
      produced: expect.arrayContaining([code]) as any
    });
  });
};

/** 语料 A：每个模板一份默认节点，覆盖面靠模板数量而不是手写用例；nodeId 固定成序号，期望集合才可复现。 */
const templateFixtures: Fixture[] = moduleTemplatesFlat.map((template, index) => ({
  name: `template:${template.flowNodeType}:${template.name}`,
  nodes: [
    flowNode(template, (node) => {
      node.data.nodeId = `n${index}`;
    })
  ]
}));

/** 语料 B：每个 code 一份最小用例。 */
const codeFixtures: Fixture[] = [
  {
    name: 'code:required_input_empty',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    edges: [edge('start', 'chat', 0)],
    expectCodes: [WorkflowIssueCode.requiredInputEmpty]
  },
  {
    name: 'code:no_upstream',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    expectCodes: [WorkflowIssueCode.noUpstream]
  },
  {
    name: 'code:isolated_node',
    nodes: [startNode()],
    expectCodes: [WorkflowIssueCode.isolatedNode]
  },
  {
    name: 'code:unreachable_from_start',
    nodes: [startNode(), named(AiChatModule, 'a'), named(AiChatModule, 'b')],
    edges: [edge('a', 'b', 0)],
    expectCodes: [WorkflowIssueCode.unreachableFromStart]
  },
  {
    name: 'code:invalid_reference',
    nodes: [startNode(), named(AssignedAnswerModule, 'answer')],
    edges: [edge('start', 'answer', 0)],
    mutate: (canonical) =>
      setValue(canonical, 'answer', NodeInputKeyEnum.answerText, ['missing', 'gone']),
    expectCodes: [WorkflowIssueCode.invalidReference]
  },
  {
    name: 'code:unreachable_reference',
    nodes: [startNode(), named(AssignedAnswerModule, 'answer'), named(AiChatModule, 'other')],
    edges: [edge('start', 'answer', 0), edge('start', 'other', 1)],
    mutate: (canonical) =>
      setValue(canonical, 'answer', NodeInputKeyEnum.answerText, ['other', 'answerText']),
    expectCodes: [WorkflowIssueCode.unreachableReference]
  },
  {
    // history 是 number，userChatInput 是 string：类型不匹配由模板 valueType 决定，
    // 不能改 canonical 上的 valueType，旧路径物化时会用模板值覆盖。
    name: 'code:invalid_reference_type',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    edges: [edge('start', 'chat', 0)],
    mutate: (canonical) =>
      setValue(canonical, 'chat', NodeInputKeyEnum.history, [
        'start',
        NodeOutputKeyEnum.userChatInput
      ]),
    expectCodes: [WorkflowIssueCode.invalidReferenceType]
  },
  {
    name: 'code:if_else_incomplete',
    nodes: [startNode(), named(IfElseNode, 'if')],
    edges: [edge('start', 'if', 0)],
    expectCodes: [WorkflowIssueCode.ifElseIncomplete]
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
    edges: [edge('start', 'loop', 0)],
    mutate: (canonical) => {
      setValue(canonical, 'loop', NodeInputKeyEnum.loopRunMode, LoopRunModeEnum.conditional);
      setValue(canonical, 'loop', NodeInputKeyEnum.childrenNodeIdList, ['loopStart']);
    },
    expectCodes: [WorkflowIssueCode.loopRunMissingBreak]
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
    edges: [edge('start', 'loop', 0)],
    mutate: (canonical) => {
      setValue(canonical, 'loop', NodeInputKeyEnum.loopRunMode, LoopRunModeEnum.conditional);
      setValue(canonical, 'loop', NodeInputKeyEnum.childrenNodeIdList, ['loopStart', 'loopBreak']);
    }
  },
  {
    name: 'code:user_select_empty',
    nodes: [startNode(), named(UserSelectNode, 'select')],
    edges: [edge('start', 'select', 0)],
    mutate: (canonical) => setValue(canonical, 'select', NodeInputKeyEnum.userSelectOptions, []),
    expectCodes: [WorkflowIssueCode.userSelectEmpty]
  },
  {
    name: 'code:user_select_value_empty',
    nodes: [startNode(), named(UserSelectNode, 'select')],
    edges: [edge('start', 'select', 0)],
    mutate: (canonical) =>
      setValue(canonical, 'select', NodeInputKeyEnum.userSelectOptions, [{ key: 'a', value: '' }]),
    expectCodes: [WorkflowIssueCode.userSelectValueEmpty]
  },
  {
    name: 'code:form_input_empty',
    nodes: [startNode(), named(FormInputNode, 'form')],
    edges: [edge('start', 'form', 0)],
    mutate: (canonical) => setValue(canonical, 'form', NodeInputKeyEnum.userInputForms, []),
    expectCodes: [WorkflowIssueCode.formInputEmpty]
  },
  {
    name: 'code:classify_question_empty',
    nodes: [startNode(), named(ClassifyQuestionModule, 'classify')],
    edges: [edge('start', 'classify', 0)],
    mutate: (canonical) => setValue(canonical, 'classify', NodeInputKeyEnum.agents, []),
    expectCodes: [WorkflowIssueCode.classifyQuestionEmpty]
  },
  {
    name: 'code:classify_question_value_empty',
    nodes: [startNode(), named(ClassifyQuestionModule, 'classify')],
    edges: [edge('start', 'classify', 0)],
    mutate: (canonical) =>
      setValue(canonical, 'classify', NodeInputKeyEnum.agents, [{ key: 'a', value: '' }]),
    expectCodes: [WorkflowIssueCode.classifyQuestionValueEmpty]
  },
  {
    name: 'code:code_input_incomplete',
    nodes: [startNode(), named(CodeNode, 'code')],
    edges: [edge('start', 'code', 0)],
    mutate: (canonical) =>
      nodeOf(canonical, 'code').inputs.push({
        key: 'dynamic',
        label: 'dynamic',
        canEdit: true,
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        valueType: WorkflowIOValueTypeEnum.string,
        value: ['', '']
      } as any),
    expectCodes: [WorkflowIssueCode.codeInputIncomplete]
  },
  {
    name: 'code:http_url_empty',
    nodes: [startNode(), named(HttpNode468, 'http')],
    edges: [edge('start', 'http', 0)],
    mutate: (canonical) => setValue(canonical, 'http', NodeInputKeyEnum.httpReqUrl, ''),
    expectCodes: [WorkflowIssueCode.httpUrlEmpty]
  },
  {
    name: 'code:context_extract_empty',
    nodes: [startNode(), named(ContextExtractModule, 'extract')],
    edges: [edge('start', 'extract', 0)],
    mutate: (canonical) => setValue(canonical, 'extract', NodeInputKeyEnum.extractKeys, []),
    expectCodes: [WorkflowIssueCode.contextExtractEmpty]
  },
  {
    name: 'code:tool_call_empty',
    nodes: [startNode(), named(ToolCallNode, 'tool')],
    edges: [edge('start', 'tool', 0)],
    mutate: (canonical) => setValue(canonical, 'tool', NodeInputKeyEnum.useAgentSandbox, false),
    expectCodes: [WorkflowIssueCode.toolCallEmpty]
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
    edges: [edge('start', 'agent', 0), toolEdge('httpTool', 'agent', 1)],
    mutate: (canonical) =>
      nodeOf(canonical, 'agent').inputs.push({
        key: NodeInputKeyEnum.systemInputConfig,
        label: 'system_input_config',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: undefined
      } as any),
    expectCodes: [WorkflowIssueCode.toolWaitingConfig]
  },
  {
    name: 'code:tool_offline',
    nodes: [startNode(), named(HttpNode468, 'http')],
    edges: [edge('start', 'http', 0)],
    mutate: (canonical) => {
      setValue(canonical, 'http', NodeInputKeyEnum.httpReqUrl, 'https://example.com');
      nodeOf(canonical, 'http').pluginData = { status: PluginStatusEnum.Offline } as any;
    },
    expectCodes: [WorkflowIssueCode.toolOffline]
  },
  {
    name: 'code:tool_no_permission',
    nodes: [startNode(), named(HttpNode468, 'http')],
    edges: [edge('start', 'http', 0)],
    mutate: (canonical) => {
      setValue(canonical, 'http', NodeInputKeyEnum.httpReqUrl, 'https://example.com');
      nodeOf(canonical, 'http').pluginData = { error: PluginErrEnum.unAuth } as any;
    },
    expectCodes: [WorkflowIssueCode.toolNoPermission]
  },
  {
    name: 'code:tool_missing',
    nodes: [startNode(), named(HttpNode468, 'http')],
    edges: [edge('start', 'http', 0)],
    mutate: (canonical) => {
      setValue(canonical, 'http', NodeInputKeyEnum.httpReqUrl, 'https://example.com');
      nodeOf(canonical, 'http').pluginData = { error: AppErrEnum.unExist } as any;
    },
    expectCodes: [WorkflowIssueCode.toolMissing]
  },
  {
    name: 'code:tool_load_failed',
    nodes: [startNode(), named(HttpNode468, 'http')],
    edges: [edge('start', 'http', 0)],
    mutate: (canonical) => {
      setValue(canonical, 'http', NodeInputKeyEnum.httpReqUrl, 'https://example.com');
      nodeOf(canonical, 'http').pluginData = { error: 'boom' } as any;
    },
    expectCodes: [WorkflowIssueCode.toolLoadFailed]
  },
  {
    name: 'code:model_required',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    edges: [edge('start', 'chat', 0)],
    mutate: (canonical) => setValue(canonical, 'chat', NodeInputKeyEnum.aiModelId, ''),
    expectCodes: [WorkflowIssueCode.modelRequired]
  },
  {
    name: 'code:model_unavailable',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    edges: [edge('start', 'chat', 0)],
    mutate: (canonical) => setValue(canonical, 'chat', NodeInputKeyEnum.aiModelId, 'gone-model'),
    expectCodes: [WorkflowIssueCode.modelUnavailable]
  },
  {
    name: 'code:sandbox_not_configured',
    nodes: [startNode(), named(ToolCallNode, 'tool')],
    edges: [edge('start', 'tool', 0)],
    mutate: (canonical) => setValue(canonical, 'tool', NodeInputKeyEnum.useAgentSandbox, true),
    environment: { sandbox: { configured: false, planSupported: true } },
    expectCodes: [WorkflowIssueCode.sandboxNotConfigured]
  },
  {
    name: 'code:sandbox_plan_not_supported',
    nodes: [startNode(), named(ToolCallNode, 'tool')],
    edges: [edge('start', 'tool', 0)],
    mutate: (canonical) => setValue(canonical, 'tool', NodeInputKeyEnum.useAgentSandbox, true),
    environment: { sandbox: { configured: true, planSupported: false } },
    expectCodes: [WorkflowIssueCode.sandboxPlanNotSupported]
  },
  {
    name: 'code:variable_update_empty',
    nodes: [startNode(), named(VariableUpdateNode, 'update')],
    edges: [edge('start', 'update', 0)],
    mutate: (canonical) => setValue(canonical, 'update', NodeInputKeyEnum.updateList, []),
    expectCodes: [WorkflowIssueCode.requiredInputEmpty]
  },
  {
    name: 'code:variable_update_reference',
    nodes: [startNode(), named(VariableUpdateNode, 'update')],
    edges: [edge('start', 'update', 0)],
    mutate: (canonical) =>
      setValue(canonical, 'update', NodeInputKeyEnum.updateList, [
        {
          variable: ['missing', 'gone'],
          value: ['missing', 'gone'],
          valueType: WorkflowIOValueTypeEnum.string,
          renderType: FlowNodeInputTypeEnum.reference
        }
      ]),
    expectCodes: [WorkflowIssueCode.invalidReference]
  },
  {
    name: 'code:if_else_reference',
    nodes: [startNode(), named(IfElseNode, 'if')],
    edges: [edge('start', 'if', 0)],
    mutate: (canonical) =>
      setValue(canonical, 'if', NodeInputKeyEnum.ifElseList, [
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
      ]),
    expectCodes: [WorkflowIssueCode.invalidReference]
  },
  {
    name: 'code:dataset_concat',
    nodes: [startNode(), named(DatasetConcatModule, 'concat')],
    edges: [edge('start', 'concat', 0)],
    expectCodes: [WorkflowIssueCode.requiredInputEmpty]
  },
  {
    name: 'code:model_unavailable_short',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    edges: [edge('start', 'chat', 0)],
    chatConfig: { questionGuide: { open: true, modelId: 'gone' } } as any,
    expectCodes: [WorkflowIssueCode.modelUnavailableShort]
  },
  {
    name: 'code:model_required_chat_config',
    nodes: [startNode(), named(AiChatModule, 'chat')],
    edges: [edge('start', 'chat', 0)],
    chatConfig: { ttsConfig: { type: 'model' } } as any,
    expectCodes: [WorkflowIssueCode.modelRequired]
  }
];

/** 语料 C：一份接近真实导出的多节点工作流。 */
const realWorldFixture: Fixture = {
  name: 'real:multi-node',
  nodes: [
    startNode(),
    named(DatasetConcatModule, 'concat'),
    named(AiChatModule, 'chat'),
    named(AssignedAnswerModule, 'answer'),
    named(IfElseNode, 'if'),
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
    edge('start', 'concat', 0),
    edge('concat', 'chat', 1),
    edge('chat', 'if', 2),
    edge('if', 'http', 3),
    edge('if', 'loop', 4),
    edge('loop', 'update', 5),
    edge('update', 'answer', 6)
  ],
  chatConfig: { questionGuide: { open: true, modelId: 'llm-1' } } as any,
  mutate: (canonical) => {
    setValue(canonical, 'chat', NodeInputKeyEnum.aiModelId, 'llm-1');
    setValue(canonical, 'answer', NodeInputKeyEnum.answerText, ['chat', 'history']);
    setValue(
      canonical,
      'http',
      NodeInputKeyEnum.httpReqUrl,
      '{{start.userChatInput}}/api/{{chat.history}}'
    );
    setValue(canonical, 'loop', NodeInputKeyEnum.loopRunMode, LoopRunModeEnum.conditional);
    setValue(canonical, 'loop', NodeInputKeyEnum.childrenNodeIdList, ['loopStart', 'loopCode']);
  }
};

const corpus = [...templateFixtures, ...codeFixtures, realWorldFixture];

describe('workflow issue rules', () => {
  it.each(corpus)('$name', (fixture) => {
    check(fixture);
  });
});

describe('corpus coverage', () => {
  it('covers every flow node type that runs rules', () => {
    const covered = new Set(
      corpus.flatMap((fixture) => fixture.nodes.map((n) => n.data.flowNodeType))
    );
    // comment 与 globalVariable 不进模板面板，也不参与任何规则。
    const skipped: string[] = [FlowNodeTypeEnum.comment, FlowNodeTypeEnum.globalVariable];
    const missing = Object.values(FlowNodeTypeEnum).filter(
      (type) => !covered.has(type) && !skipped.includes(type)
    );
    expect(missing).toEqual([]);
  });

  it('covers every issue code', () => {
    const produced = new Set(corpus.flatMap((fixture) => fixture.expectCodes ?? []));
    const missing = Object.values(WorkflowIssueCode).filter((code) => !produced.has(code));
    expect(missing).toEqual([]);
  });
});
