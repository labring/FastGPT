import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import type { AnyBulkWriteOperation, Model } from '@fastgpt/service/common/mongo';
import { AppFolderTypeList, type AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { PublishAppBodySchema } from '@fastgpt/global/openapi/core/app/version/api';
import { Types } from '@fastgpt/service/common/mongo';
import z from 'zod';

/* ============================================================================
 * API: 工作流 V1 数据升级 V2
 * Route: POST /api/admin/dataClean/v1WorkflowToV2
 * Method: POST
 * Description: 管理员数据清洗接口，将历史 apps.modules 与 app_versions.nodes 的 V1 工作流结构升级为 V2。
 * Tags: ['Admin', 'DataClean', 'Workflow', 'Write']
 * ============================================================================ */

const BATCH_SIZE = 1000;
const MAX_ZOD_ERRORS = 50;

const V1WorkflowToV2BodySchema = z.object({
  dryRun: z.boolean().default(true).meta({
    example: true,
    description: '是否只扫描验证不写库'
  })
});
export type V1WorkflowToV2BodyType = z.infer<typeof V1WorkflowToV2BodySchema>;

const ValidationIssueSchema = z.object({
  code: z.string().meta({ description: 'Zod 错误码' }),
  path: z.string().meta({ description: '错误字段路径' }),
  message: z.string().meta({ description: '错误信息' }),
  actualValue: z.unknown().optional().meta({ description: '压缩后的实际值' })
});

const IssueSummarySchema = z.object({
  path: z.string().meta({ description: '错误字段路径' }),
  message: z.string().meta({ description: '错误信息' }),
  actualValue: z.unknown().optional().meta({ description: '压缩后的实际值' }),
  count: z.number().int().nonnegative().meta({ description: '出现次数' })
});
export type IssueSummaryType = z.infer<typeof IssueSummarySchema>;

const ValidationErrorRecordSchema = z.object({
  collectionName: z.string().meta({ description: '集合名' }),
  fieldName: z.string().meta({ description: '工作流字段名' }),
  documentId: z.string().optional().meta({ description: '文档 ID' }),
  appId: z.string().optional().meta({ description: '应用 ID' }),
  name: z.string().optional().meta({ description: '应用名称' }),
  issueCount: z.number().int().nonnegative().meta({ description: '错误数量' }),
  issues: z.array(ValidationIssueSchema).meta({ description: '错误明细' })
});
export type ValidationErrorRecordType = z.infer<typeof ValidationErrorRecordSchema>;

const CollectionStatsSchema = z.object({
  collectionName: z.string().meta({ description: '集合名' }),
  fieldName: z.string().meta({ description: '工作流字段名' }),
  scannedDocumentCount: z.number().int().nonnegative().meta({ description: '扫描文档数' }),
  skippedDocumentCount: z.number().int().nonnegative().meta({ description: '跳过文档数' }),
  convertedDocumentCount: z.number().int().nonnegative().meta({ description: '转换文档数' }),
  zodErrorDocumentCount: z.number().int().nonnegative().meta({ description: 'Zod 失败文档数' }),
  writeSuccessDocumentCount: z.number().int().nonnegative().meta({ description: '写入成功文档数' }),
  writeBlockedDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '因 Zod 失败阻断写入文档数' }),
  writeErrorDocumentCount: z.number().int().nonnegative().meta({ description: '写入失败文档数' }),
  issuesByPath: z.array(IssueSummarySchema).meta({ description: 'Zod 错误聚合' })
});
export type CollectionStatsType = z.infer<typeof CollectionStatsSchema>;

const V1WorkflowToV2ResponseSchema = z.object({
  dryRun: z.boolean().meta({ description: '是否 dryRun' }),
  apps: CollectionStatsSchema,
  appVersions: CollectionStatsSchema,
  total: CollectionStatsSchema,
  zodErrors: z
    .array(ValidationErrorRecordSchema)
    .meta({ description: 'Zod 错误明细，按固定样本数量截断' })
});
export type V1WorkflowToV2ResponseType = z.infer<typeof V1WorkflowToV2ResponseSchema>;

type CollectionKey = 'apps' | 'appVersions';
type CollectionConfig = {
  key: CollectionKey;
  collectionName: 'apps' | 'app_versions';
  fieldName: 'modules' | 'nodes';
};
type WorkflowDocument = {
  _id?: unknown;
  appId?: unknown;
  name?: unknown;
  type?: unknown;
  version?: unknown;
  modules?: unknown;
  nodes?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
};
type LegacyV1WorkflowNode = {
  moduleId?: string;
  flowType?: string;
  name?: string;
  avatar?: string;
  intro?: string;
  position?: unknown;
  showStatus?: boolean;
  parentId?: string;
  inputs?: Array<Record<string, unknown>>;
  outputs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};
type UpgradeChange = {
  path: string;
  before: unknown;
  after: unknown;
  reason: string;
};
type UpgradeResult = {
  converted: boolean;
  nodes: unknown[];
  edges: unknown;
  chatConfig: unknown;
  changes: UpgradeChange[];
};
type MutableCollectionStats = Omit<CollectionStatsType, 'issuesByPath'> & {
  issuesByPath: Record<string, IssueSummaryType>;
};
type PendingWriteOperation = {
  operation: AnyBulkWriteOperation<any>;
};

const appConfig = {
  key: 'apps',
  collectionName: 'apps',
  fieldName: 'modules'
} as const satisfies CollectionConfig;

const appVersionConfig = {
  key: 'appVersions',
  collectionName: 'app_versions',
  fieldName: 'nodes'
} as const satisfies CollectionConfig;

const inputTypeMap: Record<string, FlowNodeInputTypeEnum> = {
  systemInput: FlowNodeInputTypeEnum.input,
  input: FlowNodeInputTypeEnum.input,
  numberInput: FlowNodeInputTypeEnum.numberInput,
  select: FlowNodeInputTypeEnum.select,
  target: FlowNodeInputTypeEnum.reference,
  switch: FlowNodeInputTypeEnum.switch,
  textarea: FlowNodeInputTypeEnum.textarea,
  JSONEditor: FlowNodeInputTypeEnum.JSONEditor,
  addInputParam: FlowNodeInputTypeEnum.addInputParam,
  selectApp: FlowNodeInputTypeEnum.selectApp,
  selectLLMModel: FlowNodeInputTypeEnum.selectLLMModel,
  settingLLMModel: FlowNodeInputTypeEnum.settingLLMModel,
  selectDataset: FlowNodeInputTypeEnum.selectDataset,
  selectDatasetParamsModal: FlowNodeInputTypeEnum.selectDatasetParamsModal,
  settingDatasetQuotePrompt: FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  hidden: FlowNodeInputTypeEnum.hidden,
  custom: FlowNodeInputTypeEnum.custom
};

const outputTypeMap: Record<string, FlowNodeOutputTypeEnum> = {
  addOutputParam: FlowNodeOutputTypeEnum.dynamic,
  answer: FlowNodeOutputTypeEnum.static,
  source: FlowNodeOutputTypeEnum.static,
  hidden: FlowNodeOutputTypeEnum.hidden
};

const flowTypeMap: Record<string, FlowNodeTypeEnum> = {
  userGuide: FlowNodeTypeEnum.systemConfig,
  questionInput: FlowNodeTypeEnum.workflowStart,
  chatNode: FlowNodeTypeEnum.chatNode,
  datasetSearchNode: FlowNodeTypeEnum.datasetSearchNode,
  datasetConcatNode: FlowNodeTypeEnum.datasetConcatNode,
  answerNode: FlowNodeTypeEnum.answerNode,
  classifyQuestion: FlowNodeTypeEnum.classifyQuestion,
  contentExtract: FlowNodeTypeEnum.contentExtract,
  httpRequest468: FlowNodeTypeEnum.httpRequest468,
  app: FlowNodeTypeEnum.runApp,
  pluginModule: FlowNodeTypeEnum.pluginModule,
  pluginInput: FlowNodeTypeEnum.pluginInput,
  pluginOutput: FlowNodeTypeEnum.pluginOutput,
  cfr: FlowNodeTypeEnum.queryExtension,
  tools: FlowNodeTypeEnum.toolCall,
  stopTool: FlowNodeTypeEnum.stopTool
};

const legacyWorkflowValueTypeMap: Record<string, WorkflowIOValueTypeEnum> = {
  chat_history: WorkflowIOValueTypeEnum.chatHistory,
  kb_quote: WorkflowIOValueTypeEnum.datasetQuote
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringifyId = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
};

const toObjectId = (value: unknown) => {
  if (value instanceof Types.ObjectId) return value;
  const id = stringifyId(value);
  return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined;
};

const isFolderAppType = (type: unknown) =>
  typeof type === 'string' && AppFolderTypeList.includes(type as AppTypeEnum);

const isKnownWorkflowValueType = (value: unknown): value is WorkflowIOValueTypeEnum =>
  typeof value === 'string' &&
  Object.values(WorkflowIOValueTypeEnum).includes(value as WorkflowIOValueTypeEnum);

const normalizeWorkflowValueType = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'string' && legacyWorkflowValueTypeMap[value]) {
    return legacyWorkflowValueTypeMap[value];
  }
  return isKnownWorkflowValueType(value) ? value : WorkflowIOValueTypeEnum.any;
};

const isLegacyV1WorkflowNodes = (nodes: unknown[]): nodes is LegacyV1WorkflowNode[] =>
  nodes.some(
    (node) =>
      isRecord(node) &&
      typeof node.flowType === 'string' &&
      (typeof node.moduleId === 'string' || typeof node.nodeId !== 'string')
  );

const randomNodeId = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

const getLegacyNodeId = ({ node, index }: { node: LegacyV1WorkflowNode; index: number }) =>
  typeof node.moduleId === 'string' && node.moduleId
    ? node.moduleId
    : randomNodeId() || `node${index}`;

const recordChange = ({
  changes,
  path,
  before,
  after,
  reason
}: {
  changes: UpgradeChange[];
  path: string;
  before: unknown;
  after: unknown;
  reason: string;
}) => {
  changes.push({ path, before, after, reason });
};

/**
 * 将历史 V1 workflow 节点结构转换为当前 V2 保存结构。
 *
 * 兼容策略与本地清洗脚本保持一致：未知 flowType 统一转 emptyNode，非法 valueType
 * 转 any，缺失 valueType 保持 undefined，避免旧脏数据在保存前触发 schema 错误。
 */
const convertV1WorkflowToV2 = ({
  nodes,
  changes,
  rootPath
}: {
  nodes: LegacyV1WorkflowNode[];
  changes: UpgradeChange[];
  rootPath: string;
}) => {
  const copyNodes = nodes
    .map((node, index) => ({
      ...node,
      moduleId: getLegacyNodeId({ node, index }),
      inputs: Array.isArray(node.inputs) ? node.inputs : [],
      outputs: Array.isArray(node.outputs) ? node.outputs : []
    }))
    .filter((node, index, self) => {
      if (node.flowType === 'questionInput') {
        return index === self.findIndex((item) => item.flowType === 'questionInput');
      }
      return true;
    });

  const newNodes = copyNodes
    .map((node) => {
      let pluginId: string | undefined;
      const flowNodeType =
        typeof node.flowType === 'string'
          ? flowTypeMap[node.flowType] || FlowNodeTypeEnum.emptyNode
          : FlowNodeTypeEnum.emptyNode;

      const inputs = (node.inputs || [])
        .map((input) => {
          const inputType = typeof input.type === 'string' ? inputTypeMap[input.type] : undefined;
          const newInput: Record<string, unknown> = {
            ...input,
            selectedTypeIndex: 0,
            renderTypeList: !input.type
              ? [FlowNodeInputTypeEnum.custom]
              : inputType
                ? [inputType]
                : [],
            key: input.key,
            value: input.value,
            valueType: normalizeWorkflowValueType(input.valueType),
            label: typeof input.label === 'string' ? input.label : String(input.key || ''),
            description: input.description,
            required: input.required,
            toolDescription: input.toolDescription,
            canEdit: input.edit,
            placeholder: input.placeholder,
            list: input.list,
            markList: input.markList,
            step: input.step,
            max: input.max,
            min: input.min
          };

          if (input.key === 'userChatInput') {
            newInput.label = '问题输入';
          } else if (input.key === 'quoteQA') {
            newInput.label = '';
          } else if (input.key === 'pluginId' && typeof input.value === 'string') {
            pluginId = input.value;
          }

          return newInput;
        })
        .filter((input) => Array.isArray(input.renderTypeList) && input.renderTypeList.length > 0)
        .filter((input) => {
          if (input.key === 'pluginId') return false;
          if (input.key === 'switch') return false;
          if (input.key === 'pluginStart') return false;
          if (input.key === 'DYNAMIC_INPUT_KEY') return false;
          if (input.key === 'system_addInputParam') return false;
          return true;
        });

      const outputs = (node.outputs || [])
        .map((output) => ({
          id: output.key,
          type:
            typeof output.type === 'string'
              ? outputTypeMap[output.type] || FlowNodeOutputTypeEnum.static
              : FlowNodeOutputTypeEnum.static,
          key: output.key,
          valueType: normalizeWorkflowValueType(output.valueType),
          label: typeof output.label === 'string' ? output.label : String(output.key || ''),
          description: output.description,
          required: output.required,
          defaultValue: output.defaultValue,
          canEdit: output.edit,
          editField: output.editField
        }))
        .filter((output) => {
          if (node.flowType === 'pluginOutput') return false;
          if (output.key === 'finish') return false;
          if (output.key === 'isEmpty') return false;
          if (output.key === 'unEmpty') return false;
          if (output.key === 'pluginStart') return false;
          if (node.flowType !== 'questionInput' && output.key === 'userChatInput') return false;
          if (
            node.flowType === 'contentExtract' &&
            (output.key === 'success' || output.key === 'failed')
          ) {
            return false;
          }
          return true;
        });

      if (node.flowType === 'questionInput') {
        node.name = '流程开始';
      } else if (node.flowType === 'pluginOutput') {
        (node.outputs || []).forEach((output) => {
          inputs.push({
            key: output.key,
            valueType: normalizeWorkflowValueType(output.valueType),
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            label: typeof output.key === 'string' ? output.key : '',
            canEdit: true
          });
        });
      }

      return {
        nodeId: node.moduleId,
        position: node.position,
        flowNodeType,
        avatar: node.flowType === 'pluginModule' ? node.avatar : undefined,
        name:
          node.flowType === 'questionInput'
            ? node.name
            : typeof node.name === 'string'
              ? node.name
              : String(node.flowType || ''),
        intro: node.intro,
        showStatus: node.showStatus,
        pluginId,
        parentId: node.parentId,
        version: '481',
        inputs,
        outputs
      };
    })
    .filter((node) => node.nodeId);

  let newEdges: Record<string, unknown>[] = [];

  copyNodes.forEach((node) => {
    (node.outputs || []).forEach((output) => {
      const targets = Array.isArray(output.targets) ? output.targets : [];
      targets.forEach((target) => {
        if (!isRecord(target) || typeof target.moduleId !== 'string') return;
        if (output.key === 'finish') return;
        if (output.key === 'isEmpty') return;
        if (output.key === 'unEmpty') return;
        if (node.flowType !== 'questionInput' && output.key === 'userChatInput') return;

        if (output.key === NodeOutputKeyEnum.selectedTools) {
          newEdges.push({
            source: node.moduleId,
            sourceHandle: NodeOutputKeyEnum.selectedTools,
            target: target.moduleId,
            targetHandle: NodeOutputKeyEnum.selectedTools
          });
        } else if (node.flowType === 'classifyQuestion') {
          newEdges.push({
            source: node.moduleId,
            sourceHandle: getHandleId(node.moduleId || '', 'source', String(output.key)),
            target: target.moduleId,
            targetHandle: getHandleId(target.moduleId, 'target', 'left')
          });
        } else if (node.flowType !== 'contentExtract') {
          newEdges.push({
            source: node.moduleId,
            sourceHandle: getHandleId(node.moduleId || '', 'source', 'right'),
            target: target.moduleId,
            targetHandle: getHandleId(target.moduleId, 'target', 'left')
          });
        }
      });
    });
  });

  newEdges = newEdges.filter(
    (edge, index, self) =>
      self.findIndex((item) => item.source === edge.source && item.target === edge.target) === index
  );

  const workflowStart = newNodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  );
  copyNodes.forEach((node) => {
    (node.outputs || []).forEach((output) => {
      const targets = Array.isArray(output.targets) ? output.targets : [];
      targets.forEach((target) => {
        if (!isRecord(target) || typeof target.moduleId !== 'string') return;
        const targetNode = newNodes.find((item) => item.nodeId === target.moduleId);
        if (!targetNode) return;
        const targetInput = targetNode.inputs.find((item) => item.key === target.key);
        if (!targetInput) return;
        targetInput.value = [node.moduleId, output.key];
      });
    });
  });

  newNodes.forEach((node) => {
    node.inputs.forEach((input) => {
      if (!workflowStart) return;
      if (
        node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
        input.key === NodeInputKeyEnum.datasetSearchInput
      ) {
        input.value = [
          [workflowStart.nodeId, NodeOutputKeyEnum.userChatInput],
          [workflowStart.nodeId, NodeOutputKeyEnum.userFiles]
        ];
        input.valueType = WorkflowIOValueTypeEnum.arrayString;
        return;
      }
      if (input.key !== NodeInputKeyEnum.userChatInput) return;
      input.value = [workflowStart.nodeId, NodeOutputKeyEnum.userChatInput];
    });
  });

  recordChange({
    changes,
    path: rootPath,
    before: { type: 'array', length: nodes.length },
    after: { type: 'array', length: newNodes.length },
    reason: 'legacy v1 workflow converted to v2'
  });

  copyNodes.forEach((node, nodeIndex) => {
    if (typeof node.flowType !== 'string' || !flowTypeMap[node.flowType]) {
      recordChange({
        changes,
        path: `${rootPath}[${nodeIndex}].flowType`,
        before: node.flowType,
        after: FlowNodeTypeEnum.emptyNode,
        reason: 'legacy unknown flowType converted to emptyNode'
      });
    }
  });

  return { nodes: newNodes, edges: newEdges };
};

const formatConvertedWorkflowNodes = ({
  nodes,
  changes,
  rootPath
}: {
  nodes: unknown[];
  changes: UpgradeChange[];
  rootPath: string;
}) =>
  nodes.map((node, nodeIndex) => {
    if (!isRecord(node)) return node;

    const nextNode: Record<string, unknown> = { ...node };
    if (nextNode.flowNodeType === 'lafModule') {
      recordChange({
        changes,
        path: `${rootPath}[${nodeIndex}].flowNodeType`,
        before: nextNode.flowNodeType,
        after: FlowNodeTypeEnum.emptyNode,
        reason: 'legacy lafModule node converted to emptyNode'
      });
      nextNode.flowNodeType = FlowNodeTypeEnum.emptyNode;
    }

    const formatIOList = ({ list, path }: { list: unknown; path: string }) => {
      if (!Array.isArray(list)) return list;

      return list.map((item, itemIndex) => {
        if (!isRecord(item)) return item;

        const nextItem: Record<string, unknown> = { ...item };
        const normalizedValueType = normalizeWorkflowValueType(nextItem.valueType);
        if (normalizedValueType !== nextItem.valueType) {
          recordChange({
            changes,
            path: `${path}[${itemIndex}].valueType`,
            before: nextItem.valueType,
            after: normalizedValueType,
            reason: 'legacy valueType normalized'
          });
          nextItem.valueType = normalizedValueType;
        }

        if (nextItem.label === undefined) {
          const label = String(nextItem.key || '');
          recordChange({
            changes,
            path: `${path}[${itemIndex}].label`,
            before: undefined,
            after: label,
            reason: 'legacy IO missing label'
          });
          nextItem.label = label;
        }

        (['description', 'toolDescription'] as const).forEach((key) => {
          if (nextItem[key] === null) {
            recordChange({
              changes,
              path: `${path}[${itemIndex}].${key}`,
              before: null,
              after: '',
              reason: `legacy IO ${key} is null`
            });
            nextItem[key] = '';
          }
        });

        return nextItem;
      });
    };

    nextNode.inputs = formatIOList({
      list: nextNode.inputs,
      path: `${rootPath}[${nodeIndex}].inputs`
    });
    nextNode.outputs = formatIOList({
      list: nextNode.outputs,
      path: `${rootPath}[${nodeIndex}].outputs`
    });

    return nextNode;
  });

const formatChatConfig = ({
  chatConfig,
  changes
}: {
  chatConfig: unknown;
  changes: UpgradeChange[];
}) => {
  if (chatConfig == null) {
    recordChange({
      changes,
      path: 'chatConfig',
      before: chatConfig,
      after: {},
      reason: 'legacy empty chatConfig'
    });
    return {};
  }
  if (!isRecord(chatConfig)) return chatConfig;

  const nextChatConfig: Record<string, unknown> = { ...chatConfig };
  [
    'welcomeText',
    'variables',
    'autoExecute',
    'questionGuide',
    'ttsConfig',
    'whisperConfig',
    'scheduledTriggerConfig',
    'chatInputGuide',
    'fileSelectConfig',
    'instruction'
  ].forEach((key) => {
    if (nextChatConfig[key] === null) {
      recordChange({
        changes,
        path: `chatConfig.${key}`,
        before: null,
        after: undefined,
        reason: 'legacy optional chatConfig field is null'
      });
      delete nextChatConfig[key];
    }
  });

  if (typeof nextChatConfig.questionGuide === 'boolean') {
    recordChange({
      changes,
      path: 'chatConfig.questionGuide',
      before: nextChatConfig.questionGuide,
      after: { open: nextChatConfig.questionGuide },
      reason: 'legacy boolean questionGuide'
    });
    nextChatConfig.questionGuide = { open: nextChatConfig.questionGuide };
  }

  if (Array.isArray(nextChatConfig.variables)) {
    nextChatConfig.variables = nextChatConfig.variables.map((variable, variableIndex) => {
      if (!isRecord(variable)) return variable;

      const nextVariable: Record<string, unknown> = { ...variable };
      if (nextVariable.description === undefined) {
        recordChange({
          changes,
          path: `chatConfig.variables[${variableIndex}].description`,
          before: undefined,
          after: '',
          reason: 'legacy variable missing description'
        });
        nextVariable.description = '';
      }

      if (Array.isArray(nextVariable.enums)) {
        nextVariable.enums = nextVariable.enums.map((enumItem, enumIndex) => {
          if (!isRecord(enumItem)) return enumItem;

          const nextEnumItem: Record<string, unknown> = { ...enumItem };
          if (nextEnumItem.label === undefined && typeof nextEnumItem.value === 'string') {
            recordChange({
              changes,
              path: `chatConfig.variables[${variableIndex}].enums[${enumIndex}].label`,
              before: undefined,
              after: nextEnumItem.value,
              reason: 'legacy enum missing label'
            });
            nextEnumItem.label = nextEnumItem.value;
          }

          return nextEnumItem;
        });
      }

      if (Array.isArray(nextVariable.list)) {
        nextVariable.list = nextVariable.list.map((listItem, listIndex) => {
          if (!isRecord(listItem)) return listItem;

          const nextListItem: Record<string, unknown> = { ...listItem };
          if (nextListItem.label === undefined && typeof nextListItem.value === 'string') {
            recordChange({
              changes,
              path: `chatConfig.variables[${variableIndex}].list[${listIndex}].label`,
              before: undefined,
              after: nextListItem.value,
              reason: 'legacy variable list item missing label'
            });
            nextListItem.label = nextListItem.value;
          }

          return nextListItem;
        });
      }

      return nextVariable;
    });
  }

  return nextChatConfig;
};

/**
 * 对单个 apps/app_versions 文档执行 V1->V2 转换和兼容格式化。
 *
 * apps 只有 version 非 v2 且非 folder/httpPlugin/toolFolder 才转换；app_versions
 * 通过节点结构判断是否为 V1，避免依赖版本号导致漏处理。
 */
export const upgradeV1WorkflowDocument = ({
  doc,
  config
}: {
  doc: WorkflowDocument;
  config: CollectionConfig;
}) => {
  const changes: UpgradeChange[] = [];
  const rawNodes = doc[config.fieldName];

  if (config.key === 'apps') {
    if (isFolderAppType(doc.type) || doc.version === 'v2') {
      return {
        converted: false,
        nodes: Array.isArray(rawNodes) ? rawNodes : [],
        edges: doc.edges,
        chatConfig: doc.chatConfig,
        changes
      } satisfies UpgradeResult;
    }
    if (!Array.isArray(rawNodes)) {
      recordChange({
        changes,
        path: config.fieldName,
        before: rawNodes,
        after: [],
        reason: 'legacy app workflow field is not array'
      });
      return {
        converted: true,
        nodes: [],
        edges: [],
        chatConfig: formatChatConfig({ chatConfig: doc.chatConfig, changes }),
        changes
      } satisfies UpgradeResult;
    }
  } else if (!Array.isArray(rawNodes) || !isLegacyV1WorkflowNodes(rawNodes)) {
    return {
      converted: false,
      nodes: Array.isArray(rawNodes) ? rawNodes : [],
      edges: doc.edges,
      chatConfig: doc.chatConfig,
      changes
    } satisfies UpgradeResult;
  }

  if (!Array.isArray(rawNodes)) {
    return {
      converted: false,
      nodes: [],
      edges: doc.edges,
      chatConfig: doc.chatConfig,
      changes
    } satisfies UpgradeResult;
  }

  const converted = isLegacyV1WorkflowNodes(rawNodes)
    ? convertV1WorkflowToV2({ nodes: rawNodes, changes, rootPath: config.fieldName })
    : { nodes: rawNodes, edges: doc.edges };
  const normalizedNodes = formatConvertedWorkflowNodes({
    nodes: converted.nodes,
    changes,
    rootPath: config.fieldName
  });

  return {
    converted: true,
    nodes: normalizedNodes,
    edges: converted.edges,
    chatConfig: formatChatConfig({ chatConfig: doc.chatConfig, changes }),
    changes
  } satisfies UpgradeResult;
};

const compactValue = (value: unknown): unknown => {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 20) };
  return String(value);
};

const getValueByPath = ({ value, issuePath }: { value: unknown; issuePath: PropertyKey[] }) =>
  issuePath.reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && typeof key === 'number') return current[key];
    if (isRecord(current) && (typeof key === 'string' || typeof key === 'number'))
      return current[key];
    return undefined;
  }, value);

const normalizeIssue = ({ issue, data }: { issue: z.core.$ZodIssue; data: unknown }) => ({
  code: issue.code,
  path: issue.path.map((item) => String(item)).join('.'),
  message: issue.message,
  actualValue: compactValue(getValueByPath({ value: data, issuePath: issue.path }))
});

const emptyStats = (config: CollectionConfig): MutableCollectionStats => ({
  collectionName: config.collectionName,
  fieldName: config.fieldName,
  scannedDocumentCount: 0,
  skippedDocumentCount: 0,
  convertedDocumentCount: 0,
  zodErrorDocumentCount: 0,
  writeSuccessDocumentCount: 0,
  writeBlockedDocumentCount: 0,
  writeErrorDocumentCount: 0,
  issuesByPath: {}
});

const recordIssueSummary = ({
  stats,
  issues
}: {
  stats: MutableCollectionStats;
  issues: ValidationErrorRecordType['issues'];
}) => {
  issues.forEach((issue) => {
    const key = `${issue.path}|${issue.message}|${JSON.stringify(issue.actualValue)}`;
    const existing = stats.issuesByPath[key];
    stats.issuesByPath[key] = existing || {
      path: issue.path,
      message: issue.message,
      actualValue: issue.actualValue,
      count: 0
    };
    stats.issuesByPath[key].count += 1;
  });
};

const serializeStats = (stats: MutableCollectionStats): CollectionStatsType => ({
  ...stats,
  issuesByPath: Object.values(stats.issuesByPath).sort((left, right) => right.count - left.count)
});

const mergeStats = (statsList: MutableCollectionStats[]) => {
  const total = emptyStats({
    key: 'apps',
    collectionName: 'total' as 'apps',
    fieldName: '*' as 'modules'
  });
  total.collectionName = 'total';
  total.fieldName = '*';

  statsList.forEach((stats) => {
    total.scannedDocumentCount += stats.scannedDocumentCount;
    total.skippedDocumentCount += stats.skippedDocumentCount;
    total.convertedDocumentCount += stats.convertedDocumentCount;
    total.zodErrorDocumentCount += stats.zodErrorDocumentCount;
    total.writeSuccessDocumentCount += stats.writeSuccessDocumentCount;
    total.writeBlockedDocumentCount += stats.writeBlockedDocumentCount;
    total.writeErrorDocumentCount += stats.writeErrorDocumentCount;
    Object.values(stats.issuesByPath).forEach((issue) => {
      const key = `${issue.path}|${issue.message}|${JSON.stringify(issue.actualValue)}`;
      const existing = total.issuesByPath[key];
      total.issuesByPath[key] = existing || { ...issue, count: 0 };
      total.issuesByPath[key].count += issue.count;
    });
  });

  return total;
};

const createErrorRecord = ({
  doc,
  config,
  issues
}: {
  doc: WorkflowDocument;
  config: CollectionConfig;
  issues: ValidationErrorRecordType['issues'];
}): ValidationErrorRecordType => ({
  collectionName: config.collectionName,
  fieldName: config.fieldName,
  documentId: stringifyId(doc._id),
  appId: stringifyId(doc.appId),
  name: typeof doc.name === 'string' ? doc.name : undefined,
  issueCount: issues.length,
  issues
});

const validateUpgrade = ({
  data,
  doc,
  config,
  stats,
  zodErrors,
  maxZodErrors
}: {
  data: unknown;
  doc: WorkflowDocument;
  config: CollectionConfig;
  stats: MutableCollectionStats;
  zodErrors: ValidationErrorRecordType[];
  maxZodErrors: number;
}) => {
  const result = PublishAppBodySchema.pick({
    nodes: true,
    edges: true,
    chatConfig: true
  }).safeParse(data);
  if (result.success) return true;

  const issues = result.error.issues.map((issue) => normalizeIssue({ issue, data }));
  stats.zodErrorDocumentCount += 1;
  recordIssueSummary({ stats, issues });
  if (zodErrors.length < maxZodErrors) {
    zodErrors.push(createErrorRecord({ doc, config, issues }));
  }

  return false;
};

const buildUpdatePayload = ({
  config,
  result
}: {
  config: CollectionConfig;
  result: UpgradeResult;
}) => ({
  [config.fieldName]: result.nodes,
  edges: result.edges,
  chatConfig: result.chatConfig,
  ...(config.key === 'apps' ? { version: 'v2' } : {})
});

const processBatch = async ({
  model,
  docs,
  config,
  dryRun,
  stats,
  zodErrors,
  maxZodErrors
}: {
  model: Model<any>;
  docs: WorkflowDocument[];
  config: CollectionConfig;
  dryRun: boolean;
  stats: MutableCollectionStats;
  zodErrors: ValidationErrorRecordType[];
  maxZodErrors: number;
}) => {
  const operations: PendingWriteOperation[] = [];

  for (const doc of docs) {
    stats.scannedDocumentCount += 1;
    const upgradeResult = upgradeV1WorkflowDocument({ doc, config });

    if (!upgradeResult.converted) {
      stats.skippedDocumentCount += 1;
      continue;
    }

    stats.convertedDocumentCount += 1;
    const valid = validateUpgrade({
      data: {
        nodes: upgradeResult.nodes,
        edges: upgradeResult.edges,
        chatConfig: upgradeResult.chatConfig
      },
      doc,
      config,
      stats,
      zodErrors,
      maxZodErrors
    });

    if (!valid) {
      stats.writeBlockedDocumentCount += 1;
      continue;
    }
    if (dryRun) continue;

    operations.push({
      operation: {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: buildUpdatePayload({ config, result: upgradeResult })
          }
        }
      }
    });
  }

  if (operations.length === 0) return;

  try {
    const result = await model.bulkWrite(
      operations.map(({ operation }) => operation),
      { ordered: false }
    );
    stats.writeSuccessDocumentCount += result.matchedCount;
    stats.writeErrorDocumentCount += operations.length - result.matchedCount;
  } catch {
    stats.writeErrorDocumentCount += operations.length;
  }
};

const appProjection = {
  _id: 1,
  appId: 1,
  chatConfig: 1,
  edges: 1,
  name: 1,
  type: 1,
  version: 1,
  modules: 1
};

const appVersionProjection = {
  _id: 1,
  appId: 1,
  chatConfig: 1,
  edges: 1,
  name: 1,
  version: 1,
  nodes: 1
};

const buildAppScanQuery = ({ lastId }: { lastId?: unknown }) => {
  const conditions: Record<string, unknown>[] = [
    {
      version: { $ne: 'v2' },
      type: { $nin: AppFolderTypeList }
    }
  ];
  if (lastId) conditions.push({ _id: { $gt: lastId } });

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

/**
 * 执行 V1 workflow 到 V2 的数据清洗。
 *
 * 流程与本地脚本一致：每批拉取 apps，先处理这些 app 对应的 app_versions，
 * app_versions 写完后再写 apps，防止中断后 apps 已标记 v2 但版本漏处理。
 */
export async function runV1WorkflowToV2Migration({
  dryRun = true
}: V1WorkflowToV2BodyType): Promise<V1WorkflowToV2ResponseType> {
  const apps = emptyStats(appConfig);
  const appVersions = emptyStats(appVersionConfig);
  const zodErrors: ValidationErrorRecordType[] = [];

  const processAppDocsWithVersions = async (appDocs: WorkflowDocument[]) => {
    const appIds = appDocs
      .map((doc) => toObjectId(doc._id))
      .filter((id): id is Types.ObjectId => !!id);

    if (appIds.length > 0) {
      const appVersionDocs = await MongoAppVersion.find(
        {
          appId: { $in: appIds }
        },
        appVersionProjection
      )
        .sort({ _id: 1 })
        .lean<WorkflowDocument[]>();

      await processBatch({
        model: MongoAppVersion,
        docs: appVersionDocs,
        config: appVersionConfig,
        dryRun,
        stats: appVersions,
        zodErrors,
        maxZodErrors: MAX_ZOD_ERRORS
      });
    }

    await processBatch({
      model: MongoApp,
      docs: appDocs,
      config: appConfig,
      dryRun,
      stats: apps,
      zodErrors,
      maxZodErrors: MAX_ZOD_ERRORS
    });
  };

  let lastId: unknown;
  while (true) {
    const docs = await MongoApp.find(
      buildAppScanQuery({
        lastId
      }),
      appProjection
    )
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean<WorkflowDocument[]>();

    if (docs.length === 0) break;

    await processAppDocsWithVersions(docs);
    lastId = docs[docs.length - 1]?._id;
  }

  const total = mergeStats([apps, appVersions]);
  const result = {
    dryRun,
    apps: serializeStats(apps),
    appVersions: serializeStats(appVersions),
    total: serializeStats(total),
    zodErrors
  };

  return V1WorkflowToV2ResponseSchema.parse(result);
}

async function handler(req: ApiRequestProps): Promise<V1WorkflowToV2ResponseType> {
  await authCert({ req, authRoot: true });

  const body = parseApiInput({
    req,
    bodySchema: V1WorkflowToV2BodySchema
  }).body;

  return runV1WorkflowToV2Migration(body);
}

export default NextAPI(handler);
