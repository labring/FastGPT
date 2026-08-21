import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import z from 'zod';
import type { WorkflowDocument } from '../domain/document';
import { configAutomationMetaMap } from './automationMeta';
import { getChatConfigValue } from './service';
import { CHAT_CONFIG_PATHS, type ChatConfigPath, type ConfigDescriptor } from './type';

const chatConfigValueSchema = z.toJSONSchema(AppChatConfigTypeSchema, {
  io: 'input',
  reused: 'inline',
  unrepresentable: 'any'
}) as Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getConfigValueSchema = (path: ChatConfigPath): Record<string, unknown> => {
  const schema = path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    const properties = current.properties;
    if (!isRecord(properties)) return undefined;
    return properties[key];
  }, chatConfigValueSchema);

  return isRecord(schema) ? structuredClone(schema) : {};
};

/** 将 ChatConfig Schema 与 Agent automation metadata 归一化为 CLI 可查询的配置契约。 */
export const getChatConfigDescriptor = ({
  document,
  path,
  translate = (value) => value
}: {
  document: WorkflowDocument;
  path: string;
  translate?: (value: string) => string;
}): ConfigDescriptor => {
  const value = getChatConfigValue(document, path);
  const configPath = path as ChatConfigPath;
  const valueSchema = getConfigValueSchema(configPath);
  const automationMeta = configAutomationMetaMap[configPath];
  const schemaDescription = valueSchema.description;

  return {
    path: configPath,
    description: translate(
      automationMeta.agentHint ??
        (typeof schemaDescription === 'string' && schemaDescription.trim().length > 0
          ? schemaDescription
          : configPath)
    ),
    valueSchema,
    capabilities: automationMeta.capabilities ?? [],
    value
  };
};

/** 返回全部允许修改的系统配置及其当前值和 Agent 可读契约。 */
export const listChatConfigDescriptors = ({
  document,
  translate
}: {
  document: WorkflowDocument;
  translate?: (value: string) => string;
}): ConfigDescriptor[] =>
  CHAT_CONFIG_PATHS.map((path) => getChatConfigDescriptor({ document, path, translate }));
