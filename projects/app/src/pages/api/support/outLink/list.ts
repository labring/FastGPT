import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  OutLinkListQuerySchema,
  OutLinkListResponseSchema,
  type OutLinkListResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { normalizeShareOutLinkAllowAnonymous } from '@fastgpt/service/support/outLink/compatibility';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { WechatAppSchema, WechatConnectionErrorSchema } from '@fastgpt/global/support/outLink/type';

// 历史连接记录逐字段降级，读取不到 token 时仍保留可识别的状态和错误原因。
const StoredWechatListAppSchema = WechatAppSchema.pick({ status: true, token: true }).extend({
  status: WechatAppSchema.shape.status.catch('offline'),
  token: WechatAppSchema.shape.token.catch(''),
  lastError: WechatConnectionErrorSchema.optional().catch(undefined)
});

// 查询应用的所有 OutLink
export async function handler(req: ApiRequestProps): Promise<OutLinkListResponseType> {
  const { appId, type } = parseApiInput({
    req,
    querySchema: OutLinkListQuerySchema
  }).query;
  await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  const data = await MongoOutLink.find({
    appId,
    type: type
  }).sort({
    _id: -1
  });

  const result = data.map((item) => item.toObject());
  // 配置列表只返回已保存的偏好，套餐约束由聊天初始化时计算，不在读取时修改记录。
  return OutLinkListResponseSchema.parse(
    type === PublishChannelEnum.share
      ? result.map(normalizeShareOutLinkAllowAnonymous)
      : result.map(({ allowAnonymous: _allowAnonymous, isShowBrand: _isShowBrand, ...item }) => {
          if (item.type !== PublishChannelEnum.wechat) return item;

          const { data: app } = StoredWechatListAppSchema.safeParse(item.app);
          const status = app?.status ?? 'offline';
          return {
            ...item,
            // 升级时按同版本 App 切换。旧写实例会将此摘要写回连接配置，发布时需避免新旧实例混跑。
            app: {
              status,
              isBound: Boolean(app?.token),
              errorReason: status === 'error' ? app?.lastError : undefined
            }
          };
        })
  );
}

export default NextAPI(handler);
