import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { ReasoningEffortLevel } from '@fastgpt/global/core/ai/model/schema';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';

/**
 * 按模型支持的思考等级列表归一化当前配置；不在支持列表内时回退为默认（null）。
 */
export const normalizeModelReasoningEffort = (
  effort: ReasoningEffort | undefined,
  supportedLevels: readonly ReasoningEffortLevel[]
): ReasoningEffort =>
  effort && supportedLevels.includes(effort as ReasoningEffortLevel) ? effort : null;

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
