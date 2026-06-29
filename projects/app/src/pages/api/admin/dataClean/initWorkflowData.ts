import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import type { AnyBulkWriteOperation, Model } from '@fastgpt/service/common/mongo';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import { PublishAppBodySchema } from '@fastgpt/global/openapi/core/app/version/api';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { getLogger } from '@fastgpt/service/common/logger';
import z from 'zod';

/* ============================================================================
 * API: 初始化工作流 V2 枚举与结构脏数据
 * Route: POST /api/admin/dataClean/initWorkflowData
 * Method: POST
 * Description: 管理员数据清洗接口，扫描 apps.modules 与 app_versions.nodes，按保存接口结构格式化工作流数据并在 Zod 校验通过后写库。
 * Tags: ['Admin', 'DataClean', 'Workflow', 'Write']
 * ============================================================================ */

const logger = getLogger(['initWorkflowData']);
const PROGRESS_LOG_EVERY = 1000;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_WRITE_BATCH_SIZE = 10;
const validFlowNodeTypes = new Set(Object.values(FlowNodeTypeEnum));
const validFlowNodeInputTypes = new Set(Object.values(FlowNodeInputTypeEnum));
const validFlowNodeOutputTypes = new Set(Object.values(FlowNodeOutputTypeEnum));
const validWorkflowIOValueTypes = new Set(Object.values(WorkflowIOValueTypeEnum));
const validVariableInputTypes = new Set(Object.values(VariableInputEnum));
const validPluginStatusValues = new Set(Object.values(PluginStatusEnum));
const pluginStatusNumberMap = {
  1: PluginStatusEnum.Normal,
  2: PluginStatusEnum.SoonOffline,
  3: PluginStatusEnum.Offline
} as const;
const optionalNodeStringFields = [
  'parentNodeId',
  'avatar',
  'avatarLinear',
  'intro',
  'toolDescription',
  'version',
  'versionLabel',
  'pluginId',
  'source',
  'readmeUrl'
] as const;
const optionalToolDataStringFields = [
  'diagram',
  'userGuide',
  'courseUrl',
  'readmeUrl',
  'name',
  'avatar',
  'error'
] as const;
const optionalWorkflowIOStringFields = [
  'referencePlaceholder',
  'placeholder',
  'valueDesc',
  'debugLabel',
  'description',
  'toolDescription',
  'enum'
] as const;
const optionalWorkflowIOArrayFields = ['list', 'markList'] as const;
const optionalWorkflowIONumberFields = [
  'maxLength',
  'minLength',
  'step',
  'max',
  'min',
  'precision'
] as const;
const optionalWorkflowIOBooleanFields = [
  'required',
  'canEdit',
  'isPro',
  'isToolOutput',
  'deprecated'
] as const;
const optionalNodeBooleanFields = [
  'abandon',
  'showStatus',
  'isLatestVersion',
  'catchError',
  'isFolder',
  'hasTokenFee',
  'hasSystemSecret'
] as const;
const optionalNodeNumberFields = ['currentCost', 'systemKeyCost'] as const;
const optionalNodeObjectFields = ['position'] as const;
const legacyVariableInputTypeMap: Record<string, VariableInputEnum> = {
  string: VariableInputEnum.input,
  text: VariableInputEnum.input,
  number: VariableInputEnum.numberInput,
  boolean: VariableInputEnum.switch,
  multiSelect: VariableInputEnum.multipleSelect
};
const saveApiSchema = PublishAppBodySchema.pick({ nodes: true, edges: true, chatConfig: true });
const enumConfigs = {
  renderTypeList: {
    enumName: 'FlowNodeInputTypeEnum',
    enumObject: FlowNodeInputTypeEnum,
    regexp: /^FlowNodeInputTypeEnum\./
  },
  outputType: {
    enumName: 'FlowNodeOutputTypeEnum',
    enumObject: FlowNodeOutputTypeEnum,
    regexp: /^FlowNodeOutputTypeEnum\./
  },
  valueType: {
    enumName: 'WorkflowIOValueTypeEnum',
    enumObject: WorkflowIOValueTypeEnum,
    regexp: /^WorkflowIOValueTypeEnum\./
  }
} as const;

const InitWorkflowDataBodySchema = z
  .object({
    dryRun: BoolSchema.optional().meta({
      example: true,
      description: '是否只扫描验证不写库'
    }),
    dryrun: BoolSchema.optional().meta({
      example: true,
      description: '是否只扫描验证不写库，兼容小写参数'
    }),
    batchSize: IntSchema.refine((value) => value >= 1)
      .optional()
      .meta({
        example: DEFAULT_BATCH_SIZE,
        description: '每批读取文档数量'
      }),
    batchsize: IntSchema.refine((value) => value >= 1)
      .optional()
      .meta({
        example: DEFAULT_BATCH_SIZE,
        description: '每批读取文档数量，兼容小写参数'
      }),
    writeBatchSize: IntSchema.refine((value) => value >= 1)
      .optional()
      .meta({
        example: DEFAULT_WRITE_BATCH_SIZE,
        description: '每次 bulkWrite 的文档数量'
      })
  })
  .transform((body) => ({
    dryRun: body.dryRun ?? body.dryrun ?? true,
    batchSize: body.batchSize ?? body.batchsize ?? DEFAULT_BATCH_SIZE,
    writeBatchSize: body.writeBatchSize ?? DEFAULT_WRITE_BATCH_SIZE
  }));
export type InitWorkflowDataBodyType = z.infer<typeof InitWorkflowDataBodySchema>;

const EnumExpressionEntrySchema = z.object({
  field: z.enum(['renderTypeList', 'outputType', 'valueType']).meta({ description: '字段名' }),
  expression: z.string().meta({ description: '历史枚举表达式' }),
  enumKey: z.string().meta({ description: '枚举 key' }),
  known: z.boolean().meta({ description: '是否能映射到当前枚举' }),
  fixedValue: z.string().optional().meta({ description: '修复后的值' }),
  count: z.number().int().nonnegative().meta({ description: '出现次数' })
});
const ValidationIssueSchema = z.object({
  code: z.string().meta({ description: 'Zod 错误码' }),
  path: z.string().meta({ description: '错误字段路径' }),
  message: z.string().meta({ description: '错误信息' }),
  expected: z.unknown().optional().meta({ description: '期望值' }),
  received: z.unknown().optional().meta({ description: '实际类型' }),
  actualValue: z.unknown().optional().meta({ description: '压缩后的实际值' })
});
const ValidationErrorRecordSchema = z.object({
  collectionName: z.string().meta({ description: '集合名' }),
  fieldName: z.string().meta({ description: '工作流字段名' }),
  documentId: z.string().optional().meta({ description: '文档 ID' }),
  appId: z.string().optional().meta({ description: '应用 ID' }),
  appVersion: z.string().optional().meta({ description: '应用版本号' }),
  name: z.string().optional().meta({ description: '应用名称' }),
  schemaName: z.string().meta({ description: 'Schema 名称' }),
  stage: z.enum(['saveApi', 'clean', 'write']).meta({ description: '报错阶段' }),
  issueCount: z.number().int().nonnegative().meta({ description: '错误数量' }),
  issues: z.array(ValidationIssueSchema).meta({ description: '错误明细' })
});
const CollectionStatsSchema = z.object({
  collectionName: z.string().meta({ description: '集合名' }),
  fieldName: z.string().meta({ description: '工作流字段名' }),
  queryMatchedDocumentCount: z.number().int().nonnegative().nullable().meta({
    description: '查询命中文档数量；固定全量扫描时为 null'
  }),
  scannedDocumentCount: z.number().int().nonnegative().meta({ description: '已扫描文档数' }),
  fixableDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '存在可修复枚举的文档数' }),
  unknownDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '存在未知枚举表达式的文档数' }),
  enumExpressionCount: z.number().int().nonnegative().meta({ description: '枚举表达式总数' }),
  renderTypeListFixableCount: z.number().int().nonnegative().meta({
    description: '可修复 renderTypeList 数量'
  }),
  outputTypeFixableCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '可修复 output.type 数量' }),
  valueTypeFixableCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '可修复 valueType 数量' }),
  unknownEnumExpressionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '未知枚举表达式数量' }),
  saveApiValidationErrorDocumentCount: z.number().int().nonnegative().meta({
    description: '保存接口 Schema 校验失败文档数'
  }),
  cleanErrorDocumentCount: z.number().int().nonnegative().meta({ description: '清洗异常文档数' }),
  formatChangedDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '存在 format 变更的文档数' }),
  writeSuccessDocumentCount: z.number().int().nonnegative().meta({ description: '写入成功文档数' }),
  writeBlockedDocumentCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '因校验失败阻断写入文档数' }),
  writeErrorDocumentCount: z.number().int().nonnegative().meta({ description: '写入失败文档数' }),
  byExpression: z.array(EnumExpressionEntrySchema).meta({ description: '枚举表达式分布' })
});
export type CollectionStatsType = z.infer<typeof CollectionStatsSchema>;

const InitWorkflowDataResponseSchema = z.object({
  dryRun: z.boolean().meta({ description: '是否 dryRun' }),
  batchSize: z.number().int().positive().meta({ description: '每批读取文档数量' }),
  writeBatchSize: z.number().int().positive().meta({ description: '每次 bulkWrite 的文档数量' }),
  apps: CollectionStatsSchema,
  appVersions: CollectionStatsSchema,
  total: CollectionStatsSchema
});
export type InitWorkflowDataResponseType = z.infer<typeof InitWorkflowDataResponseSchema>;

type CollectionKey = 'apps' | 'appVersions';
type EnumField = keyof typeof enumConfigs;
type CollectionConfig = {
  key: CollectionKey;
  collectionName: 'apps' | 'app_versions';
  fieldName: 'modules' | 'nodes';
  saveSchemaName: 'PublishAppBodySchema.nodes/edges/chatConfig';
};
type WorkflowIOItem = {
  renderTypeList?: unknown;
  type?: unknown;
  valueType?: unknown;
  [key: string]: unknown;
};
type WorkflowNode = {
  flowNodeType?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  [key: string]: unknown;
};
type WorkflowDocument = {
  _id?: unknown;
  appId?: unknown;
  name?: unknown;
  version?: unknown;
  modules?: unknown;
  nodes?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
};
type DocumentContext = {
  collectionName: string;
  documentId?: string;
  appId?: string;
  appVersion?: string;
  name?: string;
};
type EnumExpressionEntry = z.infer<typeof EnumExpressionEntrySchema>;
type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
type ValidationErrorRecord = z.infer<typeof ValidationErrorRecordSchema>;
type FormatChangeTracker = {
  count: number;
};
type MutableCollectionStats = Omit<CollectionStatsType, 'byExpression'> & {
  byExpression: Record<string, EnumExpressionEntry>;
};
type CleanResult = {
  nodes: unknown[];
  edges: unknown;
  chatConfig: unknown;
  renderTypeListFixedCount: number;
  outputTypeFixedCount: number;
  valueTypeFixedCount: number;
  unknownEnumExpressionCount: number;
  formatChanges: FormatChangeTracker;
};
type RuntimeContext = Pick<InitWorkflowDataBodyType, 'dryRun'> & {
  writeBatchSize: number;
};
type PendingWriteOperation = {
  docContext: DocumentContext;
  operation: AnyBulkWriteOperation<any>;
};
type ProcessDocumentResult = {
  writeOperation?: PendingWriteOperation;
};

const collectionConfigs = {
  apps: {
    key: 'apps',
    collectionName: 'apps',
    fieldName: 'modules',
    saveSchemaName: 'PublishAppBodySchema.nodes/edges/chatConfig'
  },
  appVersions: {
    key: 'appVersions',
    collectionName: 'app_versions',
    fieldName: 'nodes',
    saveSchemaName: 'PublishAppBodySchema.nodes/edges/chatConfig'
  }
} as const satisfies Record<CollectionKey, CollectionConfig>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringifyId = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
};

const pathToString = (issuePath: PropertyKey[]) => issuePath.map((item) => String(item)).join('.');

const getValueByPath = ({ value, issuePath }: { value: unknown; issuePath: PropertyKey[] }) =>
  issuePath.reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && typeof key === 'number') return current[key];
    if (isRecord(current) && (typeof key === 'string' || typeof key === 'number')) {
      return current[key];
    }
    return undefined;
  }, value);

const compactIssueValue = (value: unknown): unknown => {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length
    };
  }
  if (typeof value === 'object') {
    const stringValue = stringifyId(value);
    if (stringValue && /^[0-9a-fA-F]{24}$/.test(stringValue)) return stringValue;
    return {
      type: 'object',
      keys: Object.keys(value).slice(0, 20)
    };
  }
  return String(value);
};

const recordFormatChange = ({
  changes
}: {
  changes: FormatChangeTracker;
  path: string;
  before: unknown;
  after: unknown;
  reason: string;
}) => {
  changes.count += 1;
};

const deleteNullOptionalField = ({
  target,
  key,
  path: fieldPath,
  changes,
  reason
}: {
  target: Record<string, unknown>;
  key: string;
  path: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  if (target[key] !== null) return;

  recordFormatChange({
    changes,
    path: fieldPath,
    before: null,
    after: undefined,
    reason
  });
  delete target[key];
};

const normalizeStringFallback = ({
  target,
  key,
  fallback,
  path: fieldPath,
  changes,
  reason
}: {
  target: Record<string, unknown>;
  key: string;
  fallback: string;
  path: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  if (typeof target[key] === 'string') return;

  recordFormatChange({
    changes,
    path: fieldPath,
    before: target[key],
    after: fallback,
    reason
  });
  target[key] = fallback;
};

const normalizeBooleanOptionalField = ({
  target,
  key,
  path: fieldPath,
  changes,
  reason
}: {
  target: Record<string, unknown>;
  key: string;
  path: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  if (target[key] !== null) return;

  recordFormatChange({
    changes,
    path: fieldPath,
    before: null,
    after: undefined,
    reason
  });
  delete target[key];
};

const normalizeStringOptionalFields = ({
  target,
  keys,
  basePath,
  changes,
  reason
}: {
  target: Record<string, unknown>;
  keys: readonly string[];
  basePath: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  keys.forEach((key) =>
    deleteNullOptionalField({
      target,
      key,
      path: `${basePath}.${key}`,
      changes,
      reason
    })
  );
};

const normalizeNullOptionalFields = ({
  target,
  keys,
  basePath,
  changes,
  reason
}: {
  target: Record<string, unknown>;
  keys: readonly string[];
  basePath: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  keys.forEach((key) =>
    deleteNullOptionalField({
      target,
      key,
      path: `${basePath}.${key}`,
      changes,
      reason
    })
  );
};

const normalizeValueType = ({
  value,
  path: fieldPath,
  changes,
  reason
}: {
  value: unknown;
  path: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  if (value === undefined) return value;
  if (
    typeof value === 'string' &&
    validWorkflowIOValueTypes.has(value as WorkflowIOValueTypeEnum)
  ) {
    return value;
  }

  recordFormatChange({
    changes,
    path: fieldPath,
    before: value,
    after: WorkflowIOValueTypeEnum.any,
    reason
  });
  return WorkflowIOValueTypeEnum.any;
};

const normalizeValueTypeList = ({
  list,
  path: fieldPath,
  changes
}: {
  list: unknown;
  path: string;
  changes: FormatChangeTracker;
}) => {
  if (!Array.isArray(list)) return list;

  return list.map((valueType, valueTypeIndex) =>
    normalizeValueType({
      value: valueType,
      path: `${fieldPath}[${valueTypeIndex}]`,
      changes,
      reason: 'legacy invalid workflow value type option converted to any'
    })
  );
};

const normalizeSelectValueTypeList = ({
  item,
  basePath,
  changes
}: {
  item: Record<string, unknown>;
  basePath: string;
  changes: FormatChangeTracker;
}) => {
  ['customInputConfig', 'customFieldConfig'].forEach((configKey) => {
    const configValue = item[configKey];
    if (!isRecord(configValue)) return;

    if (configValue.selectValueTypeList === null) {
      recordFormatChange({
        changes,
        path: `${basePath}.${configKey}.selectValueTypeList`,
        before: null,
        after: undefined,
        reason: 'legacy optional selectValueTypeList is null'
      });
      delete configValue.selectValueTypeList;
    }

    const nextConfigValue = { ...configValue };
    const normalizedValueTypeList = normalizeValueTypeList({
      list: configValue.selectValueTypeList,
      path: `${basePath}.${configKey}.selectValueTypeList`,
      changes
    });
    if (normalizedValueTypeList === undefined) {
      delete nextConfigValue.selectValueTypeList;
    } else {
      nextConfigValue.selectValueTypeList = normalizedValueTypeList;
    }
    item[configKey] = nextConfigValue;
  });
};

const normalizeRenderTypeList = ({
  list,
  path: fieldPath,
  changes
}: {
  list: unknown;
  path: string;
  changes: FormatChangeTracker;
}) => {
  if (!Array.isArray(list)) return list;

  return list
    .map((renderType, renderTypeIndex) => {
      if (
        typeof renderType === 'string' &&
        validFlowNodeInputTypes.has(renderType as FlowNodeInputTypeEnum)
      ) {
        return renderType;
      }

      recordFormatChange({
        changes,
        path: `${fieldPath}[${renderTypeIndex}]`,
        before: renderType,
        after: undefined,
        reason: 'legacy invalid render type removed'
      });
      return undefined;
    })
    .filter((renderType): renderType is FlowNodeInputTypeEnum => renderType !== undefined);
};

const normalizePluginStatus = ({
  value,
  path: fieldPath,
  changes
}: {
  value: unknown;
  path: string;
  changes: FormatChangeTracker;
}) => {
  const normalizedStatus = (() => {
    if (typeof value === 'string' && validPluginStatusValues.has(value as PluginStatusType)) {
      return value;
    }
    if (
      typeof value === 'number' &&
      Object.prototype.hasOwnProperty.call(pluginStatusNumberMap, value)
    ) {
      return pluginStatusNumberMap[value as keyof typeof pluginStatusNumberMap];
    }
    return undefined;
  })();

  if (normalizedStatus === value) return value;

  recordFormatChange({
    changes,
    path: fieldPath,
    before: value,
    after: normalizedStatus,
    reason: 'legacy plugin status normalized'
  });

  return normalizedStatus;
};

const getNodeIdFallback = ({
  node,
  nodeIndex,
  documentId
}: {
  node: Record<string, unknown>;
  nodeIndex: number;
  documentId?: string;
}) => {
  if (typeof node.moduleId === 'string' && node.moduleId.length > 0) return node.moduleId;

  const seed = `${documentId ?? 'doc'}-${nodeIndex}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36).slice(0, 6).padStart(6, '0');
};

const normalizeOptionListLabels = ({
  item,
  listKey,
  basePath,
  changes
}: {
  item: Record<string, unknown>;
  listKey: 'list' | 'enums';
  basePath: string;
  changes: FormatChangeTracker;
}) => {
  const list = item[listKey];
  if (!Array.isArray(list)) return;

  item[listKey] = list
    .map((option, optionIndex) => {
      if (!isRecord(option)) return option;

      const nextOption: Record<string, unknown> = { ...option };
      if (nextOption.value === undefined) {
        recordFormatChange({
          changes,
          path: `${basePath}.${listKey}[${optionIndex}].value`,
          before: nextOption.value,
          after: '',
          reason: 'legacy option missing value'
        });
        nextOption.value = '';
      }

      if (typeof nextOption.label !== 'string' && typeof nextOption.value === 'string') {
        recordFormatChange({
          changes,
          path: `${basePath}.${listKey}[${optionIndex}].label`,
          before: nextOption.label,
          after: nextOption.value,
          reason: 'legacy option missing label'
        });
        nextOption.label = nextOption.value;
      }

      return nextOption;
    })
    .filter((option) => option !== undefined);
};

const normalizeJsonStringArrayField = ({
  item,
  key,
  path: fieldPath,
  changes,
  reason
}: {
  item: Record<string, unknown>;
  key: string;
  path: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  if (typeof item[key] !== 'string') return;

  try {
    const parsedValue = JSON.parse(item[key]);
    if (!Array.isArray(parsedValue)) throw new Error('parsed value is not array');

    recordFormatChange({
      changes,
      path: fieldPath,
      before: item[key],
      after: parsedValue,
      reason
    });
    item[key] = parsedValue;
  } catch {
    recordFormatChange({
      changes,
      path: fieldPath,
      before: item[key],
      after: undefined,
      reason: `${reason}, parse failed`
    });
    delete item[key];
  }
};

const normalizeNonNegativeIntOptionalField = ({
  item,
  key,
  path: fieldPath,
  changes,
  reason
}: {
  item: Record<string, unknown>;
  key: string;
  path: string;
  changes: FormatChangeTracker;
  reason: string;
}) => {
  if (item[key] === undefined) return;
  if (Number.isInteger(item[key]) && Number(item[key]) >= 0) return;

  recordFormatChange({
    changes,
    path: fieldPath,
    before: item[key],
    after: undefined,
    reason
  });
  delete item[key];
};

const normalizeVariableType = ({
  variable,
  variableIndex,
  changes
}: {
  variable: Record<string, unknown>;
  variableIndex: number;
  changes: FormatChangeTracker;
}) => {
  const currentType = variable.type;
  const normalizedType = (() => {
    if (
      typeof currentType === 'string' &&
      validVariableInputTypes.has(currentType as VariableInputEnum)
    ) {
      return currentType;
    }
    if (typeof currentType === 'string' && legacyVariableInputTypeMap[currentType]) {
      return legacyVariableInputTypeMap[currentType];
    }
    if (variable.valueType === WorkflowIOValueTypeEnum.number) return VariableInputEnum.numberInput;
    if (variable.valueType === WorkflowIOValueTypeEnum.boolean) return VariableInputEnum.switch;
    if (Array.isArray(variable.list) || Array.isArray(variable.enums))
      return VariableInputEnum.select;
    return VariableInputEnum.input;
  })();

  if (currentType === normalizedType) return;

  recordFormatChange({
    changes,
    path: `chatConfig.variables[${variableIndex}].type`,
    before: currentType,
    after: normalizedType,
    reason: 'legacy variable input type normalized'
  });
  variable.type = normalizedType;
};

const normalizeVariableBaseFields = ({
  variable,
  variableIndex,
  changes
}: {
  variable: Record<string, unknown>;
  variableIndex: number;
  changes: FormatChangeTracker;
}) => {
  if (typeof variable.key !== 'string' || variable.key.length === 0) {
    const fallbackKey =
      typeof variable.label === 'string' && variable.label.length > 0
        ? variable.label
        : `variable_${variableIndex}`;
    recordFormatChange({
      changes,
      path: `chatConfig.variables[${variableIndex}].key`,
      before: variable.key,
      after: fallbackKey,
      reason: 'legacy variable missing key'
    });
    variable.key = fallbackKey;
  }

  if (typeof variable.label !== 'string') {
    recordFormatChange({
      changes,
      path: `chatConfig.variables[${variableIndex}].label`,
      before: variable.label,
      after: variable.key,
      reason: 'legacy variable missing label'
    });
    variable.label = variable.key;
  }

  variable.valueType = normalizeValueType({
    value: variable.valueType,
    path: `chatConfig.variables[${variableIndex}].valueType`,
    changes,
    reason: 'legacy invalid variable value type converted to any'
  });
};

const removePropertyRequiredFlags = ({
  value,
  basePath,
  changes
}: {
  value: unknown;
  basePath: string;
  changes: FormatChangeTracker;
}) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      removePropertyRequiredFlags({ value: item, basePath: `${basePath}[${index}]`, changes })
    );
    return;
  }
  if (!isRecord(value)) return;

  Object.entries(value).forEach(([key, itemValue]) => {
    const itemPath = `${basePath}.${key}`;
    if ((key === 'properties' || key === '$defs' || key === 'definitions') && isRecord(itemValue)) {
      Object.entries(itemValue).forEach(([propertyKey, propertyValue]) => {
        if (!isRecord(propertyValue) || typeof propertyValue.required !== 'boolean') return;

        recordFormatChange({
          changes,
          path: `${itemPath}.${propertyKey}.required`,
          before: propertyValue.required,
          after: undefined,
          reason: 'legacy JSON schema property required flag removed'
        });
        delete propertyValue.required;
      });
    }

    removePropertyRequiredFlags({ value: itemValue, basePath: itemPath, changes });
  });
};

const normalizeToolConfig = ({
  toolConfig,
  basePath,
  changes
}: {
  toolConfig: unknown;
  basePath: string;
  changes: FormatChangeTracker;
}) => {
  if (toolConfig === null) {
    recordFormatChange({
      changes,
      path: basePath,
      before: null,
      after: undefined,
      reason: 'legacy optional toolConfig is null'
    });
    return undefined;
  }
  if (!isRecord(toolConfig)) return toolConfig;

  removePropertyRequiredFlags({ value: toolConfig, basePath, changes });
  const systemToolSet = toolConfig.systemToolSet;
  if (isRecord(systemToolSet) && Array.isArray(systemToolSet.toolList)) {
    systemToolSet.toolList = systemToolSet.toolList
      .map((tool, toolIndex) => {
        if (!isRecord(tool)) {
          recordFormatChange({
            changes,
            path: `${basePath}.systemToolSet.toolList[${toolIndex}]`,
            before: tool,
            after: undefined,
            reason: 'legacy invalid system tool set child removed'
          });
          return undefined;
        }

        const nextTool: Record<string, unknown> = { ...tool };
        normalizeStringFallback({
          target: nextTool,
          key: 'toolId',
          fallback:
            typeof tool.key === 'string' && tool.key.length > 0
              ? tool.key
              : typeof tool.name === 'string' && tool.name.length > 0
                ? tool.name
                : `${String(systemToolSet.toolId ?? 'systemTool')}_${toolIndex}`,
          path: `${basePath}.systemToolSet.toolList[${toolIndex}].toolId`,
          changes,
          reason: 'legacy system tool set child missing toolId'
        });
        normalizeStringFallback({
          target: nextTool,
          key: 'name',
          fallback: typeof nextTool.toolId === 'string' ? nextTool.toolId : `tool_${toolIndex}`,
          path: `${basePath}.systemToolSet.toolList[${toolIndex}].name`,
          changes,
          reason: 'legacy system tool set child missing name'
        });
        normalizeStringFallback({
          target: nextTool,
          key: 'description',
          fallback: '',
          path: `${basePath}.systemToolSet.toolList[${toolIndex}].description`,
          changes,
          reason: 'legacy system tool set child missing description'
        });

        return nextTool;
      })
      .filter((tool) => tool !== undefined);
  }

  const httpToolSet = toolConfig.httpToolSet;
  if (isRecord(httpToolSet) && typeof httpToolSet.customHeaders !== 'string') {
    recordFormatChange({
      changes,
      path: `${basePath}.httpToolSet.customHeaders`,
      before: httpToolSet.customHeaders,
      after: undefined,
      reason: 'legacy invalid httpToolSet customHeaders removed'
    });
    delete httpToolSet.customHeaders;
  }
  return toolConfig;
};

const normalizeInputListValue = ({
  inputList,
  basePath,
  changes
}: {
  inputList: unknown;
  basePath: string;
  changes: FormatChangeTracker;
}) => {
  if (inputList === null) {
    recordFormatChange({
      changes,
      path: basePath,
      before: null,
      after: undefined,
      reason: 'legacy optional inputList is null'
    });
    return undefined;
  }
  if (!Array.isArray(inputList)) return inputList;

  return inputList.map((inputConfig, inputIndex) => {
    if (!isRecord(inputConfig)) return inputConfig;

    const nextInputConfig: Record<string, unknown> = { ...inputConfig };
    if (
      nextInputConfig.value !== undefined &&
      !isRecord(nextInputConfig.value) &&
      (typeof nextInputConfig.value === 'string' || typeof nextInputConfig.value === 'number')
    ) {
      const nextValue = { value: String(nextInputConfig.value) };
      recordFormatChange({
        changes,
        path: `${basePath}[${inputIndex}].value`,
        before: nextInputConfig.value,
        after: nextValue,
        reason: 'legacy input config secret value normalized'
      });
      nextInputConfig.value = nextValue;
    }

    return nextInputConfig;
  });
};

const normalizeWorkflowIOItem = ({
  item,
  basePath,
  changes,
  kind,
  itemIndex
}: {
  item: Record<string, unknown>;
  basePath: string;
  changes: FormatChangeTracker;
  kind: 'inputs' | 'outputs';
  itemIndex: number;
}) => {
  normalizeStringFallback({
    target: item,
    key: 'key',
    fallback:
      typeof item.id === 'string'
        ? item.id
        : typeof item.label === 'string'
          ? item.label
          : `${kind}_${itemIndex}`,
    path: `${basePath}.key`,
    changes,
    reason: 'legacy workflow IO missing key'
  });

  normalizeStringFallback({
    target: item,
    key: 'label',
    fallback: typeof item.key === 'string' ? item.key : '',
    path: `${basePath}.label`,
    changes,
    reason: 'legacy workflow IO missing label'
  });

  normalizeStringOptionalFields({
    target: item,
    keys: optionalWorkflowIOStringFields,
    basePath,
    changes,
    reason: 'legacy optional workflow IO string field is null'
  });
  normalizeNullOptionalFields({
    target: item,
    keys: optionalWorkflowIOArrayFields,
    basePath,
    changes,
    reason: 'legacy optional workflow IO array field is null'
  });
  normalizeNullOptionalFields({
    target: item,
    keys: optionalWorkflowIONumberFields,
    basePath,
    changes,
    reason: 'legacy optional workflow IO number field is null'
  });

  optionalWorkflowIOBooleanFields.forEach((key) =>
    normalizeBooleanOptionalField({
      target: item,
      key,
      path: `${basePath}.${key}`,
      changes,
      reason: 'legacy optional workflow IO boolean field is null'
    })
  );

  normalizeOptionListLabels({ item, listKey: 'list', basePath, changes });
  normalizeOptionListLabels({ item, listKey: 'enums', basePath, changes });
  normalizeSelectValueTypeList({ item, basePath, changes });
  const normalizedInputList = normalizeInputListValue({
    inputList: item.inputList,
    basePath: `${basePath}.inputList`,
    changes
  });
  if (normalizedInputList === undefined) {
    delete item.inputList;
  } else {
    item.inputList = normalizedInputList;
  }

  if (kind === 'inputs') {
    item.renderTypeList = normalizeRenderTypeList({
      list: item.renderTypeList,
      path: `${basePath}.renderTypeList`,
      changes
    });

    if (!Array.isArray(item.renderTypeList) || item.renderTypeList.length === 0) {
      recordFormatChange({
        changes,
        path: `${basePath}.renderTypeList`,
        before: item.renderTypeList,
        after: [FlowNodeInputTypeEnum.reference],
        reason: 'legacy input missing render type'
      });
      item.renderTypeList = [FlowNodeInputTypeEnum.reference];
    }
  }

  if (kind === 'outputs') {
    normalizeStringFallback({
      target: item,
      key: 'id',
      fallback: typeof item.key === 'string' ? item.key : `outputs_${itemIndex}`,
      path: `${basePath}.id`,
      changes,
      reason: 'legacy output missing id'
    });

    if (!validFlowNodeOutputTypes.has(item.type as FlowNodeOutputTypeEnum)) {
      recordFormatChange({
        changes,
        path: `${basePath}.type`,
        before: item.type,
        after: FlowNodeOutputTypeEnum.static,
        reason: 'legacy invalid output type converted to static'
      });
      item.type = FlowNodeOutputTypeEnum.static;
    }
  }
};

const normalizePluginData = ({
  pluginData,
  basePath,
  changes
}: {
  pluginData: unknown;
  basePath: string;
  changes: FormatChangeTracker;
}) => {
  if (pluginData === null) {
    recordFormatChange({
      changes,
      path: basePath,
      before: null,
      after: undefined,
      reason: 'legacy optional pluginData is null'
    });
    return undefined;
  }
  if (!isRecord(pluginData)) return pluginData;

  const nextPluginData: Record<string, unknown> = { ...pluginData };
  normalizeStringOptionalFields({
    target: nextPluginData,
    keys: optionalToolDataStringFields,
    basePath,
    changes,
    reason: 'legacy optional plugin data string field is null'
  });

  if (nextPluginData.status !== undefined) {
    const normalizedStatus = normalizePluginStatus({
      value: nextPluginData.status,
      path: `${basePath}.status`,
      changes
    });

    if (normalizedStatus === undefined) {
      delete nextPluginData.status;
    } else {
      nextPluginData.status = normalizedStatus;
    }
  }

  return nextPluginData;
};

const buildEmptyNode = ({
  node,
  nodeIndex,
  rootPath,
  docContext,
  changes,
  reason
}: {
  node: unknown;
  nodeIndex: number;
  rootPath: string;
  docContext: DocumentContext;
  changes: FormatChangeTracker;
  reason: string;
}): WorkflowNode => {
  const fallbackNode = {
    nodeId: getNodeIdFallback({
      node: isRecord(node) ? node : {},
      nodeIndex,
      documentId: docContext.documentId
    }),
    name:
      isRecord(node) && typeof node.flowType === 'string'
        ? node.flowType
        : FlowNodeTypeEnum.emptyNode,
    flowNodeType: FlowNodeTypeEnum.emptyNode,
    inputs: [],
    outputs: []
  };

  recordFormatChange({
    changes,
    path: `${rootPath}[${nodeIndex}]`,
    before: node,
    after: fallbackNode,
    reason
  });

  return fallbackNode;
};

const emptyStats = ({
  collectionName,
  fieldName
}: {
  collectionName: string;
  fieldName: string;
}): MutableCollectionStats => ({
  collectionName,
  fieldName,
  queryMatchedDocumentCount: null,
  scannedDocumentCount: 0,
  fixableDocumentCount: 0,
  unknownDocumentCount: 0,
  enumExpressionCount: 0,
  renderTypeListFixableCount: 0,
  outputTypeFixableCount: 0,
  valueTypeFixableCount: 0,
  unknownEnumExpressionCount: 0,
  saveApiValidationErrorDocumentCount: 0,
  cleanErrorDocumentCount: 0,
  formatChangedDocumentCount: 0,
  writeSuccessDocumentCount: 0,
  writeBlockedDocumentCount: 0,
  writeErrorDocumentCount: 0,
  byExpression: {}
});

const createDocContext = ({
  collectionName,
  doc
}: {
  collectionName: string;
  doc: WorkflowDocument;
}): DocumentContext => ({
  collectionName,
  documentId: stringifyId(doc._id),
  appId: stringifyId(doc.appId),
  appVersion: typeof doc.version === 'string' ? doc.version : undefined,
  name: typeof doc.name === 'string' ? doc.name : undefined
});

const parseEnumExpressionValue = <T extends Record<string, string>>({
  enumObject,
  enumName,
  value
}: {
  enumObject: T;
  enumName: string;
  value: unknown;
}) => {
  if (typeof value !== 'string') return undefined;

  const prefix = `${enumName}.`;
  if (!value.startsWith(prefix)) return undefined;

  const enumKey = value.slice(prefix.length);
  const known = Object.prototype.hasOwnProperty.call(enumObject, enumKey);

  return {
    expression: value,
    enumKey,
    known,
    fixedValue: known ? enumObject[enumKey as keyof T] : undefined
  };
};

const recordExpression = ({
  stats,
  docResult,
  path: fieldPath,
  field,
  value
}: {
  stats: MutableCollectionStats;
  docResult: Pick<
    CleanResult,
    'renderTypeListFixedCount' | 'outputTypeFixedCount' | 'valueTypeFixedCount' | 'formatChanges'
  > & {
    unknownEnumExpressionCount: number;
  };
  path: string;
  field: EnumField;
  value: unknown;
}) => {
  const enumConfig = enumConfigs[field];
  const parsed = parseEnumExpressionValue({
    enumObject: enumConfig.enumObject,
    enumName: enumConfig.enumName,
    value
  });

  if (!parsed) return value;

  const expressionKey = `${field}:${parsed.expression}`;
  const existing = stats.byExpression[expressionKey];
  stats.byExpression[expressionKey] = existing || {
    field,
    expression: parsed.expression,
    enumKey: parsed.enumKey,
    known: parsed.known,
    fixedValue: parsed.fixedValue,
    count: 0
  };
  stats.byExpression[expressionKey].count += 1;
  stats.enumExpressionCount += 1;

  if (parsed.known) {
    if (field === 'renderTypeList') {
      docResult.renderTypeListFixedCount += 1;
      stats.renderTypeListFixableCount += 1;
    } else if (field === 'outputType') {
      docResult.outputTypeFixedCount += 1;
      stats.outputTypeFixableCount += 1;
    } else {
      docResult.valueTypeFixedCount += 1;
      stats.valueTypeFixableCount += 1;
    }
  } else {
    docResult.unknownEnumExpressionCount += 1;
    stats.unknownEnumExpressionCount += 1;
  }

  if (parsed.known && parsed.fixedValue !== value) {
    recordFormatChange({
      changes: docResult.formatChanges,
      path: fieldPath,
      before: value,
      after: parsed.fixedValue,
      reason: `${enumConfig.enumName} expression`
    });
  }

  return parsed.known ? parsed.fixedValue : value;
};

const fixWorkflowIOList = ({
  list,
  stats,
  docResult,
  basePath,
  kind,
  node
}: {
  list: unknown;
  stats: MutableCollectionStats;
  docResult: CleanResult;
  basePath: string;
  kind: 'inputs' | 'outputs';
  node: WorkflowNode;
}) => {
  if (!Array.isArray(list)) {
    recordFormatChange({
      changes: docResult.formatChanges,
      path: basePath,
      before: list,
      after: [],
      reason: 'legacy workflow IO list is not array'
    });
    return [];
  }

  return list.map((item, itemIndex) => {
    if (!isRecord(item)) {
      const fallbackItem =
        kind === 'inputs'
          ? {
              key: `${kind}_${itemIndex}`,
              label: `${kind}_${itemIndex}`,
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.any
            }
          : {
              id: `${kind}_${itemIndex}`,
              key: `${kind}_${itemIndex}`,
              label: `${kind}_${itemIndex}`,
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.any
            };

      recordFormatChange({
        changes: docResult.formatChanges,
        path: `${basePath}[${itemIndex}]`,
        before: item,
        after: fallbackItem,
        reason: 'legacy workflow IO item is not object'
      });
      return fallbackItem;
    }

    const nextItem: WorkflowIOItem = { ...item };

    if (Array.isArray(item.renderTypeList)) {
      nextItem.renderTypeList = item.renderTypeList.map((renderType, renderTypeIndex) =>
        recordExpression({
          stats,
          docResult,
          path: `${basePath}[${itemIndex}].renderTypeList[${renderTypeIndex}]`,
          field: 'renderTypeList',
          value: renderType
        })
      );
    }

    nextItem.renderTypeList = normalizeRenderTypeList({
      list: nextItem.renderTypeList,
      path: `${basePath}[${itemIndex}].renderTypeList`,
      changes: docResult.formatChanges
    });

    if (kind === 'outputs') {
      nextItem.type = recordExpression({
        stats,
        docResult,
        path: `${basePath}[${itemIndex}].type`,
        field: 'outputType',
        value: item.type
      });
    }

    nextItem.valueType = recordExpression({
      stats,
      docResult,
      path: `${basePath}[${itemIndex}].valueType`,
      field: 'valueType',
      value: item.valueType
    });
    nextItem.valueType = normalizeValueType({
      value: nextItem.valueType,
      path: `${basePath}[${itemIndex}].valueType`,
      changes: docResult.formatChanges,
      reason: 'legacy invalid workflow value type converted to any'
    });

    if (
      kind === 'inputs' &&
      nextItem.valueType == null &&
      node.flowNodeType === FlowNodeTypeEnum.code &&
      (item.key === NodeInputKeyEnum.codeType || item.key === NodeInputKeyEnum.code)
    ) {
      nextItem.valueType = WorkflowIOValueTypeEnum.string;
      recordFormatChange({
        changes: docResult.formatChanges,
        path: `${basePath}[${itemIndex}].valueType`,
        before: item.valueType,
        after: nextItem.valueType,
        reason: 'legacy code node input missing valueType'
      });
    }

    normalizeWorkflowIOItem({
      item: nextItem,
      basePath: `${basePath}[${itemIndex}]`,
      changes: docResult.formatChanges,
      kind,
      itemIndex
    });

    return nextItem;
  });
};

/**
 * 兼容旧版 chatConfig 数据，保证 dry-run 和写库前校验检查的是最终待保存结构。
 */
const formatChatConfig = ({
  chatConfig,
  formatChanges
}: {
  chatConfig: unknown;
  formatChanges: FormatChangeTracker;
}) => {
  if (chatConfig == null) {
    recordFormatChange({
      changes: formatChanges,
      path: 'chatConfig',
      before: chatConfig,
      after: {},
      reason: 'legacy empty chatConfig'
    });
    return {};
  }

  if (!isRecord(chatConfig)) return chatConfig;

  const nextChatConfig: Record<string, unknown> = { ...chatConfig };
  const optionalChatConfigKeys = [
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
  ];

  optionalChatConfigKeys.forEach((key) => {
    if (nextChatConfig[key] === null) {
      recordFormatChange({
        changes: formatChanges,
        path: `chatConfig.${key}`,
        before: null,
        after: undefined,
        reason: 'legacy optional chatConfig field is null'
      });
      delete nextChatConfig[key];
    }
  });

  if (typeof nextChatConfig.questionGuide === 'boolean') {
    recordFormatChange({
      changes: formatChanges,
      path: 'chatConfig.questionGuide',
      before: nextChatConfig.questionGuide,
      after: { open: nextChatConfig.questionGuide },
      reason: 'legacy boolean questionGuide'
    });
    nextChatConfig.questionGuide = { open: nextChatConfig.questionGuide };
  } else if (
    nextChatConfig.questionGuide !== undefined &&
    !isRecord(nextChatConfig.questionGuide)
  ) {
    recordFormatChange({
      changes: formatChanges,
      path: 'chatConfig.questionGuide',
      before: nextChatConfig.questionGuide,
      after: undefined,
      reason: 'legacy invalid questionGuide removed'
    });
    delete nextChatConfig.questionGuide;
  }

  if (nextChatConfig.chatInputGuide !== undefined) {
    const shouldRemoveChatInputGuide =
      !isRecord(nextChatConfig.chatInputGuide) ||
      typeof nextChatConfig.chatInputGuide.customUrl !== 'string';

    if (shouldRemoveChatInputGuide) {
      recordFormatChange({
        changes: formatChanges,
        path: 'chatConfig.chatInputGuide',
        before: nextChatConfig.chatInputGuide,
        after: undefined,
        reason: 'legacy invalid chatInputGuide removed'
      });
      delete nextChatConfig.chatInputGuide;
    }
  }

  if (isRecord(nextChatConfig.autoExecute)) {
    const autoExecute = nextChatConfig.autoExecute;
    if (autoExecute.defaultPrompt === null) {
      recordFormatChange({
        changes: formatChanges,
        path: 'chatConfig.autoExecute.defaultPrompt',
        before: null,
        after: undefined,
        reason: 'legacy auto execute defaultPrompt is null'
      });
      delete autoExecute.defaultPrompt;
    }

    if (typeof autoExecute.open !== 'boolean') {
      recordFormatChange({
        changes: formatChanges,
        path: 'chatConfig.autoExecute',
        before: autoExecute,
        after: undefined,
        reason: 'legacy incomplete auto execute config removed'
      });
      delete nextChatConfig.autoExecute;
    }
  }

  if (isRecord(nextChatConfig.scheduledTriggerConfig)) {
    const scheduledTriggerConfig = nextChatConfig.scheduledTriggerConfig;
    const missingRequiredField =
      typeof scheduledTriggerConfig.cronString !== 'string' ||
      typeof scheduledTriggerConfig.timezone !== 'string' ||
      typeof scheduledTriggerConfig.defaultPrompt !== 'string';

    if (missingRequiredField) {
      recordFormatChange({
        changes: formatChanges,
        path: 'chatConfig.scheduledTriggerConfig',
        before: scheduledTriggerConfig,
        after: undefined,
        reason: 'legacy incomplete scheduled trigger config removed'
      });
      delete nextChatConfig.scheduledTriggerConfig;
    }
  }

  if (Array.isArray(nextChatConfig.variables)) {
    nextChatConfig.variables = nextChatConfig.variables.map((variable, variableIndex) => {
      if (!isRecord(variable)) return variable;

      const nextVariable: Record<string, unknown> = { ...variable };
      normalizeVariableBaseFields({
        variable: nextVariable,
        variableIndex,
        changes: formatChanges
      });

      if (nextVariable.description === undefined) {
        recordFormatChange({
          changes: formatChanges,
          path: `chatConfig.variables[${variableIndex}].description`,
          before: undefined,
          after: '',
          reason: 'legacy variable missing description'
        });
        nextVariable.description = '';
      }

      normalizeNonNegativeIntOptionalField({
        item: nextVariable,
        key: 'maxLength',
        path: `chatConfig.variables[${variableIndex}].maxLength`,
        changes: formatChanges,
        reason: 'legacy variable maxLength is not non-negative integer'
      });
      normalizeOptionListLabels({
        item: nextVariable,
        listKey: 'list',
        basePath: `chatConfig.variables[${variableIndex}]`,
        changes: formatChanges
      });
      normalizeJsonStringArrayField({
        item: nextVariable,
        key: 'enums',
        path: `chatConfig.variables[${variableIndex}].enums`,
        changes: formatChanges,
        reason: 'legacy variable enums JSON string converted to array'
      });
      normalizeVariableType({
        variable: nextVariable,
        variableIndex,
        changes: formatChanges
      });

      if (Array.isArray(nextVariable.enums)) {
        nextVariable.enums = nextVariable.enums.map((enumItem, enumIndex) => {
          if (!isRecord(enumItem)) return enumItem;

          const nextEnumItem: Record<string, unknown> = { ...enumItem };
          if (nextEnumItem.label === undefined && typeof nextEnumItem.value === 'string') {
            recordFormatChange({
              changes: formatChanges,
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

      return nextVariable;
    });
  }

  return nextChatConfig;
};

const formatEdges = ({
  edges,
  formatChanges
}: {
  edges: unknown;
  formatChanges: FormatChangeTracker;
}) => {
  if (edges == null) {
    recordFormatChange({
      changes: formatChanges,
      path: 'edges',
      before: edges,
      after: [],
      reason: 'legacy empty edges'
    });
    return [];
  }

  if (!Array.isArray(edges)) return edges;

  return edges.filter((edge, edgeIndex) => {
    if (!isRecord(edge)) return true;

    const hasInvalidEndpoint = typeof edge.source !== 'string' || typeof edge.target !== 'string';
    if (hasInvalidEndpoint) {
      recordFormatChange({
        changes: formatChanges,
        path: `edges[${edgeIndex}]`,
        before: edge,
        after: undefined,
        reason: 'legacy edge missing source or target removed'
      });
      return false;
    }

    const hasInvalidHandle =
      typeof edge.sourceHandle !== 'string' || typeof edge.targetHandle !== 'string';
    if (!hasInvalidHandle) return true;

    recordFormatChange({
      changes: formatChanges,
      path: `edges[${edgeIndex}]`,
      before: edge,
      after: undefined,
      reason: 'legacy edge missing sourceHandle or targetHandle removed'
    });
    return false;
  });
};

/**
 * 与本地 scan-workflow-enum-dirty-data 脚本保持一致：只在内存中 format，
 * 写库前必须通过 PublishAppBodySchema 的 nodes/edges/chatConfig 校验。
 */
export const formatWorkflowDocument = ({
  doc,
  fieldName,
  stats,
  docContext,
  rootPath
}: {
  doc: WorkflowDocument;
  fieldName: CollectionConfig['fieldName'];
  stats: MutableCollectionStats;
  docContext: DocumentContext;
  rootPath: string;
}): CleanResult => {
  const docResult: CleanResult = {
    nodes: [],
    edges: doc.edges,
    chatConfig: doc.chatConfig,
    renderTypeListFixedCount: 0,
    outputTypeFixedCount: 0,
    valueTypeFixedCount: 0,
    unknownEnumExpressionCount: 0,
    formatChanges: {
      count: 0
    }
  };

  const nodes = doc[fieldName];
  if (!Array.isArray(nodes)) {
    recordFormatChange({
      changes: docResult.formatChanges,
      path: rootPath,
      before: nodes,
      after: [],
      reason: 'legacy workflow nodes is not array'
    });
    docResult.chatConfig = formatChatConfig({
      chatConfig: doc.chatConfig,
      formatChanges: docResult.formatChanges
    });
    docResult.edges = formatEdges({
      edges: docResult.edges,
      formatChanges: docResult.formatChanges
    });
    return docResult;
  }

  docResult.nodes = nodes.map((node, nodeIndex) => {
    if (!isRecord(node)) {
      return buildEmptyNode({
        node,
        nodeIndex,
        rootPath,
        docContext,
        changes: docResult.formatChanges,
        reason: 'legacy workflow node is not object'
      });
    }

    const nextNode: WorkflowNode = { ...node };
    normalizeStringFallback({
      target: nextNode,
      key: 'nodeId',
      fallback: getNodeIdFallback({ node, nodeIndex, documentId: docContext.documentId }),
      path: `${rootPath}[${nodeIndex}].nodeId`,
      changes: docResult.formatChanges,
      reason: 'legacy node missing nodeId'
    });
    normalizeStringFallback({
      target: nextNode,
      key: 'name',
      fallback: typeof node.flowType === 'string' ? node.flowType : String(nextNode.nodeId),
      path: `${rootPath}[${nodeIndex}].name`,
      changes: docResult.formatChanges,
      reason: 'legacy node missing name'
    });
    normalizeStringOptionalFields({
      target: nextNode,
      keys: optionalNodeStringFields,
      basePath: `${rootPath}[${nodeIndex}]`,
      changes: docResult.formatChanges,
      reason: 'legacy optional node string field is null'
    });
    normalizeNullOptionalFields({
      target: nextNode,
      keys: optionalNodeBooleanFields,
      basePath: `${rootPath}[${nodeIndex}]`,
      changes: docResult.formatChanges,
      reason: 'legacy optional node boolean field is null'
    });
    normalizeNullOptionalFields({
      target: nextNode,
      keys: optionalNodeNumberFields,
      basePath: `${rootPath}[${nodeIndex}]`,
      changes: docResult.formatChanges,
      reason: 'legacy optional node number field is null'
    });
    normalizeNullOptionalFields({
      target: nextNode,
      keys: optionalNodeObjectFields,
      basePath: `${rootPath}[${nodeIndex}]`,
      changes: docResult.formatChanges,
      reason: 'legacy optional node object field is null'
    });
    if (typeof nextNode.version === 'number') {
      recordFormatChange({
        changes: docResult.formatChanges,
        path: `${rootPath}[${nodeIndex}].version`,
        before: nextNode.version,
        after: String(nextNode.version),
        reason: 'legacy numeric node version converted to string'
      });
      nextNode.version = String(nextNode.version);
    }

    if (
      node.flowNodeType === 'lafModule' ||
      !validFlowNodeTypes.has(node.flowNodeType as FlowNodeTypeEnum)
    ) {
      nextNode.flowNodeType = FlowNodeTypeEnum.emptyNode;
      recordFormatChange({
        changes: docResult.formatChanges,
        path: `${rootPath}[${nodeIndex}].flowNodeType`,
        before: node.flowNodeType,
        after: nextNode.flowNodeType,
        reason: 'legacy unknown node converted to emptyNode'
      });
    }

    nextNode.inputs = fixWorkflowIOList({
      list: node.inputs,
      stats,
      docResult,
      basePath: `${rootPath}[${nodeIndex}].inputs`,
      kind: 'inputs',
      node
    });
    nextNode.outputs = fixWorkflowIOList({
      list: node.outputs,
      stats,
      docResult,
      basePath: `${rootPath}[${nodeIndex}].outputs`,
      kind: 'outputs',
      node
    });
    const normalizedPluginData = normalizePluginData({
      pluginData: node.pluginData,
      basePath: `${rootPath}[${nodeIndex}].pluginData`,
      changes: docResult.formatChanges
    });
    if (normalizedPluginData === undefined) {
      delete nextNode.pluginData;
    } else {
      nextNode.pluginData = normalizedPluginData;
    }

    const normalizedToolConfig = normalizeToolConfig({
      toolConfig: node.toolConfig,
      basePath: `${rootPath}[${nodeIndex}].toolConfig`,
      changes: docResult.formatChanges
    });
    if (normalizedToolConfig === undefined) {
      delete nextNode.toolConfig;
    } else {
      nextNode.toolConfig = normalizedToolConfig;
    }

    return nextNode;
  });

  docResult.chatConfig = formatChatConfig({
    chatConfig: doc.chatConfig,
    formatChanges: docResult.formatChanges
  });
  docResult.edges = formatEdges({
    edges: docResult.edges,
    formatChanges: docResult.formatChanges
  });

  return docResult;
};

const normalizeZodIssue = ({
  issue,
  data
}: {
  issue: z.core.$ZodIssue;
  data: unknown;
}): ValidationIssue => {
  const issueWithDetails = issue as z.core.$ZodIssue & {
    expected?: unknown;
    received?: unknown;
  };
  const actualValue = compactIssueValue(getValueByPath({ value: data, issuePath: issue.path }));

  return {
    code: issue.code,
    path: pathToString(issue.path),
    message: issue.message,
    expected: issueWithDetails.expected,
    received: issueWithDetails.received,
    actualValue
  };
};

const recordValidationError = ({
  record,
  stats
}: {
  record: ValidationErrorRecord;
  stats: MutableCollectionStats;
}) => {
  if (record.stage === 'saveApi') {
    stats.saveApiValidationErrorDocumentCount += 1;
  } else if (record.stage === 'clean') {
    stats.cleanErrorDocumentCount += 1;
  } else {
    stats.writeErrorDocumentCount += 1;
  }

  logger.warn('Workflow data clean validation blocked', {
    collectionName: record.collectionName,
    fieldName: record.fieldName,
    documentId: record.documentId,
    appId: record.appId,
    appVersion: record.appVersion,
    name: record.name,
    schemaName: record.schemaName,
    stage: record.stage,
    issueCount: record.issueCount,
    issues: record.issues
  });
};

const validateAndRecord = ({
  schemaName,
  stage,
  data,
  config,
  docContext,
  stats
}: {
  schemaName: string;
  stage: ValidationErrorRecord['stage'];
  data: unknown;
  config: CollectionConfig;
  docContext: DocumentContext;
  stats: MutableCollectionStats;
}) => {
  const result = saveApiSchema.safeParse(data);
  if (result.success) return true;

  const issues = result.error.issues.map((issue) => normalizeZodIssue({ issue, data }));
  recordValidationError({
    stats,
    record: {
      ...docContext,
      collectionName: config.collectionName,
      fieldName: config.fieldName,
      schemaName,
      stage,
      issueCount: issues.length,
      issues
    }
  });
  return false;
};

const recordFormatChanges = ({
  cleanResult,
  stats
}: {
  cleanResult: CleanResult;
  stats: MutableCollectionStats;
}) => {
  if (cleanResult.formatChanges.count === 0) return;
  stats.formatChangedDocumentCount += 1;
};

const buildUpdatePayload = ({
  config,
  cleanResult
}: {
  config: CollectionConfig;
  cleanResult: CleanResult;
}) => ({
  [config.fieldName]: cleanResult.nodes,
  edges: cleanResult.edges,
  chatConfig: cleanResult.chatConfig
});

const recordWriteError = ({
  config,
  docContext,
  stats,
  message
}: {
  config: CollectionConfig;
  docContext: DocumentContext;
  stats: MutableCollectionStats;
  message: string;
}) => {
  recordValidationError({
    stats,
    record: {
      ...docContext,
      collectionName: config.collectionName,
      fieldName: config.fieldName,
      schemaName: 'bulkWriteWorkflowDirtyData',
      stage: 'write',
      issueCount: 1,
      issues: [
        {
          code: 'write_error',
          path: config.fieldName,
          message
        }
      ]
    }
  });
};

const flushWriteOperations = async ({
  model,
  operations,
  config,
  stats,
  runtime
}: {
  model: Model<any>;
  operations: PendingWriteOperation[];
  config: CollectionConfig;
  stats: MutableCollectionStats;
  runtime: RuntimeContext;
}) => {
  if (operations.length === 0) return;

  const writeOperationBatch = async ({
    batchOperations,
    reason
  }: {
    batchOperations: PendingWriteOperation[];
    reason: string;
  }) => {
    logger.info('Workflow data clean write start', {
      collectionName: config.collectionName,
      fieldName: config.fieldName,
      reason,
      batchSize: batchOperations.length,
      firstDocumentId: batchOperations[0]?.docContext.documentId,
      lastDocumentId: batchOperations[batchOperations.length - 1]?.docContext.documentId
    });

    try {
      const result = await model.bulkWrite(
        batchOperations.map(({ operation }) => operation),
        { ordered: false }
      );

      stats.writeSuccessDocumentCount += result.matchedCount;
      logger.info('Workflow data clean write success', {
        collectionName: config.collectionName,
        fieldName: config.fieldName,
        batchSize: batchOperations.length,
        matchedCount: result.matchedCount,
        totalWriteSuccessDocumentCount: stats.writeSuccessDocumentCount,
        totalWriteErrorDocumentCount: stats.writeErrorDocumentCount
      });

      const unmatchedCount = batchOperations.length - result.matchedCount;
      if (unmatchedCount <= 0) return;

      stats.writeErrorDocumentCount += unmatchedCount;
      logger.warn('Workflow data clean write unmatched', {
        collectionName: config.collectionName,
        fieldName: config.fieldName,
        batchSize: batchOperations.length,
        matchedCount: result.matchedCount,
        unmatchedCount,
        firstDocumentId: batchOperations[0]?.docContext.documentId,
        lastDocumentId: batchOperations[batchOperations.length - 1]?.docContext.documentId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Workflow data clean write error', {
        collectionName: config.collectionName,
        fieldName: config.fieldName,
        batchSize: batchOperations.length,
        firstDocumentId: batchOperations[0]?.docContext.documentId,
        lastDocumentId: batchOperations[batchOperations.length - 1]?.docContext.documentId,
        totalWriteSuccessDocumentCount: stats.writeSuccessDocumentCount,
        totalWriteErrorDocumentCount: stats.writeErrorDocumentCount + batchOperations.length,
        error: message
      });
      batchOperations.forEach(({ docContext }) => {
        recordWriteError({
          config,
          docContext,
          stats,
          message
        });
      });
    }
  };

  logger.info('Workflow data clean write flush', {
    collectionName: config.collectionName,
    fieldName: config.fieldName,
    operationCount: operations.length,
    writeBatchSize: runtime.writeBatchSize,
    firstDocumentId: operations[0]?.docContext.documentId,
    lastDocumentId: operations[operations.length - 1]?.docContext.documentId
  });

  for (let start = 0; start < operations.length; start += runtime.writeBatchSize) {
    const batchOperations = operations.slice(start, start + runtime.writeBatchSize);
    await writeOperationBatch({
      batchOperations,
      reason: `offset:${start}`
    });
  }
};

const processWorkflowDocument = ({
  doc,
  config,
  stats,
  runtime
}: {
  doc: WorkflowDocument;
  config: CollectionConfig;
  stats: MutableCollectionStats;
  runtime: RuntimeContext;
}): ProcessDocumentResult => {
  stats.scannedDocumentCount += 1;
  if (stats.scannedDocumentCount % PROGRESS_LOG_EVERY === 0) {
    logger.info('Workflow data clean progress', {
      collectionName: config.collectionName,
      fieldName: config.fieldName,
      scannedDocumentCount: stats.scannedDocumentCount,
      formatChangedDocumentCount: stats.formatChangedDocumentCount,
      saveApiValidationErrorDocumentCount: stats.saveApiValidationErrorDocumentCount,
      writeSuccessDocumentCount: stats.writeSuccessDocumentCount,
      writeBlockedDocumentCount: stats.writeBlockedDocumentCount,
      writeErrorDocumentCount: stats.writeErrorDocumentCount
    });
  }
  const docContext = createDocContext({ collectionName: config.collectionName, doc });

  try {
    const cleanResult = formatWorkflowDocument({
      doc,
      fieldName: config.fieldName,
      stats,
      docContext,
      rootPath: config.fieldName
    });

    if (
      cleanResult.renderTypeListFixedCount +
        cleanResult.outputTypeFixedCount +
        cleanResult.valueTypeFixedCount >
      0
    ) {
      stats.fixableDocumentCount += 1;
    }
    if (cleanResult.unknownEnumExpressionCount > 0) {
      stats.unknownDocumentCount += 1;
    }

    recordFormatChanges({
      cleanResult,
      stats
    });

    const saveApiValid = validateAndRecord({
      schemaName: config.saveSchemaName,
      stage: 'saveApi',
      data: {
        nodes: cleanResult.nodes,
        edges: cleanResult.edges,
        chatConfig: cleanResult.chatConfig
      },
      config,
      docContext,
      stats
    });
    const valid = saveApiValid && cleanResult.unknownEnumExpressionCount === 0;

    if (!valid) {
      stats.writeBlockedDocumentCount += 1;
      return {};
    }

    if (runtime.dryRun || cleanResult.formatChanges.count === 0) {
      return {};
    }

    return {
      writeOperation: {
        docContext,
        operation: {
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: buildUpdatePayload({ config, cleanResult })
            }
          }
        }
      }
    };
  } catch (error) {
    recordValidationError({
      stats,
      record: {
        ...docContext,
        collectionName: config.collectionName,
        fieldName: config.fieldName,
        schemaName: runtime.dryRun ? 'formatWorkflowDirtyData' : 'formatOrWriteWorkflowDirtyData',
        stage: 'clean',
        issueCount: 1,
        issues: [
          {
            code: 'clean_error',
            path: config.fieldName,
            message: error instanceof Error ? error.message : String(error)
          }
        ]
      }
    });
    return {};
  }
};

const processWorkflowDocumentBatch = async ({
  model,
  docs,
  config,
  stats,
  runtime
}: {
  model: Model<any>;
  docs: WorkflowDocument[];
  config: CollectionConfig;
  stats: MutableCollectionStats;
  runtime: RuntimeContext;
}) => {
  const writeOperations: PendingWriteOperation[] = [];
  docs.forEach((doc) => {
    const result = processWorkflowDocument({
      doc,
      config,
      stats,
      runtime
    });

    if (result.writeOperation) {
      writeOperations.push(result.writeOperation);
    }
  });

  await flushWriteOperations({
    model,
    operations: writeOperations,
    config,
    stats,
    runtime
  });
};

const serializeStats = (stats: MutableCollectionStats): CollectionStatsType => ({
  ...stats,
  byExpression: Object.values(stats.byExpression).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.expression.localeCompare(right.expression);
  })
});

const mergeTotalStats = (statsList: MutableCollectionStats[]) => {
  const total = emptyStats({ collectionName: 'total', fieldName: '*' });
  const hasCompleteQueryMatchedCount = statsList.every(
    (stats) => typeof stats.queryMatchedDocumentCount === 'number'
  );
  total.queryMatchedDocumentCount = hasCompleteQueryMatchedCount ? 0 : null;

  statsList.forEach((stats) => {
    if (hasCompleteQueryMatchedCount && typeof stats.queryMatchedDocumentCount === 'number') {
      total.queryMatchedDocumentCount =
        (total.queryMatchedDocumentCount ?? 0) + stats.queryMatchedDocumentCount;
    }
    total.scannedDocumentCount += stats.scannedDocumentCount;
    total.fixableDocumentCount += stats.fixableDocumentCount;
    total.unknownDocumentCount += stats.unknownDocumentCount;
    total.enumExpressionCount += stats.enumExpressionCount;
    total.renderTypeListFixableCount += stats.renderTypeListFixableCount;
    total.outputTypeFixableCount += stats.outputTypeFixableCount;
    total.valueTypeFixableCount += stats.valueTypeFixableCount;
    total.unknownEnumExpressionCount += stats.unknownEnumExpressionCount;
    total.saveApiValidationErrorDocumentCount += stats.saveApiValidationErrorDocumentCount;
    total.cleanErrorDocumentCount += stats.cleanErrorDocumentCount;
    total.formatChangedDocumentCount += stats.formatChangedDocumentCount;
    total.writeSuccessDocumentCount += stats.writeSuccessDocumentCount;
    total.writeBlockedDocumentCount += stats.writeBlockedDocumentCount;
    total.writeErrorDocumentCount += stats.writeErrorDocumentCount;

    Object.values(stats.byExpression).forEach((entry) => {
      const expressionKey = `${entry.field}:${entry.expression}`;
      const existing = total.byExpression[expressionKey];
      total.byExpression[expressionKey] = existing || {
        field: entry.field,
        expression: entry.expression,
        enumKey: entry.enumKey,
        known: entry.known,
        fixedValue: entry.fixedValue,
        count: 0
      };
      total.byExpression[expressionKey].count += entry.count;
    });
  });

  return total;
};

const scanCollection = async ({
  model,
  config,
  runtime,
  batchSize
}: {
  model: Model<any>;
  config: CollectionConfig;
  runtime: RuntimeContext;
  batchSize: number;
}) => {
  const query = config.key === 'apps' ? { type: { $nin: AppFolderTypeList } } : {};
  const stats = emptyStats({
    collectionName: config.collectionName,
    fieldName: config.fieldName
  });

  let lastId: unknown;
  while (true) {
    const pageQueryConditions = [query];
    if (lastId) {
      pageQueryConditions.push({ _id: { $gt: lastId } });
    }
    const pageQuery = pageQueryConditions.length === 1 ? query : { $and: pageQueryConditions };
    const docs = await model
      .find(pageQuery, {
        _id: 1,
        appId: 1,
        chatConfig: 1,
        edges: 1,
        name: 1,
        version: 1,
        [config.fieldName]: 1
      })
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean<WorkflowDocument[]>();

    if (docs.length === 0) break;

    await processWorkflowDocumentBatch({
      model,
      docs,
      config,
      stats,
      runtime
    });
    docs.forEach((doc) => {
      lastId = doc._id;
    });
  }

  return stats;
};

/**
 * 执行工作流 V2 数据结构清洗。
 *
 * 流程与本地 scan-workflow-enum-dirty-data 脚本一致：批量读取，逐条 format，
 * 逐条用保存接口 Schema 校验；非 dryRun 时只批量更新校验通过且确实被 format 的数据。
 */
export async function runInitWorkflowDataMigration(
  options: InitWorkflowDataBodyType
): Promise<InitWorkflowDataResponseType> {
  const normalizedOptions = {
    dryRun: options.dryRun,
    batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
    writeBatchSize: options.writeBatchSize ?? DEFAULT_WRITE_BATCH_SIZE
  };
  const runtime: RuntimeContext = {
    dryRun: normalizedOptions.dryRun,
    writeBatchSize: normalizedOptions.writeBatchSize
  };

  const appsStats = await scanCollection({
    model: MongoApp,
    config: collectionConfigs.apps,
    runtime,
    batchSize: normalizedOptions.batchSize
  });
  const appVersionsStats = await scanCollection({
    model: MongoAppVersion,
    config: collectionConfigs.appVersions,
    runtime,
    batchSize: normalizedOptions.batchSize
  });
  const totalStats = mergeTotalStats([appsStats, appVersionsStats]);

  return InitWorkflowDataResponseSchema.parse({
    dryRun: normalizedOptions.dryRun,
    batchSize: normalizedOptions.batchSize,
    writeBatchSize: normalizedOptions.writeBatchSize,
    apps: serializeStats(appsStats),
    appVersions: serializeStats(appVersionsStats),
    total: serializeStats(totalStats)
  });
}

/**
 * 管理员工作流数据清洗接口。
 *
 * 默认 dryRun。真正执行时会批量修复 `apps.modules` 和 `app_versions.nodes`
 * 中的 V2 工作流枚举表达式、空值和旧结构字段；失败文档只记录，不写库。
 */
async function handler(req: ApiRequestProps): Promise<InitWorkflowDataResponseType> {
  await authCert({ req, authRoot: true });

  const { body } = parseApiInput({
    req,
    bodySchema: InitWorkflowDataBodySchema
  });

  return runInitWorkflowDataMigration(body);
}

export default NextAPI(handler);
