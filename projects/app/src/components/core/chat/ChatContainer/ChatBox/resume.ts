import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatSiteItemType } from './type';

/**
 * 判断恢复流中是否需要先补一个 AI placeholder。
 *
 * 恢复生成时，前端可能先拿到 SSE 增量事件，而历史记录中还没有本轮 AI 消息。
 * 对于会产生可见回答内容、运行状态或响应详情的事件，需要先创建一个稳定的
 * AI placeholder，后续 `generatingMessage` 才能继续沿用“更新最后一条 AI 消息”
 * 的约束。
 *
 * 不在这里处理 error/updateVariables 等控制类事件：
 * - error 只影响最终状态和 toast，不应该制造空 AI 气泡。
 * - updateVariables 会回写变量，不代表有可展示的 AI 输出。
 *
 * 该函数必须和 `generatingMessage` 支持的可见 SSE 事件保持同步。
 */
export const shouldCreateResumeAiPlaceholder = (event: SseResponseEventEnum) => {
  return [
    SseResponseEventEnum.flowNodeResponse,
    SseResponseEventEnum.flowNodeStatus,
    SseResponseEventEnum.answer,
    SseResponseEventEnum.fastAnswer,
    SseResponseEventEnum.toolCall,
    SseResponseEventEnum.toolParams,
    SseResponseEventEnum.toolResponse,
    SseResponseEventEnum.interactive,
    SseResponseEventEnum.plan,
    SseResponseEventEnum.planStatus,
    SseResponseEventEnum.workflowDuration
  ].includes(event);
};

/**
 * 判断 AI 消息是否已经包含可保留的输出。
 *
 * 恢复生成会提前插入 AI placeholder。恢复完成或失败后，如果这个 placeholder
 * 没有任何可见内容或运行详情，就应当被移除，避免聊天列表残留空 AI 气泡。
 *
 * 可保留输出包括：
 * - responseData：节点响应详情，即使没有文本也需要保留用于详情查看。
 * - text/reasoning：直接展示给用户的回答或推理内容。
 * - tool/tools：工具调用参数或响应，只有出现 params/response 才算有展示价值。
 * - skills/plan/interactive：Agent 技能、计划和交互节点都会在 UI 中展示。
 *
 * 非 AI 消息永远返回 false，因为该函数只用于判断恢复生成产生的 AI placeholder。
 */
export const hasMeaningfulAiOutput = (chat?: ChatSiteItemType) => {
  if (!chat || chat.obj !== ChatRoleEnum.AI) return false;
  if (chat.responseData?.length) return true;

  return chat.value.some((item) => {
    // 文本和推理内容允许分块增量追加，只要已有内容就需要保留。
    if (item.text?.content) return true;
    if (item.reasoning?.content) return true;
    // 兼容旧的单 tool 字段和新的 tools 数组字段。
    if (item.tool?.params || item.tool?.response) return true;
    if (item.tools?.some((tool) => tool.params || tool.response)) return true;
    // 技能、计划和交互本身就是可见 UI 块，不要求额外文本。
    if (item.skills?.length) return true;
    if (item.plan || item.interactive) return true;
    return false;
  });
};
