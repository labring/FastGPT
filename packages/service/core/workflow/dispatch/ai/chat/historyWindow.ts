import z from 'zod';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hasContextCheckpoint } from '@fastgpt/global/core/chat/utils';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatHistoryWindowSchema } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { getHistories } from '../../utils';

const WindowMemorySchema = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
  startDataId: z.string().min(1)
});

/**
 * 为普通 AI 对话选择历史，用最近成功 AI 记录的节点 memory 恢复窗口起点。
 * 不依赖已被分页截断的总轮数，也不在运行前写状态；只有成功保存本轮回复才推进窗口。
 * 配置改变、起点被删除/截掉或超过 max 时缩回 min；首次请求从可用历史的 min 轮起步。
 * 引用历史、压缩点和交互恢复继续使用原有选择规则。
 */
export const selectChatHistories = ({
  history,
  histories,
  window,
  memoryKey,
  responseChatItemId
}: {
  history: ChatItemMiniType[] | number;
  histories: ChatItemMiniType[];
  window?: unknown;
  memoryKey: string;
  responseChatItemId: string;
}): {
  histories: ChatItemMiniType[];
  memories?: Record<string, z.infer<typeof WindowMemorySchema> | null>;
} => {
  // 失败或未执行本节点的轮次不覆盖上次成功状态；显式 null 是关闭/切换模式后的清除标记。
  const previousItem = histories.findLast(
    (item) => item.obj === ChatRoleEnum.AI && Object.hasOwn(item.memories ?? {}, memoryKey)
  );
  const previousValue =
    previousItem?.obj === ChatRoleEnum.AI ? previousItem.memories?.[memoryKey] : undefined;
  if (
    window === undefined ||
    window === null ||
    Array.isArray(history) ||
    histories.some(hasContextCheckpoint) ||
    getLastInteractiveValue(histories)
  ) {
    return {
      histories: getHistories(history, histories),
      ...(previousValue ? { memories: { [memoryKey]: null } } : {})
    };
  }

  const parsed = ChatHistoryWindowSchema.safeParse(window);
  if (!parsed.success) throw new UserConfigError('Invalid periodic history window');
  const { min, max } = parsed.data;
  if (max === 0) {
    return { histories: [], ...(previousValue ? { memories: { [memoryKey]: null } } : {}) };
  }

  // 按 Human 边界分组，避免工具/多条 AI 消息被误当成额外轮次。
  const starts = histories.flatMap((item, index) =>
    item.obj === ChatRoleEnum.Human ? [{ index, dataId: item.dataId }] : []
  );
  const previous = WindowMemorySchema.safeParse(previousValue);
  const previousStart =
    previous.success && previous.data.min === min && previous.data.max === max
      ? starts.findIndex((item) => item.dataId === previous.data.startDataId)
      : -1;

  const start =
    previousStart >= 0 && starts.length - previousStart <= max
      ? previousStart
      : Math.max(0, starts.length - min);
  const firstNonSystem = histories.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemHistories = firstNonSystem === -1 ? histories : histories.slice(0, firstNonSystem);
  const selected = starts[start] ? histories.slice(starts[start].index) : [];
  const startDataId = starts[start]?.dataId || responseChatItemId;

  return {
    histories: [...systemHistories, ...selected],
    // 非持久化入口可能没有 dataId；只在有稳定标识时记录可恢复的起点。
    ...(startDataId ? { memories: { [memoryKey]: { min, max, startDataId } } } : {})
  };
};
