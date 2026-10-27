import {
  WorkflowCheckIssueCodeEnum,
  WorkflowDiagnosticCodeEnum
} from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, it, expect, vi } from 'vitest';
import * as workflowValidation from '@fastgpt/workflow-core/validation';
import * as workflowModelValidation from '@fastgpt/workflow-core/validation/model';
import { createWorkflowCheckDocument } from '@/web/core/workflow/check/document';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import commonZh from '@fastgpt/web/i18n/zh-CN/common.json';
import type { TFunction } from 'next-i18next';
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
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  checkWorkflowNodeIssues,
  checkWorkflowBeforeRunOrPublish,
  getWorkflowCheckErrorNodeIds
} from '@/web/core/workflow/check/check';
import { getToolErrorMessage } from '@/web/core/workflow/check/message';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { AssignedAnswerModule } from '@fastgpt/global/core/workflow/template/system/assignedAnswer';
import { DatasetConcatModule } from '@fastgpt/global/core/workflow/template/system/datasetConcat';
import { uiWorkflow2StoreWorkflow } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { ContextExtractModule } from '@fastgpt/global/core/workflow/template/system/contextExtract';
import { VariableUpdateNode } from '@fastgpt/global/core/workflow/template/system/variableUpdate';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { createEmptyTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';

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
        id: flowNodeType,
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

  it('accepts the blank tag-filter row shown by the dataset-search editor under both checker policies', () => {
    const search = makeNode('search', FlowNodeTypeEnum.datasetSearchNode, {
      ...DatasetSearchModule,
      inputs: DatasetSearchModule.inputs.map((input) => ({
        ...input,
        value:
          input.key === NodeInputKeyEnum.collectionFilterMatch
            ? createEmptyTagFilterValue()
            : input.key === NodeInputKeyEnum.datasetSelectList
              ? [{ datasetId: 'dataset-id' }]
              : input.key === NodeInputKeyEnum.datasetSearchInput
                ? [['start', NodeOutputKeyEnum.userChatInput]]
                : input.value
      }))
    });
    const graph = {
      nodes: [startNode, search],
      edges: [{ id: 'e1', source: 'start', target: 'search' }]
    };
    const before = structuredClone(search.data.inputs);
    const { document } = createWorkflowCheckDocument(graph);

    expect(
      workflowValidation.validateWorkflow(document, { invalidReferencePolicy: 'error' })
    ).toEqual([]);
    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: false,
      diagnostics: [],
      issueMap: {}
    });
    expect(search.data.inputs).toEqual(before);
  });

  it('accepts legacy start inputs after loading while preserving dataset search checks', () => {
    const source = storeNode2FlowNode({
      item: {
        ...startNode.data,
        inputs: [
          {
            ...WorkflowStart.inputs[0],
            selectedType: FlowNodeInputTypeEnum.reference,
            value: ['', '']
          }
        ]
      },
      t: ((key: string) => key) as TFunction
    });
    const search = makeNode('search', FlowNodeTypeEnum.datasetSearchNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          label: 'Dataset',
          valueType: WorkflowIOValueTypeEnum.selectDataset,
          required: true,
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          value: [{ datasetId: 'dataset-id' }]
        },
        {
          key: NodeInputKeyEnum.datasetSearchInput,
          label: 'Search query',
          valueType: WorkflowIOValueTypeEnum.arrayString,
          required: true,
          selectedType: FlowNodeInputTypeEnum.reference,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: [[source.id, NodeOutputKeyEnum.userChatInput]]
        }
      ]
    });
    const graph = {
      nodes: [source, search],
      edges: [{ id: 'edge', source: source.id, target: search.id }]
    };
    const before = structuredClone(source.data.inputs);

    expect(checkWorkflowNodeIssues(graph)).toEqual({});
    expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);

    search.data.inputs[1].value = [['deleted', NodeOutputKeyEnum.userChatInput]];
    const invalidReference = checkWorkflowBeforeRunOrPublish(graph);
    expect(invalidReference.hasError).toBe(true);
    expect(invalidReference.firstErrorNodeId).toBe(search.id);
    expect(invalidReference.issueMap.search).toEqual([
      expect.objectContaining({
        code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
        inputKey: NodeInputKeyEnum.datasetSearchInput
      })
    ]);

    search.data.inputs[1].value = [[source.id, NodeOutputKeyEnum.userChatInput]];
    search.data.inputs[0].value = [];
    const missingDataset = checkWorkflowBeforeRunOrPublish(graph);
    expect(missingDataset.hasError).toBe(true);
    expect(missingDataset.issueMap.search).toEqual([
      expect.objectContaining({
        code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
        inputKey: NodeInputKeyEnum.datasetSelectList
      })
    ]);
    expect(source.data.inputs).toEqual(before);
  });

  it('runs saved HTTP, extraction, boolean-update and form configurations through the shared check', () => {
    const http = makeNode('http', FlowNodeTypeEnum.httpRequest468, {
      ...HttpNode468,
      inputs: HttpNode468.inputs.map((input) => ({
        ...input,
        value:
          input.key === NodeInputKeyEnum.httpReqUrl
            ? 'https://example.com/api'
            : [
                  NodeInputKeyEnum.httpHeaders,
                  NodeInputKeyEnum.httpParams,
                  NodeInputKeyEnum.httpFormBody
                ].includes(input.key as NodeInputKeyEnum)
              ? [{ key: 'name', type: 'string', value: 'Alice' }]
              : input.value
      }))
    });
    const extract = makeNode('extract', FlowNodeTypeEnum.contentExtract, {
      ...ContextExtractModule,
      inputs: ContextExtractModule.inputs.map((input) => ({
        ...input,
        selectedType:
          input.key === NodeInputKeyEnum.contextExtractInput
            ? FlowNodeInputTypeEnum.textarea
            : input.selectedType,
        value:
          input.key === NodeInputKeyEnum.aiModelId
            ? 'llm-id'
            : input.key === NodeInputKeyEnum.contextExtractInput
              ? 'Status is open'
              : input.key === NodeInputKeyEnum.extractKeys
                ? [
                    {
                      key: 'status',
                      desc: 'Status',
                      valueType: WorkflowIOValueTypeEnum.string,
                      required: false,
                      defaultValue: 'open',
                      enum: 'open\nclosed'
                    }
                  ]
                : input.value
      }))
    });
    const update = makeNode('update', FlowNodeTypeEnum.variableUpdate, {
      ...VariableUpdateNode,
      inputs: [
        {
          ...VariableUpdateNode.inputs[0],
          value: [
            {
              variable: ['extract', NodeOutputKeyEnum.success],
              renderType: FlowNodeInputTypeEnum.input,
              valueType: WorkflowIOValueTypeEnum.boolean,
              booleanMode: 'false',
              value: ['', false]
            }
          ]
        }
      ]
    });
    const form = makeNode('form', FlowNodeTypeEnum.formInput, {
      ...FormInputNode,
      inputs: [
        {
          ...FormInputNode.inputs[1],
          value: [
            {
              type: FlowNodeInputTypeEnum.input,
              key: 'name',
              label: 'Name',
              required: false,
              valueType: WorkflowIOValueTypeEnum.string,
              defaultValue: 'Alice'
            }
          ]
        }
      ],
      outputs: [
        {
          id: 'name',
          key: 'name',
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    });
    const nodes = [startNode, http, extract, update, form];
    const edges = nodes
      .slice(1)
      .map((node, index) => ({ id: `edge-${index}`, source: nodes[index].id, target: node.id }));
    const result = checkWorkflowBeforeRunOrPublish({ nodes, edges });
    expect(result.errorMessages).toEqual([]);
    expect(result.hasError).toBe(false);
  });

  it('accepts sparse Agent tool and Skill snapshots and preserves explicit resource errors', () => {
    const values = new Map<string, unknown>([
      [NodeInputKeyEnum.aiModelId, 'llm-id'],
      [NodeInputKeyEnum.selectedTools, [{ id: 'systemTool-search', config: {} }]],
      [NodeInputKeyEnum.skills, [{ skillId: 'skill-id' }]],
      [NodeInputKeyEnum.datasetSelectList, [{ datasetId: 'dataset-id' }]]
    ]);
    const agent = makeNode('agent', FlowNodeTypeEnum.agent, {
      inputs: AgentNode.inputs
        .filter((input) => values.has(input.key))
        .map((input) => ({ ...input, value: values.get(input.key) }))
    });
    const graph = {
      nodes: [startNode, agent],
      edges: [{ id: 'edge', source: 'start', target: 'agent' }]
    };
    expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);

    agent.data.inputs.find((input) => input.key === NodeInputKeyEnum.skills)!.value = [
      { skillId: 'skill-id', error: WorkflowCheckIssueCodeEnum.resourceNoPermission }
    ];
    expect(checkWorkflowBeforeRunOrPublish(graph).issueMap.agent).toEqual([
      expect.objectContaining({
        code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
        inputKey: NodeInputKeyEnum.skills
      })
    ]);
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
    expect(result.required.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.requiredInputEmpty
    );
    expect(result.form.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.formInputEmpty
    );
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
      expect.arrayContaining([
        WorkflowCheckIssueCodeEnum.userSelectValueEmpty,
        WorkflowCheckIssueCodeEnum.requiredInputEmpty
      ])
    );
  });

  it('reports empty or all-stale reference issues for userSelect and formInput dynamic options without duplicate required errors', () => {
    const emptySelect = makeNode('select-empty', FlowNodeTypeEnum.userSelect, {
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.any,
          required: true,
          value: [['deleted-node', 'out']]
        }
      ]
    });
    const formNode = makeNode('form-ref', FlowNodeTypeEnum.formInput, {
      inputs: [
        {
          key: NodeInputKeyEnum.userInputForms,
          label: 'Form fields',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [
            {
              key: 'city',
              label: 'City',
              type: FlowNodeInputTypeEnum.select,
              valueType: WorkflowIOValueTypeEnum.string,
              value: '',
              required: false,
              listInputType: FlowNodeInputTypeEnum.reference,
              listReference: [['deleted-node', 'out']]
            },
            {
              key: 'tags',
              label: 'Tags',
              type: FlowNodeInputTypeEnum.multipleSelect,
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: [],
              required: false,
              listInputType: FlowNodeInputTypeEnum.reference,
              listReference: []
            }
          ]
        }
      ],
      outputs: ['city', 'tags'].map((key) => ({
        id: key,
        key,
        label: key,
        type: FlowNodeOutputTypeEnum.static
      }))
    });

    const issues = checkWorkflowNodeIssues({
      nodes: [startNode, emptySelect, formNode],
      t: ((key: string, params?: { inputName?: string }) =>
        `${key}:${params?.inputName ?? ''}`) as TFunction,
      edges: [
        { id: 'e1', source: 'start', target: 'select-empty', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'form-ref', type: EDGE_TYPE }
      ]
    });

    expect(
      issues['select-empty']
        ?.filter((i) => i.inputKey === NodeInputKeyEnum.userSelectOptions)
        .map((i) => i.code)
    ).toEqual([WorkflowCheckIssueCodeEnum.userSelectEmpty]);
    expect(
      issues['form-ref']
        ?.filter((i) => i.inputKey === NodeInputKeyEnum.userInputForms)
        .map((i) => i.code)
    ).toEqual([
      WorkflowCheckIssueCodeEnum.requiredInputEmpty,
      WorkflowCheckIssueCodeEnum.requiredInputEmpty
    ]);
    expect(issues['form-ref'].map((issue) => issue.message)).toEqual([
      expect.stringContaining('City'),
      expect.stringContaining('Tags')
    ]);
  });

  it('flags excluded variable types (e.g. arrayBoolean) as empty dynamic options in static check', () => {
    const source = makeNode('source', FlowNodeTypeEnum.workflowStart, {
      outputs: [
        {
          id: 'boolArr',
          key: 'boolArr',
          label: 'boolArr',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.arrayBoolean
        }
      ]
    });
    const select = makeNode('select', FlowNodeTypeEnum.userSelect, {
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.any,
          value: [['source', 'boolArr']]
        }
      ]
    });

    const issues = checkWorkflowNodeIssues({
      nodes: [startNode, source, select],
      edges: [{ id: 'e1', source: 'source', target: 'select', type: EDGE_TYPE }]
    });

    expect(
      issues.select
        ?.filter((i) => i.inputKey === NodeInputKeyEnum.userSelectOptions)
        .map((i) => i.code)
    ).toEqual([WorkflowCheckIssueCodeEnum.userSelectEmpty]);
  });

  it('reports nodes without upstream connections', () => {
    const node = makeNode('orphan', FlowNodeTypeEnum.answerNode);

    const result = checkWorkflowNodeIssues({ nodes: [startNode, node], edges: [] });

    expect(result.orphan.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.noUpstream
    );
  });

  it('treats optional invalid references as unset without clearing the canvas value', () => {
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

  it('does not block run or publish for invalid global and node expressions in text', () => {
    const node = makeNode('answer', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'Answer',
          valueType: WorkflowIOValueTypeEnum.string,
          required: true,
          selectedType: FlowNodeInputTypeEnum.textarea,
          renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
          value: '{{deletedGlobal}} {{$deletedNode.output$}} {{$start.deletedOutput$}}'
        }
      ]
    });
    const graph = {
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'answer' }]
    };
    const before = structuredClone(node.data.inputs);

    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: false,
      diagnostics: [],
      issueMap: {}
    });
    expect(node.data.inputs).toEqual(before);
  });

  it('uses effective references for client checks while AI validation retains the original errors', () => {
    const node = makeNode('ref', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.aiChatDatasetQuote,
          label: '知识库引用',
          valueType: WorkflowIOValueTypeEnum.datasetQuote,
          renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
          value: ['deleted', 'quoteQA']
        },
        {
          key: NodeInputKeyEnum.fileUrlList,
          label: '文件链接',
          valueType: WorkflowIOValueTypeEnum.arrayString,
          required: true,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: [
            ['start', NodeOutputKeyEnum.userChatInput],
            ['deleted', 'files']
          ]
        }
      ]
    });
    const graph = {
      nodes: [startNode, node],
      edges: [{ id: 'e1', source: 'start', target: 'ref' }]
    };
    const before = structuredClone(node.data.inputs);
    const { document } = createWorkflowCheckDocument(graph);
    expect(
      workflowValidation
        .validateWorkflow(document, { invalidReferencePolicy: 'error' })
        .map((issue) => issue.code)
    ).toEqual([
      WorkflowDiagnosticCodeEnum.referenceOutputNotFound,
      WorkflowDiagnosticCodeEnum.referenceOutputNotFound
    ]);
    expect(checkWorkflowNodeIssues(graph)).toEqual({});
    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: false,
      diagnostics: []
    });
    expect(node.data.inputs).toEqual(before);
  });

  it.each([
    { required: false, resourceValue: ['deleted', 'datasets'] },
    {
      required: true,
      resourceValue: [{ datasetId: 'old', error: WorkflowCheckIssueCodeEnum.resourceNoPermission }]
    }
  ])(
    'uses the same empty-reference snapshot for model and resource requirements (model required: $required)',
    ({ required, resourceValue }) => {
      const model = makeNode('model', FlowNodeTypeEnum.chatNode, {
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            label: '模型',
            required,
            valueType: WorkflowIOValueTypeEnum.string,
            selectedType: FlowNodeInputTypeEnum.reference,
            renderTypeList: [
              FlowNodeInputTypeEnum.settingLLMModel,
              FlowNodeInputTypeEnum.reference
            ],
            value: ['deleted', 'model']
          }
        ]
      });
      const dataset = makeNode('dataset', FlowNodeTypeEnum.datasetSearchNode, {
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            label: '知识库',
            required: true,
            valueType: WorkflowIOValueTypeEnum.selectDataset,
            selectedType: FlowNodeInputTypeEnum.reference,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            value: resourceValue
          }
        ]
      });
      const result = checkWorkflowBeforeRunOrPublish({
        nodes: [startNode, model, dataset],
        edges: [
          { id: 'model', source: 'start', target: 'model' },
          { id: 'dataset', source: 'start', target: 'dataset' }
        ]
      });
      expect(result.hasError).toBe(true);
      expect(result.issueMap.model).toEqual([
        expect.objectContaining({
          code: WorkflowCheckIssueCodeEnum.modelRequired,
          inputKey: NodeInputKeyEnum.aiModelId
        })
      ]);
      expect(result.issueMap.dataset).toEqual([
        expect.objectContaining({
          code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
          inputKey: NodeInputKeyEnum.datasetSelectList
        })
      ]);
      expect(model.data.inputs[0].value).toEqual(['deleted', 'model']);
      expect(dataset.data.inputs[0].value).toEqual(resourceValue);
    }
  );

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

    expect(result.tool.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.toolLoadFailed
    );
    expect(result.tool[0]?.message).toBe('common:core.workflow.check.tool_load_failed');
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

    expect(result.tool.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.resourceNoPermission
    );
    expect(result.tool[0]?.message).toBe('common:core.workflow.check.resource_no_permission');
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

    expect(result.tool.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.resourceNoPermission
    );
    expect(result.tool[0]?.message).toBe('common:core.workflow.check.resource_no_permission');
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

    expect(result.tool.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.toolMissing
    );
  });

  it('uses fixed design copy for mapped issue codes', () => {
    const disconnectedNode = makeNode('disconnected', FlowNodeTypeEnum.textEditor);
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

    expect(unreachableResult.unreachable[0]?.code).toBe(
      WorkflowCheckIssueCodeEnum.unreachableFromStart
    );
    expect(unreachableResult.unreachable[0]?.message).toBe(
      'common:core.workflow.check.no_upstream'
    );
    expect(requiredResult.required[0]?.message).toBe(
      'common:core.workflow.check.required_input_empty'
    );
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

    expect(result['non-latest']?.map((issue) => issue.code) ?? []).not.toContain(
      WorkflowCheckIssueCodeEnum.toolInactive
    );
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

    expect(result['activated-tool']?.map((issue) => issue.code)).toEqual([
      WorkflowCheckIssueCodeEnum.requiredInputEmpty
    ]);
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
      WorkflowCheckIssueCodeEnum.requiredInputEmpty
    );
  });

  it.each([false, true])(
    'blocks an inactive tool before running or publishing (mounted: %s)',
    (isMounted) => {
      const toolCallNode = makeNode('tool-call', FlowNodeTypeEnum.toolCall, {
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            label: 'Model',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
            value: 'llm-id'
          }
        ]
      });
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

      const graph = isMounted
        ? {
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
          }
        : {
            nodes: [startNode, inactiveToolNode],
            edges: [
              { id: 'e-start-tool', source: 'start', target: 'inactive-tool', type: EDGE_TYPE }
            ]
          };
      const result = checkWorkflowBeforeRunOrPublish(graph);

      expect(result.hasError).toBe(true);
      expect(result.firstErrorNodeId).toBe('inactive-tool');
      expect(result.issueMap['inactive-tool']).toEqual([
        expect.objectContaining({
          code: WorkflowCheckIssueCodeEnum.toolWaitingConfig,
          inputKey: NodeInputKeyEnum.systemInputConfig,
          level: 'error'
        })
      ]);
      expect(result.errorMessages).toEqual([
        '「inactive-tool」common:core.workflow.check.tool_inactive'
      ]);
      expect(result.diagnostics).toEqual([]);
    }
  );

  it.each([
    { name: 'system secret', config: { value: { type: SystemToolSecretInputTypeEnum.system } } },
    {
      name: 'manual secret',
      config: {
        value: {
          type: SystemToolSecretInputTypeEnum.manual,
          value: { apiKey: { secret: 'encrypted' } }
        }
      }
    },
    {
      name: 'configured default',
      config: { defaultValue: { type: SystemToolSecretInputTypeEnum.system } }
    },
    { name: 'no secret required', config: undefined }
  ])('allows a linear tool with $name', ({ config }) => {
    const node = makeNode('tool', FlowNodeTypeEnum.tool, {
      inputs: config
        ? [
            {
              key: NodeInputKeyEnum.systemInputConfig,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              ...config
            }
          ]
        : []
    });
    const result = checkWorkflowBeforeRunOrPublish({
      nodes: [startNode, node],
      edges: [{ id: 'e-start-tool', source: 'start', target: 'tool', type: EDGE_TYPE }]
    });

    expect(result.hasError).toBe(false);
    expect(result.issueMap).toEqual({});
  });

  it('reports offline tools', () => {
    const offlineNode = makeNode('offline', FlowNodeTypeEnum.appModule, {
      status: PluginStatusEnum.Offline
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, offlineNode],
      edges: [{ id: 'e1', source: 'start', target: 'offline', type: EDGE_TYPE }]
    });

    expect(result.offline.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.toolOffline
    );
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

    expect(result.http.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.httpUrlEmpty
    );
    expect(result.toolCall.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.toolCallEmpty
    );
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
            { datasetId: 'd2', name: 'gone', error: WorkflowCheckIssueCodeEnum.resourceMissing }
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
          value: [
            { skillId: 's2', name: 'gone', error: WorkflowCheckIssueCodeEnum.resourceMissing }
          ]
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

    expect(result.dataset.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.resourceMissing
    );
    expect(result.skill.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.resourceMissing
    );
  });

  it('focuses resources with an explicit ACL denial marker', () => {
    const datasetNode = makeNode('dataset', FlowNodeTypeEnum.answerNode, {
      inputs: [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          label: '知识库',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [
            {
              datasetId: 'd1',
              name: 'no-perm',
              error: WorkflowCheckIssueCodeEnum.resourceNoPermission
            }
          ]
        }
      ]
    });
    const toolNode = makeNode('tool', FlowNodeTypeEnum.appModule, {
      pluginData: { error: WorkflowCheckIssueCodeEnum.resourceNoPermission } as any
    });

    const result = checkWorkflowNodeIssues({
      nodes: [startNode, datasetNode, toolNode],
      edges: [
        { id: 'e1', source: 'start', target: 'dataset', type: EDGE_TYPE },
        { id: 'e2', source: 'start', target: 'tool', type: EDGE_TYPE }
      ]
    });

    expect((result.dataset ?? []).map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.resourceNoPermission
    );
    expect((result.tool ?? []).map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.resourceNoPermission
    );
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
              {
                datasetId: 'd1',
                name: 'no-perm',
                error: WorkflowCheckIssueCodeEnum.resourceNoPermission
              },
              { datasetId: 'd2', name: 'gone', error: WorkflowCheckIssueCodeEnum.resourceMissing }
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
          code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
          inputKey: NodeInputKeyEnum.datasetParams
        }),
        expect.objectContaining({
          code: WorkflowCheckIssueCodeEnum.resourceMissing,
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

    it('reports required_input_empty for empty required template inputs and clears when filled', () => {
      const answerNode = makeNodeWithTemplateInputs(
        'answer',
        FlowNodeTypeEnum.answerNode,
        AssignedAnswerModule.inputs
      );
      const concatNode = makeNodeWithTemplateInputs(
        'concat',
        FlowNodeTypeEnum.datasetConcatNode,
        DatasetConcatModule.inputs
      );
      const httpNode = makeNodeWithTemplateInputs(
        'http',
        FlowNodeTypeEnum.httpRequest468,
        HttpNode468.inputs
      );

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, answerNode, concatNode, httpNode],
        edges: [
          { id: 'e1', source: 'start', target: 'answer', type: EDGE_TYPE },
          { id: 'e2', source: 'start', target: 'concat', type: EDGE_TYPE },
          { id: 'e3', source: 'start', target: 'http', type: EDGE_TYPE }
        ]
      });

      expect(result.answer?.map((i) => i.code)).toContain(
        WorkflowCheckIssueCodeEnum.requiredInputEmpty
      );
      expect(result.concat?.map((i) => i.code)).toContain(
        WorkflowCheckIssueCodeEnum.requiredInputEmpty
      );
      expect(result.http?.map((i) => i.code)).toContain(WorkflowCheckIssueCodeEnum.httpUrlEmpty);

      const filledResult = checkWorkflowNodeIssues({
        nodes: [
          startNode,
          makeNodeWithTemplateInputs('answer-ok', FlowNodeTypeEnum.answerNode, [
            { ...AssignedAnswerModule.inputs[0], value: 'hello' }
          ]),
          makeNodeWithTemplateInputs(
            'http-ok',
            FlowNodeTypeEnum.httpRequest468,
            HttpNode468.inputs.map((input) =>
              input.key === NodeInputKeyEnum.httpReqUrl
                ? { ...input, value: 'https://example.com/api' }
                : input
            )
          )
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'answer-ok', type: EDGE_TYPE },
          { id: 'e2', source: 'start', target: 'http-ok', type: EDGE_TYPE }
        ]
      });

      expect(filledResult['answer-ok']?.map((i) => i.code) ?? []).not.toContain(
        WorkflowCheckIssueCodeEnum.requiredInputEmpty
      );
      expect(filledResult['http-ok']?.map((i) => i.code) ?? []).not.toContain(
        WorkflowCheckIssueCodeEnum.httpUrlEmpty
      );
    });

    it('loopStart hidden required any does not false-positive required_input_empty', () => {
      const node = makeNodeWithTemplateInputs(
        'loop-start',
        FlowNodeTypeEnum.nestedStart,
        LoopStartNode.inputs
      );
      const result = checkWorkflowNodeIssues({
        nodes: [startNode, node],
        edges: [{ id: 'e-start', source: 'start', target: 'loop-start', type: EDGE_TYPE }]
      });
      expect(result['loop-start']?.map((i) => i.code) ?? []).not.toContain(
        WorkflowCheckIssueCodeEnum.requiredInputEmpty
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
      const result = checkWorkflowNodeIssues({
        nodes: [startNode, node],
        edges: [{ id: 'e-start', source: 'start', target: 'hidden-selected', type: EDGE_TYPE }]
      });
      expect(result['hidden-selected']?.map((i) => i.code) ?? []).not.toContain(
        WorkflowCheckIssueCodeEnum.requiredInputEmpty
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
      ).toEqual([WorkflowCheckIssueCodeEnum.requiredInputEmpty]);
    });
  });

  it('reports required inputs as missing when the upstream node or output was deleted without changing the canvas', () => {
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
      ).toEqual([expect.objectContaining({ code: WorkflowCheckIssueCodeEnum.requiredInputEmpty })]);
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

    expect(result.ifElse.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.ifElseIncomplete
    );
    expect(result.classify.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.classifyQuestionEmpty
    );
    expect(result.code.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.codeInputIncomplete
    );
    expect(result.extract.map((issue) => issue.code)).toContain(
      WorkflowCheckIssueCodeEnum.contextExtractEmpty
    );
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
      WorkflowCheckIssueCodeEnum.codeInputIncomplete
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
          id: flowNodeType,
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
    /** 使用实际父子关系与连线，避免旧占位边掩盖 Core 的容器或悬空连线错误。 */
    const makeGraph = (mode: LoopRunModeEnum, withBreak = false) => {
      const child = (id: string, flowNodeType: FlowNodeTypeEnum): Node<FlowNodeItemType> =>
        ({
          id,
          position: { x: 0, y: 0 },
          data: {
            id: flowNodeType,
            nodeId: id,
            name: id,
            parentNodeId: 'loop1',
            flowNodeType,
            inputs: [],
            outputs: []
          }
        }) as Node<FlowNodeItemType>;
      const children = [
        child('start1', FlowNodeTypeEnum.loopRunStart),
        child('body1', FlowNodeTypeEnum.textEditor),
        ...(withBreak ? [child('break1', FlowNodeTypeEnum.loopRunBreak)] : [])
      ];
      const nodes: Node<FlowNodeItemType>[] = [
        {
          id: 'ws',
          position: { x: 0, y: 0 },
          data: {
            id: FlowNodeTypeEnum.workflowStart,
            nodeId: 'ws',
            name: 'Start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            inputs: [],
            outputs: [
              {
                id: 'items',
                key: 'items',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.arrayAny
              }
            ]
          }
        } as Node<FlowNodeItemType>,
        {
          id: 'loop1',
          position: { x: 0, y: 0 },
          data: {
            id: FlowNodeTypeEnum.loopRun,
            nodeId: 'loop1',
            name: 'Loop',
            flowNodeType: FlowNodeTypeEnum.loopRun,
            inputs: [
              {
                key: NodeInputKeyEnum.loopRunMode,
                label: 'Mode',
                renderTypeList: [FlowNodeInputTypeEnum.select],
                value: mode
              },
              {
                key: NodeInputKeyEnum.loopRunInputArray,
                label: 'Array',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                required: true,
                valueType: WorkflowIOValueTypeEnum.arrayAny,
                value: mode === LoopRunModeEnum.array ? [['ws', 'items']] : []
              },
              {
                key: NodeInputKeyEnum.childrenNodeIdList,
                label: 'Children',
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                value: children.map(({ id }) => id)
              }
            ],
            outputs: []
          }
        } as Node<FlowNodeItemType>,
        ...children
      ];
      const edges: Edge[] = [
        { id: 'outer', source: 'ws', target: 'loop1' },
        { id: 'inner', source: 'start1', target: 'body1' },
        ...(withBreak ? [{ id: 'break', source: 'body1', target: 'break1' }] : [])
      ];
      return { nodes, edges };
    };

    it('条件循环无 loopRunBreak → 返回该 loopRun 为无效', () => {
      expect(getErrorNodeIds(makeGraph(LoopRunModeEnum.conditional))).toEqual(['loop1']);
    });

    it('rejects an out-of-sync child list even when the break has a valid parent', () => {
      const graph = makeGraph(LoopRunModeEnum.conditional, true);
      graph.nodes[1].data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.childrenNodeIdList
      )!.value = ['start1', 'body1'];
      const result = checkWorkflowBeforeRunOrPublish(graph);
      expect(result.errorNodeIds).toEqual(['loop1']);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.containerChildrenOutOfSync })
      );
    });

    it('数组模式不强制要求 loopRunBreak', () => {
      expect(getErrorNodeIds(makeGraph(LoopRunModeEnum.array))).toBeUndefined();
    });

    it('条件循环含 Break 时忽略隐藏数组输入的必填标记', () => {
      const graph = makeGraph(LoopRunModeEnum.conditional, true);
      expect(
        graph.nodes[1].data.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunInputArray)
          ?.value
      ).toEqual([]);
      expect(getErrorNodeIds(graph)).toBeUndefined();
    });
  });
  describe('variableUpdate node', () => {
    const makeVarUpdateNode = (updateList: any[]): Node<FlowNodeItemType> =>
      ({
        id: 'u1',
        type: FlowNodeTypeEnum.variableUpdate,
        position: { x: 0, y: 0 },
        data: {
          id: FlowNodeTypeEnum.variableUpdate,
          nodeId: 'u1',
          flowNodeType: FlowNodeTypeEnum.variableUpdate,
          name: 'update',
          avatar: '',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              label: 'Variable updates',
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
        id: FlowNodeTypeEnum.workflowStart,
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

  describe('workflowStart isolation check', () => {
    it.each([
      {
        nodeId: 'start-1',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        issue: WorkflowCheckIssueCodeEnum.isolatedNode
      },
      {
        nodeId: 'node-2',
        flowNodeType: FlowNodeTypeEnum.textEditor,
        issue: WorkflowCheckIssueCodeEnum.noUpstream
      }
    ])('keeps $flowNodeType isolation visible as $issue', ({ nodeId, flowNodeType, issue }) => {
      const node: Node<FlowNodeItemType> = {
        id: nodeId,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          id: flowNodeType,
          nodeId,
          name: nodeId,
          flowNodeType,
          avatar: 'avatar',
          inputs: [],
          outputs: []
        }
      };
      const result = checkWorkflowBeforeRunOrPublish({ nodes: [node], edges: [] });

      expect(result.hasError).toBe(true);
      expect(result.firstErrorNodeId).toBe(nodeId);
      expect(result.issueMap[nodeId]?.some((item) => item.code === issue)).toBe(true);
    });
  });

  describe('getToolErrorMessage and non-system input label boundary', () => {
    const mockT = ((key: string) => `translated:${key}`) as unknown as Parameters<
      typeof getToolErrorMessage
    >[0]['t'];

    it('translates offline, permission, missing, appErrList, and fallback tool errors via t', () => {
      expect(getToolErrorMessage({ status: PluginStatusEnum.Offline, t: mockT })).toBe(
        'translated:common:core.workflow.check.tool_missing'
      );
      expect(getToolErrorMessage({ error: PluginErrEnum.unAuth, t: mockT })).toBe(
        'translated:common:core.workflow.check.resource_no_permission'
      );
      expect(getToolErrorMessage({ error: PluginErrEnum.unExist, t: mockT })).toBe(
        'translated:common:core.workflow.check.tool_missing'
      );
      expect(getToolErrorMessage({ error: AppErrEnum.invalidAppType, t: mockT })).toBe(
        'translated:common:code_error.app_error.invalid_app_type'
      );
      expect(getToolErrorMessage({ error: '   ', t: mockT })).toBe(
        'translated:common:core.workflow.check.tool_load_failed'
      );
      expect(getToolErrorMessage({ error: 'custom failure', t: mockT })).toBe('custom failure');
      expect(getToolErrorMessage({ error: undefined, t: mockT })).toBeUndefined();
    });

    it('does not treat a non-system tool input named model with empty label as a system model slot', () => {
      const startNode: Node<FlowNodeItemType> = {
        id: 'start',
        type: FlowNodeTypeEnum.workflowStart,
        position: { x: 0, y: 0 },
        data: {
          id: FlowNodeTypeEnum.workflowStart,
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'start',
          avatar: '',
          inputs: [],
          outputs: [],
          version: '1',
          intro: ''
        }
      };
      const toolNode: Node<FlowNodeItemType> = {
        id: 'tool-1',
        type: FlowNodeTypeEnum.pluginModule,
        position: { x: 0, y: 0 },
        data: {
          id: FlowNodeTypeEnum.pluginModule,
          nodeId: 'tool-1',
          flowNodeType: FlowNodeTypeEnum.pluginModule,
          name: 'tool',
          avatar: '',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              label: '',
              required: true,
              value: '',
              valueType: WorkflowIOValueTypeEnum.string,
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: [],
          version: '1',
          intro: ''
        }
      };

      const result = checkWorkflowNodeIssues({
        nodes: [startNode, toolNode],
        edges: [{ id: 'e1', source: 'start', target: 'tool-1', type: EDGE_TYPE }],
        t: ((key: string, params?: { inputName?: string }) =>
          key === 'common:core.workflow.check.required_input_empty'
            ? `missing:${params?.inputName ?? ''}`
            : `i18n:${key}`) as unknown as Parameters<typeof checkWorkflowNodeIssues>[0]['t']
      });

      expect(result['tool-1']).toEqual([
        expect.objectContaining({
          code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
          inputKey: NodeInputKeyEnum.aiModel,
          message: `missing:i18n:${NodeInputKeyEnum.aiModel}`
        })
      ]);
    });
  });
});

describe('Core validation and Web extension contract', () => {
  const t = ((key: string, params?: Record<string, unknown>) => {
    const text = (commonZh as Record<string, string>)[key.replace('common:', '')] ?? key;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
  }) as TFunction;
  const modelData = {
    references: [{ modelId: 'llm-id', type: ModelTypeEnum.llm }],
    defaultModelIds: {}
  };
  const makeGraph = (inputs: FlowNodeItemType['inputs'] = []) => ({
    nodes: ['start', 'target'].map(
      (id) =>
        ({
          id,
          position: { x: 0, y: 0 },
          data: {
            id,
            nodeId: id,
            name: id === 'target' ? '目标' : 'Start',
            flowNodeType:
              id === 'start' ? FlowNodeTypeEnum.workflowStart : FlowNodeTypeEnum.pluginModule,
            inputs: id === 'target' ? inputs : [],
            outputs: []
          }
        }) as Node<FlowNodeItemType>
    ),
    edges: [{ id: 'edge', source: 'start', target: 'target' }] as Edge[]
  });

  it('runs Core static and injected model checks once, reports one missing-model error, and skips models without context', () => {
    const graph = makeGraph([
      {
        key: 'customModel',
        label: '自定义模型',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }
    ]);
    const coreSpy = vi.spyOn(workflowValidation, 'validateWorkflow');
    const modelsSpy = vi.spyOn(workflowModelValidation, 'checkWorkflowModels');
    try {
      const result = checkWorkflowBeforeRunOrPublish({ ...graph, modelData, t });
      expect(coreSpy).toHaveBeenCalledTimes(1);
      expect(modelsSpy).toHaveBeenCalledTimes(1);
      expect(modelsSpy.mock.calls[0][0].modelData).toBe(modelData);
      expect(result.issueMap.target).toEqual([
        expect.objectContaining({
          code: WorkflowCheckIssueCodeEnum.modelRequired,
          inputKey: 'customModel',
          message: '未配置[自定义模型]模型'
        })
      ]);
      expect(result.diagnostics.map((issue) => issue.code)).toEqual([
        WorkflowDiagnosticCodeEnum.modelRequired
      ]);
      const { document } = createWorkflowCheckDocument(graph);
      expect(
        workflowValidation.validateWorkflow(document, { invalidReferencePolicy: 'error' })
      ).toEqual([]);
      expect(modelsSpy).toHaveBeenCalledTimes(1);
    } finally {
      coreSpy.mockRestore();
      modelsSpy.mockRestore();
    }
  });

  it('does not treat editor-only comment fields as runtime inputs', () => {
    const graph = makeGraph();
    graph.nodes.push(
      storeNode2FlowNode({
        item: {
          ...CommentNode,
          nodeId: 'comment',
          inputs: CommentNode.inputs.map((input) =>
            input.key === NodeInputKeyEnum.commentText
              ? { ...input, value: 'A canvas note' }
              : input
          )
        },
        t: ((key: string) => key) as TFunction
      })
    );
    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({ hasError: false });
  });

  it('still rejects domain errors after the graph has been projected', () => {
    const graph = makeGraph();
    graph.edges.push({ ...graph.edges[0], id: 'duplicate-edge' });

    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: true,
      errorNodeIds: expect.arrayContaining(['start', 'target']),
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.edgeDuplicated,
          severity: 'error'
        })
      ])
    });
  });

  it('keeps resource status exclusively in Web and reports a plugin error once', () => {
    const graph = makeGraph();
    graph.nodes[1].data.pluginData = { error: WorkflowCheckIssueCodeEnum.resourceNoPermission };
    const result = checkWorkflowBeforeRunOrPublish({ ...graph, t });
    expect(result.diagnostics).toEqual([]);
    expect(result.issueMap.target).toEqual([
      expect.objectContaining({
        code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
        message: '无权限访问该资源，请检查权限'
      })
    ]);
    expect(result.errorMessages).toEqual(['「目标」无权限访问该资源，请检查权限']);
  });

  it('names each node with a missing required input and limits the summary to three messages', () => {
    const graph = makeGraph([
      {
        key: 'source',
        label: '热榜来源',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }
    ]);
    const target = graph.nodes[1];
    for (let index = 2; index <= 4; index++) {
      const nodeId = `target-${index}`;
      graph.nodes.push({
        ...target,
        id: nodeId,
        data: { ...target.data, nodeId, name: `目标${index}` }
      });
      graph.edges.push({ id: `edge-${index}`, source: 'start', target: nodeId });
    }

    const result = checkWorkflowBeforeRunOrPublish({ ...graph, t });

    expect(result.errorMessages).toEqual([
      '「目标」需填写必填项 热榜来源',
      '「目标2」需填写必填项 热榜来源',
      '「目标3」需填写必填项 热榜来源'
    ]);
    expect(result.errorNodeIds).toEqual(['target', 'target-2', 'target-3', 'target-4']);
    expect(result.issueMap['target-4']).toEqual([
      expect.objectContaining({ message: '需填写必填项 热榜来源' })
    ]);
  });

  it('shows the concrete Core-only input type error and retains its original diagnostic', () => {
    const graph = makeGraph([
      {
        key: 'count',
        label: '数量',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        valueType: WorkflowIOValueTypeEnum.number,
        value: 'wrong-type'
      }
    ]);
    const result = checkWorkflowBeforeRunOrPublish({ ...graph, t });
    expect(result.hasError).toBe(true);
    expect(result.firstErrorNodeId).toBe('target');
    expect(result.errorMessages).toEqual(['「目标」输入项 数量 的值类型错误，应为 number']);
    expect(result.diagnostics).toEqual([
      {
        code: WorkflowDiagnosticCodeEnum.inputValueTypeInvalid,
        severity: 'error',
        nodeId: 'target',
        inputKey: 'count',
        params: { expected: WorkflowIOValueTypeEnum.number }
      }
    ]);
  });

  it('keeps specific field errors and raw unsupported handles after an edge projection failure', () => {
    const graph = makeGraph([
      {
        key: 'text',
        label: '文本',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }
    ]);
    graph.edges[0].sourceHandle = 'legacy-invalid-handle';
    const result = checkWorkflowBeforeRunOrPublish({ ...graph, t });
    expect(result.issueMap.target).toContainEqual(
      expect.objectContaining({
        code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
        message: '需填写必填项 文本'
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.edgeHandleUnsupported,
        params: expect.objectContaining({
          edge: expect.objectContaining({ sourceHandle: 'legacy-invalid-handle' })
        })
      })
    );
    expect(result.errorMessages.some((message) => message.includes('legacy-invalid-handle'))).toBe(
      true
    );
    expect(result.errorMessages.every(Boolean)).toBe(true);
    expect(new Set(result.errorMessages).size).toBe(result.errorMessages.length);
  });

  it('surfaces global entry-count errors even when there are no nodes to highlight', () => {
    const result = checkWorkflowBeforeRunOrPublish({ nodes: [], edges: [], t });
    expect(result).toMatchObject({
      hasError: true,
      errorNodeIds: [],
      firstErrorNodeId: undefined,
      firstErrorIssue: {
        code: WorkflowDiagnosticCodeEnum.startCountInvalid,
        nodeId: '__workflow__'
      },
      errorMessages: ['工作流必须有且仅有一个入口节点，当前有 0 个']
    });
  });

  it('accepts a plain object without requiring a custom schema or reporting a warning', () => {
    const graph = makeGraph([
      {
        key: 'payload',
        label: '结构化参数',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        valueType: WorkflowIOValueTypeEnum.object,
        value: { arbitrary: true }
      }
    ]);
    const result = checkWorkflowBeforeRunOrPublish({ ...graph, t });
    expect(result.hasError).toBe(false);
    expect(result.errorMessages).toEqual([]);
    expect(result.issueMap.target).toBeUndefined();
  });

  it('reports schema errors with their exact validation reason instead of an empty generic failure', () => {
    const graph = makeGraph([
      {
        key: 'payload',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: 'hi'
      } as FlowNodeItemType['inputs'][number]
    ]);
    const result = checkWorkflowBeforeRunOrPublish({ ...graph, t });
    const diagnostic = result.diagnostics.find(
      (issue) => issue.code === WorkflowDiagnosticCodeEnum.schemaInvalid
    )!;
    expect(result.hasError).toBe(true);
    expect(result.errorMessages[0]).toContain(String(diagnostic.params?.reason));
    expect(result.errorMessages[0]).toContain('nodes.1.inputs.0.label');
  });

  it('uses the exact model field label when a duplicated slot has an unavailable second value', () => {
    const graph = makeGraph([
      {
        key: NodeInputKeyEnum.aiModelId,
        label: '第一个模型',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
        value: 'llm-id'
      },
      {
        key: NodeInputKeyEnum.aiModelId,
        label: '第二个模型',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
        value: 'missing-id'
      }
    ]);
    graph.nodes[1].data.flowNodeType = FlowNodeTypeEnum.chatNode;
    const result = checkWorkflowBeforeRunOrPublish({ ...graph, modelData, t });
    expect(
      result.issueMap.target.find(
        (issue) => issue.code === WorkflowCheckIssueCodeEnum.modelUnavailable
      )?.message
    ).toBe('「目标」的「第二个模型」模型不可用');
    expect(result.errorMessages).toContain('「目标」的「第二个模型」模型不可用');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelUnavailable,
        path: ['nodes', 1, 'inputs', 1, 'value']
      })
    );
  });
});

describe('Web external resource bindings', () => {
  it('requires visible external resources using Core binding diagnostics and skips hidden bindings', () => {
    const start: Node<FlowNodeItemType> = {
      id: 'start',
      position: { x: 0, y: 0 },
      data: {
        id: FlowNodeTypeEnum.workflowStart,
        nodeId: 'start',
        name: 'Start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        inputs: [],
        outputs: []
      }
    } as Node<FlowNodeItemType>;
    const target: Node<FlowNodeItemType> = {
      id: 'target',
      position: { x: 0, y: 0 },
      data: {
        id: FlowNodeTypeEnum.datasetSearchNode,
        nodeId: 'target',
        name: 'Search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            label: '知识库',
            required: true,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
            valueType: WorkflowIOValueTypeEnum.arrayObject,
            value: []
          }
        ],
        outputs: []
      }
    } as Node<FlowNodeItemType>;
    const graph = {
      nodes: [start, target],
      edges: [{ id: 'edge', source: 'start', target: 'target' }]
    };
    const missing = checkWorkflowBeforeRunOrPublish(graph);
    expect(missing.diagnostics).toEqual([]);
    expect(missing.issueMap.target).toEqual([
      expect.objectContaining({
        code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
        inputKey: NodeInputKeyEnum.datasetSelectList
      })
    ]);
    target.data.inputs[0].selectedType = FlowNodeInputTypeEnum.hidden;
    expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);
    target.data.inputs[0].selectedType = FlowNodeInputTypeEnum.off;
    expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);
    target.data.inputs[0].selectedType = FlowNodeInputTypeEnum.selectDataset;
    target.data.inputs[0].required = false;
    expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);
    target.data.inputs[0].required = true;
    target.data.inputs[0].value = [
      {
        datasetId: 'selected',
        name: 'Selected',
        avatar: '',
        vectorModel: { model: 'embedding-model' }
      }
    ];
    expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);

    // 旧 ChatAgent/持久化数据只保证 ID；向量模型也可能仅保存新的 modelId。
    for (const value of [
      [{ datasetId: 'selected' }],
      [{ datasetId: 'selected', vectorModel: { modelId: 'embedding-id' } }]
    ]) {
      target.data.inputs[0].value = value;
      expect(checkWorkflowBeforeRunOrPublish(graph).hasError).toBe(false);
    }
    target.data.inputs[0].value = [
      { datasetId: 'selected', error: WorkflowCheckIssueCodeEnum.resourceNoPermission }
    ];
    expect(checkWorkflowBeforeRunOrPublish(graph).issueMap.target).toEqual([
      expect.objectContaining({ code: WorkflowCheckIssueCodeEnum.resourceNoPermission })
    ]);
  });
});
