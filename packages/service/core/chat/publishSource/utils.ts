import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import {
  ChatPublishSourceSchema,
  type ChatPublishSourceType
} from '@fastgpt/global/core/chat/publishSource/type';

/** 新运行的外部渠道必须带可信记录 ID；历史读取仍允许 type-only。 */
export const resolveCurrentChatPublishSource = ({
  source,
  publishSource
}: {
  source: string;
  publishSource?: ChatPublishSourceType;
}): ChatPublishSourceType => {
  const result = ChatPublishSourceSchema.parse(publishSource ?? { type: source });
  const internal = [ChatSourceEnum.online, ChatSourceEnum.test, ChatSourceEnum.cronJob];
  if (internal.includes(result.type)) return { type: result.type };
  if (!result.id) throw new Error('External chat publish source ID is missing');
  return result;
};

/** 仅当前分享/MCP 请求检查完整旧来源；缺字段兼容不替代原有资源与 UID 鉴权。 */
export const assertChatPublishSource = ({
  previous,
  current
}: {
  previous?: Partial<ChatPublishSourceType> | null;
  current: ChatPublishSourceType;
}): void => {
  if (current.type !== ChatSourceEnum.share && current.type !== ChatSourceEnum.mcp) return;
  if (!current.id) throw ChatErrEnum.unAuthChat;
  if (!previous?.type || !previous.id) return;
  if (previous.type !== current.type || String(previous.id) !== String(current.id)) {
    throw ChatErrEnum.unAuthChat;
  }
};

/** 新分类优先；缺失（含 null）时才按旧 source 查询，空数组保持未选择语义。 */
export const buildChatPublishSourceFilter = (sources?: readonly string[]) =>
  sources === undefined
    ? {}
    : {
        $or: [
          { 'publishSource.type': { $in: [...sources] } },
          { 'publishSource.type': null, source: { $in: [...sources] } }
        ]
      };
