import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { AppChatConfigTypeSchema, type AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  VariableItemTypeSchema,
  type VariableItemType
} from '@fastgpt/global/core/app/variable/type';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { DatasetTagFilterValueModeEnum } from '@fastgpt/global/core/dataset/constants';
import { isDatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  workflowSystemVariables
} from '@fastgpt/global/core/workflow/node/constant';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/output';
import { isReferenceOptionFormItem } from '@fastgpt/global/core/workflow/template/system/interactive/constants';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  areWorkflowValueTypesCompatible,
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import {
  getWorkflowReferenceValues,
  isWorkflowReferenceValue,
  type WorkflowReferenceValue
} from '../reference/service';
import { CHAT_CONFIG_PATHS } from './type';

const assertConfigPath = (path: string) => {
  if (!(CHAT_CONFIG_PATHS as readonly string[]).includes(path)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.chatConfigPathNotAllowed,
        severity: 'error',
        params: { path }
      }
    ]);
  }
};

const canUploadFiles = (fileSelectConfig: AppChatConfigType['fileSelectConfig']) =>
  Boolean(
    fileSelectConfig?.canSelectFile ||
    fileSelectConfig?.canSelectImg ||
    fileSelectConfig?.canSelectVideo ||
    fileSelectConfig?.canSelectAudio ||
    fileSelectConfig?.canSelectCustomFileExtension
  );

const referencesOutput = (value: unknown, nodeId: string, outputKey: string): boolean => {
  if (!Array.isArray(value)) return false;
  if (value.length === 2 && value[0] === nodeId && value[1] === outputKey) return true;
  return value.some((item) => referencesOutput(item, nodeId, outputKey));
};

/** 根据文件选择配置同步 Start 的文件输出，避免上传能力与图引用契约分离。 */
export const syncWorkflowStartFileOutput = ({
  document,
  fileSelectConfig
}: {
  document: WorkflowDocument;
  fileSelectConfig: AppChatConfigType['fileSelectConfig'];
}) => {
  const startNode = document.nodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  );
  if (!startNode) return;

  const outputIndex = startNode.outputs.findIndex(
    (output) => output.key === NodeOutputKeyEnum.userFiles
  );
  if (canUploadFiles(fileSelectConfig)) {
    if (outputIndex < 0) startNode.outputs.push(structuredClone(userFilesInput));
    return;
  }
  if (outputIndex < 0) return;

  const references = document.nodes.flatMap((node) =>
    node.inputs
      .filter((input) =>
        referencesOutput(input.value, startNode.nodeId, NodeOutputKeyEnum.userFiles)
      )
      .map((input) => ({ nodeId: node.nodeId, inputKey: input.key }))
  );
  if (references.length > 0) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.fileOutputStillReferenced,
        severity: 'error',
        nodeId: startNode.nodeId,
        params: { references }
      }
    ]);
  }
  startNode.outputs.splice(outputIndex, 1);
};

export const getChatConfigValue = (document: WorkflowDocument, path: string) => {
  assertConfigPath(path);
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, document.chatConfig);
};

export const setChatConfigValue = ({
  document,
  path,
  value
}: {
  document: WorkflowDocument;
  path: string;
  value: unknown;
}) => {
  assertConfigPath(path);
  const keys = path.split('.');
  const next = structuredClone(document.chatConfig) as Record<string, unknown>;
  let target = next;
  for (const key of keys.slice(0, -1)) {
    const current = target[key];
    target[key] = current && typeof current === 'object' ? current : {};
    target = target[key] as Record<string, unknown>;
  }
  target[keys.at(-1)!] = structuredClone(value);
  const nextChatConfig = AppChatConfigTypeSchema.parse(next);
  if (path === 'fileSelectConfig') {
    syncWorkflowStartFileOutput({
      document,
      fileSelectConfig: nextChatConfig.fileSelectConfig
    });
  }
  document.chatConfig = nextChatConfig;
};

export const unsetChatConfigValue = ({
  document,
  path
}: {
  document: WorkflowDocument;
  path: string;
}) => {
  assertConfigPath(path);
  const keys = path.split('.');
  const next = structuredClone(document.chatConfig) as Record<string, unknown>;
  let target: Record<string, unknown> | undefined = next;
  for (const key of keys.slice(0, -1)) {
    const current: unknown = target?.[key];
    target =
      current && typeof current === 'object' ? (current as Record<string, unknown>) : undefined;
  }
  if (target) delete target[keys.at(-1)!];
  const nextChatConfig = AppChatConfigTypeSchema.parse(next);
  if (path === 'fileSelectConfig') {
    syncWorkflowStartFileOutput({
      document,
      fileSelectConfig: nextChatConfig.fileSelectConfig
    });
  }
  document.chatConfig = nextChatConfig;
};

const getVariables = (document: WorkflowDocument) => document.chatConfig.variables ?? [];

type AddGlobalVariableInput = Omit<VariableItemType, 'key'> & { key?: string };

type UpdateGlobalVariablePatch = Omit<Partial<VariableItemType>, 'key'>;

type GlobalVariableReferenceMatch = {
  expectedValueType?: string;
};

type GlobalVariableReferenceLocation = {
  node: WorkflowDocument['nodes'][number];
  inputKey: string;
  matches: GlobalVariableReferenceMatch[];
};

const generateUniqueVariableKey = (variables: VariableItemType[]): string => {
  const usedKeys = new Set([
    ...variables.map((item) => item.key),
    ...workflowSystemVariables.map((item) => item.key)
  ]);
  let candidate = getNanoid(8);
  while (usedKeys.has(candidate)) {
    candidate = getNanoid(8);
  }
  return candidate;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFlowNodeInputType = (value: unknown): value is FlowNodeInputTypeEnum =>
  typeof value === 'string' && (Object.values(FlowNodeInputTypeEnum) as string[]).includes(value);

const isReferenceOptionListInputType = (
  value: unknown
): value is FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference =>
  value === FlowNodeInputTypeEnum.input || value === FlowNodeInputTypeEnum.reference;

const getGlobalVariablePlaceholder = (key: string) => `{{$${VARIABLE_NODE_ID}.${key}$}}`;

const collectTupleMatches = ({
  references,
  key,
  expectedValueType
}: {
  references: WorkflowReferenceValue[] | undefined;
  key: string;
  expectedValueType?: string;
}): GlobalVariableReferenceMatch[] =>
  (references ?? []).flatMap((reference) =>
    reference[0] === VARIABLE_NODE_ID && reference[1] === key ? [{ expectedValueType }] : []
  );

/** 仅匹配显式全局变量命名空间 `{{$VARIABLE_NODE_ID.key$}}`，避免误伤普通模板或节点自有动态参数 `{{key}}`。 */
const collectTemplateMatches = ({
  text,
  key
}: {
  text: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  const placeholder = getGlobalVariablePlaceholder(key);
  if (typeof text !== 'string' || !text.includes(placeholder)) return [];

  return [{}];
};

/** 知识库标签过滤同时支持整项引用元组、表单条件行内引用元组以及字符串插值。 */
const collectCollectionFilterMatches = ({
  value,
  key,
  expectedWholeValueType
}: {
  value: unknown;
  key: string;
  expectedWholeValueType?: string;
}): GlobalVariableReferenceMatch[] => {
  if (isWorkflowReferenceValue(value)) {
    return collectTupleMatches({
      references: [value],
      key,
      expectedValueType: expectedWholeValueType
    });
  }
  if (isDatasetTagFilterValue(value)) {
    return value.conditions.flatMap((condition) =>
      condition.valueMode === DatasetTagFilterValueModeEnum.reference &&
      isWorkflowReferenceValue(condition.value)
        ? collectTupleMatches({
            references: [condition.value],
            key
          })
        : []
    );
  }
  return collectTemplateMatches({
    text: value,
    key
  });
};

/** 凭据项可能以 `{ ref }` 对象或历史 JSON 字符串保存，复用共享凭据解析器提取引用。 */
const collectSecretValueMatches = ({
  value,
  key,
  expectedValueType
}: {
  value: unknown;
  key: string;
  expectedValueType?: string;
}): GlobalVariableReferenceMatch[] => {
  const parsedReference = getSecretReferenceValue(value);
  if (!parsedReference) return [];

  return collectTupleMatches({
    references: getWorkflowReferenceValues(parsedReference),
    key,
    expectedValueType
  });
};

const collectSecretRecordMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!isPlainRecord(value)) return [];
  return Object.values(value).flatMap((entryValue) =>
    collectSecretValueMatches({
      value: entryValue,
      key
    })
  );
};

const collectIfElseMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((branch) => {
    if (!isPlainRecord(branch) || !Array.isArray(branch.list)) return [];
    return branch.list.flatMap((condition) => {
      if (!isPlainRecord(condition)) return [];
      const leftMatches = isWorkflowReferenceValue(condition.variable)
        ? collectTupleMatches({ references: [condition.variable], key })
        : [];
      const rightMatches =
        condition.valueType === 'reference' && isWorkflowReferenceValue(condition.value)
          ? collectTupleMatches({ references: [condition.value], key })
          : [];
      return [...leftMatches, ...rightMatches];
    });
  });
};

const collectUpdateListMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];
    const itemValueType = typeof item.valueType === 'string' ? item.valueType : undefined;
    const targetMatches = isWorkflowReferenceValue(item.variable)
      ? collectTupleMatches({
          references: [item.variable],
          key,
          expectedValueType: itemValueType
        })
      : [];
    const sourceMatches = (() => {
      if (item.renderType === FlowNodeInputTypeEnum.reference) {
        return collectTupleMatches({
          references: getWorkflowReferenceValues(item.value),
          key,
          expectedValueType: itemValueType
        });
      } else if (
        item.renderType === FlowNodeInputTypeEnum.input &&
        Array.isArray(item.value) &&
        typeof item.value[1] === 'string'
      ) {
        return collectTemplateMatches({
          text: item.value[1],
          key
        });
      } else {
        return [];
      }
    })();
    return [...targetMatches, ...sourceMatches];
  });
};

const collectUserInputFormMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item) || !isFlowNodeInputType(item.type)) return [];
    const listInputType = isReferenceOptionListInputType(item.listInputType)
      ? item.listInputType
      : undefined;
    if (!isReferenceOptionFormItem({ type: item.type, listInputType })) return [];
    return collectTupleMatches({
      references: getWorkflowReferenceValues(item.listReference),
      key
    });
  });
};

const collectHttpPropsTemplateMatches = ({
  value,
  key
}: {
  value: unknown;
  key: string;
}): GlobalVariableReferenceMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];
    return [
      ...collectTemplateMatches({
        text: item.key,
        key
      }),
      ...collectTemplateMatches({
        text: item.value,
        key
      })
    ];
  });
};

/** 收集引用指定全局变量的节点输入与工具配置，与运行时各输入类型的引用解析规则对齐。 */
const getGlobalVariableReferences = ({
  document,
  key
}: {
  document: WorkflowDocument;
  key: string;
}): GlobalVariableReferenceLocation[] =>
  document.nodes.flatMap((node) => {
    const inputLocations: GlobalVariableReferenceLocation[] = node.inputs.flatMap((input) => {
      const selectedRenderType = getSelectedInputRenderType(input);
      const matches = (() => {
        // 1. 普通引用模式（reference / settingDatasetQuotePrompt）：支持单引用元组或一层引用数组
        if (nodeInputIsReference(input)) {
          return collectTupleMatches({
            references: getWorkflowReferenceValues(input.value),
            key,
            expectedValueType: input.valueType
          });
        }
        // 2. 知识库标签过滤（collectionFilterMatch / datasetTagFilter）：支持顶层整项引用、条件行内引用及文本插值
        else if (
          input.key === NodeInputKeyEnum.collectionFilterMatch ||
          selectedRenderType === FlowNodeInputTypeEnum.datasetTagFilter
        ) {
          return collectCollectionFilterMatches({
            value: input.value,
            key,
            expectedWholeValueType: input.valueType
          });
        }
        // 3. 知识库聚合参数（datasetParams）：嵌套的 collectionFilterMatch 同样走标签过滤归一化器
        else if (input.key === NodeInputKeyEnum.datasetParams) {
          if (!isPlainRecord(input.value)) return [];
          return collectCollectionFilterMatches({
            value: input.value.collectionFilterMatch,
            key,
            expectedWholeValueType: WorkflowIOValueTypeEnum.string
          });
        }
        // 4. 条件判断节点（ifElseList）：分支条件左值 variable 及引用模式右值 value
        else if (input.key === NodeInputKeyEnum.ifElseList) {
          return collectIfElseMatches({ value: input.value, key });
        }
        // 5. 变量更新节点（updateList）：赋值目标 variable、引用模式来源 value 及输入模式文本插值
        else if (input.key === NodeInputKeyEnum.updateList) {
          return collectUpdateListMatches({ value: input.value, key });
        }
        // 6. 表单输入节点（userInputForms）：单选/多选字段在引用模式下的动态选项 listReference
        else if (input.key === NodeInputKeyEnum.userInputForms) {
          return collectUserInputFormMatches({ value: input.value, key });
        }
        // 7. 密码输入（password）：凭据包装对象 { ref }
        else if (selectedRenderType === FlowNodeInputTypeEnum.password) {
          return collectSecretValueMatches({
            value: input.value,
            key,
            expectedValueType: input.valueType
          });
        }
        // 8. HTTP 请求头密钥（headerSecret）：键值映射表中的各项凭据 { [header]: { ref } }
        else if (input.key === NodeInputKeyEnum.headerSecret) {
          return collectSecretRecordMatches({ value: input.value, key });
        }
        // 9. 系统工具密钥配置（systemInputConfig）：仅 manual 模式的 value 映射表会解析凭据引用
        else if (input.key === NodeInputKeyEnum.systemInputConfig) {
          if (
            !isPlainRecord(input.value) ||
            input.value.type !== SystemToolSecretInputTypeEnum.manual
          ) {
            return [];
          }
          return collectSecretRecordMatches({ value: input.value.value, key });
        }
        // 10. HTTP 键值对数组输入（httpHeaders / httpParams / httpFormBody）：项内 key/value 的全局变量插值
        else if (
          input.key === NodeInputKeyEnum.httpHeaders ||
          input.key === NodeInputKeyEnum.httpParams ||
          input.key === NodeInputKeyEnum.httpFormBody
        ) {
          return collectHttpPropsTemplateMatches({ value: input.value, key });
        }
        // 11. 其他非引用模式输入：忽略与引用元组同形的普通字面量数组，仅识别字符串中的全局变量插值
        else {
          return collectTemplateMatches({
            text: input.value,
            key
          });
        }
      })();

      return matches.length > 0 ? [{ node, inputKey: input.key, matches }] : [];
    });

    // 内联 MCP / HTTP 工具配置中的 headerSecret 挂在 node.toolConfig 下，独立于 node.inputs
    const toolConfigLocations: GlobalVariableReferenceLocation[] = [
      { inputKey: 'toolConfig.mcpToolSet.headerSecret', config: node.toolConfig?.mcpToolSet },
      { inputKey: 'toolConfig.httpToolSet.headerSecret', config: node.toolConfig?.httpToolSet },
      { inputKey: 'toolConfig.mcpTool.headerSecret', config: node.toolConfig?.mcpTool },
      { inputKey: 'toolConfig.httpTool.headerSecret', config: node.toolConfig?.httpTool }
    ].flatMap(({ inputKey, config }) => {
      if (!isPlainRecord(config) || !('headerSecret' in config)) return [];
      const matches = collectSecretRecordMatches({ value: config.headerSecret, key });
      return matches.length > 0 ? [{ node, inputKey, matches }] : [];
    });

    return [...inputLocations, ...toolConfigLocations];
  });

export const addGlobalVariable = ({
  document,
  variable
}: {
  document: WorkflowDocument;
  variable: AddGlobalVariableInput;
}) => {
  const variables = getVariables(document);
  const resolvedKey = variable.key?.trim() || generateUniqueVariableKey(variables);
  if (variables.some((item) => item.key === resolvedKey)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.variableKeyDuplicated,
        severity: 'error',
        params: { key: resolvedKey }
      }
    ]);
  }
  const parsedVariable = VariableItemTypeSchema.parse({
    ...variable,
    key: resolvedKey
  });
  document.chatConfig.variables = [...variables, parsedVariable];
  return parsedVariable.key;
};

export const updateGlobalVariable = ({
  document,
  key,
  patch
}: {
  document: WorkflowDocument;
  key: string;
  patch: UpdateGlobalVariablePatch;
}) => {
  const variables = getVariables(document);
  const index = variables.findIndex((item) => item.key === key);
  if (index < 0) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.variableNotFound, severity: 'error', params: { key } }
    ]);
  }
  const nextValueType = patch.valueType ?? variables[index].valueType;
  const references = getGlobalVariableReferences({ document, key });
  const incompatibleReference = references.find(({ matches }) =>
    matches.some(
      ({ expectedValueType }) =>
        !areWorkflowValueTypesCompatible({
          expected: expectedValueType,
          actual: nextValueType
        })
    )
  );
  if (incompatibleReference) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.variableTypeChangeIncompatible,
        severity: 'error',
        nodeId: incompatibleReference.node.nodeId,
        inputKey: incompatibleReference.inputKey,
        params: { key, valueType: nextValueType }
      }
    ]);
  }
  const next = [...variables];
  // 全局变量 key 创建后不可变，仅允许修改 label / valueType / 配置项等属性。
  next[index] = VariableItemTypeSchema.parse({
    ...variables[index],
    ...structuredClone(patch),
    key: variables[index].key
  });
  document.chatConfig.variables = next;
};

export const removeGlobalVariable = ({
  document,
  key
}: {
  document: WorkflowDocument;
  key: string;
}) => {
  const variables = getVariables(document);
  if (!variables.some((item) => item.key === key)) {
    throw new WorkflowCommandError([
      { code: WorkflowDiagnosticCodeEnum.variableNotFound, severity: 'error', params: { key } }
    ]);
  }
  const references = getGlobalVariableReferences({ document, key });
  if (references.length > 0) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.variableStillReferenced,
        severity: 'error',
        params: {
          key,
          references: references.map(({ node, inputKey }) => ({
            nodeId: node.nodeId,
            inputKey
          }))
        }
      }
    ]);
  }
  document.chatConfig.variables = variables.filter((item) => item.key !== key);
};
