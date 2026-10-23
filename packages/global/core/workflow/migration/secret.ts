import { SecretRefValueSchema } from '../../../common/secret/type';
import { normalizeLegacySecretValue } from '../../../common/secret/utils';
import { NodeInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum } from '../node/constant';

type RecordValue = Record<string, unknown>;

type WorkflowSecretMigrationInput = {
  nodes: unknown[];
  edges?: unknown;
  chatConfig?: unknown;
};

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 将单个旧密钥值收敛为唯一的明文、密文或引用分支。 */
export const migrateSecretValueToCurrent = (value: unknown): unknown => {
  const normalizedValue = normalizeLegacySecretValue(value);
  if (!isRecord(normalizedValue)) return normalizedValue;

  const reference = SecretRefValueSchema.safeParse(normalizedValue);
  if (reference.success) return reference.data;

  if (!('value' in normalizedValue) && !('secret' in normalizedValue)) return normalizedValue;

  const keys = Object.keys(normalizedValue);
  if (keys.some((key) => key !== 'value' && key !== 'secret')) return normalizedValue;
  if (normalizedValue.value !== undefined && typeof normalizedValue.value !== 'string') {
    return normalizedValue;
  }
  if (normalizedValue.secret !== undefined && typeof normalizedValue.secret !== 'string') {
    return normalizedValue;
  }

  if (typeof normalizedValue.value === 'string' && normalizedValue.value.length > 0) {
    return { value: normalizedValue.value };
  }
  if (typeof normalizedValue.secret === 'string') return { secret: normalizedValue.secret };
  if (typeof normalizedValue.value === 'string') return { value: normalizedValue.value };

  return normalizedValue;
};

const migrateSecretStoreToCurrent = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, migrateSecretValueToCurrent(item)])
  );
};

const migrateToolSetSecrets = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  const toolSet = { ...value };
  if ('headerSecret' in toolSet) {
    toolSet.headerSecret = migrateSecretStoreToCurrent(toolSet.headerSecret);
  }
  if (Array.isArray(toolSet.toolList)) {
    toolSet.toolList = toolSet.toolList.map((tool) => {
      if (!isRecord(tool) || !('headerSecret' in tool)) return tool;
      return {
        ...tool,
        headerSecret: migrateSecretStoreToCurrent(tool.headerSecret)
      };
    });
  }

  return toolSet;
};

const migrateNodeToolConfigSecrets = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  return {
    ...value,
    ...(isRecord(value.mcpToolSet) ? { mcpToolSet: migrateToolSetSecrets(value.mcpToolSet) } : {}),
    ...(isRecord(value.httpToolSet)
      ? { httpToolSet: migrateToolSetSecrets(value.httpToolSet) }
      : {})
  };
};

/** 迁移 system_input_config 的手工密钥表；system 分支历史上也可能带有 value。 */
const migrateSystemInputConfigSecrets = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  if (!isRecord(value.value)) return value;

  return {
    ...value,
    value: migrateSecretStoreToCurrent(value.value)
  };
};

const migrateSelectedToolsSecrets = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;

  return value.map((tool) => {
    if (!isRecord(tool) || !isRecord(tool.toolConfig)) return tool;
    return { ...tool, toolConfig: migrateNodeToolConfigSecrets(tool.toolConfig) };
  });
};

const migrateInputSecrets = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  const input = { ...value };
  if (Array.isArray(input.inputList)) {
    input.inputList = input.inputList.map((item) => {
      if (!isRecord(item) || item.inputType !== 'secret' || !('value' in item)) return item;
      return { ...item, value: migrateSecretValueToCurrent(item.value) };
    });
  }
  if (
    Array.isArray(input.renderTypeList) &&
    input.renderTypeList.includes(FlowNodeInputTypeEnum.password) &&
    'value' in input
  ) {
    input.value = migrateSecretValueToCurrent(input.value);
  }
  if (input.key === NodeInputKeyEnum.headerSecret && 'value' in input) {
    input.value = migrateSecretStoreToCurrent(input.value);
  }
  if (input.key === NodeInputKeyEnum.systemInputConfig && isRecord(input.value)) {
    input.value = migrateSystemInputConfigSecrets(input.value);
  }
  if (input.key === NodeInputKeyEnum.selectedTools) {
    input.value = migrateSelectedToolsSecrets(input.value);
  }
  if (isRecord(input.value) && 'headerSecret' in input.value) {
    input.value = {
      ...input.value,
      headerSecret: migrateSecretStoreToCurrent(input.value.headerSecret)
    };
  }

  return input;
};

const migrateNodeSecrets = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  const node = { ...value };
  if (Array.isArray(node.inputs)) {
    node.inputs = node.inputs.map(migrateInputSecrets);
  }
  if (isRecord(node.toolConfig)) {
    node.toolConfig = migrateNodeToolConfigSecrets(node.toolConfig);
  }

  return node;
};

/** 在 workflow 进入 canonical schema 前迁移所有已知密钥容器；重复调用不改变结果。 */
export const migrateWorkflowSecretValues = <T extends WorkflowSecretMigrationInput>(
  workflow: T
): T =>
  ({
    ...workflow,
    nodes: workflow.nodes.map(migrateNodeSecrets)
  }) as T;
