import { getDefaultHelperBotModel } from '../../../model';

/**
 * 选择 AI 辅助创建 Skill 使用的 LLM 模型。
 *
 * 与 HelperBot 辅助生成保持同一配置入口：优先使用 HELPER_BOT_MODEL 命中的
 * 已启用模型；未配置或未命中时由系统默认 LLM 兜底。
 */
export const getSkillCreationLLMModel = () => getDefaultHelperBotModel().model;
