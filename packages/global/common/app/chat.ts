import { resolveLegacyWelcomeConfig } from './legacy/utils';
import type { AppChatConfigType } from '../../core/app/type';
import type { VariableItemType } from '../../core/app/variable/type';
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
