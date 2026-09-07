import type { SettingAIDataType } from '@fastgpt/global/core/app/type';

/**
 * 切换模型时清除不受支持的显式多模态选项，不自动开启或恢复任何选项。
 * 隐藏配置的表单不调用此函数；文本链接提取不是模型能力，保持原值。
 */
export const filterModelMultimodalSettings = ({
  settings,
  support
}: {
  settings: SettingAIDataType;
  support: { vision?: boolean; audio?: boolean; video?: boolean };
}): SettingAIDataType => ({
  ...settings,
  aiChatVision: !!(settings.aiChatVision && support.vision),
  aiChatAudio: !!(settings.aiChatAudio && support.audio),
  aiChatVideo: !!(settings.aiChatVideo && support.video)
});
