import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Spinner } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import Markdown from '@/components/Markdown';
import { onWorkflowCopilot, type CopilotToolCallEvent } from '@/web/common/api/fetch';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { checkWorkflowNodeAndConnection, nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import {
  EDGE_TYPE,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/workflow/template/system/contextExtract/type';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { LoopEndNode } from '@fastgpt/global/core/workflow/template/system/loop/loopEnd';
import { useTranslation, type TFunction } from 'next-i18next';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { Node } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemoizedFn } from 'ahooks';
import { useWorkflowAutoLayout } from '../hooks/useWorkflowAutoLayout';
import { AppContext } from '@/pageComponents/app/detail/context';
import type { AppChatConfigType, AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { WORKFLOW_COPILOT_TASK_STORAGE_KEY, type WorkflowCopilotGenerationTask } from './constants';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

// ─── Types ────────────────────────────────────────────────────────────────────

type TextMessage = { kind: 'text'; id: string; role: 'user' | 'assistant'; content: string };
type ToolCallMessage = {
  kind: 'tool';
  id: string;
  functionName: string;
  params: string;
  status: 'calling' | 'done' | 'error';
  result?: string;
  /** toolResponse 完成后填入，展示给用户的具体操作对象描述 */
  displaySuffix?: string;
};
type MessageItem = TextMessage | ToolCallMessage;

// ─── Local Tracker (可变快照，解决 React 批处理问题) ──────────────────────────

type TrackerNodeOutput = { id: string; key: string; label?: string; valueType?: string };
type TrackerNodeInput = {
  key: string;
  label?: string;
  value: any;
  valueType?: string;
  renderType?: string;
  required?: boolean;
};
type TrackerNode = {
  nodeId: string;
  flowNodeType: string;
  name: string;
  inputs: TrackerNodeInput[];
  outputs: TrackerNodeOutput[];
  parentNodeId?: string;
  configuredInputKeys: Set<string>;
  /** 是否支持错误捕获（undefined = 不支持，false = 支持但未开启，true = 已开启） */
  catchError?: boolean;
};
type TrackerEdge = {
  source: string;
  target: string;
  sourceHandleKey: string;
  targetHandleKey: string;
};
type LocalTracker = {
  nodes: TrackerNode[];
  edges: TrackerEdge[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOOL_LABEL_KEYS: Record<string, string> = {
  get_workflow: i18nT('workflow:copilot_tool_get_workflow'),
  add_node: i18nT('workflow:copilot_tool_add_node'),
  delete_node: i18nT('workflow:copilot_tool_delete_node'),
  add_classifyQuestion_branch: i18nT('workflow:copilot_tool_add_classifyQuestion_branch'),
  delete_classifyQuestion_branch: i18nT('workflow:copilot_tool_delete_classifyQuestion_branch'),
  add_ifElseNode_branch: i18nT('workflow:copilot_tool_add_ifElseNode_branch'),
  delete_ifElseNode_branch: i18nT('workflow:copilot_tool_delete_ifElseNode_branch'),
  add_edge: i18nT('workflow:copilot_tool_add_edge'),
  delete_edge: i18nT('workflow:copilot_tool_delete_edge'),
  validate_workflow: i18nT('workflow:copilot_tool_validate_workflow'),
  search_app_templates: i18nT('workflow:copilot_tool_search_app_templates'),
  get_app_template_detail: i18nT('workflow:copilot_tool_get_app_template_detail'),
  get_node_config_schema: i18nT('workflow:copilot_tool_get_node_config_schema'),
  update_node_inputs: i18nT('workflow:copilot_tool_update_node_inputs'),
  get_available_references: i18nT('workflow:copilot_tool_get_available_references'),
  get_node_detail: i18nT('workflow:copilot_tool_get_node_detail'),
  update_system_config: i18nT('workflow:copilot_tool_update_system_config'),
  set_node_catch_error: i18nT('workflow:copilot_tool_set_node_catch_error')
};

const NODE_TYPE_LABEL_MAP: Partial<Record<FlowNodeTypeEnum, string>> = {
  [FlowNodeTypeEnum.chatNode]: i18nT('workflow:template.ai_chat'),
  [FlowNodeTypeEnum.textEditor]: i18nT('workflow:text_concatenation'),
  [FlowNodeTypeEnum.answerNode]: i18nT('workflow:assigned_reply'),
  [FlowNodeTypeEnum.datasetSearchNode]: i18nT('workflow:template.dataset_search'),
  [FlowNodeTypeEnum.classifyQuestion]: i18nT('workflow:question_classification'),
  [FlowNodeTypeEnum.contentExtract]: i18nT('workflow:text_content_extraction'),
  [FlowNodeTypeEnum.datasetConcatNode]: i18nT('workflow:knowledge_base_search_merge'),
  [FlowNodeTypeEnum.toolCall]: i18nT('workflow:template.agent'),
  [FlowNodeTypeEnum.toolParams]: i18nT('workflow:tool_custom_field'),
  [FlowNodeTypeEnum.stopTool]: i18nT('workflow:tool_call_termination'),
  [FlowNodeTypeEnum.agent]: i18nT('workflow:template.agent_module'),
  [FlowNodeTypeEnum.readFiles]: i18nT('app:workflow.read_files'),
  [FlowNodeTypeEnum.httpRequest468]: i18nT('workflow:http_request'),
  [FlowNodeTypeEnum.queryExtension]: i18nT('workflow:question_optimization'),
  [FlowNodeTypeEnum.lafModule]: i18nT('workflow:laf_function_call_test'),
  [FlowNodeTypeEnum.ifElseNode]: i18nT('workflow:condition_checker'),
  [FlowNodeTypeEnum.variableUpdate]: i18nT('workflow:variable_update'),
  [FlowNodeTypeEnum.code]: i18nT('workflow:code_execution'),
  [FlowNodeTypeEnum.loop]: i18nT('workflow:loop'),
  [FlowNodeTypeEnum.parallelRun]: i18nT('workflow:parallel_run'),
  [FlowNodeTypeEnum.systemConfig]: i18nT('workflow:template.system_config'),
  [FlowNodeTypeEnum.workflowStart]: i18nT('workflow:template.workflow_start'),
  [FlowNodeTypeEnum.customFeedback]: i18nT('workflow:custom_feedback'),
  [FlowNodeTypeEnum.userSelect]: i18nT('app:workflow.user_select'),
  [FlowNodeTypeEnum.formInput]: i18nT('app:workflow.form_input'),
}


function safeParseJson(str: string): Record<string, any> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function toolRecoverableError(message: string, extra?: Record<string, any>) {
  return JSON.stringify({
    success: false,
    recoverable: true,
    message,
    ...extra
  });
}

function isFatalToolResult(result: string) {
  if (result.startsWith('fatal:')) return true;
  if (!result.startsWith('error:')) return false;

  return (
    result.includes('workflow generation state is not initialized') ||
    result.includes('unknown tool')
  );
}

/** sourceHandleKey → actual ReactFlow sourceHandle string */
function resolveSourceHandle(sourceNodeId: string, sourceHandleKey: string): string {
  // "catch" 是特殊关键字，对应错误捕获的 source_catch handle
  if (sourceHandleKey === 'catch') {
    return `${sourceNodeId}-source_catch-right`;
  }
  return `${sourceNodeId}-source-${sourceHandleKey}`;
}

// ─── Tool execution ───────────────────────────────────────────────────────────

// 完全隐藏的系统节点（不出现在 get_workflow / get_node_detail 中）
const SYSTEM_NODES = new Set(['pluginConfig', 'userGuide']);
// systemConfig 需要在 get_workflow 中显示，但不参与连线验证、不参与引用计算

// Render types that require user UI selection (can't be filled by model)
const REQUIRES_USER_SELECT = new Set([
  FlowNodeInputTypeEnum.selectDataset,
  FlowNodeInputTypeEnum.selectApp,
  'selectDatasetParamsModal'
]);

// Render types the model can set via update_node_inputs
const AUTO_CONFIGURABLE = new Set([
  FlowNodeInputTypeEnum.input,
  FlowNodeInputTypeEnum.textarea,
  FlowNodeInputTypeEnum.numberInput,
  FlowNodeInputTypeEnum.switch,
  FlowNodeInputTypeEnum.select,
  FlowNodeInputTypeEnum.multipleSelect,
  FlowNodeInputTypeEnum.settingLLMModel,
  FlowNodeInputTypeEnum.JSONEditor,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt
]);

const SKIP_INPUT_KEYS = new Set(['userChatInput', 'history', 'switch']);

const USER_CONFIG_INPUT_TYPES = new Set<string>([
  ...REQUIRES_USER_SELECT,
  FlowNodeInputTypeEnum.selectSkill,
  FlowNodeInputTypeEnum.selectTool,
  FlowNodeInputTypeEnum.fileSelect,
  FlowNodeInputTypeEnum.timePointSelect,
  FlowNodeInputTypeEnum.timeRangeSelect,
  FlowNodeInputTypeEnum.password,
  FlowNodeInputTypeEnum.tagFilterConfig
]);

const VALIDATE_CUSTOM_INPUT_KEYS = new Set<string>([
  NodeInputKeyEnum.extractKeys,
  NodeInputKeyEnum.userInputForms,
  NodeInputKeyEnum.agents,
  NodeInputKeyEnum.ifElseList,
  NodeInputKeyEnum.code,
  NodeInputKeyEnum.httpMethod,
  NodeInputKeyEnum.httpTimeout,
  NodeInputKeyEnum.httpHeaders,
  NodeInputKeyEnum.userSelectOptions
]);

const TEMPLATE_SEARCH_CAPABILITIES: Record<string, string[]> = {
  datasetSearchNode: ['knowledge_base', 'rag', 'dataset_search'],
  datasetConcatNode: ['knowledge_base_merge', 'rag'],
  chatNode: ['ai_chat', 'llm'],
  classifyQuestion: ['intent_classification', 'routing'],
  ifElseNode: ['conditional_branch'],
  httpRequest468: ['http_request', 'api_call'],
  code: ['code_runner', 'data_processing'],
  formInput: ['form_input'],
  readFiles: ['file_parse'],
  contentExtract: ['structured_extraction'],
  userSelect: ['user_choice'],
  loop: ['loop'],
  tools: ['agent_tools'],
  answerNode: ['fixed_reply'],
  textEditor: ['text_splicing']
};

const TEMPLATE_SEARCH_KEYWORDS: Array<{ words: string[]; nodeTypes: string[] }> = [
  {
    words: ['知识库', '知识库检索', 'rag', '客服', '问答', 'qa'],
    nodeTypes: ['datasetSearchNode']
  },
  { words: ['分类', '意图', '路由', '分流', 'classify'], nodeTypes: ['classifyQuestion'] },
  { words: ['条件', '判断', 'if', 'else', '分支'], nodeTypes: ['ifElseNode'] },
  { words: ['接口', 'api', 'http', 'webhook', '联网', '请求'], nodeTypes: ['httpRequest468'] },
  { words: ['代码', '脚本', '计算', '处理', 'javascript', 'python'], nodeTypes: ['code'] },
  { words: ['表单', '填写', '收集信息', 'form'], nodeTypes: ['formInput'] },
  { words: ['文件', '解析文件', '上传', 'excel', 'pdf', 'word'], nodeTypes: ['readFiles'] },
  { words: ['提取', '抽取', '结构化', '字段'], nodeTypes: ['contentExtract'] },
  { words: ['选择', '选项', '按钮'], nodeTypes: ['userSelect'] },
  { words: ['循环', '批量', '遍历'], nodeTypes: ['loop'] },
  { words: ['工具', 'agent', '调用工具'], nodeTypes: ['tools'] }
];

const TEMPLATE_SENSITIVE_INPUT_KEY_RE =
  /(dataset|selectapp|appid|secret|password|token|authorization|credential|apikey|api_key|header|customheaders)/i;

function normalizeTemplateText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(normalizeTemplateText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(normalizeTemplateText).join(' ');
  return String(value).toLowerCase();
}

function getNodeTypeFromEdgeHandle(handle?: string) {
  return handle ? handle.split('-source-')[1] || 'right' : 'right';
}

function isEmptyInputValue(value: any) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function getInputDisplayName(input: TrackerNodeInput) {
  return input.label || input.key;
}

function shouldValidateNodeInput(input: TrackerNodeInput) {
  if (!input.required && !VALIDATE_CUSTOM_INPUT_KEYS.has(input.key)) return false;
  if (input.key === NodeInputKeyEnum.history) return false;
  if (!input.renderType) return false;
  if (USER_CONFIG_INPUT_TYPES.has(input.renderType)) return false;
  if (input.renderType === FlowNodeInputTypeEnum.hidden) return false;
  if (input.renderType === FlowNodeInputTypeEnum.addInputParam) return false;
  if (input.renderType === FlowNodeInputTypeEnum.off) return false;
  if (input.renderType === FlowNodeInputTypeEnum.custom) {
    return VALIDATE_CUSTOM_INPUT_KEYS.has(input.key);
  }
  return (
    input.renderType === FlowNodeInputTypeEnum.reference ||
    AUTO_CONFIGURABLE.has(input.renderType as FlowNodeInputTypeEnum)
  );
}

function getTrackerInputsFromFlowNode(node: Node<FlowNodeItemType>): TrackerNodeInput[] {
  return node.data.inputs
    .filter((inp: any) => {
      const rt = inp.renderTypeList?.[inp.selectedTypeIndex ?? 0] ?? inp.renderTypeList?.[0];
      return (
        rt && rt !== FlowNodeInputTypeEnum.hidden && rt !== FlowNodeInputTypeEnum.addInputParam
      );
    })
    .map((inp: any) => ({
      key: inp.key,
      label: inp.label,
      value: inp.value,
      valueType: inp.valueType,
      renderType: inp.renderTypeList?.[inp.selectedTypeIndex ?? 0] ?? inp.renderTypeList?.[0],
      required: inp.required ?? false
    }));
}

function getTrackerOutputsFromFlowNode(node: Node<FlowNodeItemType>): TrackerNodeOutput[] {
  return node.data.outputs
    .filter((o: FlowNodeOutputItemType) => o.type !== FlowNodeOutputTypeEnum.hidden)
    .map((o: FlowNodeOutputItemType) => ({
      id: String(o.id ?? o.key),
      key: o.key,
      label: o.label,
      valueType: String(o.valueType ?? 'any')
    }));
}

const waitWorkflowRenderFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return;
    }
    setTimeout(resolve, 0);
  });

async function waitForRenderedWorkflow({
  getNodes,
  tracker
}: {
  getNodes: () => Node<FlowNodeItemType>[];
  tracker: LocalTracker;
}) {
  const expectedNodeIds = tracker.nodes.map((node) => node.nodeId);

  for (let i = 0; i < 8; i++) {
    await waitWorkflowRenderFrame();

    const renderedNodeIds = new Set(getNodes().map((node) => node.id));
    const allNodesRendered = expectedNodeIds.every((nodeId) => renderedNodeIds.has(nodeId));
    if (!allNodesRendered) continue;

    // Give input render effects one extra frame to write automatic defaults
    // such as workflow_default_llm_model into the node instance.
    await waitWorkflowRenderFrame();
    return;
  }
}

function syncTrackerFromRenderedWorkflow({
  tracker,
  renderedNodes
}: {
  tracker: LocalTracker;
  renderedNodes: Node<FlowNodeItemType>[];
}) {
  const renderedNodeMap = new Map(renderedNodes.map((node) => [node.id, node]));

  tracker.nodes.forEach((trackerNode) => {
    const renderedNode = renderedNodeMap.get(trackerNode.nodeId);
    if (!renderedNode) return;

    trackerNode.inputs = getTrackerInputsFromFlowNode(renderedNode);
    trackerNode.outputs = getTrackerOutputsFromFlowNode(renderedNode);
    trackerNode.catchError = (renderedNode.data as any).catchError;
  });
}

function summarizeTemplateWorkflow(template: AppTemplateSchemaType | null | undefined) {
  const nodes = template?.workflow?.nodes ?? [];
  const edges = template?.workflow?.edges ?? [];
  const nodeTypes = Array.from(new Set(nodes.map((node) => node.flowNodeType)));
  const capabilities = Array.from(
    new Set(nodeTypes.flatMap((type) => TEMPLATE_SEARCH_CAPABILITIES[type] ?? []))
  );

  const nodeNameById = new Map(nodes.map((node) => [node.nodeId, node.name]));
  const edgesText = edges.slice(0, 30).map((edge) => ({
    source: nodeNameById.get(edge.source) ?? edge.source,
    target: nodeNameById.get(edge.target) ?? edge.target,
    sourceHandleKey: getNodeTypeFromEdgeHandle(edge.sourceHandle)
  }));

  const manualConfigMap = new Map<
    string,
    { nodeName: string; nodeType: string; key: string; label?: string }
  >();
  nodes.forEach((node) => {
    (node.inputs ?? []).forEach((input) => {
      const renderType = input.renderTypeList?.[0];
      if (!renderType || !REQUIRES_USER_SELECT.has(renderType as FlowNodeInputTypeEnum)) return;
      manualConfigMap.set(`${node.nodeId}:${input.key}`, {
        nodeName: node.name,
        nodeType: node.flowNodeType,
        key: input.key,
        label: input.label
      });
    });
  });
  const manualConfigRequired = Array.from(manualConfigMap.values()).slice(0, 20);

  const importantNodes = nodes.slice(0, 30).map((node: StoreNodeItemType) => ({
    nodeId: node.nodeId,
    flowNodeType: node.flowNodeType,
    name: node.name,
    importantInputs: (node.inputs ?? [])
      .filter((input) => {
        if (TEMPLATE_SENSITIVE_INPUT_KEY_RE.test(input.key)) return false;
        const value = input.value;
        if (value == null || value === '') return false;
        return (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          input.key === 'agents' ||
          input.key === 'ifElseList' ||
          input.key === 'extractKeys' ||
          input.key === 'userInputForms'
        );
      })
      .slice(0, 8)
      .map((input) => ({
        key: input.key,
        label: input.label,
        value: input.value
      })),
    outputs: (node.outputs ?? [])
      .filter((output) => output.type !== FlowNodeOutputTypeEnum.hidden)
      .slice(0, 10)
      .map((output) => ({
        id: output.id ?? output.key,
        key: output.key,
        label: output.label,
        valueType: output.valueType
      }))
  }));

  return {
    nodeTypes,
    capabilities,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    edgesText,
    manualConfigRequired,
    importantNodes,
    chatConfigSummary: {
      hasWelcomeText: Boolean(template?.workflow?.chatConfig?.welcomeText),
      variables: template?.workflow?.chatConfig?.variables ?? [],
      fileSelectConfig: template?.workflow?.chatConfig?.fileSelectConfig,
      questionGuide: template?.workflow?.chatConfig?.questionGuide
    }
  };
}

function scoreTemplate(
  template: AppTemplateSchemaType,
  requirement: string,
  nodeTypes: string[] = []
) {
  const req = requirement.toLowerCase();
  const text = normalizeTemplateText([
    template.name,
    template.intro,
    template.recommendText,
    template.tags,
    template.userGuide
  ]);

  let score = 0;
  const reasons: string[] = [];
  const terms = req
    .split(/[\s,，。；;:：/\\|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  for (const term of terms) {
    if (text.includes(term)) {
      score += 2;
      reasons.push(`metadata:${term}`);
    }
  }

  for (const rule of TEMPLATE_SEARCH_KEYWORDS) {
    if (!rule.words.some((word) => req.includes(word))) continue;
    const matchedTypes = rule.nodeTypes.filter((type) => nodeTypes.includes(type));
    if (matchedTypes.length > 0) {
      score += matchedTypes.length * 4;
      reasons.push(`capability:${matchedTypes.join(',')}`);
    } else if (rule.words.some((word) => text.includes(word))) {
      score += 1;
      reasons.push(`keyword:${rule.words.find((word) => text.includes(word))}`);
    }
  }

  if (template.isPromoted) score += 1;
  if (template.isQuickTemplate) score += 1;

  return { score, reasons: Array.from(new Set(reasons)).slice(0, 8) };
}

async function searchAppTemplatesForCopilot(requirement: string, limit = 5) {
  const templateListRes = await getTemplateMarketItemList({
    type: AppTypeEnum.workflow,
    isQuickTemplate: false
  });
  const templates = templateListRes.list ?? [];

  const metadataRanked = templates
    .map((template) => ({ template, ...scoreTemplate(template, requirement) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(limit * 3, 10));

  const details = await Promise.all(
    metadataRanked.map(async ({ template, score, reasons }) => {
      try {
        const detail = await getTemplateMarketItemDetail(template.templateId);
        const summary = summarizeTemplateWorkflow(detail);
        const finalScore = scoreTemplate(detail, requirement, summary.nodeTypes);
        return {
          template: detail,
          score: score + finalScore.score,
          reasons: Array.from(new Set([...reasons, ...finalScore.reasons])),
          summary
        };
      } catch {
        return null;
      }
    })
  );

  const candidates = details
    .filter((item): item is NonNullable<(typeof details)[number]> => Boolean(item))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ template, score, reasons, summary }) => ({
      templateId: template.templateId,
      name: template.name,
      intro: template.intro,
      tags: template.tags,
      type: template.type,
      score,
      reasons,
      workflowSummary: {
        nodeTypes: summary.nodeTypes,
        capabilities: summary.capabilities,
        nodeCount: summary.nodeCount,
        edgeCount: summary.edgeCount,
        manualConfigRequired: summary.manualConfigRequired
      }
    }));

  return {
    candidates,
    note:
      candidates.length > 0
        ? 'Use a candidate only as a structural reference. Leave user-specific resources unset.'
        : 'No relevant system template found. Generate the workflow from scratch.'
  };
}

async function getAppTemplateDetailForCopilot(templateId: string) {
  let template: AppTemplateSchemaType | null | undefined;
  try {
    template = await getTemplateMarketItemDetail(templateId);
  } catch {
    template = null;
  }

  if (!template) {
    return {
      templateId,
      found: false,
      workflow: summarizeTemplateWorkflow(null),
      note: 'Template detail is unavailable. Continue generating the workflow from scratch based on the user requirement.'
    };
  }

  const summary = summarizeTemplateWorkflow(template);
  return {
    templateId: template.templateId,
    found: true,
    name: template.name,
    intro: template.intro,
    tags: template.tags,
    workflow: summary,
    note: 'This is a summarized template reference. Recreate or adapt the pattern with add_node/add_edge/update tools. Do not copy dataset/app/API credential selections.'
  };
}

function getNodeConfigSchema(nodeType: string, t: TFunction) {
  const template = moduleTemplatesFlat.find((tmpl) => tmpl.flowNodeType === nodeType);
  if (!template) return null;

  const autoConfigurable: Array<{
    key: string;
    description: string;
    defaultValue: any;
    required: boolean;
    supportsReference?: true;
    needsReferences?: true;
  }> = [];
  const manualConfigRequired: Array<{ key: string; description: string }> = [];
  const referenceInputs: Array<{ key: string; description: string; valueType?: string }> = [];
  let hasDynamicOutputs = false;

  for (const inp of template.inputs) {
    const renderType = inp.renderTypeList?.[0];
    if (!renderType) continue;

    if (inp.key === 'ifElseList') {
      autoConfigurable.push({
        key: inp.key,
        description:
          'IMPORTANT: call get_available_references(node_id) FIRST to get the referenceValue for each variable. ' +
          'Then set this field with the full branch array. ' +
          'Each branch: { condition: "AND"|"OR", list: [condition_item, ...] }. ' +
          'condition_item: { variable: <referenceValue>, condition: <operator>, value: <string or referenceValue>, valueType: "input"|"reference" }. ' +
          'Operators: equalTo, notEqual, isEmpty, isNotEmpty, include, notInclude, startWith, endWith, greaterThan, greaterThanOrEqualTo, lessThan, lessThanOrEqualTo, reg. ' +
          'isEmpty/isNotEmpty: omit value field. valueType="input": value is a string. valueType="reference": value is a referenceValue array. ' +
          'Full example: [{"condition":"AND","list":[{"variable":["abc","memberLevel"],"condition":"equalTo","value":"VIP","valueType":"input"}]}]',
        defaultValue: null,
        required: false,
        needsReferences: true
      });
      continue;
    }

    if (renderType === FlowNodeInputTypeEnum.hidden) continue;
    if (renderType === FlowNodeInputTypeEnum.addInputParam) continue;
    if (renderType === FlowNodeInputTypeEnum.fileSelect) continue;

    if (renderType === FlowNodeInputTypeEnum.custom) {
      if (inp.key === 'extractKeys' || inp.key === 'userInputForms') {
        hasDynamicOutputs = true;
      }
      continue;
    }

    const description = t(String(inp.description ?? ''));
    const supportsReference = (inp.renderTypeList ?? []).includes(FlowNodeInputTypeEnum.reference);

    if (renderType === FlowNodeInputTypeEnum.reference) {
      if (inp.key !== 'switch') {
        referenceInputs.push({ key: inp.key, description, valueType: inp.valueType });
      }
      continue;
    }

    if (SKIP_INPUT_KEYS.has(inp.key)) continue;

    if (REQUIRES_USER_SELECT.has(renderType as FlowNodeInputTypeEnum)) {
      manualConfigRequired.push({ key: inp.key, description });
    } else if (AUTO_CONFIGURABLE.has(renderType as FlowNodeInputTypeEnum)) {
      autoConfigurable.push({
        key: inp.key,
        description,
        defaultValue: inp.value,
        required: inp.required ?? false,
        ...(supportsReference ? { supportsReference: true as const } : {})
      });
      if (supportsReference && inp.key !== 'switch') {
        referenceInputs.push({ key: inp.key, description, valueType: inp.valueType });
      }
    }
  }

  const outputs: Array<{
    id: string;
    key: string;
    label: string;
    valueType: string;
    description?: string;
  }> = [];
  for (const out of template.outputs) {
    if (out.type === FlowNodeOutputTypeEnum.hidden) continue;
    if (out.type === FlowNodeOutputTypeEnum.source) continue;
    if (out.key === 'addOutputParam') continue;
    outputs.push({
      id: String(out.id ?? out.key),
      key: out.key,
      label: t(String(out.label ?? '')),
      valueType: String(out.valueType ?? 'any'),
      ...(out.description ? { description: t(String(out.description)) } : {})
    });
  }

  return {
    autoConfigurable,
    manualConfigRequired,
    referenceInputs,
    outputs,
    ...(hasDynamicOutputs
      ? {
          hasDynamicOutputs: true,
          dynamicOutputsNote:
            '此节点的提取字段输出是动态的。调用 update_node_inputs 设置 extractKeys/userInputForms 后，前端会自动创建对应的输出变量（outputId = 字段 key）。之后在下游节点调用 get_available_references 即可获取这些输出 id，无需额外确认步骤。'
        }
      : {})
  };
}

/**
 * 从 LLM 消息历史中查找最后一次 validate_workflow 的结果。
 * 返回解析后的结果对象（含 valid/issues），如果找不到则返回 null。
 */
function findLastValidationResult(
  messages: Array<Record<string, unknown>>
): { valid: boolean; issues: string[] } | null {
  // 从后往前遍历，找到最后一个 validate_workflow 的 tool result
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'tool') continue;

    // 找到对应的 assistant tool_calls，确认是 validate_workflow
    const toolCallId = msg.tool_call_id as string;
    for (let j = i - 1; j >= 0; j--) {
      const am = messages[j];
      if (am.role !== 'assistant' || !Array.isArray(am.tool_calls)) continue;
      const tc = (am.tool_calls as Array<{ id: string; function: { name: string } }>).find(
        (c) => c.id === toolCallId
      );
      if (tc?.function?.name === 'validate_workflow') {
        try {
          return JSON.parse(msg.content as string);
        } catch {
          return null;
        }
      }
      break; // 找到了对应的 assistant 消息，无论是否匹配都停止向前查找
    }
  }
  return null;
}

function trimCopilotMessages(messages: Array<Record<string, unknown>>, maxGroups = 30) {
  const toolCallIdToGroup = new Map<string, Set<number>>();
  const assistantToolGroupByIndex = new Map<number, Set<number>>();

  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return;

    const toolCallIds = (message.tool_calls as Array<{ id?: string }>)
      .map((toolCall) => toolCall.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (toolCallIds.length === 0) return;

    const groupIndexes = new Set<number>([index]);

    for (let j = index + 1; j < messages.length; j++) {
      const candidate = messages[j];
      if (
        candidate.role === 'tool' &&
        typeof candidate.tool_call_id === 'string' &&
        toolCallIds.includes(candidate.tool_call_id)
      ) {
        groupIndexes.add(j);
      }
      if (groupIndexes.size === toolCallIds.length + 1) break;
    }

    if (groupIndexes.size !== toolCallIds.length + 1) return;

    assistantToolGroupByIndex.set(index, groupIndexes);
    toolCallIds.forEach((id) => toolCallIdToGroup.set(id, groupIndexes));
  });

  const selectedIndexes = new Set<number>();
  let groups = 0;

  for (let i = messages.length - 1; i >= 0 && groups < maxGroups; i--) {
    if (selectedIndexes.has(i)) continue;

    const message = messages[i];
    const groupIndexes = new Set<number>([i]);

    if (message.role === 'tool') {
      const toolCallId = message.tool_call_id;
      const toolGroup = typeof toolCallId === 'string' ? toolCallIdToGroup.get(toolCallId) : null;

      if (!toolGroup) {
        continue;
      }

      toolGroup.forEach((index) => groupIndexes.add(index));
    } else if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      const toolGroup = assistantToolGroupByIndex.get(i);
      if (!toolGroup) {
        continue;
      }

      toolGroup.forEach((index) => groupIndexes.add(index));
    }

    groupIndexes.forEach((index) => selectedIndexes.add(index));
    groups += 1;
  }

  return messages.filter((_, index) => selectedIndexes.has(index));
}

// Thinking animation — bouncing dots
const thinkingBounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-5px); opacity: 1; }
`;

const ThinkingDots = () => {
  const { t } = useTranslation();
  return (
    <Flex alignItems="center" gap={1}>
      <Box fontSize="xs" color="myGray.500" mr={1}>
        {t('workflow:copilot_thinking')}
      </Box>
      {[0, 0.15, 0.3].map((delay, i) => (
        <Box
          key={i}
          w="5px"
          h="5px"
          borderRadius="full"
          bg="myGray.400"
          animation={`${thinkingBounce} 1.2s ${delay}s ease-in-out infinite`}
        />
      ))}
    </Flex>
  );
};

type ExecuteToolCtx = {
  functionName: string;
  params: string;
  tracker: LocalTracker;
  setNodes: (fn: (prev: Node<FlowNodeItemType>[]) => Node<FlowNodeItemType>[]) => void;
  setEdges: (fn: (prev: any[]) => any[]) => void;
  getNodes: () => Node<FlowNodeItemType>[];
  workflowStartNodeId: string | undefined;
  getAndAdvanceNodePos: () => { x: number; y: number };
  t: TFunction;
  /** 读取当前 chatConfig（用于 get_node_detail systemConfig） */
  getChatConfig: () => AppChatConfigType;
  /** 更新 chatConfig（用于 update_system_config） */
  setChatConfig: (updater: (prev: AppChatConfigType) => AppChatConfigType) => void;
  /** 修改节点属性（用于 set_node_catch_error） */
  onChangeNode: (params: any) => void;
};

async function executeTool(ctx: ExecuteToolCtx): Promise<string> {
  const {
    functionName,
    params,
    tracker,
    setNodes,
    setEdges,
    getNodes,
    workflowStartNodeId,
    getAndAdvanceNodePos,
    t,
    getChatConfig,
    setChatConfig,
    onChangeNode
  } = ctx;
  const p = safeParseJson(params);

  switch (functionName) {
    // ── search_app_templates — find system template references ─────────────
    case 'search_app_templates': {
      if (!p?.requirement) return 'error: requirement required';
      const result = await searchAppTemplatesForCopilot(
        String(p.requirement),
        typeof p.limit === 'number' ? p.limit : 5
      );
      return JSON.stringify(result);
    }

    // ── get_app_template_detail — summarized selected template ────────────
    case 'get_app_template_detail': {
      if (!p?.templateId) return 'error: templateId required';
      const result = await getAppTemplateDetailForCopilot(String(p.templateId));
      return JSON.stringify(result);
    }

    // ── get_workflow — return full state from tracker ──────────────────────
    case 'get_workflow': {
      const nodes = tracker.nodes
        .filter((n) => !SYSTEM_NODES.has(n.flowNodeType))
        .map((n) => ({
          nodeId: n.nodeId,
          flowNodeType: n.flowNodeType,
          name: n.name,
          outputs: n.outputs,
          ...(n.flowNodeType === 'systemConfig' ? { isSystemConfig: true } : {}),
          // catchError: undefined=不支持, false=支持未开启, true=已开启
          ...(n.catchError !== undefined ? { catchError: n.catchError } : {})
        }));
      const edgesSummary = tracker.edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandleKey: e.sourceHandleKey
      }));
      return JSON.stringify({
        nodes,
        edges: edgesSummary,
        totalNodes: nodes.length,
        totalEdges: edgesSummary.length
      });
    }

    // ── validate_workflow — 基于 tracker 验证（同步，无 React flush 问题）────
    case 'validate_workflow': {
      await waitForRenderedWorkflow({ getNodes, tracker });
      syncTrackerFromRenderedWorkflow({ tracker, renderedNodes: getNodes() });

      const issues: string[] = [];
      const SKIP_TYPES = new Set(['systemConfig', 'pluginConfig', 'userGuide']);

      // 1. BFS 连通性检查
      const startNode = tracker.nodes.find((n) => n.flowNodeType === 'workflowStart');
      if (!startNode) {
        return JSON.stringify({ valid: false, issues: ['Missing workflowStart node'] });
      }
      const reachable = new Set<string>();
      const queue = [startNode.nodeId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (reachable.has(cur)) continue;
        reachable.add(cur);
        tracker.edges.filter((e) => e.source === cur).forEach((e) => queue.push(e.target));
      }
      // loop 子节点跟随父节点可达性
      tracker.nodes.forEach((n) => {
        if (n.parentNodeId && reachable.has(n.parentNodeId)) reachable.add(n.nodeId);
      });

      // 2. 孤立节点检查——找出哪些边缺失
      for (const node of tracker.nodes) {
        if (SKIP_TYPES.has(node.flowNodeType) || node.flowNodeType === 'workflowStart') continue;
        if (!reachable.has(node.nodeId)) {
          // 找出哪些节点有出边指向它（帮助模型知道该从哪里补连线）
          const incomingEdges = tracker.edges.filter((e) => e.target === node.nodeId);
          if (incomingEdges.length === 0) {
            issues.push(
              `Node "${node.name}" (id=${node.nodeId}, type=${node.flowNodeType}) has no incoming edges — call add_edge to connect it from an upstream node`
            );
          } else {
            // 有入边但源节点不可达
            issues.push(
              `Node "${node.name}" (id=${node.nodeId}, type=${node.flowNodeType}) is not reachable — its upstream nodes may also be disconnected`
            );
          }
        }
      }

      // 3. 节点必填参数检查。只检查 copilot 能配置的参数；知识库、应用、密钥、
      // 定时等需要用户在 UI 中选择/填写的参数由 manualConfigRequired 负责提示。
      for (const node of tracker.nodes) {
        if (SKIP_TYPES.has(node.flowNodeType) || node.flowNodeType === 'workflowStart') continue;
        for (const input of node.inputs) {
          if (!shouldValidateNodeInput(input)) continue;
          if (!isEmptyInputValue(input.value)) continue;

          issues.push(
            `Node "${node.name}" (id=${node.nodeId}, type=${node.flowNodeType}) is missing required configurable input "${getInputDisplayName(
              input
            )}" (key=${input.key}) — call get_node_config_schema and update_node_inputs to set it. Do not set manualConfigRequired inputs such as knowledge base IDs or app/credential selections.`
          );
        }
      }

      return JSON.stringify({ valid: issues.length === 0, issues });
    }

    // ── get_node_config_schema ─────────────────────────────────────────────
    case 'get_node_config_schema': {
      if (!p) return 'error: invalid params';

      if (p.node_type === 'systemConfig') {
        return JSON.stringify({
          nodeType: 'systemConfig',
          description:
            'System configuration node. Its parameters are stored in app-level chatConfig, NOT in standard node inputs.',
          autoConfigurable: [
            { key: 'welcomeText', description: '对话开场白，用户进入对话时显示的欢迎语' },
            {
              key: 'variables',
              description: '对话开始变量，用户填写后才能开始对话（如用户名、场景选择等）'
            },
            { key: 'questionGuide', description: '问题引导，在输入框旁展示推荐问题帮助用户提问' },
            { key: 'fileSelectConfig', description: '文件上传配置，允许用户上传文件/图片参与对话' },
            { key: 'ttsConfig', description: '语音合成（TTS）配置，将 AI 回复转为语音播报' },
            { key: 'whisperConfig', description: '语音输入配置，允许用户用麦克风输入' },
            { key: 'autoExecute', description: '自动执行，打开对话后无需用户输入即自动触发工作流' },
            { key: 'chatInputGuide', description: '输入框引导文字，显示在对话输入框中提示用户' }
          ],
          manualConfigRequired: [
            { key: 'scheduledTriggerConfig', description: '定时触发配置，按计划定时执行工作流' }
          ],
          note: 'Configure supported keys directly with update_system_config. Leave scheduledTriggerConfig for manual UI configuration and mention it in the final summary.'
        });
      }

      const schema = getNodeConfigSchema(p.node_type as string, t);
      if (!schema) return `error: unknown node_type "${p.node_type}"`;
      return JSON.stringify(schema);
    }

    // ── get_available_references — DFS upstream from node_id ──────────────
    case 'get_available_references': {
      if (!p) return 'error: invalid params';
      const targetNodeId = p.node_id as string;

      // DFS upstream along tracker.edges
      const visited = new Set<string>();
      const stack = [targetNodeId];
      visited.add(targetNodeId);
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const edge of tracker.edges) {
          if (edge.target === cur && !visited.has(edge.source)) {
            visited.add(edge.source);
            stack.push(edge.source);
          }
        }
      }
      visited.delete(targetNodeId); // exclude self

      const available = tracker.nodes
        .filter((n) => visited.has(n.nodeId) && n.flowNodeType !== 'systemConfig')
        .map((n) => ({
          nodeId: n.nodeId,
          nodeName: n.name,
          outputs: n.outputs.map((o) => ({
            outputId: o.id,
            outputLabel: o.label ?? o.key,
            valueType: o.valueType ?? 'any',
            referenceValue: [n.nodeId, o.id]
          }))
        }));

      return JSON.stringify({ available });
    }

    // ── get_node_detail — 查看节点实例的当前配置 ─────────────────────────
    case 'get_node_detail': {
      if (!p?.node_id) return JSON.stringify({ error: 'node_id required' });
      const nodeId = p.node_id as string;

      const trackerNode = tracker.nodes.find((n) => n.nodeId === nodeId);
      if (!trackerNode) return JSON.stringify({ error: `Node "${nodeId}" not found` });

      // systemConfig 节点：返回当前 chatConfig 实际值
      if (trackerNode.flowNodeType === 'systemConfig') {
        const chatConfig = getChatConfig();
        return JSON.stringify({
          nodeId: trackerNode.nodeId,
          name: trackerNode.name,
          flowNodeType: 'systemConfig',
          isSystemConfig: true,
          currentConfig: {
            welcomeText: chatConfig.welcomeText ?? '',
            variables: chatConfig.variables ?? [],
            questionGuide: chatConfig.questionGuide ?? { open: false },
            autoExecute: chatConfig.autoExecute ?? { open: false, defaultPrompt: '' },
            fileSelectConfig: chatConfig.fileSelectConfig ?? {
              canSelectFile: false,
              canSelectImg: false
            },
            ttsConfig: chatConfig.ttsConfig ?? { type: 'none' },
            whisperConfig: chatConfig.whisperConfig ?? {
              open: false,
              autoSend: false,
              autoTTSResponse: false
            },
            chatInputGuide: chatConfig.chatInputGuide ?? { open: false, customUrl: '' },
            scheduledTriggerConfig: chatConfig.scheduledTriggerConfig ?? null
          },
          note: 'Use update_system_config to modify these values. Only scheduledTriggerConfig requires user configuration.'
        });
      }

      // 普通节点：从 tracker 读取
      return JSON.stringify({
        nodeId: trackerNode.nodeId,
        name: trackerNode.name,
        flowNodeType: trackerNode.flowNodeType,
        inputs: trackerNode.inputs,
        outputs: trackerNode.outputs
      });
    }

    // ── add_node ───────────────────────────────────────────────────────────
    case 'add_node': {
      if (!p) return 'error: invalid params';
      const nodeName =
        typeof p.node_name === 'string' && p.node_name.trim() ? p.node_name.trim() : undefined;

      // 去重：如果 tracker 中已存在相同 type+name 的节点，直接返回已有 nodeId
      const existingNode = tracker.nodes.find(
        (n) => n.flowNodeType === p.node_type && n.name === (nodeName ?? p.node_type)
      );
      if (existingNode) {
        return JSON.stringify({
          success: true,
          nodeId: existingNode.nodeId,
          _note: `Node "${existingNode.name}" already exists, returning existing nodeId`
        });
      }

      const nodeId = getNanoid();

      const template = moduleTemplatesFlat.find((tmpl) => tmpl.flowNodeType === p.node_type);
      if (!template) return `error: unknown node_type "${p.node_type}"`;

      // Use the session-tracked position (stays near workflowStart, avoids far drift)
      const position = getAndAdvanceNodePos();

      const flowNode = nodeTemplate2FlowNode({ template, position, t });
      flowNode.id = nodeId;
      flowNode.data.nodeId = nodeId;
      flowNode.data.name = nodeName || flowNode.data.name || template.name || String(p.node_type);

      // Collect template outputs for tracker
      const templateOutputs: TrackerNodeOutput[] = flowNode.data.outputs
        .filter((o: FlowNodeOutputItemType) => o.type !== FlowNodeOutputTypeEnum.hidden)
        .map((o: FlowNodeOutputItemType) => ({
          id: String(o.id ?? o.key),
          key: o.key,
          label: o.label,
          valueType: String(o.valueType ?? 'any')
        }));

      // classifyQuestion ships with 3 default branches that have no connected edges
      // in copilot context — clear them so the model uses add_classifyQuestion_branch
      if (p.node_type === 'classifyQuestion') {
        flowNode.data.inputs = flowNode.data.inputs.map((inp: any) =>
          inp.key === 'agents' ? { ...inp, value: [] } : inp
        );
      }

      const newNodes = [flowNode];
      let loopStartNodeId: string | undefined;
      let loopEndNodeId: string | undefined;

      // Loop node: auto-create loopStart and loopEnd child nodes, matching the
      // behavior of the regular node template drag-and-drop (list.tsx).
      if (p.node_type === 'loop') {
        loopStartNodeId = getNanoid();
        loopEndNodeId = getNanoid();

        const startNode = nodeTemplate2FlowNode({
          template: LoopStartNode,
          position: { x: position.x + 60, y: position.y + 280 },
          parentNodeId: nodeId,
          t
        });
        startNode.id = loopStartNodeId;
        startNode.data.nodeId = loopStartNodeId;

        const endNode = nodeTemplate2FlowNode({
          template: LoopEndNode,
          position: { x: position.x + 420, y: position.y + 680 },
          parentNodeId: nodeId,
          t
        });
        endNode.id = loopEndNodeId;
        endNode.data.nodeId = loopEndNodeId;

        newNodes.push(startNode, endNode);

        // Update loop node's childrenNodeIdList so the canvas knows its children
        flowNode.data.inputs = flowNode.data.inputs.map((inp: any) =>
          inp.key === NodeInputKeyEnum.childrenNodeIdList
            ? { ...inp, value: [loopStartNodeId, loopEndNodeId] }
            : inp
        );

        // Add loop child nodes to tracker
        const startOutputs: TrackerNodeOutput[] = startNode.data.outputs
          .filter((o: FlowNodeOutputItemType) => o.type !== FlowNodeOutputTypeEnum.hidden)
          .map((o: FlowNodeOutputItemType) => ({
            id: String(o.id ?? o.key),
            key: o.key,
            label: o.label,
            valueType: String(o.valueType ?? 'any')
          }));
        const endOutputs: TrackerNodeOutput[] = endNode.data.outputs
          .filter((o: FlowNodeOutputItemType) => o.type !== FlowNodeOutputTypeEnum.hidden)
          .map((o: FlowNodeOutputItemType) => ({
            id: String(o.id ?? o.key),
            key: o.key,
            label: o.label,
            valueType: String(o.valueType ?? 'any')
          }));
        tracker.nodes.push({
          nodeId: loopStartNodeId,
          flowNodeType: 'loopStart',
          name: startNode.data.name,
          inputs: [],
          outputs: startOutputs,
          parentNodeId: nodeId,
          configuredInputKeys: new Set()
        });
        tracker.nodes.push({
          nodeId: loopEndNodeId,
          flowNodeType: 'loopEnd',
          name: endNode.data.name,
          inputs: [],
          outputs: endOutputs,
          parentNodeId: nodeId,
          configuredInputKeys: new Set()
        });
      }

      // Add to tracker — 存储模板默认 inputs，供 get_node_detail 使用（无需等待 React flush）
      const templateInputs: TrackerNodeInput[] = flowNode.data.inputs
        .filter((inp: any) => {
          const rt = inp.renderTypeList?.[0];
          return rt && rt !== 'hidden' && rt !== 'addInputParam' && rt !== 'fileSelect';
        })
        .map((inp: any) => ({
          key: inp.key,
          label: inp.label,
          value: inp.value,
          valueType: inp.valueType,
          renderType: inp.renderTypeList?.[0],
          required: inp.required ?? false
        }));

      tracker.nodes.push({
        nodeId,
        flowNodeType: p.node_type as string,
        name: flowNode.data.name,
        inputs: templateInputs,
        outputs: templateOutputs,
        configuredInputKeys: new Set(),
        // 从模板读取 catchError 支持状态（undefined=不支持，false=支持但默认关闭）
        catchError: (template as any).catchError
      });

      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);

      if (loopStartNodeId && loopEndNodeId) {
        return JSON.stringify({ success: true, nodeId, loopStartNodeId, loopEndNodeId });
      }
      return JSON.stringify({ success: true, nodeId });
    }

    // ── delete_node ────────────────────────────────────────────────────────
    case 'delete_node': {
      if (!p) return 'error: invalid params';
      const nodeId = p.node_id as string;

      // Silently skip protected nodes to avoid hallucination side-effects
      const PROTECTED_NODE_TYPES = new Set([
        'workflowStart',
        'systemConfig',
        'pluginConfig',
        'userGuide'
      ]);
      const targetNode = getNodes().find((n) => n.id === nodeId);
      if (!targetNode) return 'skipped: node not found';
      if (
        PROTECTED_NODE_TYPES.has(targetNode.type ?? '') ||
        PROTECTED_NODE_TYPES.has(targetNode.data?.flowNodeType ?? '')
      ) {
        return 'skipped: protected node cannot be deleted';
      }

      // Update tracker
      tracker.nodes = tracker.nodes.filter((n) => n.nodeId !== nodeId && n.parentNodeId !== nodeId);
      tracker.edges = tracker.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);

      setNodes((prev) => prev.filter((n) => n.id !== nodeId && n.data.parentNodeId !== nodeId));
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
      return JSON.stringify({ success: true });
    }

    // ── add_classifyQuestion_branch ────────────────────────────────────────
    case 'add_classifyQuestion_branch': {
      if (!p) return 'error: invalid params';
      const branchKey = getNanoid();
      const nodeId = p.node_id as string;

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const agentsInput = node.data.inputs.find((inp: any) => inp.key === 'agents');
          if (!agentsInput) return node;
          const newAgents = [...(agentsInput.value as any[]), { value: p.value, key: branchKey }];
          return {
            ...node,
            data: {
              ...node.data,
              inputs: node.data.inputs.map((inp: any) =>
                inp.key === 'agents' ? { ...inp, value: newAgents } : inp
              )
            }
          };
        })
      );
      return JSON.stringify({ success: true, branchKey });
    }

    // ── delete_classifyQuestion_branch ─────────────────────────────────────
    case 'delete_classifyQuestion_branch': {
      if (!p) return 'error: invalid params';
      const nodeId = p.node_id as string;
      const key = p.key as string;

      // Update tracker edges
      tracker.edges = tracker.edges.filter(
        (e) => !(e.source === nodeId && e.sourceHandleKey === key)
      );

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const agentsInput = node.data.inputs.find((inp: any) => inp.key === 'agents');
          if (!agentsInput) return node;
          const newAgents = (agentsInput.value as any[]).filter((a) => a.key !== key);
          return {
            ...node,
            data: {
              ...node.data,
              inputs: node.data.inputs.map((inp: any) =>
                inp.key === 'agents' ? { ...inp, value: newAgents } : inp
              )
            }
          };
        })
      );
      // Remove edges from this branch handle
      setEdges((prev) =>
        prev.filter(
          (e) => !(e.source === nodeId && e.sourceHandle === resolveSourceHandle(nodeId, key))
        )
      );
      return JSON.stringify({ success: true });
    }

    // ── add_ifElseNode_branch ──────────────────────────────────────────────
    case 'add_ifElseNode_branch': {
      if (!p) return 'error: invalid params';
      const nodeId = p.node_id as string;

      // Compute branchIndex from tracker edges (count existing ifElse branch edges)
      const branchCount = tracker.edges.filter(
        (e) =>
          e.source === nodeId &&
          (e.sourceHandleKey === 'IF' ||
            e.sourceHandleKey.startsWith('ELSE IF') ||
            e.sourceHandleKey === 'ELSE')
      ).length;
      // New branch is inserted before ELSE, so its index = number of IF/ELSE IF branches
      // The handle pattern: IF (index 0), ELSE IF 1, ELSE IF 2, ..., ELSE (last)
      const branchIndex = branchCount > 0 ? branchCount : 1;
      const handleKey = `ELSE IF ${branchIndex}`;

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const listInput = node.data.inputs.find((inp: any) => inp.key === 'ifElseList');
          if (!listInput) return node;
          const newList = [...(listInput.value as any[]), { condition: 'AND', list: [{}] }];
          return {
            ...node,
            data: {
              ...node.data,
              inputs: node.data.inputs.map((inp: any) =>
                inp.key === 'ifElseList' ? { ...inp, value: newList } : inp
              )
            }
          };
        })
      );
      return JSON.stringify({ success: true, branchIndex, handleKey });
    }

    // ── delete_ifElseNode_branch ───────────────────────────────────────────
    case 'delete_ifElseNode_branch': {
      if (!p) return 'error: invalid params';
      const nodeId = p.node_id as string;
      const index = p.index as number;

      // Remove from tracker edges
      const branchHandle = index === 0 ? 'IF' : `ELSE IF ${index}`;
      tracker.edges = tracker.edges.filter(
        (e) => !(e.source === nodeId && e.sourceHandleKey === branchHandle)
      );

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const listInput = node.data.inputs.find((inp: any) => inp.key === 'ifElseList');
          if (!listInput) return node;
          const newList = [...(listInput.value as any[])];
          newList.splice(index, 1);
          return {
            ...node,
            data: {
              ...node.data,
              inputs: node.data.inputs.map((inp: any) =>
                inp.key === 'ifElseList' ? { ...inp, value: newList } : inp
              )
            }
          };
        })
      );
      // Remove the edge for this branch handle on canvas
      setEdges((prev) =>
        prev.filter(
          (e) =>
            !(e.source === nodeId && e.sourceHandle === resolveSourceHandle(nodeId, branchHandle))
        )
      );
      return JSON.stringify({ success: true });
    }

    // ── add_edge ───────────────────────────────────────────────────────────
    case 'add_edge': {
      if (!p) return 'error: invalid params';
      const sourceId = p.sourceNodeId as string;
      const targetId = p.targetNodeId as string;
      const hk = (p.source_handle_key as string) ?? 'right';
      const sourceHandle = resolveSourceHandle(sourceId, hk);
      const targetHandle = `${targetId}-target-left`;

      // Warn if either node is not tracked (but still proceed)
      const systemNodeTypes = ['workflowStart', 'globalVariable'];
      const sourceTracked = tracker.nodes.some((n) => n.nodeId === sourceId);
      const targetTracked = tracker.nodes.some((n) => n.nodeId === targetId);
      if (!sourceTracked && !systemNodeTypes.some((t) => sourceId.includes(t))) {
        console.warn(`[add_edge] sourceId "${sourceId}" not found in tracker.nodes`);
      }
      if (!targetTracked && !systemNodeTypes.some((t) => targetId.includes(t))) {
        console.warn(`[add_edge] targetId "${targetId}" not found in tracker.nodes`);
      }

      // Add to tracker
      const trackerExists = tracker.edges.some(
        (e) => e.source === sourceId && e.target === targetId && e.sourceHandleKey === hk
      );
      if (!trackerExists) {
        tracker.edges.push({
          source: sourceId,
          target: targetId,
          sourceHandleKey: hk,
          targetHandleKey: 'left'
        });
      }

      setEdges((prev) => {
        // Check if edge already exists
        const exists = prev.some(
          (e) => e.source === sourceId && e.target === targetId && e.sourceHandle === sourceHandle
        );
        if (exists) return prev;

        return [
          ...prev,
          {
            id: `edge_${getNanoid()}`,
            type: EDGE_TYPE,
            source: sourceId,
            sourceHandle,
            target: targetId,
            targetHandle
          }
        ];
      });
      return JSON.stringify({ success: true });
    }

    // ── delete_edge ────────────────────────────────────────────────────────
    case 'delete_edge': {
      if (!p) return 'error: invalid params';
      const sourceId = p.sourceNodeId as string;
      const targetId = p.targetNodeId as string;
      const hk = (p.source_handle_key as string) ?? 'right';
      const sourceHandle = resolveSourceHandle(sourceId, hk);

      // Remove from tracker
      const beforeCount = tracker.edges.length;
      tracker.edges = tracker.edges.filter(
        (e) => !(e.source === sourceId && e.target === targetId && e.sourceHandleKey === hk)
      );
      const deletedCount = beforeCount - tracker.edges.length;

      setEdges((prev) =>
        prev.filter(
          (e) =>
            !(e.source === sourceId && e.target === targetId && e.sourceHandle === sourceHandle)
        )
      );
      return JSON.stringify({ success: true, deletedCount });
    }

    // ── update_node_inputs ─────────────────────────────────────────────────
    case 'update_node_inputs': {
      if (!p) {
        return toolRecoverableError('Invalid params. Pass node_id and inputs.', {
          nextAction:
            'Call get_node_detail or get_node_config_schema, then retry update_node_inputs.'
        });
      }
      const nodeId = p.node_id as string;
      const inputUpdates = Array.isArray(p.inputs)
        ? (p.inputs as Array<{ key: string; value: any }>)
        : [];
      if (!nodeId) {
        return toolRecoverableError('node_id is required.', {
          nextAction: 'Use the nodeId returned by add_node or get_workflow.'
        });
      }
      if (inputUpdates.length === 0) {
        return toolRecoverableError('inputs must be a non-empty array.', {
          nextAction: 'Call get_node_config_schema to inspect configurable input keys.'
        });
      }

      // Model sometimes serializes array/object values as JSON strings
      // (e.g. reference values like "[\"nodeId\",\"key\"]"). Parse them back.
      // Also handles double-encoded strings where the model wraps the JSON in extra quotes:
      // e.g. '"[\"n3wJiv6GOHb5ahOX\",\"history\"]"' → '["n3wJiv6GOHb5ahOX","history"]' → array
      const parseValue = (val: any): any => {
        if (typeof val !== 'string') return val;
        let trimmed = val.trim();
        // Unwrap one level of JSON string encoding if wrapped in extra quotes
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          try {
            const inner = JSON.parse(trimmed);
            if (typeof inner === 'string') trimmed = inner.trim();
          } catch {
            /* keep trimmed as-is */
          }
        }
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          try {
            return JSON.parse(trimmed);
          } catch {
            /* keep as string */
          }
        }
        return val;
      };

      // Update tracker: mark configured input keys + 同步 inputs 值
      const trackerNode = tracker.nodes.find((n) => n.nodeId === nodeId);
      if (!trackerNode) {
        return toolRecoverableError(`Node "${nodeId}" not found.`, {
          availableNodes: tracker.nodes.map((n) => ({
            nodeId: n.nodeId,
            flowNodeType: n.flowNodeType,
            name: n.name
          })),
          nextAction: 'Call get_workflow and retry with an existing nodeId.'
        });
      }

      const inputKeySet = new Set(trackerNode.inputs.map((inp) => inp.key));
      const invalidInputKeys = inputUpdates
        .map((u) => u.key)
        .filter((key) => !key || !inputKeySet.has(key));
      if (invalidInputKeys.length > 0) {
        return toolRecoverableError(
          `Invalid input key(s) for node "${trackerNode.name}": ${invalidInputKeys.join(', ')}.`,
          {
            nodeId,
            nodeType: trackerNode.flowNodeType,
            validInputKeys: trackerNode.inputs.map((inp) => ({
              key: inp.key,
              label: inp.label,
              renderType: inp.renderType,
              required: inp.required
            })),
            nextAction:
              'Call get_node_config_schema for this node type, then retry update_node_inputs with valid keys only.'
          }
        );
      }

      const manualConfigUpdates = inputUpdates.filter((u) => {
        const input = trackerNode.inputs.find((inp) => inp.key === u.key);
        return input?.renderType && USER_CONFIG_INPUT_TYPES.has(input.renderType);
      });
      if (manualConfigUpdates.length > 0) {
        return toolRecoverableError(
          `Input key(s) require manual UI configuration and cannot be set by copilot: ${manualConfigUpdates
            .map((u) => u.key)
            .join(', ')}.`,
          {
            nodeId,
            nodeType: trackerNode.flowNodeType,
            manualConfigRequired: manualConfigUpdates.map((u) => {
              const input = trackerNode.inputs.find((inp) => inp.key === u.key);
              return {
                key: u.key,
                label: input?.label,
                renderType: input?.renderType
              };
            }),
            nextAction:
              'Skip these inputs, continue generating the workflow, and mention them in the final summary for the user to configure manually.'
          }
        );
      }

      for (const u of inputUpdates) {
        trackerNode.configuredInputKeys.add(u.key);
        // 同步 inputs 值到 tracker，确保 get_node_detail 无需依赖 React 状态
        const parsedVal = parseValue(u.value);
        const existingInput = trackerNode.inputs.find((inp) => inp.key === u.key);
        if (existingInput) {
          existingInput.value = parsedVal;
        }
      }

      // Sync dynamic outputs (extractKeys / userInputForms) to tracker
      const extractKeysUpdate = inputUpdates.find((u) => u.key === NodeInputKeyEnum.extractKeys);
      if (extractKeysUpdate) {
        const fields = parseValue(extractKeysUpdate.value) ?? [];
        if (!Array.isArray(fields)) {
          return toolRecoverableError('extractKeys must be an array.', {
            nodeId,
            inputKey: NodeInputKeyEnum.extractKeys,
            nextAction:
              'Retry update_node_inputs with extractKeys as an array of objects containing key, description, and valueType.'
          });
        }
        const newFieldOutputs: TrackerNodeOutput[] = fields.map((f) => ({
          id: f.key,
          key: f.key,
          label: t('workflow:copilot_extract_result_label', { key: f.key }),
          valueType: String(f.valueType ?? 'string')
        }));
        // Keep system outputs (those not matching new field keys)
        const newFieldKeys = new Set(fields.map((f) => f.key));
        trackerNode.outputs = [
          ...trackerNode.outputs.filter((o) => !newFieldKeys.has(o.key)),
          ...newFieldOutputs
        ];
      }

      const userInputFormsUpdate = inputUpdates.find(
        (u) => u.key === NodeInputKeyEnum.userInputForms
      );
      if (userInputFormsUpdate) {
        const forms = parseValue(userInputFormsUpdate.value) ?? [];
        if (!Array.isArray(forms)) {
          return toolRecoverableError('userInputForms must be an array.', {
            nodeId,
            inputKey: NodeInputKeyEnum.userInputForms,
            nextAction:
              'Retry update_node_inputs with userInputForms as an array of form field objects.'
          });
        }
        const newFormOutputs: TrackerNodeOutput[] = forms.map((f) => ({
          id: f.key,
          key: f.key,
          label: f.label,
          valueType: f.valueType ?? 'string'
        }));
        const newFormKeys = new Set(forms.map((f) => f.key));
        trackerNode.outputs = [
          ...trackerNode.outputs.filter((o) => !newFormKeys.has(o.key)),
          ...newFormOutputs
        ];
      }

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;

          const updatedInputs = node.data.inputs.map((inp: any) => {
            const update = inputUpdates.find((u) => u.key === inp.key);
            if (!update) return inp;
            const parsedValue = parseValue(update.value);
            // When value is a valid reference array [sourceNodeId, outputId], activate reference mode.
            // Guard: must be exactly 2 non-empty strings; ignore malformed arrays (e.g. missing nodeId).
            if (Array.isArray(parsedValue)) {
              const isValidRef =
                parsedValue.length === 2 &&
                typeof parsedValue[0] === 'string' &&
                parsedValue[0].length > 0 &&
                typeof parsedValue[1] === 'string' &&
                parsedValue[1].length > 0;
              if (isValidRef) {
                const refIdx = (inp.renderTypeList ?? []).findIndex(
                  (t: string) => t === FlowNodeInputTypeEnum.reference
                );
                if (refIdx !== -1) {
                  return { ...inp, value: parsedValue, selectedTypeIndex: refIdx };
                }
              }
            }
            if (inp.key === 'ifElseList') {
              console.log(
                '[update_node_inputs] ifElseList value:',
                JSON.stringify(parsedValue, null, 2)
              );
            }
            return { ...inp, value: parsedValue };
          });

          // If extractKeys was updated, sync the node's outputs accordingly.
          // Keep all non-field outputs (system outputs) and replace field outputs.
          const extractKeysCanvasUpdate = inputUpdates.find(
            (u) => u.key === NodeInputKeyEnum.extractKeys
          );
          if (extractKeysCanvasUpdate) {
            const parsedFields = parseValue(extractKeysCanvasUpdate.value) ?? [];
            const fields: ContextExtractAgentItemType[] = Array.isArray(parsedFields)
              ? parsedFields
              : [];
            const newFieldKeys = new Set(fields.map((f) => f.key));
            // Preserve system outputs (success, fields, error...) by keeping outputs whose
            // key does NOT match any of the new field keys.
            const systemOutputs = node.data.outputs.filter(
              (o: FlowNodeOutputItemType) => !newFieldKeys.has(o.key)
            );
            const fieldOutputs: FlowNodeOutputItemType[] = fields.map((f) => ({
              id: f.key,
              key: f.key,
              label: t('workflow:copilot_extract_result_label', { key: f.key }),
              valueType: f.valueType ?? WorkflowIOValueTypeEnum.string,
              type: FlowNodeOutputTypeEnum.static
            }));
            console.log('[update_node_inputs] extractKeys sync:', { fields, fieldOutputs });
            return {
              ...node,
              data: {
                ...node.data,
                inputs: updatedInputs,
                outputs: [...systemOutputs, ...fieldOutputs]
              }
            };
          }

          // If userInputForms was updated, sync outputs: keep non-field outputs.
          const userInputFormsCanvasUpdate = inputUpdates.find(
            (u) => u.key === NodeInputKeyEnum.userInputForms
          );
          if (userInputFormsCanvasUpdate) {
            const parsedForms = parseValue(userInputFormsCanvasUpdate.value) ?? [];
            const forms: Array<{ key: string; label: string; valueType: string }> = Array.isArray(
              parsedForms
            )
              ? parsedForms
              : [];
            const newFormKeys = new Set(forms.map((f) => f.key));
            const systemOutputs = node.data.outputs.filter(
              (o: FlowNodeOutputItemType) => !newFormKeys.has(o.key)
            );
            const formFieldOutputs: FlowNodeOutputItemType[] = forms.map((f) => ({
              id: f.key,
              key: f.key,
              label: f.label,
              valueType: (f.valueType as WorkflowIOValueTypeEnum) ?? WorkflowIOValueTypeEnum.string,
              type: FlowNodeOutputTypeEnum.static
            }));
            return {
              ...node,
              data: {
                ...node.data,
                inputs: updatedInputs,
                outputs: [...systemOutputs, ...formFieldOutputs]
              }
            };
          }

          return { ...node, data: { ...node.data, inputs: updatedInputs } };
        })
      );
      return JSON.stringify({ success: true });
    }

    // ── set_node_catch_error — 开启/关闭节点的错误捕获 ───────────────────
    case 'set_node_catch_error': {
      if (!p) return 'error: invalid params';
      const nodeId = p.node_id as string;
      const enable = p.enable as boolean;

      // 更新 tracker 中的 catchError 状态
      const trackerNode = tracker.nodes.find((n) => n.nodeId === nodeId);
      if (!trackerNode) return JSON.stringify({ error: `Node "${nodeId}" not found` });
      if (trackerNode.catchError === undefined) {
        return JSON.stringify({
          error: `Node "${trackerNode.name}" does not support error catching`
        });
      }
      trackerNode.catchError = enable;

      // 更新 React 画布节点属性
      onChangeNode({ nodeId, type: 'attr', key: 'catchError', value: enable });

      // 关闭时同时移除 catch 边
      if (!enable) {
        setEdges((prev) =>
          prev.filter(
            (e) => !(e.source === nodeId && e.sourceHandle === `${nodeId}-source_catch-right`)
          )
        );
        tracker.edges = tracker.edges.filter(
          (e) => !(e.source === nodeId && e.sourceHandleKey === 'catch')
        );
      }

      return JSON.stringify({ success: true, catchError: enable });
    }

    // ── update_system_config — 更新 appDetail.chatConfig ──────────────────
    case 'update_system_config': {
      if (!p) return 'error: invalid params';
      const configs = p.configs as Array<{ key: string; value: any }>;
      if (!Array.isArray(configs) || configs.length === 0) {
        return 'error: configs must be a non-empty array';
      }
      // 允许设置的 key 白名单（scheduledTriggerConfig 需要用户操作，不在此列）
      const ALLOWED_KEYS = new Set([
        'welcomeText',
        'variables',
        'questionGuide',
        'autoExecute',
        'fileSelectConfig',
        'ttsConfig',
        'whisperConfig',
        'chatInputGuide'
      ]);
      const rejected: string[] = [];
      const applied: string[] = [];
      setChatConfig((prev) => {
        const next = { ...prev };
        for (const { key, value } of configs) {
          if (!ALLOWED_KEYS.has(key)) {
            rejected.push(key);
            continue;
          }
          (next as any)[key] = value;
          applied.push(key);
        }
        return next;
      });
      return JSON.stringify({
        success: true,
        applied,
        ...(rejected.length > 0
          ? { rejected, note: 'Rejected keys require user configuration' }
          : {})
      });
    }

    default:
      return `error: unknown tool "${functionName}"`;
  }
}

// ─── ToolCallBubble (compact row within a group) ──────────────────────────────

const ToolCallRow = React.memo(
  ({ msg, getNodes }: { msg: ToolCallMessage; getNodes: () => Node<FlowNodeItemType>[] }) => {
    const { t } = useTranslation();
    const backendResult = msg.status === 'done' && msg.result ? safeParseJson(msg.result) : null;
    const [issuesExpanded, setIssuesExpanded] = useState(false);

    const label = TOOL_LABEL_KEYS[msg.functionName]
      ? t(TOOL_LABEL_KEYS[msg.functionName])
      : msg.functionName;

    return (
      <Box py={0.5}>
        <Flex alignItems="center" gap="8px">
          {/* Left icon: keep existing status logic */}
          {msg.status === 'calling' ? (
            <Spinner size="xs" color="primary.500" flexShrink={0} />
          ) : msg.status === 'error' ? (
            <MyIcon name="common/closeLight" w="12px" color="red.500" flexShrink={0} />
          ) : (
            <MyIcon name="common/check" w="12px" color="green.500" flexShrink={0} />
          )}

          <Box
            fontSize="12px"
            lineHeight="20px"
            color="#999999"
            noOfLines={1}
            flex={1}
          >
            {label}
            {msg.displaySuffix && (
              <Box as="span" color="#BBBBBB">
                {' '}({msg.displaySuffix})
              </Box>
            )}
            {/* 工具执行结果摘要（单行） */}
            {backendResult && (
              <Box as="span" ml="4px">
                {backendResult.valid === true && <Box as="span" color="green.600">✓</Box>}
                {backendResult.valid === false && (
                  <Box as="span" color="red.500">
                    ✗ {t('workflow:copilot_issues_count', {
                      count: ((backendResult.issues as string[]) ?? []).length
                    })}
                    <Box
                      as="span"
                      ml="8px"
                      cursor="pointer"
                      color="myGray.400"
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIssuesExpanded((v) => !v); }}
                    >
                      <MyIcon
                        name={issuesExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                        w="12px"
                        display="inline"
                        verticalAlign="middle"
                        mb="4px"
                      />
                    </Box>
                  </Box>
                )}
                {backendResult._note && (
                  <Box as="span" color="#BBBBBB">{t('workflow:copilot_node_already_exists')}</Box>
                )}
              </Box>
            )}
          </Box>
        </Flex>

        {/* valid === false 时在文本下方展开 issues 列表 */}
        {backendResult?.valid === false && issuesExpanded && (
          <Box pl="20px" mt="2px">
            <Box bg="myGray.50" p="8px" borderRadius="md">
              {((backendResult.issues as string[]) ?? []).map((issue: string, i: number) => (
                <Box key={i} fontSize="12px" lineHeight="20px" color="red.500">{i + 1}. {issue}</Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    );
  }
);
ToolCallRow.displayName = 'ToolCallRow';

/** 将连续的 tool 消息合并为一个分组气泡 */
const ToolCallGroup = React.memo(
  ({ tools, getNodes }: { tools: ToolCallMessage[]; getNodes: () => Node<FlowNodeItemType>[] }) => {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [issuesExpanded, setIssuesExpanded] = useState(false);
    const hasError = tools.some((t) => t.status === 'error');
    const calling = tools.some((t) => t.status === 'calling');
    const hasChildren = tools.length > 1;
    const allDone = tools.every((t) => t.status === 'done');

    const singleValidation =
      !hasChildren && tools[0].functionName === 'validate_workflow'
        ? safeParseJson(tools[0].result ?? '')
        : null;

    const label = hasChildren
      ? t('workflow:copilot_tool_group_title')
      : TOOL_LABEL_KEYS[tools[0].functionName]
        ? t(TOOL_LABEL_KEYS[tools[0].functionName])
        : tools[0].functionName;

    return (
      <Box mb={2}>
        {/* Header row: min-height 24px, no bg, no border */}
        <Flex
          alignItems="flex-start"
          minH="24px"
          gap="8px"
          cursor={hasChildren ? 'pointer' : 'default'}
          onClick={() => hasChildren && setExpanded((v) => !v)}
        >
          <MyIcon name="core/chat/toolCall" w="14px" flexShrink={0} color="#3E4A59" mt="5px" />

          <Box minW={0}>
            <Flex
              fontSize="12px"
              lineHeight="24px"
              color={hasError ? 'red.500' : '#666666'}
              alignItems="center"
              minW={0}
              gap="4px"
            >
              <Box
                as="span"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                minW={0}
                flex="1"
              >
                {label}
                {!hasChildren && tools[0].displaySuffix && ` (${tools[0].displaySuffix})`}
              </Box>
              {/* validate_workflow 单工具：inline 显示验证结果，固定不收缩 */}
              {singleValidation && allDone && (
                <Flex as="span" alignItems="center" flexShrink={0} gap="4px">
                  {singleValidation.valid === true && (
                    <Box as="span" color="green.600">✓ {t('workflow:copilot_validate_passed')}</Box>
                  )}
                  {singleValidation.valid === false && (
                    <Flex as="span" alignItems="center" color="red.500" gap="4px">
                      <Box as="span">
                        ✗ {t('workflow:copilot_validate_problems', {
                          count: ((singleValidation.issues as string[]) ?? []).length
                        })}
                      </Box>
                      <Box
                        as="span"
                        cursor="pointer"
                        color="myGray.400"
                        display="inline-flex"
                        alignItems="center"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIssuesExpanded((v) => !v); }}
                      >
                        <MyIcon
                          name={issuesExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                          w="12px"
                        />
                      </Box>
                    </Flex>
                  )}
                </Flex>
              )}
              {calling && (
                <Box as="span" display="inline-flex" alignItems="center" flexShrink={0}>
                  <MyIcon name="common/loading" w="14px" flexShrink={0} />
                </Box>
              )}
              {hasChildren && (
                <Box as="span" display="inline-flex" alignItems="center" flexShrink={0}>
                  <MyIcon
                    name={expanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                    w="12px"
                    color="myGray.400"
                  />
                </Box>
              )}
            </Flex>
            {/* validate_workflow 失败时展示 issues 列表 */}
            {singleValidation?.valid === false && allDone && issuesExpanded && (
              <Box mt={1} pl={0}>
                <Box bg="myGray.50" p="8px" borderRadius="md">
                  {((singleValidation.issues as string[]) ?? []).map((issue: string, i: number) => (
                    <Box key={i} fontSize="12px" lineHeight="20px" color="red.500">{i + 1}. {issue}</Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Flex>

        {/* Expanded child rows */}
        {hasChildren && expanded && (
          <Flex mt={1}>
            {/* 竖线：宽度与左侧 icon 对齐（14px），居中放 2px 竖线 */}
            <Flex w="14px" flexShrink={0} justifyContent="center" mr="8px">
              <Box w="1px" bg="#EBEDF0" borderRadius="1px" />
            </Flex>
            <Box flex={1} minW={0}>
              {tools.map((tool) => (
                <ToolCallRow key={tool.id} msg={tool} getNodes={getNodes} />
              ))}
            </Box>
          </Flex>
        )}
      </Box>
    );
  }
);
ToolCallGroup.displayName = 'ToolCallGroup';

// ─── CopilotPanel ─────────────────────────────────────────────────────────────

const CopilotPanel = ({
  onClose,
  onLoadingChange
}: {
  onClose: () => void;
  onLoadingChange?: (loading: boolean) => void;
}) => {
  const { t } = useTranslation();
  const autoStartedRef = useRef(false);
  const generationModelRef = useRef('');

  const { setNodes, setEdges, workflowStartNode, getNodeList, getNodes, edges } =
    useContextSelector(WorkflowBufferDataContext, (v) => v);
  const { onChangeNode, onUpdateNodeError, onRemoveError } = useContextSelector(
    WorkflowActionsContext,
    (v) => v
  );
  const autoLayout = useWorkflowAutoLayout();

  // 读取和更新 chatConfig（用于 update_system_config 工具）
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);
  const getChatConfig = useMemoizedFn(() => appDetail.chatConfig ?? {});
  const setChatConfig = useMemoizedFn((updater: (prev: AppChatConfigType) => AppChatConfigType) => {
    setAppDetail((prev) => ({
      ...prev,
      chatConfig: updater(prev.chatConfig ?? {})
    }));
  });

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const trackerRef = useRef<LocalTracker | null>(null);
  // Thinking indicator: true when model is processing but no output yet (or between tool calls)
  const [isThinking, setIsThinking] = useState(false);
  // Tracks the next canvas position for copilot-generated nodes (reset each request)
  const nextNodePosRef = useRef<{ x: number; y: number }>({ x: 500, y: 400 });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useMemoizedFn(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  });
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /** 静默触发工作流校验：不弹 toast，仅标红错误节点 */
  const runSilentValidation = useMemoizedFn(() => {
    const checkResults = checkWorkflowNodeAndConnection({
      nodes: getNodes(),
      edges
    });
    onRemoveError();
    if (checkResults) {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));
    }
  });

  /** Returns the current slot position and advances to the next one (350px right) */
  const getAndAdvanceNodePos = useMemoizedFn(() => {
    const pos = { ...nextNodePosRef.current };
    nextNodePosRef.current = { x: pos.x + 350, y: pos.y };
    return pos;
  });

  // ── Message helpers ───────────────────────────────────────────────────────

  const appendText = useMemoizedFn((role: 'user' | 'assistant', text: string) => {
    if (role === 'assistant') setIsThinking(false); // model is outputting — stop thinking
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === 'text' && last.role === role) {
        return [...prev.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...prev, { kind: 'text', id: getNanoid(), role, content: text }];
    });
  });

  // 暂存 finalizeToolCall 先于 addToolCall 执行的结果（竞态处理）
  const earlyFinalizedRef = useRef(
    new Map<string, { params: string; status: 'done' | 'error'; result: string; displaySuffix?: string }>()
  );

  const addToolCall = useMemoizedFn((tool: CopilotToolCallEvent) => {
    setIsThinking(false);
    setMessages((prev) => {
      if (prev.some((m) => m.kind === 'tool' && m.id === tool.id)) return prev;
      // 检查是否 finalizeToolCall 已经先执行了（竞态），如果是，直接用最终状态创建
      const earlyResult = earlyFinalizedRef.current.get(tool.id);
      if (earlyResult) {
        earlyFinalizedRef.current.delete(tool.id);
        return [
          ...prev,
          {
            kind: 'tool' as const,
            id: tool.id,
            functionName: tool.functionName,
            params: earlyResult.params,
            status: earlyResult.status,
            result: earlyResult.result,
            displaySuffix: earlyResult.displaySuffix
          }
        ];
      }
      return [
        ...prev,
        {
          kind: 'tool' as const,
          id: tool.id,
          functionName: tool.functionName,
          params: '',
          status: 'calling' as const
        }
      ];
    });
  });

  const updateToolParams = useMemoizedFn(({ id, params }: { id: string; params: string }) => {
    setMessages((prev) =>
      prev.map((m) => (m.kind === 'tool' && m.id === id ? { ...m, params: m.params + params } : m))
    );
  });

  const finalizeToolCall = useMemoizedFn(async (tool: CopilotToolCallEvent): Promise<string> => {
    // 在执行工具前计算 displaySuffix（delete_node 执行后节点已从 tracker 移除，需要提前获取名称）
    const _p = safeParseJson(tool.params);
    let displaySuffix: string | undefined;
    if (_p && trackerRef.current) {
      const _findName = (nodeId: string): string | undefined => {
        const node = trackerRef.current!.nodes.find((n) => n.nodeId === nodeId);
        if (node) return t(node.name);
        // 兜底：将 nodeId 作为 flowNodeType 查 NODE_TYPE_LABEL_MAP（系统节点如 userGuide、systemConfig）
        const labelKey = NODE_TYPE_LABEL_MAP[nodeId as FlowNodeTypeEnum];
        return labelKey ? t(labelKey) : undefined;
      };
      const _typeLabel = (nodeType: string) => {
        const key = NODE_TYPE_LABEL_MAP[nodeType as FlowNodeTypeEnum];
        return key ? t(key) : nodeType;
      };
      switch (tool.functionName) {
        case 'add_node': {
          const lbl =
            typeof _p.node_name === 'string' && _p.node_name.trim()
              ? _p.node_name.trim()
              : _typeLabel(String(_p.node_type ?? ''));
          if (lbl) displaySuffix = lbl;
          break;
        }
        case 'delete_node':
          displaySuffix = _findName(_p.node_id as string);
          break;
        case 'add_edge': {
          const src = _findName(_p.sourceNodeId as string);
          const tgt = _findName(_p.targetNodeId as string);
          if (src || tgt) displaySuffix = `${src ?? _p.sourceNodeId} → ${tgt ?? _p.targetNodeId}`;
          break;
        }
        case 'get_node_config_schema':
          displaySuffix = _typeLabel(String(_p.node_type ?? ''));
          break;
        case 'update_node_inputs':
        case 'get_available_references':
        case 'get_node_detail':
          displaySuffix = _findName(_p.node_id as string);
          break;
      }
    }

    let execResult: string;
    try {
      if (!trackerRef.current) {
        execResult = 'error: workflow generation state is not initialized';
      } else {
        execResult = await executeTool({
          functionName: tool.functionName,
          params: tool.params,
          tracker: trackerRef.current,
          setNodes,
          setEdges,
          getNodes,
          workflowStartNodeId: workflowStartNode?.nodeId,
          getAndAdvanceNodePos,
          t,
          getChatConfig,
          setChatConfig,
          onChangeNode
        });
      }
    } catch (err) {
      console.error('[Copilot] tool execution error:', err);
      execResult = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    setIsThinking(true);

    const finalStatus = isFatalToolResult(execResult) ? 'error' : 'done';

    if (isFatalToolResult(execResult)) {
      abortControllerRef.current?.abort();
    }

    setMessages((prev) => {
      const exists = prev.some((m) => m.kind === 'tool' && m.id === tool.id);
      if (exists) {
        // 正常路径：addToolCall 已创建了 'calling' 消息，更新为最终状态
        return prev.map((m) =>
          m.kind === 'tool' && m.id === tool.id
            ? { ...m, params: tool.params, status: finalStatus, result: execResult, displaySuffix }
            : m
        );
      }
      // 竞态：addToolCall 的 updater 还没执行。不在这里新增消息，
      // 将结果暂存到 earlyFinalizedRef，由 addToolCall 统一创建。
      earlyFinalizedRef.current.set(tool.id, {
        params: tool.params,
        status: finalStatus,
        result: execResult,
        displaySuffix
      });
      return prev;
    });

    return execResult;
  });

  // ── Core request logic ────────────────────────────────────────────────────
  const copilotIterationCountRef = useRef(0);
  // 验证失败后强制修复的重试计数（防止无限循环，最多重试 2 次）
  const MAX_VALIDATION_RETRIES = 2;
  const validationRetryCountRef = useRef(0);
  // 跨迭代的工具调用签名追踪，检测连续重复（如反复 add_node 同类型节点）
  const toolCallSignaturesRef = useRef(new Set<string>());
  // 连续无新操作的迭代计数（如果连续2轮都是重复调用，终止循环）
  const staleIterationCountRef = useRef(0);

  /**
   * 单轮迭代：发起一次 SSE 请求，执行前端工具，然后判断是否需要继续。
   * llmMessages 是完整的 LLM 对话历史（不含 system prompt，后端重建）。
   * sessionController 是跨迭代的会话级 AbortController，保持 Stop 按钮始终有效。
   */
  const runCopilotIteration = useMemoizedFn(
    async (llmMessages: Array<Record<string, unknown>>): Promise<void> => {
      // 会话已取消（用户点击了 Stop）
      const sessionController = abortControllerRef.current;
      if (!sessionController || sessionController.signal.aborted) return;

      copilotIterationCountRef.current += 1;

      // 使用持久化的 tracker（在 runCopilotRequest 中初始化，跨迭代持续使用）
      // tracker 是同步更新的可变对象，不受 React 批处理影响
      const tracker = trackerRef.current!;

      // 从 tracker（而非 React 状态）构建 currentWorkflow 发给后端
      // 这样 system prompt 中的 "Current Workflow State" 总是反映真实最新状态
      const currentNodes = tracker.nodes.map((n) => ({
        nodeId: n.nodeId,
        flowNodeType: n.flowNodeType,
        name: n.name,
        parentNodeId: n.parentNodeId,
        outputs: n.outputs.map((o) => ({
          id: o.id,
          key: o.key,
          label: o.label,
          valueType: o.valueType
        }))
      }));
      const currentEdges = tracker.edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandleKey: e.sourceHandleKey,
        targetHandleKey: e.targetHandleKey
      }));

      const toolParamsAcc: Record<string, string> = {};

      // 收集本轮数据（用于构建下一轮的 messages）
      type IterToolCall = {
        id: string;
        functionName: string;
        params: string;
        result: string; // 前端统一执行结果
      };
      const iterToolCalls: IterToolCall[] = [];
      let iterAssistantText = '';
      let iterHasError = false;
      const pendingToolExecutions: Promise<void>[] = [];
      let validationExecutionChain: Promise<void> = Promise.resolve();

      // 为本次 SSE 流创建独立的 AbortController，并与会话级 controller 联动
      const sseController = new AbortController();

      // 用 Promise.race 保证 abort 时立即退出 await，
      // 因为 fetchEventSource 在某些情况下 abort 后不调用 onclose/onerror，导致 await 永久挂起
      let abortResolve: () => void;
      const abortPromise = new Promise<void>((resolve) => {
        abortResolve = resolve;
      });
      const onSessionAbort = () => {
        sseController.abort();
        abortResolve();
      };
      sessionController.signal.addEventListener('abort', onSessionAbort, { once: true });

      try {
        await Promise.race([
          onWorkflowCopilot({
            model: generationModelRef.current,
            messages: llmMessages as any,
            currentWorkflow: { nodes: currentNodes, edges: currentEdges },
            onText: (text) => {
              if (!sseController.signal.aborted) {
                iterAssistantText += text;
                appendText('assistant', text);
              }
            },
            onToolCall: (tool) => {
              if (!sseController.signal.aborted) {
                toolParamsAcc[tool.id] = '';
                addToolCall(tool);
              }
            },
            onToolParams: ({ id, params }) => {
              if (!sseController.signal.aborted) {
                toolParamsAcc[id] = (toolParamsAcc[id] ?? '') + params;
                updateToolParams({ id, params });
              }
            },
            onToolResponse: (tool) => {
              if (!sseController.signal.aborted) {
                const accParams = toolParamsAcc[tool.id] || tool.params;
                const mergedTool = { ...tool, params: accParams };
                const previousToolExecutions = [...pendingToolExecutions];
                const executeAndRecord = async () => {
                  if (mergedTool.functionName === 'validate_workflow') {
                    await Promise.all(previousToolExecutions);
                  }

                  const result = await finalizeToolCall(mergedTool);
                  iterToolCalls.push({
                    id: tool.id,
                    functionName: tool.functionName,
                    params: accParams,
                    result
                  });
                  if (isFatalToolResult(result)) {
                    iterHasError = true;
                  }
                };
                const execution =
                  mergedTool.functionName === 'validate_workflow'
                    ? (validationExecutionChain = validationExecutionChain.then(() =>
                        executeAndRecord()
                      ))
                    : executeAndRecord();
                pendingToolExecutions.push(execution);
              }
            },
            abortController: sseController
          }),
          abortPromise // abort 时立即 resolve，不再等待 SSE 可能的挂起
        ]);
      } catch (err) {
        if (!sseController.signal.aborted && !sessionController.signal.aborted) {
          console.error('[Copilot] stream error:', err);
        }
      } finally {
        await Promise.all(pendingToolExecutions);
        sessionController.signal.removeEventListener('abort', onSessionAbort);
        setIsThinking(false);
        // 清理：SSE 流结束后，所有 toolResponse 应该已处理完毕
        // 任何仍处于 'calling' 状态的工具消息都是残留状态（SSE 中断/竞态），标记为 'done'
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === 'tool' && m.status === 'calling' ? { ...m, status: 'done' } : m
          )
        );
      }

      // 条件：本轮有工具调用 && 无前端错误 && 会话未取消
      if (iterToolCalls.length > 0 && !iterHasError && !sessionController.signal.aborted) {
        // ── 重复工具调用检测 ──
        // 为每个 mutation 工具生成签名，检测跨迭代的重复操作
        let hasNewWork = false;
        for (const tc of iterToolCalls) {
          // 查询工具（get_*、validate_*）不计入重复检测
          if (tc.functionName.startsWith('get_') || tc.functionName === 'validate_workflow') {
            continue;
          }
          const sig = `${tc.functionName}:${tc.params}`;
          if (!toolCallSignaturesRef.current.has(sig)) {
            toolCallSignaturesRef.current.add(sig);
            hasNewWork = true;
          }
        }
        // 如果本轮所有 mutation 工具都是重复的，递增 stale 计数
        if (
          !hasNewWork &&
          iterToolCalls.some(
            (tc) => !tc.functionName.startsWith('get_') && tc.functionName !== 'validate_workflow'
          )
        ) {
          staleIterationCountRef.current += 1;
          if (staleIterationCountRef.current >= 2) {
            console.warn('[Copilot] 检测到连续重复工具调用，终止迭代');
            appendText('assistant', '\n\n' + t('workflow:copilot_repeated_warning'));
            return;
          }
        } else {
          staleIterationCountRef.current = 0;
        }

        // 构建 assistant 消息（含 tool_calls）
        const assistantMsg = {
          role: 'assistant',
          content: iterAssistantText || null,
          tool_calls: iterToolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.functionName, arguments: tc.params }
          }))
        };

        // 构建工具结果消息：使用前端统一执行结果
        const toolResultMsgs = iterToolCalls.map((tc) => ({
          role: 'tool',
          tool_call_id: tc.id,
          content: tc.result
        }));

        const newMessages = trimCopilotMessages([...llmMessages, assistantMsg, ...toolResultMsgs]);

        // 等待 React 批量状态更新（setNodes/setEdges）完成，让画布视觉上同步
        // 注意：正确性不依赖于此延迟，tracker 才是 source of truth
        await new Promise((resolve) => setTimeout(resolve, 20));

        if (!sessionController.signal.aborted) {
          setIsThinking(true);
          await runCopilotIteration(newMessages as Array<Record<string, unknown>>);
        }
      }
      // 无工具调用（LLM 给出纯文本回复），但可能存在未修复的验证问题 → 强制重试
      else if (
        iterToolCalls.length === 0 &&
        !sessionController.signal.aborted &&
        validationRetryCountRef.current < MAX_VALIDATION_RETRIES
      ) {
        // 从消息历史中查找最后一次 validate_workflow 的结果
        const lastValidateResult = findLastValidationResult(llmMessages);
        if (lastValidateResult && !lastValidateResult.valid) {
          validationRetryCountRef.current += 1;
          const retryMessages = [
            ...llmMessages,
            ...(iterAssistantText ? [{ role: 'assistant', content: iterAssistantText }] : []),
            {
              role: 'user',
              content:
                'The workflow still has validation issues that need to be fixed. Please use tools to fix all issues, then call validate_workflow again.'
            }
          ];

          await new Promise((resolve) => setTimeout(resolve, 20));

          if (!sessionController.signal.aborted) {
            setIsThinking(true);
            await runCopilotIteration(retryMessages as Array<Record<string, unknown>>);
          }
        }
      }
      // 无工具调用且无验证问题（或已达重试上限）→ 自然结束，由 runCopilotRequest 的 finally 触发 autoLayout
    }
  );

  /**
   * 用户触发的入口：创建会话级 AbortController（Stop 按钮全程有效），
   * 初始化状态、构建首轮 messages，然后驱动迭代循环。
   */
  const runCopilotRequest = useMemoizedFn(
    async (
      userMsg: string,
      history: Array<{ role: string; content: string }>,
      skipAppend = false
    ) => {
      if (!skipAppend) {
        setMessages((prev) => [
          ...prev,
          { kind: 'text', id: getNanoid(), role: 'user', content: userMsg }
        ]);
      }

      // 初始化节点放置位置：在 workflowStart 右侧开始排列
      const allNodes = getNodes();
      const startNode = allNodes.find((n) => n.data.flowNodeType === 'workflowStart');
      const startX = startNode?.position?.x ?? 100;
      const startY = startNode?.position?.y ?? 400;
      const userNodes = allNodes.filter((n) => {
        const ft = n.data.flowNodeType;
        return !['systemConfig', 'pluginConfig', 'userGuide', 'workflowStart'].includes(ft ?? '');
      });
      const existingMaxX = userNodes.length
        ? Math.max(...userNodes.map((n) => (n.position?.x ?? 0) + (n.width ?? 300)))
        : startX;
      const cappedStartX = Math.min(existingMaxX + 60, startX + 350 * 5);
      nextNodePosRef.current = { x: Math.max(cappedStartX, startX + 350), y: startY };

      setIsThinking(true);

      // 创建会话级 AbortController（跨所有迭代，保持 Stop 按钮全程有效）
      const sessionController = new AbortController();
      abortControllerRef.current = sessionController;

      const initialLlmMessages: Array<Record<string, unknown>> = [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMsg }
      ];

      copilotIterationCountRef.current = 0;
      validationRetryCountRef.current = 0;
      toolCallSignaturesRef.current = new Set();
      staleIterationCountRef.current = 0;

      // 初始化 tracker：从当前 React 画布状态创建可变快照
      // tracker 跨所有迭代持续使用，工具调用同步更新 tracker
      // 这样避免了 React 异步批处理导致的 getNodeList() 返回旧数据问题
      const EXCLUDED_TYPES = new Set(['pluginConfig', 'userGuide']);
      const initialTrackerNodes = getNodeList()
        .filter((n) => !EXCLUDED_TYPES.has(n.flowNodeType))
        .map((n) => {
          // 从 React 画布读取完整 inputs（会话开始时 React 状态是准确的）
          const canvasNode = getNodes().find((cn) => cn.id === n.nodeId);
          const inputs: TrackerNodeInput[] = canvasNode
            ? getTrackerInputsFromFlowNode(canvasNode)
            : [];
          return {
            nodeId: n.nodeId,
            flowNodeType: n.flowNodeType,
            name: n.name,
            parentNodeId: n.parentNodeId,
            inputs,
            outputs: canvasNode
              ? getTrackerOutputsFromFlowNode(canvasNode)
              : n.outputs
                  .filter((o: any) => o.type !== FlowNodeOutputTypeEnum.hidden)
                  .map((o: any) => ({
                    id: o.id as string,
                    key: o.key as string,
                    label: o.label as string | undefined,
                    valueType: o.valueType as string | undefined
                  })),
            configuredInputKeys: new Set<string>(),
            // 从画布读取 catchError 状态（undefined=不支持，false=未开启，true=已开启）
            catchError: (canvasNode?.data as any)?.catchError
          };
        });
      const initialTrackerEdges = edges.map((e: any) => ({
        source: e.source as string,
        target: e.target as string,
        sourceHandleKey: e.sourceHandle
          ? (e.sourceHandle as string).split('-source-')[1] ?? 'right'
          : 'right',
        targetHandleKey: 'left'
      }));
      trackerRef.current = {
        nodes: initialTrackerNodes,
        edges: initialTrackerEdges
      };

      try {
        await runCopilotIteration(initialLlmMessages);
      } finally {
        abortControllerRef.current = null;
        setIsThinking(false);
        // 等待一帧，确保所有 setNodes/setEdges 的 React 批处理已应用到画布，
        // 再让 useRequest 的 loading 变为 false（完成按钮出现）
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        setTimeout(() => {
          autoLayout();
          // 自动布局完成后，静默触发工作流校验（不弹 toast，仅标红错误节点）
          // 使用双 rAF 确保 autoLayout 的 setNodes/setEdges 已完成渲染
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              runSilentValidation();
            });
          });
        }, 400);
      }
    }
  );

  const { runAsync: startGeneration, loading } = useRequest(
    async ({ userMsg, model }: { userMsg: string; model: string }) => {
      generationModelRef.current = model;
      await runCopilotRequest(userMsg, []);
    }
  );

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const setGenerationError = useMemoizedFn((text: string) => {
    setMessages([{ kind: 'text', id: getNanoid(), role: 'assistant', content: text }]);
  });

  useEffect(() => {
    if (autoStartedRef.current || !appDetail._id || !workflowStartNode) return;

    const rawTask = sessionStorage.getItem(WORKFLOW_COPILOT_TASK_STORAGE_KEY);
    if (!rawTask) return;

    let task: WorkflowCopilotGenerationTask | null = null;
    try {
      task = JSON.parse(rawTask);
    } catch {
      sessionStorage.removeItem(WORKFLOW_COPILOT_TASK_STORAGE_KEY);
      return;
    }

    if (!task || Date.now() - task.createdAt > 10 * 60 * 1000) {
      sessionStorage.removeItem(WORKFLOW_COPILOT_TASK_STORAGE_KEY);
      return;
    }
    if (task.appId !== appDetail._id) return;
    if (!task.requirement.trim() || !task.model) {
      sessionStorage.removeItem(WORKFLOW_COPILOT_TASK_STORAGE_KEY);
      setGenerationError(t('workflow:copilot_missing_task_params'));
      return;
    }

    autoStartedRef.current = true;
    sessionStorage.removeItem(WORKFLOW_COPILOT_TASK_STORAGE_KEY);
    startGeneration({ userMsg: task.requirement, model: task.model });
  }, [appDetail._id, setGenerationError, startGeneration, workflowStartNode]);

  const handleStop = useCallback(() => {
    // 用 ref 而非 state，避免 React 异步批处理导致 state 未更新时 abort 失效
    const ctrl = abortControllerRef.current;
    if (ctrl) {
      ctrl.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  /** 将 messages 分组：连续的 tool 消息合并为一组，text 消息各自独立 */
  const groupedMessages = React.useMemo(() => {
    const groups: Array<
      { kind: 'text'; msg: TextMessage } | { kind: 'tools'; msgs: ToolCallMessage[] }
    > = [];
    for (const msg of messages) {
      if (msg.kind === 'tool') {
        const last = groups[groups.length - 1];
        if (last?.kind === 'tools') {
          last.msgs.push(msg);
        } else {
          groups.push({ kind: 'tools', msgs: [msg] });
        }
      } else {
        groups.push({ kind: 'text', msg });
      }
    }
    return groups;
  }, [messages]);

  const renderTextMessage = (msg: TextMessage) => {
    if (msg.role === 'user') {
      return (
        <Flex key={msg.id} justifyContent="flex-end" mb={3}>
          <Box
            bg="blue.100"
            p="12px"
            borderRadius="8px"
            maxW="85%"
            fontSize="sm"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
          >
            {msg.content}
          </Box>
        </Flex>
      );
    }

    return (
      <Flex key={msg.id} mb={3}>
        <Box flex={1} minW={0} fontSize="sm">
          <Markdown source={msg.content} />
        </Box>
      </Flex>
    );
  };

  const isDone = !loading;

  return (
    <Flex direction="column" h="full" bg="white" overflow="hidden">
      {/* Header */}
      <Flex
        alignItems="center"
        px="24px"
        py="10px"
        h="52px"
        flexShrink={0}
        borderBottom="1px solid"
        borderColor="#EBEDF0"
      >
        <Box fontWeight="bold" fontSize="16px" color="myGray.900" flex={1}>
          {t('workflow:copilot_title')}
        </Box>
      </Flex>

      {/* Messages */}
      <Box flex={1} overflowY="auto" px="20px" py={3} minH={0}>
        {messages.length === 0 && !loading && (
          <Box textAlign="center" color="myGray.400" mt={8} fontSize="sm">
            <MyIcon name="optimizer" w={10} color="myGray.200" mb={3} />
            <Box fontWeight="medium" mb={1} color="myGray.600">
              {t('workflow:copilot_empty_title')}
            </Box>
            <Box>{t('workflow:copilot_empty_hint')}</Box>
          </Box>
        )}
        {groupedMessages.map((group, i) =>
          group.kind === 'text' ? (
            renderTextMessage(group.msg)
          ) : (
            <ToolCallGroup key={`tg-${i}`} tools={group.msgs} getNodes={getNodes} />
          )
        )}
        {loading && isThinking && (
          <Flex mb={3} alignItems="center">
            <ThinkingDots />
          </Flex>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Footer: only show when done */}
      {isDone && (
        <Box px="20px" pt="10px" pb="20px" h="70px" flexShrink={0}>
          <Button colorScheme="primary" variant="solid" w="full" h="40px" onClick={onClose}>
            {t('workflow:copilot_done')}
          </Button>
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(CopilotPanel);
