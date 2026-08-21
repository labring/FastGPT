import {
  AppChatConfigTypeSchema,
  type AppChatConfigType,
  VariableItemTypeSchema,
  type VariableItemType
} from '@fastgpt/global/core/app/type';
import { NodeOutputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/core/workflow/utils';
import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { getWorkflowReferenceValues } from '../reference/service';
import { CHAT_CONFIG_PATHS } from './type';

export { CHAT_CONFIG_PATHS } from './type';

const assertConfigPath = (path: string) => {
  if (!(CHAT_CONFIG_PATHS as readonly string[]).includes(path)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_CHAT_CONFIG_PATH_NOT_ALLOWED', severity: 'error', params: { path } }
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
        code: 'WORKFLOW_FILE_OUTPUT_STILL_REFERENCED',
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

/** 收集引用指定全局变量的节点输入及其原始引用元组。 */
const getGlobalVariableReferences = ({
  document,
  key
}: {
  document: WorkflowDocument;
  key: string;
}) =>
  document.nodes.flatMap((node) =>
    node.inputs.flatMap((input) => {
      const references = (getWorkflowReferenceValues(input.value) ?? []).filter(
        ([sourceNodeId, outputKey]) => sourceNodeId === VARIABLE_NODE_ID && outputKey === key
      );
      return references.length > 0 ? [{ node, input, references }] : [];
    })
  );

export const addGlobalVariable = ({
  document,
  variable
}: {
  document: WorkflowDocument;
  variable: VariableItemType;
}) => {
  if (getVariables(document).some((item) => item.key === variable.key)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_VARIABLE_KEY_DUPLICATED', severity: 'error', params: { key: variable.key } }
    ]);
  }
  document.chatConfig.variables = [
    ...getVariables(document),
    VariableItemTypeSchema.parse(variable)
  ];
};

export const updateGlobalVariable = ({
  document,
  key,
  patch
}: {
  document: WorkflowDocument;
  key: string;
  patch: Partial<VariableItemType>;
}) => {
  const variables = getVariables(document);
  const index = variables.findIndex((item) => item.key === key);
  if (index < 0) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_VARIABLE_NOT_FOUND', severity: 'error', params: { key } }
    ]);
  }
  const nextKey = patch.key ?? key;
  if (nextKey !== key && variables.some((item) => item.key === nextKey)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_VARIABLE_KEY_DUPLICATED', severity: 'error', params: { key: nextKey } }
    ]);
  }
  const nextValueType = patch.valueType ?? variables[index].valueType;
  const references = getGlobalVariableReferences({ document, key });
  const incompatibleReference = references.find(
    ({ input }) =>
      !areWorkflowValueTypesCompatible({
        expected: input.valueType,
        actual: nextValueType
      })
  );
  if (incompatibleReference) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_VARIABLE_TYPE_CHANGE_INCOMPATIBLE',
        severity: 'error',
        nodeId: incompatibleReference.node.nodeId,
        inputKey: incompatibleReference.input.key,
        params: { key, valueType: nextValueType }
      }
    ]);
  }
  const next = [...variables];
  next[index] = VariableItemTypeSchema.parse({ ...variables[index], ...structuredClone(patch) });
  document.chatConfig.variables = next;
  if (nextKey !== key) {
    for (const { references: matchedReferences } of references) {
      for (const reference of matchedReferences) {
        reference[1] = nextKey;
      }
    }
  }
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
      { code: 'WORKFLOW_VARIABLE_NOT_FOUND', severity: 'error', params: { key } }
    ]);
  }
  const references = getGlobalVariableReferences({ document, key });
  if (references.length > 0) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_VARIABLE_STILL_REFERENCED',
        severity: 'error',
        params: {
          key,
          references: references.map(({ node, input }) => ({
            nodeId: node.nodeId,
            inputKey: input.key
          }))
        }
      }
    ]);
  }
  document.chatConfig.variables = variables.filter((item) => item.key !== key);
};
