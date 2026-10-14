import { describe, it, expect } from 'vitest';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import type { Node, Edge } from 'reactflow';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  EDGE_TYPE
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { workflowReferenceValueIsSelectable } from '@/web/core/workflow/utils';
import {
  checkWorkflowNodeIssues,
  checkWorkflowBeforeRunOrPublish,
  getWorkflowCheckErrorNodeIds
} from '@/web/core/workflow/check/check';
import {
  applyWorkflowStartInputAutoFill,
  collectWorkflowStartInputAutoFillPatches,
  collectWorkflowStartAutoFillRevertPatches,
  collectWorkflowStartOutputAutoFillRevertPatches
} from '@/web/core/workflow/workflowStartAutoFill';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { AssignedAnswerModule } from '@fastgpt/global/core/workflow/template/system/assignedAnswer';
import {
  DatasetConcatModule,
  getOneQuoteInputTemplate
} from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { uiWorkflow2StoreWorkflow } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';

describe('checkWorkflowNodeIssues', () => {
  const makeNode = (
    nodeId: string,
    flowNodeType: FlowNodeTypeEnum,
    data?: Partial<FlowNodeItemType>
  ): Node<FlowNodeItemType> =>
    ({
      id: nodeId,
      type: flowNodeType,
      position: { x: 0, y: 0 },
      data: {
        nodeId,
        flowNodeType,
        name: nodeId,
        inputs: [],
        outputs: [],
        ...data
      }
    }) as Node<FlowNodeItemType>;

  const startNode = makeNode('start', FlowNodeTypeEnum.workflowStart, {
    outputs: [
      {
        id: NodeOutputKeyEnum.userChatInput,
        key: NodeOutputKeyEnum.userChatInput,
        label: 'question',
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ]
  });

  it('collects multiple node errors in one pass', () => {
    const requiredNode = makeNode('required', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });
    const formNode = makeNode('form', FlowNodeTypeEnum.formInput, {
      inputs: [
        {
          key: NodeInputKeyEnum.userInputForms,
          label: 'Form fields',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: []
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, requiredNode, formNode],
      edges: [
        { id: 'e1', source: 'start', target: 'required', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'form', type: EDGE_TYPE }
      ]
    });

    expect(Object.keys(result).sort()).toEqual(['form', 'required']);
    expect(result.required.map((issue) => issue.code)).toContain('required_input_empty');
    expect(result.form.map((issue) => issue.code)).toContain('form_input_empty');
  });

  it('keeps all errors on a single node', () => {
    const node = makeNode('multi', FlowNodeTypeEnum.userSelect, {
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [{ value: '' }]
        },
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'multi', type: EDGE_TYPE }]
    });

    expect(result.multi.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['user_select_value_empty', 'required_input_empty'])
    );
  });

  it('reports nodes without upstream connections', () => {
    const node = makeNode('orphan', FlowNodeTypeEnum.answerNode);

    const result = checkWorkflowNodeIssues({ nodes: [startNode, node], edges: [] });

    expect(result.orphan.map((issue) => issue.code)).toContain('no_upstream');
  });

  it('does not report unselectable references', () => {
    const node = makeNode('ref', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: ['deleted', 'output']
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'ref', type: EDGE_TYPE }]
    });

    expect(result).toEqual({});
    expect(node.data.inputs[0].value).toEqual(['deleted', 'output']);
  });

  it('filters unselectable single and multiple references when storing workflow data', () => {
    const sourceNode = makeNode('source', FlowNodeTypeEnum.workflowStart, {
      outputs: [
        {
          id: 'text',
          key: 'text',
          label: 'text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          id: 'files',
          key: 'files',
          label: 'files',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.arrayString
        },
        {
          id: 'count',
          key: 'count',
          label: 'count',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.number
        }
      ]
    });
    const node = makeNode('ref', FlowNodeTypeEnum.chatNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          label: '用户问题',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: ['source', 'count']
        },
        {
          key: NodeInputKeyEnum.fileUrlList,
          label: '文件链接',
          valueType: WorkflowIOValueTypeEnum.arrayString,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: [
            ['source', 'files'],
            ['source', 'deleted'],
            ['source', 'count']
          ]
        }
      ]
    });

    const result = uiWorkflow2StoreWorkflow({
      nodes: [sourceNode, node],
      edges: [{ id: 'e1', source: 'source', target: 'ref', type: EDGE_TYPE }],
      chatConfig: {}
    });
    const storedNode = result.nodes.find((item) => item.nodeId === 'ref');

    expect(
      storedNode?.inputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)
    ).toEqual(
      expect.objectContaining({
        value: undefined
      })
    );
    expect(storedNode?.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)).toEqual(
      expect.objectContaining({
        value: [['source', 'files']]
      })
    );
  });

  it('stores the canonical selectedType', () => {
    const node = makeNode('input-node', FlowNodeTypeEnum.chatNode, {
      inputs: [
        {
          key: 'query',
          label: 'Query',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference
        }
      ]
    });

    const result = uiWorkflow2StoreWorkflow({ nodes: [node], edges: [], chatConfig: {} });

    expect(result.nodes[0].inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.reference
    });
  });

  it('reports generic plugin load errors without telling users to delete the tool', () => {
    const node = makeNode('tool', FlowNodeTypeEnum.appModule, {
      pluginData: {
        error: 'not found'
      } as any
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'tool', type: EDGE_TYPE }]
    });

    expect(result.tool.map((issue) => issue.code)).toContain('tool_load_failed');
    expect(result.tool[0]?.message).toBe('工具加载失败，请稍后重试');
  });

  it('reports permission error when pluginData error is unAuthApp', () => {
    const node = makeNode('tool', FlowNodeTypeEnum.appModule, {
      pluginData: {
        error: AppErrEnum.unAuthApp
      } as any
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'tool', type: EDGE_TYPE }]
    });

    expect(result.tool.map((issue) => issue.code)).toContain('resource_no_permission');
    expect(result.tool[0]?.message).toBe('无权限访问该资源，请检查权限');
  });

  it('reports permission error when pluginData error is translated message', () => {
    const node = makeNode('tool', FlowNodeTypeEnum.pluginModule, {
      pluginData: {
        error: ERROR_RESPONSE[PluginErrEnum.unAuth].message
      } as any
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'tool', type: EDGE_TYPE }]
    });

    expect(result.tool.map((issue) => issue.code)).toContain('resource_no_permission');
    expect(result.tool[0]?.message).toBe('无权限访问该资源，请检查权限');
  });

  it('reports missing tool when pluginData error is appUnExist', () => {
    const node = makeNode('tool', FlowNodeTypeEnum.runApp, {
      pluginData: {
        error: AppErrEnum.unExist
      } as any
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'tool', type: EDGE_TYPE }]
    });

    expect(result.tool.map((issue) => issue.code)).toContain('tool_missing');
  });

  it('uses fixed design copy for mapped issue codes', () => {
    const disconnectedNode = makeNode('disconnected', FlowNodeTypeEnum.answerNode);
    const unreachableNode = makeNode('unreachable', FlowNodeTypeEnum.answerNode);
    const requiredNode = makeNode('required', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });

    const unreachableResult = checkWorkflowNodeIssues({
      nodes: [startNode, disconnectedNode, unreachableNode],
      edges: [{ id: 'e1', source: 'disconnected', target: 'unreachable', type: EDGE_TYPE }]
    });
    const requiredResult = checkWorkflowNodeIssues({
      nodes: [startNode, requiredNode],
      edges: [{ id: 'e1', source: 'start', target: 'required', type: EDGE_TYPE }]
    });

    expect(unreachableResult.unreachable[0]?.code).toBe('unreachable_from_start');
    expect(unreachableResult.unreachable[0]?.message).toBe('未与其他节点连线');
    expect(requiredResult.required[0]?.message).toBe('需填写必填项 answer');
  });

  it('does not treat non-latest tool versions as inactive', () => {
    const nonLatestNode = makeNode('non-latest', FlowNodeTypeEnum.appModule, {
      pluginData: {} as any,
      isLatestVersion: false
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, nonLatestNode],
      edges: [{ id: 'e1', source: 'start', target: 'non-latest', type: EDGE_TYPE }]
    });

    expect(result['non-latest']?.map((issue) => issue.code) ?? []).not.toContain('tool_inactive');
  });

  it('does not require a legacy user question when an AI node is used as a tool', () => {
    const toolCallNode = makeNode('tool-call', FlowNodeTypeEnum.toolCall);
    const aiToolNode = makeNode('ai-tool', FlowNodeTypeEnum.chatNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.aiModelId,
          label: '模型',
          value: 'configured-model',
          renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel]
        },
        {
          key: NodeInputKeyEnum.userChatInput,
          label: '用户问题',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [
            FlowNodeInputTypeEnum.agentGenerated,
            FlowNodeInputTypeEnum.reference,
            FlowNodeInputTypeEnum.textarea
          ],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          value: undefined
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, toolCallNode, aiToolNode],
      edges: [
        { id: 'e-start-tool-call', source: 'start', target: 'tool-call', type: EDGE_TYPE },
        {
          id: 'e-tool-call-ai',
          source: 'tool-call',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          target: 'ai-tool',
          targetHandle: NodeOutputKeyEnum.selectedTools,
          type: EDGE_TYPE
        }
      ]
    });

    expect(result['ai-tool'] ?? []).toEqual([]);
  });

  it('does not report an activated tool as inactive when a normal required input is empty', () => {
    const toolCallNode = makeNode('tool-call', FlowNodeTypeEnum.toolCall);
    const activatedToolNode = makeNode('activated-tool', FlowNodeTypeEnum.tool, {
      inputs: [
        {
          key: NodeInputKeyEnum.systemInputConfig,
          label: 'System input config',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: { type: 'system' }
        },
        {
          key: 'query',
          label: '搜索查询词',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, toolCallNode, activatedToolNode],
      edges: [
        { id: 'e-start-tool-call', source: 'start', target: 'tool-call', type: EDGE_TYPE },
        {
          id: 'e-tool-call-tool',
          source: 'tool-call',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          target: 'activated-tool',
          targetHandle: NodeOutputKeyEnum.selectedTools,
          type: EDGE_TYPE
        }
      ]
    });

    expect(result['activated-tool']?.map((issue) => issue.code)).toEqual(['required_input_empty']);
  });

  it('accepts a required tool input with a default value during workflow checks', () => {
    const toolCallNode = makeNode('tool-call', FlowNodeTypeEnum.toolCall);
    const activatedToolNode = makeNode('activated-tool', FlowNodeTypeEnum.tool, {
      inputs: [
        {
          key: NodeInputKeyEnum.systemInputConfig,
          label: 'System input config',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: { type: 'system' }
        },
        {
          key: 'query',
          label: '搜索查询词',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: undefined,
          defaultValue: '默认查询词'
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, toolCallNode, activatedToolNode],
      edges: [
        { id: 'e-start-tool-call', source: 'start', target: 'tool-call', type: EDGE_TYPE },
        {
          id: 'e-tool-call-tool',
          source: 'tool-call',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          target: 'activated-tool',
          targetHandle: NodeOutputKeyEnum.selectedTools,
          type: EDGE_TYPE
        }
      ]
    });

    expect(result['activated-tool']?.map((issue) => issue.code) ?? []).not.toContain(
      'required_input_empty'
    );
  });

  it('reports a tool as inactive when its system input configuration is missing', () => {
    const toolCallNode = makeNode('tool-call', FlowNodeTypeEnum.toolCall);
    const inactiveToolNode = makeNode('inactive-tool', FlowNodeTypeEnum.tool, {
      inputs: [
        {
          key: NodeInputKeyEnum.systemInputConfig,
          label: 'System input config',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: undefined
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, toolCallNode, inactiveToolNode],
      edges: [
        { id: 'e-start-tool-call', source: 'start', target: 'tool-call', type: EDGE_TYPE },
        {
          id: 'e-tool-call-tool',
          source: 'tool-call',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          target: 'inactive-tool',
          targetHandle: NodeOutputKeyEnum.selectedTools,
          type: EDGE_TYPE
        }
      ]
    });

    expect(result['inactive-tool']?.map((issue) => issue.code)).toContain('tool_waiting_config');
  });

  it('reports offline tools', () => {
    const offlineNode = makeNode('offline', FlowNodeTypeEnum.appModule, {
      status: PluginStatusEnum.Offline
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, offlineNode],
      edges: [{ id: 'e1', source: 'start', target: 'offline', type: EDGE_TYPE }]
    });

    expect(result.offline.map((issue) => issue.code)).toContain('tool_offline');
  });

  it('reports specific node configuration errors', () => {
    const httpNode = makeNode('http', FlowNodeTypeEnum.httpRequest468, {
      inputs: [
        {
          key: NodeInputKeyEnum.httpReqUrl,
          label: 'Request URL',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });
    const toolCallNode = makeNode('toolCall', FlowNodeTypeEnum.toolCall, {
      inputs: [
        {
          key: NodeInputKeyEnum.useAgentSandbox,
          label: 'Agent sandbox',
          renderTypeList: [FlowNodeInputTypeEnum.switch],
          value: false
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, httpNode, toolCallNode],
      edges: [
        { id: 'e1', source: 'start', target: 'http', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'toolCall', type: EDGE_TYPE }
      ]
    });

    expect(result.http.map((issue) => issue.code)).toContain('http_url_empty');
    expect(result.toolCall.map((issue) => issue.code)).toContain('tool_call_empty');
  });

  it('reports deleted dataset or skill references via resource_missing', () => {
    const datasetNode = makeNode('dataset', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          label: '知识库',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [
            { datasetId: 'd1', name: 'ok' },
            { datasetId: 'd2', name: 'gone', error: 'resource_missing' }
          ]
        }
      ]
    });
    const skillNode = makeNode('skill', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.skills,
          label: '技能',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [{ skillId: 's2', name: 'gone', error: 'resource_missing' }]
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, datasetNode, skillNode],
      edges: [
        { id: 'e1', source: 'start', target: 'dataset', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'skill', type: EDGE_TYPE }
      ]
    });

    expect(result.dataset.map((issue) => issue.code)).toContain('resource_missing');
    expect(result.skill.map((issue) => issue.code)).toContain('resource_missing');
  });

  it('focuses resources with an explicit ACL denial marker', () => {
    const datasetNode = makeNode('dataset', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          label: '知识库',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [{ datasetId: 'd1', name: 'no-perm', error: 'resource_no_permission' }]
        }
      ]
    });
    const toolNode = makeNode('tool', FlowNodeTypeEnum.appModule, {
      pluginData: { error: 'resource_no_permission' } as any
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, datasetNode, toolNode],
      edges: [
        { id: 'e1', source: 'start', target: 'dataset', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'tool', type: EDGE_TYPE }
      ]
    });

    expect((result.dataset ?? []).map((issue) => issue.code)).toContain('resource_no_permission');
    expect((result.tool ?? []).map((issue) => issue.code)).toContain('resource_no_permission');
  });

  it('reports unavailable datasets nested in Agent datasetParams', () => {
    const agentNode = makeNode('agent', FlowNodeTypeEnum.agent, {
      inputs: [
        {
          key: NodeInputKeyEnum.datasetParams,
          label: '知识库配置',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: {
            datasets: [
              { datasetId: 'd1', name: 'no-perm', error: 'resource_no_permission' },
              { datasetId: 'd2', name: 'gone', error: 'resource_missing' }
            ]
          }
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, agentNode],
      edges: [{ id: 'e1', source: 'start', target: 'agent', type: EDGE_TYPE }]
    });

    expect(result.agent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'resource_no_permission',
          inputKey: NodeInputKeyEnum.datasetParams
        }),
        expect.objectContaining({
          code: 'resource_missing',
          inputKey: NodeInputKeyEnum.datasetParams
        })
      ])
    );
  });

  /**
   * 使用 packages/global 真实节点模板构造 inputs，避免手写 valueType 掩盖模板默认值。
   */
  describe('real node template default validation', () => {
    const makeNodeWithTemplateInputs = (
      nodeId: string,
      flowNodeType: FlowNodeTypeEnum,
      templateInputs: FlowNodeTemplateType['inputs']
    ) =>
      makeNode(nodeId, flowNodeType, {
        inputs: templateInputs.map((input) => ({ ...input }))
      });

    const runCheck = (node: Node<FlowNodeItemType>, extraNodes: Node<FlowNodeItemType>[] = []) =>
      checkWorkflowNodeIssues({
        nodes: [startNode, ...extraNodes, node],
        edges: [
          { id: 'e-start', source: 'start', target: node.data.nodeId, type: EDGE_TYPE },
          ...extraNodes.map((extraNode, index) => ({
            id: `e-extra-${index}`,
            source: 'start',
            target: extraNode.data.nodeId,
            type: EDGE_TYPE
          }))
        ]
      });

    it('AssignedAnswerModule keeps required answerText with valueType any (template contract)', () => {
      const answerInput = AssignedAnswerModule.inputs.find(
        (input) => input.key === NodeInputKeyEnum.answerText
      );

      expect(answerInput?.required).toBe(true);
      expect(answerInput?.valueType).toBe(WorkflowIOValueTypeEnum.any);
      expect(answerInput?.value).toBeUndefined();
    });

    it('answerNode template default: empty required answerText reports required_input_empty', () => {
      const node = makeNodeWithTemplateInputs(
        'answer',
        FlowNodeTypeEnum.answerNode,
        AssignedAnswerModule.inputs
      );

      const result = runCheck(node);
      const answerIssues =
        result.answer?.filter((issue) => issue.inputKey === NodeInputKeyEnum.answerText) ?? [];

      expect(answerIssues.map((issue) => issue.code)).toContain('required_input_empty');
    });

    it('answerNode with filled content does not report required_input_empty', () => {
      const node = makeNodeWithTemplateInputs('answer-ok', FlowNodeTypeEnum.answerNode, [
        {
          ...AssignedAnswerModule.inputs[0],
          value: 'hello'
        }
      ]);

      const result = runCheck(node);
      const answerIssues =
        result['answer-ok']?.filter((issue) => issue.code === 'required_input_empty') ?? [];

      expect(answerIssues).toEqual([]);
    });

    it('answerNode contrast: same field with valueType string reports required_input_empty', () => {
      const templateInput = AssignedAnswerModule.inputs.find(
        (input) => input.key === NodeInputKeyEnum.answerText
      );
      expect(templateInput).toBeDefined();

      const node = makeNode('answer-string', FlowNodeTypeEnum.answerNode, {
        inputs: [
          {
            ...templateInput!,
            valueType: WorkflowIOValueTypeEnum.string,
            value: ''
          }
        ]
      });

      const result = runCheck(node);
      const answerIssues =
        result['answer-string']?.filter(
          (issue) => issue.inputKey === NodeInputKeyEnum.answerText
        ) ?? [];

      expect(answerIssues.map((issue) => issue.code)).toContain('required_input_empty');
    });

    it('DatasetConcatModule default: empty quote list reports required_input_empty', () => {
      const node = makeNodeWithTemplateInputs(
        'concat',
        FlowNodeTypeEnum.datasetConcatNode,
        DatasetConcatModule.inputs
      );

      expect(node.data.inputs.filter((input) => input.canEdit)).toHaveLength(0);

      const result = runCheck(node);

      expect(result.concat?.map((issue) => issue.code)).toContain('required_input_empty');
      expect(result.concat?.[0]?.inputKey).toBe(NodeInputKeyEnum.datasetQuoteList);
    });

    it('datasetConcat added quote without reference reports required_input_empty', () => {
      const quoteTemplate = getOneQuoteInputTemplate({ index: 1 });
      const node = makeNodeWithTemplateInputs('concat-one', FlowNodeTypeEnum.datasetConcatNode, [
        ...DatasetConcatModule.inputs,
        quoteTemplate
      ]);

      expect(quoteTemplate.required).toBe(true);

      const result = runCheck(node);
      const quoteIssues =
        result['concat-one']?.filter((issue) => issue.code === 'required_input_empty') ?? [];

      expect(quoteIssues.length).toBeGreaterThan(0);
    });

    it('datasetConcat with valid quote reference does not report required_input_empty', () => {
      const datasetNode = makeNode('dataset', FlowNodeTypeEnum.datasetSearchNode, {
        outputs: [
          {
            id: NodeOutputKeyEnum.datasetQuoteQA,
            key: NodeOutputKeyEnum.datasetQuoteQA,
            label: 'quote',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.datasetQuote
          }
        ]
      });
      const quoteKey = 'quote-1';
      const node = makeNodeWithTemplateInputs('concat-ok', FlowNodeTypeEnum.datasetConcatNode, [
        ...DatasetConcatModule.inputs,
        {
          ...getOneQuoteInputTemplate({ key: quoteKey, index: 1 }),
          value: ['dataset', NodeOutputKeyEnum.datasetQuoteQA]
        }
      ]);

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, datasetNode, node],
        edges: [
          { id: 'e1', source: 'start', target: 'dataset', type: EDGE_TYPE },
          { id: 'e2', source: 'start', target: 'concat-ok', type: EDGE_TYPE }
        ]
      });

      const requiredIssues =
        result['concat-ok']?.filter((issue) => issue.code === 'required_input_empty') ?? [];
      expect(requiredIssues).toEqual([]);
    });

    it('HttpNode468 template default: empty httpReqUrl reports http_url_empty via node rule', () => {
      const node = makeNodeWithTemplateInputs(
        'http',
        FlowNodeTypeEnum.httpRequest468,
        HttpNode468.inputs
      );
      const urlInput = node.data.inputs.find((input) => input.key === NodeInputKeyEnum.httpReqUrl);

      expect(urlInput?.required).toBe(true);
      expect(urlInput?.value).toBeUndefined();

      const result = runCheck(node);
      expect(result.http?.map((issue) => issue.code)).toContain('http_url_empty');
      expect(result.http?.[0]?.inputKey).toBe(NodeInputKeyEnum.httpReqUrl);
      expect(result.http?.map((issue) => issue.code)).not.toContain('required_input_empty');
    });

    it('HttpNode468 with request url does not report http_url_empty', () => {
      const node = makeNodeWithTemplateInputs(
        'http-ok',
        FlowNodeTypeEnum.httpRequest468,
        HttpNode468.inputs.map((input) =>
          input.key === NodeInputKeyEnum.httpReqUrl
            ? { ...input, value: 'https://example.com/api' }
            : input
        )
      );

      const result = runCheck(node);
      expect(result['http-ok']?.map((issue) => issue.code) ?? []).not.toContain('http_url_empty');
    });

    it('loopStart hidden required any does not false-positive required_input_empty', () => {
      const node = makeNodeWithTemplateInputs(
        'loop-start',
        FlowNodeTypeEnum.nestedStart,
        LoopStartNode.inputs
      );

      const result = runCheck(node);
      expect(result['loop-start']?.map((issue) => issue.code) ?? []).not.toContain(
        'required_input_empty'
      );
    });

    it('uses selectedType in required validation', () => {
      const node = makeNodeWithTemplateInputs('hidden-selected', FlowNodeTypeEnum.formInput, [
        {
          key: 'internal',
          label: 'Internal',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.hidden],
          selectedType: FlowNodeInputTypeEnum.hidden,
          required: true
        }
      ]);

      const result = runCheck(node);
      expect(result['hidden-selected']?.map((issue) => issue.code) ?? []).not.toContain(
        'required_input_empty'
      );
    });
  });

  it('reports required_input_empty for unset references', () => {
    const unsetValues = [undefined, ['', ''], [undefined, undefined]] as const;

    unsetValues.forEach((value, index) => {
      const node = makeNode(`empty-ref-${index}`, FlowNodeTypeEnum.chatNode, {
        inputs: [
          {
            key: NodeInputKeyEnum.userChatInput,
            label: '用户问题',
            required: true,
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            value
          }
        ]
      });

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, node],
        edges: [{ id: `e-${index}`, source: 'start', target: node.id, type: EDGE_TYPE }]
      });

      expect(
        result[node.id]
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code)
      ).toEqual(['required_input_empty']);
    });
  });

  describe('auto-fill input variables after connecting from workflow start', () => {
    const makeFreshConnectedNode = (
      nodeId: string,
      template: FlowNodeTemplateType
    ): Node<FlowNodeItemType> =>
      makeNode(nodeId, template.flowNodeType, {
        inputs: template.inputs.map((input) => ({
          ...input,
          value: input.value ?? input.defaultValue
        })),
        outputs: template.outputs
      });

    const startNodeWithFiles = makeNode('start', FlowNodeTypeEnum.workflowStart, {
      outputs: [...startNode.data.outputs, userFilesInput]
    });

    const applyStartAutoFill = (targetNode: Node<FlowNodeItemType>, workflowStart = startNode) => {
      targetNode.data.inputs = applyWorkflowStartInputAutoFill({
        inputs: targetNode.data.inputs,
        workflowStartNodeId: workflowStart.data.nodeId,
        workflowStartOutputs: workflowStart.data.outputs
      });
    };

    const expectInputValue = (
      node: Node<FlowNodeItemType>,
      inputKey: NodeInputKeyEnum,
      expectedValue: unknown
    ) => {
      expect(
        node.data.inputs.find((input) => input.key === inputKey)?.value,
        `${node.data.name || node.id}.${inputKey} should auto reference workflow start output after connection`
      ).toEqual(expectedValue);
    };

    it.each([
      [
        'AI 对话',
        AiChatModule,
        'ai-chat',
        NodeInputKeyEnum.userChatInput,
        ['start', NodeOutputKeyEnum.userChatInput]
      ],
      [
        '知识库搜索',
        DatasetSearchModule,
        'dataset-search',
        NodeInputKeyEnum.datasetSearchInput,
        [['start', NodeOutputKeyEnum.userChatInput]]
      ],
      [
        '问题分类',
        ClassifyQuestionModule,
        'classify',
        NodeInputKeyEnum.userChatInput,
        ['start', NodeOutputKeyEnum.userChatInput]
      ],
      [
        '工具调用',
        ToolCallNode,
        'tool-call',
        NodeInputKeyEnum.userChatInput,
        ['start', NodeOutputKeyEnum.userChatInput]
      ]
    ] as const)(
      '%s 节点连线后应自动填充用户问题引用',
      (_nodeName, template, nodeId, inputKey, expectedValue) => {
        const targetNode = makeFreshConnectedNode(nodeId, template);
        applyStartAutoFill(targetNode);

        const result = checkWorkflowNodeIssues({
          nodes: [startNode, targetNode],
          edges: [{ id: `e-start-${nodeId}`, source: 'start', target: nodeId, type: EDGE_TYPE }]
        });

        expectInputValue(targetNode, inputKey, expectedValue);
        expect(
          result[nodeId]
            ?.filter((issue) => issue.inputKey === inputKey)
            .map((issue) => issue.code) ?? []
        ).not.toContain('required_input_empty');
      }
    );

    it('AI 对话节点连线且开启文件上传后应自动填充文件链接引用', () => {
      const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      applyStartAutoFill(targetNode, startNodeWithFiles);

      expectInputValue(targetNode, NodeInputKeyEnum.fileUrlList, [
        ['start', NodeOutputKeyEnum.userFiles]
      ]);
      expect(
        workflowReferenceValueIsSelectable({
          value: targetNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)
            ?.value as any,
          sourceNodes: [
            {
              nodeId: startNodeWithFiles.data.nodeId,
              outputs: startNodeWithFiles.data.outputs
            }
          ],
          valueType: WorkflowIOValueTypeEnum.arrayString
        })
      ).toBe(true);

      const result = checkWorkflowNodeIssues({
        nodes: [startNodeWithFiles, targetNode],
        edges: [{ id: 'e-start-ai-chat', source: 'start', target: 'ai-chat', type: EDGE_TYPE }]
      });
      const fileLinkIssues =
        result['ai-chat']?.filter((issue) => issue.inputKey === NodeInputKeyEnum.fileUrlList) ?? [];
      expect(fileLinkIssues).toEqual([]);
    });

    it('收集自动填充补丁时，同一个节点的文件链接和用户问题应同时返回', () => {
      const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);

      const patches = collectWorkflowStartInputAutoFillPatches({
        nodes: [startNodeWithFiles, targetNode],
        edges: [{ source: 'start', target: 'ai-chat' }],
        workflowStartNode: startNodeWithFiles.data
      });

      expect(
        patches
          .filter((patch) => patch.nodeId === 'ai-chat')
          .map((patch) => patch.key)
          .sort()
      ).toEqual([NodeInputKeyEnum.fileUrlList, NodeInputKeyEnum.userChatInput].sort());
    });

    it('开启文件上传后再关闭，应清理自动写入的 userFiles 引用', () => {
      const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      const datasetNode = makeFreshConnectedNode('dataset-search', DatasetSearchModule);
      const edges: Edge[] = [
        { id: 'e-start-ai', source: 'start', target: 'ai-chat', type: EDGE_TYPE },
        { id: 'e-ai-dataset', source: 'ai-chat', target: 'dataset-search', type: EDGE_TYPE }
      ];
      const nodes = [startNodeWithFiles, aiNode, datasetNode];

      const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
        nodes,
        edges,
        workflowStartNode: startNodeWithFiles.data
      });

      nodes.forEach((node) => {
        node.data.inputs = node.data.inputs.map((input) => {
          const patch = autoFillPatches.find(
            (item) => item.nodeId === node.data.nodeId && item.key === input.key
          );
          return patch ? patch.value : input;
        });
      });

      const revertPatches = collectWorkflowStartOutputAutoFillRevertPatches({
        nodes,
        edges,
        workflowStartNode: startNodeWithFiles.data,
        outputKey: userFilesInput.key
      });

      expect(revertPatches.map((patch) => `${patch.nodeId}:${patch.key}`).sort()).toEqual(
        [
          `ai-chat:${NodeInputKeyEnum.fileUrlList}`,
          `dataset-search:${NodeInputKeyEnum.datasetSearchInput}`
        ].sort()
      );

      nodes.forEach((node) => {
        node.data.inputs = node.data.inputs.map((input) => {
          const patch = revertPatches.find(
            (item) => item.nodeId === node.data.nodeId && item.key === input.key
          );
          return patch ? patch.value : input;
        });
      });

      expectInputValue(aiNode, NodeInputKeyEnum.fileUrlList, undefined);
      expectInputValue(datasetNode, NodeInputKeyEnum.datasetSearchInput, [
        ['start', NodeOutputKeyEnum.userChatInput]
      ]);

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, aiNode, datasetNode],
        edges
      });
      expect(
        result['ai-chat']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.fileUrlList)
          .map((issue) => issue.code) ?? []
      ).not.toContain('invalid_reference');
      expect(
        result['dataset-search']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.datasetSearchInput)
          .map((issue) => issue.code) ?? []
      ).not.toContain('invalid_reference');
    });

    it('流程开始节点可达的间接下游节点也应自动填充用户问题引用', () => {
      const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      const toolNode = makeFreshConnectedNode('tool-call', ToolCallNode);

      const patches = collectWorkflowStartInputAutoFillPatches({
        nodes: [startNode, aiNode, toolNode],
        edges: [
          { source: 'start', target: 'ai-chat' },
          { source: 'ai-chat', target: 'tool-call' }
        ],
        workflowStartNode: startNode.data
      });

      const toolUserQuestionPatch = patches.find(
        (patch) => patch.nodeId === 'tool-call' && patch.key === NodeInputKeyEnum.userChatInput
      );

      expect(toolUserQuestionPatch?.value.value).toEqual([
        'start',
        NodeOutputKeyEnum.userChatInput
      ]);
    });

    it('合法手动配置的用户问题引用不应被连线自动填充覆盖', () => {
      const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      const manualReference = [VARIABLE_NODE_ID, 'customQuestion'];
      targetNode.data.inputs = targetNode.data.inputs.map((input) =>
        input.key === NodeInputKeyEnum.userChatInput ? { ...input, value: manualReference } : input
      );

      applyStartAutoFill(targetNode);

      expectInputValue(targetNode, NodeInputKeyEnum.userChatInput, manualReference);
    });

    it('未从流程开始连线时不应自动填充，应提示用户问题必填', () => {
      const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, targetNode],
        edges: []
      });

      expectInputValue(targetNode, NodeInputKeyEnum.userChatInput, undefined);
      expect(
        result['ai-chat']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
    });

    it('断开流程开始连线后应回滚自动填充并重新提示用户问题必填', () => {
      const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      applyStartAutoFill(targetNode);

      const patches = collectWorkflowStartAutoFillRevertPatches({
        removedEdges: [{ id: 'e1', source: 'start', target: 'ai-chat' }],
        remainingEdges: [],
        getNodeById: (nodeId) => {
          if (nodeId === 'start') return startNode.data;
          if (nodeId === 'ai-chat') return targetNode.data;
          return undefined;
        }
      });

      expect(patches.map((patch) => patch.key)).toContain(NodeInputKeyEnum.userChatInput);
      targetNode.data.inputs = targetNode.data.inputs.map((input) => {
        const patch = patches.find((item) => item.key === input.key);
        return patch ? patch.value : input;
      });

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, targetNode],
        edges: []
      });

      expectInputValue(targetNode, NodeInputKeyEnum.userChatInput, undefined);
      expect(
        result['ai-chat']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
    });

    it('断开流程开始主链路后应回滚整条下游链的自动填充并恢复必填校验', () => {
      const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      const datasetNode = makeFreshConnectedNode('dataset-search', DatasetSearchModule);
      const classifyNode = makeFreshConnectedNode('classify', ClassifyQuestionModule);
      const toolNode = makeFreshConnectedNode('tool-call', ToolCallNode);
      const nodes = [startNodeWithFiles, aiNode, datasetNode, classifyNode, toolNode];
      const previousEdges: Edge[] = [
        { id: 'e-start-ai', source: 'start', target: 'ai-chat', type: EDGE_TYPE },
        { id: 'e-ai-dataset', source: 'ai-chat', target: 'dataset-search', type: EDGE_TYPE },
        { id: 'e-ai-classify', source: 'ai-chat', target: 'classify', type: EDGE_TYPE },
        { id: 'e-classify-tool', source: 'classify', target: 'tool-call', type: EDGE_TYPE }
      ];

      const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
        nodes,
        edges: previousEdges,
        workflowStartNode: startNodeWithFiles.data
      });

      nodes.forEach((node) => {
        node.data.inputs = node.data.inputs.map((input) => {
          const patch = autoFillPatches.find(
            (item) => item.nodeId === node.data.nodeId && item.key === input.key
          );
          return patch ? patch.value : input;
        });
      });

      const revertPatches = collectWorkflowStartAutoFillRevertPatches({
        removedEdges: [{ id: 'e-start-ai', source: 'start', target: 'ai-chat' }],
        remainingEdges: previousEdges.filter((edge) => edge.id !== 'e-start-ai'),
        getNodeById: (nodeId) => nodes.find((node) => node.data.nodeId === nodeId)?.data
      });

      expect(revertPatches.map((patch) => `${patch.nodeId}:${patch.key}`).sort()).toEqual(
        [
          `ai-chat:${NodeInputKeyEnum.fileUrlList}`,
          `ai-chat:${NodeInputKeyEnum.userChatInput}`,
          `dataset-search:${NodeInputKeyEnum.datasetSearchInput}`,
          `classify:${NodeInputKeyEnum.userChatInput}`,
          `tool-call:${NodeInputKeyEnum.fileUrlList}`,
          `tool-call:${NodeInputKeyEnum.userChatInput}`
        ].sort()
      );

      nodes.forEach((node) => {
        node.data.inputs = node.data.inputs.map((input) => {
          const patch = revertPatches.find(
            (item) => item.nodeId === node.data.nodeId && item.key === input.key
          );
          return patch ? patch.value : input;
        });
      });

      const result = checkWorkflowNodeIssues({
        nodes,
        edges: previousEdges.filter((edge) => edge.id !== 'e-start-ai')
      });

      expect(
        result['ai-chat']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
      expect(
        result['dataset-search']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.datasetSearchInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
      expect(
        result['tool-call']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
    });

    it('断开中间连线后应只回滚失去流程开始可达性的下游节点自动填充', () => {
      const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
      const datasetNode = makeFreshConnectedNode('dataset-search', DatasetSearchModule);
      const classifyNode = makeFreshConnectedNode('classify', ClassifyQuestionModule);
      const toolNode = makeFreshConnectedNode('tool-call', ToolCallNode);
      const nodes = [startNodeWithFiles, aiNode, datasetNode, classifyNode, toolNode];
      const previousEdges: Edge[] = [
        { id: 'e-start-ai', source: 'start', target: 'ai-chat', type: EDGE_TYPE },
        { id: 'e-ai-dataset', source: 'ai-chat', target: 'dataset-search', type: EDGE_TYPE },
        { id: 'e-ai-classify', source: 'ai-chat', target: 'classify', type: EDGE_TYPE },
        { id: 'e-classify-tool', source: 'classify', target: 'tool-call', type: EDGE_TYPE }
      ];

      const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
        nodes,
        edges: previousEdges,
        workflowStartNode: startNodeWithFiles.data
      });

      nodes.forEach((node) => {
        node.data.inputs = node.data.inputs.map((input) => {
          const patch = autoFillPatches.find(
            (item) => item.nodeId === node.data.nodeId && item.key === input.key
          );
          return patch ? patch.value : input;
        });
      });

      const remainingEdges = previousEdges.filter((edge) => edge.id !== 'e-ai-classify');
      const revertPatches = collectWorkflowStartAutoFillRevertPatches({
        removedEdges: [{ id: 'e-ai-classify', source: 'ai-chat', target: 'classify' }],
        remainingEdges,
        getNodeById: (nodeId) => nodes.find((node) => node.data.nodeId === nodeId)?.data
      });

      expect(revertPatches.map((patch) => `${patch.nodeId}:${patch.key}`).sort()).toEqual(
        [
          `classify:${NodeInputKeyEnum.userChatInput}`,
          `tool-call:${NodeInputKeyEnum.fileUrlList}`,
          `tool-call:${NodeInputKeyEnum.userChatInput}`
        ].sort()
      );
      expect(
        revertPatches.some(
          (patch) =>
            patch.nodeId === 'dataset-search' && patch.key === NodeInputKeyEnum.datasetSearchInput
        )
      ).toBe(false);

      nodes.forEach((node) => {
        node.data.inputs = node.data.inputs.map((input) => {
          const patch = revertPatches.find(
            (item) => item.nodeId === node.data.nodeId && item.key === input.key
          );
          return patch ? patch.value : input;
        });
      });

      const result = checkWorkflowNodeIssues({
        nodes,
        edges: remainingEdges
      });

      expect(
        result['classify']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
      expect(
        result['tool-call']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput)
          .map((issue) => issue.code) ?? []
      ).toContain('required_input_empty');
      expect(
        result['dataset-search']
          ?.filter((issue) => issue.inputKey === NodeInputKeyEnum.datasetSearchInput)
          .map((issue) => issue.code) ?? []
      ).not.toContain('required_input_empty');
    });
  });

  it.each([
    ['AI chat files', AiChatModule, NodeInputKeyEnum.fileUrlList, undefined],
    ['tool call files', ToolCallNode, NodeInputKeyEnum.fileUrlList, undefined],
    [
      'dataset search query',
      DatasetSearchModule,
      NodeInputKeyEnum.datasetSearchInput,
      [['start', NodeOutputKeyEnum.userChatInput]]
    ]
  ] as const)(
    'auto-fills %s using only available start outputs and validates without changing the value',
    (_name, template, inputKey, expectedValue) => {
      const inputs = template.inputs
        .filter((input) => input.key === inputKey)
        .map((input) => ({ ...input, value: input.value ?? input.defaultValue }));
      expect(inputs).toHaveLength(1);
      const node = makeNode('default-ref', template.flowNodeType, {
        inputs: applyWorkflowStartInputAutoFill({
          inputs,
          workflowStartNodeId: startNode.data.nodeId,
          workflowStartOutputs: startNode.data.outputs
        })
      });
      expect(node.data.inputs[0].value).toEqual(expectedValue);

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, node],
        edges: [{ id: 'e-start-default', source: 'start', target: node.id, type: EDGE_TYPE }]
      });

      expect(result[node.id]?.filter((issue) => issue.inputKey === inputKey) ?? []).toEqual([]);
      expect(node.data.inputs[0].value).toEqual(expectedValue);
    }
  );

  it.each([
    [
      'optional files with deleted outputs and nodes',
      ToolCallNode,
      NodeInputKeyEnum.fileUrlList,
      false,
      [
        ['start', NodeOutputKeyEnum.userFiles],
        ['deleted-node', NodeOutputKeyEnum.userFiles]
      ]
    ],
    [
      'required query with live and stale references',
      DatasetSearchModule,
      NodeInputKeyEnum.datasetSearchInput,
      true,
      [
        ['start', NodeOutputKeyEnum.userChatInput],
        ['start', NodeOutputKeyEnum.userFiles]
      ]
    ],
    [
      'required user question with a live reference',
      ClassifyQuestionModule,
      NodeInputKeyEnum.userChatInput,
      true,
      ['start', NodeOutputKeyEnum.userChatInput]
    ]
  ] as const)(
    'accepts imported %s without modifying the configured value',
    (_name, template, inputKey, required, value) => {
      const originalValue = structuredClone(value);
      const inputs = template.inputs
        .filter((input) => input.key === inputKey)
        .map((input) => ({ ...input, value }));
      expect(inputs).toHaveLength(1);
      expect(inputs[0].required ?? false).toBe(required);
      const node = makeNode('imported-ref', template.flowNodeType, { inputs });

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, node],
        edges: [{ id: 'e-start-imported', source: 'start', target: node.id, type: EDGE_TYPE }]
      });

      expect(result[node.id]?.filter((issue) => issue.inputKey === inputKey) ?? []).toEqual([]);
      expect(node.data.inputs[0].value).toEqual(originalValue);
    }
  );

  it('keeps configured references when the upstream node or output was deleted', () => {
    const nodeWithDeletedNodeRef = makeNode('deleted-node', FlowNodeTypeEnum.chatNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          label: '用户问题',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['deleted-node-id', NodeOutputKeyEnum.userChatInput]
        }
      ]
    });
    const nodeWithDeletedOutputRef = makeNode('deleted-output', FlowNodeTypeEnum.chatNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          label: '用户问题',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['start', 'deleted-output-id']
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, nodeWithDeletedNodeRef, nodeWithDeletedOutputRef],
      edges: [
        { id: 'e1', source: 'start', target: 'deleted-node', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'deleted-output', type: EDGE_TYPE }
      ]
    });

    for (const node of [nodeWithDeletedNodeRef, nodeWithDeletedOutputRef]) {
      expect(
        result[node.id]?.filter((issue) => issue.inputKey === NodeInputKeyEnum.userChatInput) ?? []
      ).toEqual([]);
    }
    expect(nodeWithDeletedNodeRef.data.inputs[0].value).toEqual([
      'deleted-node-id',
      NodeOutputKeyEnum.userChatInput
    ]);
    expect(nodeWithDeletedOutputRef.data.inputs[0].value).toEqual(['start', 'deleted-output-id']);
  });

  it('checks only the requested node while preserving graph context', () => {
    const requiredNode = makeNode('required', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });
    const validNode = makeNode('valid', FlowNodeTypeEnum.answerNode);

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, requiredNode, validNode],
      edges: [
        { id: 'e1', source: 'start', target: 'required', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'valid', type: EDGE_TYPE }
      ],
      nodeId: 'valid'
    });

    expect(result.required).toBeUndefined();
    expect(result.valid).toBeUndefined();
  });

  it('reports specific node configuration errors for ifElse, classify, code and extract', () => {
    const ifElseNode = makeNode('ifElse', FlowNodeTypeEnum.ifElseNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.ifElseList,
          label: 'Conditions',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [
            {
              list: [{ variable: undefined, condition: undefined, value: undefined }]
            }
          ]
        }
      ]
    });
    const classifyNode = makeNode('classify', FlowNodeTypeEnum.classifyQuestion, {
      inputs: [
        {
          key: NodeInputKeyEnum.agents,
          label: 'Agents',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: []
        }
      ]
    });
    const codeNode = makeNode('code', FlowNodeTypeEnum.code, {
      inputs: [
        {
          key: 'customVar',
          label: '',
          canEdit: true,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.any,
          value: undefined
        }
      ]
    });
    const extractNode = makeNode('extract', FlowNodeTypeEnum.contentExtract, {
      inputs: [
        {
          key: NodeInputKeyEnum.extractKeys,
          label: 'Extract keys',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: []
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, ifElseNode, classifyNode, codeNode, extractNode],
      edges: [
        { id: 'e1', source: 'start', target: 'ifElse', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'classify', type: EDGE_TYPE },
        { id: 'e3', source: 'start', target: 'code', type: EDGE_TYPE },
        { id: 'e4', source: 'start', target: 'extract', type: EDGE_TYPE }
      ]
    });

    expect(result.ifElse.map((issue) => issue.code)).toContain('if_else_incomplete');
    expect(result.classify.map((issue) => issue.code)).toContain('classify_question_empty');
    expect(result.code.map((issue) => issue.code)).toContain('code_input_incomplete');
    expect(result.extract.map((issue) => issue.code)).toContain('context_extract_empty');
  });

  it('allows Agent-generated tool inputs on code nodes', () => {
    const toolCallNode = makeNode('tool-call', FlowNodeTypeEnum.toolCall);
    const codeNode = makeNode('code-tool', FlowNodeTypeEnum.code, {
      inputs: [
        {
          key: 'query',
          label: 'Query',
          toolDescription: 'Search query',
          required: true,
          canEdit: true,
          defaultToAgentGenerated: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, toolCallNode, codeNode],
      edges: [
        { id: 'e-start-tool-call', source: 'start', target: 'tool-call', type: EDGE_TYPE },
        {
          id: 'e-tool-call-code',
          source: 'tool-call',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          target: 'code-tool',
          targetHandle: NodeOutputKeyEnum.selectedTools,
          type: EDGE_TYPE
        }
      ]
    });

    expect(result['code-tool']?.map((issue) => issue.code) ?? []).not.toContain(
      'code_input_incomplete'
    );
  });

  it('clears single node errors after configuration is fixed', () => {
    const requiredNode = makeNode('required', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: 'fixed answer'
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, requiredNode],
      edges: [{ id: 'e1', source: 'start', target: 'required', type: EDGE_TYPE }],
      nodeId: 'required'
    });

    expect(result.required).toBeUndefined();
    expect(getWorkflowCheckErrorNodeIds(result)).toEqual([]);
  });

  it('supports single node validation', () => {
    const requiredNode = makeNode('required', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });
    const formNode = makeNode('form', FlowNodeTypeEnum.formInput, {
      inputs: [
        {
          key: NodeInputKeyEnum.userInputForms,
          label: 'Form fields',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: []
        }
      ]
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, requiredNode, formNode],
      edges: [
        { id: 'e1', source: 'start', target: 'required', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'form', type: EDGE_TYPE }
      ],
      nodeId: 'required'
    });

    expect(Object.keys(result)).toEqual(['required']);
  });
});

describe('workflow check helpers', () => {
  it('orders error node ids by canvas node order for stable first-error focus', () => {
    const issueMap = {
      nodeB: [{ level: 'error' } as any],
      nodeA: [{ level: 'error' } as any]
    };

    expect(getWorkflowCheckErrorNodeIds(issueMap)).toEqual(
      expect.arrayContaining(['nodeA', 'nodeB'])
    );
    expect(getWorkflowCheckErrorNodeIds(issueMap, ['nodeA', 'nodeB', 'nodeC'])).toEqual([
      'nodeA',
      'nodeB'
    ]);
  });

  it('returns first error node by canvas order for run/publish checks', () => {
    const makeNode = (
      nodeId: string,
      flowNodeType: FlowNodeTypeEnum,
      data?: Partial<FlowNodeItemType>
    ): Node<FlowNodeItemType> =>
      ({
        id: nodeId,
        type: flowNodeType,
        position: { x: 0, y: 0 },
        data: {
          nodeId,
          flowNodeType,
          name: nodeId,
          inputs: [],
          outputs: [],
          ...data
        }
      }) as Node<FlowNodeItemType>;

    const startNode = makeNode('start', FlowNodeTypeEnum.workflowStart);
    const requiredNode = makeNode('required', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'answer',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });
    const httpNode = makeNode('http', FlowNodeTypeEnum.httpRequest468, {
      inputs: [
        {
          key: NodeInputKeyEnum.httpReqUrl,
          label: 'Request URL',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        }
      ]
    });

    const result = checkWorkflowBeforeRunOrPublish({
      nodes: [startNode, requiredNode, httpNode],
      edges: [
        { id: 'e1', source: 'start', target: 'required', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'http', type: EDGE_TYPE }
      ]
    });

    expect(result.hasError).toBe(true);
    expect(result.firstErrorNodeId).toBe('required');
    expect(result.errorNodeIds).toEqual(['required', 'http']);
  });
});

describe('checkWorkflowBeforeRunOrPublish', () => {
  const getErrorNodeIds = ({
    nodes,
    edges
  }: {
    nodes: Node<FlowNodeItemType, string | undefined>[];
    edges: Edge[];
  }) => {
    const { errorNodeIds } = checkWorkflowBeforeRunOrPublish({ nodes, edges });
    return errorNodeIds.length > 0 ? errorNodeIds : undefined;
  };

  it('should validate nodes and connections', () => {
    const nodes: Node<FlowNodeItemType>[] = [
      {
        id: 'node1',
        type: FlowNodeTypeEnum.formInput,
        data: {
          id: 'node1',
          nodeId: 'node1',
          flowNodeType: FlowNodeTypeEnum.formInput,
          name: 'Form input',
          inputs: [
            {
              key: NodeInputKeyEnum.aiChatDatasetQuote,
              label: 'Dataset quote',
              required: true,
              value: undefined,
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ];

    const edges: Edge[] = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        type: EDGE_TYPE
      }
    ];

    const result = getErrorNodeIds({ nodes, edges });
    expect(result).toEqual(['node1']);
  });

  it('should handle empty nodes and edges', () => {
    const result = getErrorNodeIds({ nodes: [], edges: [] });
    expect(result).toBeUndefined();
  });

  describe('loopRun conditional mode', () => {
    const makeLoopRunNode = (
      mode: LoopRunModeEnum | undefined,
      children: string[]
    ): Node<FlowNodeItemType> => ({
      id: 'loop1',
      type: FlowNodeTypeEnum.loopRun,
      data: {
        nodeId: 'loop1',
        flowNodeType: FlowNodeTypeEnum.loopRun,
        inputs: [
          {
            key: NodeInputKeyEnum.loopRunMode,
            value: mode,
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.select]
          } as any,
          {
            // 模板里这个字段永远 required: true + value: []，
            // 条件循环模式下不该因此被判无效
            key: NodeInputKeyEnum.loopRunInputArray,
            value: [],
            required: true,
            valueType: WorkflowIOValueTypeEnum.arrayAny,
            renderTypeList: [FlowNodeInputTypeEnum.reference]
          } as any,
          {
            key: NodeInputKeyEnum.childrenNodeIdList,
            value: children,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          } as any
        ],
        outputs: []
      } as any,
      position: { x: 0, y: 0 }
    });

    const makeChild = (id: string, flowNodeType: FlowNodeTypeEnum): Node<FlowNodeItemType> => ({
      id,
      type: flowNodeType,
      data: {
        nodeId: id,
        flowNodeType,
        inputs: [],
        outputs: []
      } as any,
      position: { x: 0, y: 0 }
    });

    const workflowStart: Node<FlowNodeItemType> = {
      id: 'ws',
      type: FlowNodeTypeEnum.workflowStart,
      data: {
        nodeId: 'ws',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        inputs: [],
        outputs: []
      } as any,
      position: { x: 0, y: 0 }
    };
    const wsToLoop: Edge = {
      id: 'e-ws-loop',
      source: 'ws',
      target: 'loop1',
      type: EDGE_TYPE
    };
    // 通用「节点必须有边」校验针对画布上的每个节点，给循环子节点挂上占位边
    const stubEdge = (nodeId: string): Edge => ({
      id: `e-stub-${nodeId}`,
      source: nodeId,
      target: '__stub__',
      type: EDGE_TYPE
    });

    it('条件循环无 loopRunBreak → 返回该 loopRun 为无效', () => {
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart)
      ];
      const result = getErrorNodeIds({
        nodes,
        edges: [wsToLoop, stubEdge('start1')]
      });
      expect(result).toEqual(['loop1']);
    });

    it('条件循环含 loopRunBreak → 有效', () => {
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1', 'break1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart),
        makeChild('break1', FlowNodeTypeEnum.loopRunBreak)
      ];
      const startToBreak: Edge = {
        id: 'e-start-break',
        source: 'start1',
        target: 'break1',
        type: EDGE_TYPE
      };
      const result = getErrorNodeIds({
        nodes,
        edges: [wsToLoop, startToBreak]
      });
      expect(result).toBeUndefined();
    });

    it('break 节点不在 childrenNodeIdList 内 → 视为无 break', () => {
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart),
        makeChild('break1', FlowNodeTypeEnum.loopRunBreak) // 属于别的 loopRun
      ];
      const result = getErrorNodeIds({
        nodes,
        edges: [wsToLoop, stubEdge('start1'), stubEdge('break1')]
      });
      expect(result).toEqual(['loop1', 'break1']);
    });

    it('数组模式不强制要求 loopRunBreak', () => {
      const loop = makeLoopRunNode(LoopRunModeEnum.array, ['start1']);
      // 数组模式下 loopRunInputArray 必填，填个非空 value 走通用校验
      const arrInput = loop.data.inputs.find((i) => i.key === NodeInputKeyEnum.loopRunInputArray)!;
      arrInput.value = [[VARIABLE_NODE_ID, 'bar']];
      const nodes = [workflowStart, loop, makeChild('start1', FlowNodeTypeEnum.loopRunStart)];
      const result = getErrorNodeIds({
        nodes,
        edges: [wsToLoop, stubEdge('start1')]
      });
      expect(result).toBeUndefined();
    });

    it('条件循环下 loopRunInputArray 必填标记被忽略', () => {
      // 模板静态定义里 loopRunInputArray 永远 required: true + value: []；
      // 条件循环模式下这个字段被 UI 隐藏，不应该因此拦校验。
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1', 'break1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart),
        makeChild('break1', FlowNodeTypeEnum.loopRunBreak)
      ];
      const startToBreak: Edge = {
        id: 'e-start-break-2',
        source: 'start1',
        target: 'break1',
        type: EDGE_TYPE
      };
      const result = getErrorNodeIds({
        nodes,
        edges: [wsToLoop, startToBreak]
      });
      expect(result).toBeUndefined();
    });
  });
  describe('variableUpdate node', () => {
    const makeVarUpdateNode = (updateList: any[]): Node<FlowNodeItemType> =>
      ({
        id: 'u1',
        type: FlowNodeTypeEnum.variableUpdate,
        position: { x: 0, y: 0 },
        data: {
          nodeId: 'u1',
          flowNodeType: FlowNodeTypeEnum.variableUpdate,
          name: 'update',
          avatar: '',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              valueType: WorkflowIOValueTypeEnum.any,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: updateList
            }
          ],
          outputs: [],
          version: '1',
          intro: ''
        } as any
      }) as any;

    const startNode: Node<FlowNodeItemType> = {
      id: 's1',
      type: FlowNodeTypeEnum.workflowStart,
      position: { x: 0, y: 0 },
      data: {
        nodeId: 's1',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'start',
        avatar: '',
        inputs: [],
        outputs: [],
        version: '1',
        intro: ''
      } as any
    };

    const connectedEdges: Edge[] = [{ id: 'e1', source: 's1', target: 'u1', type: EDGE_TYPE }];

    const run = (updateList: any[]) =>
      getErrorNodeIds({
        nodes: [startNode, makeVarUpdateNode(updateList)],
        edges: connectedEdges
      });

    it('flags empty updateList', () => {
      expect(run([])).toEqual(['u1']);
    });

    it('flags row with empty variable', () => {
      expect(
        run([
          {
            variable: ['', ''],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toEqual(['u1']);
    });

    it('flags input row with empty value', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: ['', ''],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toEqual(['u1']);
    });

    it('passes when boolean input has no value (booleanMode decides)', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.boolean,
            booleanMode: 'true',
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toBeUndefined();
    });

    it('passes when array clear mode has no value', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.arrayString,
            arrayMode: 'clear',
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toBeUndefined();
    });

    it('flags reference row with incomplete value', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: ['n2', ''],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toEqual(['u1']);
    });

    it('flags reference array row with empty array', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: [],
            valueType: WorkflowIOValueTypeEnum.arrayString,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toEqual(['u1']);
    });

    // item.valueType 是写入快照，不与目标变量同步——校验只看 value 形态
    it('passes reference array form regardless of stale valueType', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: [[VARIABLE_NODE_ID, 'bar']],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toBeUndefined();
    });

    // 历史数据：array reference 旧版本存为单引用 [refNode, refOutputId]
    it('passes legacy single-reference form for array valueType', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: [VARIABLE_NODE_ID, 'bar'],
            valueType: WorkflowIOValueTypeEnum.arrayString,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toBeUndefined();
    });

    it('passes a fully filled input row', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toBeUndefined();
    });

    it('flags variable pointing to a non-existent node id', () => {
      expect(
        run([
          {
            variable: ['ghost-node', 'out1'],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toEqual(['u1']);
    });
  });
});
