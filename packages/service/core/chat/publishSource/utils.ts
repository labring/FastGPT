import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceSchema } from '@fastgpt/global/core/chat/schema';
import {
  ChatPublishSourceSchema,
  type ChatPublishSourceType
} from '@fastgpt/global/core/chat/publishSource/type';

/** 已知外部渠道必须带可信记录 ID；内部及未知来源不保留渠道引用，避免误认其归属。 */
export const resolveCurrentChatPublishSource = ({
  source,
  publishSource
}: {
  source: string;
  publishSource?: ChatPublishSourceType;
}): ChatPublishSourceType => {
  const result = ChatPublishSourceSchema.parse(publishSource ?? { type: source });
  const sourcesWithoutChannelId = [
    ChatSourceEnum.online,
    ChatSourceEnum.test,
    ChatSourceEnum.cronJob,
    ChatSourceEnum.unknown
  ];
  if (sourcesWithoutChannelId.includes(result.type)) return { type: result.type };
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

/**
 * 新分类优先，缺失（含 null）时回退旧 source，再按公共 schema 的枚举范围归类。
 * Mongo 表达式按完整字段值比较，名称、空值、数组等均归为 unknown，避免与响应/CSV 分类不同。
 * 省略参数不筛选，空数组保持未选择语义；应用、团队和时间范围仍由调用方限定。
 */
export const buildChatPublishSourceFilter = (sources?: readonly string[]) =>
  sources === undefined
    ? {}
    : {
        $expr: {
          $in: [
            {
              $let: {
                vars: { source: { $ifNull: ['$publishSource.type', '$source'] } },
                in: {
                  $cond: [
                    { $in: ['$$source', ChatSourceSchema.unwrap().options] },
                    '$$source',
                    ChatSourceEnum.unknown
                  ]
                }
              }
            },
            { $literal: [...sources] }
          ]
        }
      };
