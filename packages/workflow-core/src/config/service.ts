import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { AppChatConfigTypeSchema, type AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  VariableItemTypeSchema,
  type VariableItemType
} from '@fastgpt/global/core/app/variable/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  workflowSystemVariables
} from '@fastgpt/global/core/workflow/node/constant';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/output';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/common/workflow/reference';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import {
  CHAT_CONFIG_PATHS,
  type AddGlobalVariableInput,
  type UpdateGlobalVariablePatch
} from './type';
import { getGlobalVariableReferences } from './variableReference';

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

/** 统一归一化可选变量 key，空白字符串视为未指定。 */
export const normalizeOptionalVariableKey = (key?: string): string | undefined => {
  const trimmedKey = key?.trim();
  return trimmedKey !== undefined && trimmedKey !== '' ? trimmedKey : undefined;
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

export const addGlobalVariable = ({
  document,
  variable
}: {
  document: WorkflowDocument;
  variable: AddGlobalVariableInput;
}) => {
  const variables = getVariables(document);
  const resolvedKey =
    normalizeOptionalVariableKey(variable.key) ?? generateUniqueVariableKey(variables);
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
