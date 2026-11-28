import { resolveLegacyWelcomeConfig } from './legacy/utils';
import type { AppChatConfigType } from '../../core/app/type';
import type { VariableItemType } from '../../core/app/variable/type';
import { VariableInputEnum } from '../../core/workflow/constants';
import { normalizeAndParseVariableList } from '../../core/app/variable/utils';
import {
  defaultAutoExecuteConfig,
  defaultChatInputGuideConfig,
  defaultQGConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '../../core/app/constants';

/**
 * 合并应用配置与会话快照，并返回运行时对话配置。
 *
 * 会话变量会在这里统一补齐 valueType 并通过变量 schema 校验；读取历史会话和保存新快照共用该边界。
 */
export const getAppChatConfig = ({
  chatConfig,
  storeVariables,
  storeWelcomeText,
  isPublicFetch = false
}: {
  chatConfig?: AppChatConfigType;
  storeVariables?: VariableItemType[];
  storeWelcomeText?: string;
  isPublicFetch: boolean;
}): AppChatConfigType => {
  const welcomeConfig = resolveLegacyWelcomeConfig({ chatConfig, storeWelcomeText });

  const config: AppChatConfigType = {
    questionGuide: defaultQGConfig,
    ttsConfig: defaultTTSConfig,
    whisperConfig: defaultWhisperConfig,
    chatInputGuide: defaultChatInputGuideConfig,
    autoExecute: defaultAutoExecuteConfig,
    ...chatConfig,
    variables: normalizeAndParseVariableList(storeVariables ?? chatConfig?.variables ?? []),
    welcomeConfig,
    welcomeText: welcomeConfig.welcomeText
  };

  if (!isPublicFetch) {
    config.scheduledTriggerConfig = undefined;
  }

  return config;
};

/** 开场白只使用普通标量输入和调用方传入的自定义变量。 */
export const canMatchWelcomeVariable = (variable: VariableItemType) =>
  [
    VariableInputEnum.input,
    VariableInputEnum.textarea,
    VariableInputEnum.select,
    VariableInputEnum.numberInput,
    VariableInputEnum.switch,
    VariableInputEnum.custom
  ].includes(variable.type);

/** 仅比较已声明变量的标量值，按配置顺序返回首条完整匹配的文案。 */
export const resolveWelcomeText = (
  config?: AppChatConfigType,
  values?: Record<string, unknown>
) => {
  const fallback = config?.welcomeConfig?.welcomeText ?? config?.welcomeText;
  const rule = config?.welcomeConfig?.byVariable;
  const variable = rule && config?.variables?.find((item) => item.key === rule.key);
  if (!rule || !variable || !canMatchWelcomeVariable(variable)) return fallback;

  const value = values?.[variable.key] ?? values?.[variable.label] ?? variable.defaultValue;
  if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') {
    return fallback;
  }
  return (
    rule.cases.find((item) => item.value !== '' && item.value === String(value) && item.text.trim())
      ?.text ?? fallback
  );
};
