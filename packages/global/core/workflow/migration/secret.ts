import { CompatibleSecretValueSchema } from '../../../common/secret/type';
import { getWorkflowSecretInputKind } from '../../../common/workflow/input';
import { NodeInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../node/constant';
import { normalizeToolInputValue } from '../../app/tool/systemTool/codec';
import { InputConfigInputTypeSchema } from '../type/io';

type RecordValue = Record<string, unknown>;

type WorkflowSecretMigrationInput = {
  nodes: unknown[];
  edges?: unknown;
  chatConfig?: unknown;
};

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 已确认的凭据字段兼容旧空 wrapper，再收敛为唯一的明文、密文或引用分支。 */
export const migrateSecretValueToCurrent = (value: unknown): unknown => {
  const parsed = CompatibleSecretValueSchema.safeParse(value);
  return parsed.success ? parsed.data : value;
};

/** 迁移已确认属于鉴权配置的凭据表；普通业务对象不进入此入口。 */
export const migrateSecretStoreToCurrent = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, migrateSecretValueToCurrent(item)])
  );
};

const migrateToolSetSecrets = (value: RecordValue): RecordValue => {
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

const migrateNodeToolConfigSecrets = (value: RecordValue): RecordValue => {
  return {
    ...value,
    ...(isRecord(value.mcpToolSet) ? { mcpToolSet: migrateToolSetSecrets(value.mcpToolSet) } : {}),
    ...(isRecord(value.httpToolSet)
      ? { httpToolSet: migrateToolSetSecrets(value.httpToolSet) }
      : {})
  };
};

/** 迁移 system_input_config 的手工密钥表；system 分支历史上也可能带有 value。 */
const migrateSystemInputConfigSecrets = (value: RecordValue, inputList: unknown): RecordValue => {
  if (!isRecord(value.value)) return value;

  return {
    ...value,
    value: Object.fromEntries(
      Object.entries(value.value).map(([key, item]) => {
        const config = Array.isArray(inputList)
          ? inputList.find((entry) => isRecord(entry) && entry.key === key)
          : undefined;
        const inputType = InputConfigInputTypeSchema.safeParse(config?.inputType);
        return [
          key,
          inputType.success
            ? (normalizeToolInputValue({ value: item, inputType: inputType.data }) ?? item)
            : migrateSecretValueToCurrent(item)
        ];
      })
    )
  };
};

const migrateSelectedToolsSecrets = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;

  return value.map((tool) => {
    if (!isRecord(tool) || !isRecord(tool.toolConfig)) return tool;
    return { ...tool, toolConfig: migrateNodeToolConfigSecrets(tool.toolConfig) };
  });
};

/** 按显式密钥声明和共享字段身份迁移输入；Agent 工具配置只从专用容器读取。 */
const migrateInputSecrets = (value: unknown, flowNodeType: unknown): unknown => {
  if (!isRecord(value)) return value;

  const input = { ...value };
  const secretInputKind = getWorkflowSecretInputKind({ flowNodeType, inputKey: input.key });
  if (Array.isArray(input.inputList)) {
    input.inputList = input.inputList.map((item) => {
      if (!isRecord(item) || !('value' in item)) return item;
      const inputType = InputConfigInputTypeSchema.safeParse(item.inputType);
      if (!inputType.success) return item;
      if (secretInputKind !== 'systemConfig' && inputType.data !== 'secret') return item;
      return {
        ...item,
        value:
          normalizeToolInputValue({ value: item.value, inputType: inputType.data }) ?? item.value
      };
    });
  }
  if (
    Array.isArray(input.renderTypeList) &&
    input.renderTypeList.includes(FlowNodeInputTypeEnum.password) &&
    'value' in input
  ) {
    input.value = migrateSecretValueToCurrent(input.value);
  }
  if (secretInputKind === 'headers' && 'value' in input) {
    input.value = migrateSecretStoreToCurrent(input.value);
  }
  if (secretInputKind === 'systemConfig' && isRecord(input.value)) {
    input.value = migrateSystemInputConfigSecrets(input.value, input.inputList);
  }
  if (flowNodeType === FlowNodeTypeEnum.agent && input.key === NodeInputKeyEnum.selectedTools) {
    input.value = migrateSelectedToolsSecrets(input.value);
  }

  return input;
};

const migrateNodeSecrets = (value: unknown): unknown => {
  if (!isRecord(value)) return value;

  const node = { ...value };
  if (Array.isArray(node.inputs)) {
    node.inputs = node.inputs.map((input) => migrateInputSecrets(input, node.flowNodeType));
  }
  // 当前工具集配置只从 toolSet 节点的专用路径读取，不按业务对象的字段形状推断。
  if (node.flowNodeType === FlowNodeTypeEnum.toolSet && isRecord(node.toolConfig)) {
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
