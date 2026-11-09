import { ObjectIdSchema } from '../../common/type/mongo';
import { optionalNullToUndefined } from '../../common/zod';
import type { ZodOpenApiMetadata } from 'zod-openapi';
import z from 'zod';

export const OutLinkChatAuthSchema = z.object({
  shareId: z.string().min(1).describe('分享链接ID'),
  outLinkUid: z.string().min(1).describe('外链用户ID')
});
export type ShareChatAuthProps = z.infer<typeof OutLinkChatAuthSchema>;
export type OutLinkChatAuthProps = z.infer<typeof OutLinkChatAuthSchema>;

/**
 * 解析 API 边界传入的外链鉴权数据。
 *
 * Query 将对象序列化成字符串；此处供 Query 校验和身份转换复用，让业务层只处理对象。
 * 非 JSON 字符串保留原值交给 zod 报错，避免静默吞掉非法请求。
 */
export const parseOutLinkChatAuthInput = (value: unknown) => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/** Query 只接收 JSON 字符串，校验后交给业务层的身份数据始终为对象。 */
export const OutLinkChatAuthQuerySchema = z
  .string()
  .transform((value, ctx) => {
    const parsedAuth = OutLinkChatAuthSchema.safeParse(parseOutLinkChatAuthInput(value));
    if (!parsedAuth.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid outLinkAuthData'
      });
      return z.NEVER;
    }
    return parsedAuth.data;
  })
  .meta({
    example: JSON.stringify({ shareId: 'share-id', outLinkUid: 'outlink-user-id' }),
    description: '外链鉴权数据的 JSON 字符串，包含 shareId 和 outLinkUid。'
  });
export type OutLinkChatAuthQuery = z.input<typeof OutLinkChatAuthQuerySchema>;

export const ChatAuthProxySchema = z
  .union([
    z
      .object({
        tmbId: ObjectIdSchema.meta({
          description: 'API Key 代理调用的团队成员 ID，优先于 username'
        })
      })
      .meta({ title: '按团队成员 ID' }),
    z
      .object({
        username: z.string().trim().min(1).max(128).meta({
          example: 'user@example.com',
          description: 'API Key 代理调用的团队成员用户名'
        }),
        // 兼容 tmbId: null，但禁止无效 ID 回退到用户名查询。
        tmbId: optionalNullToUndefined(z.never())
      })
      .meta({
        title: '按用户名',
        override: ({ jsonSchema }) => {
          // 仅用于运行时校验的守卫字段，不作为用户名模式的文档参数展示。
          delete jsonSchema.properties?.tmbId;
        }
      } satisfies ZodOpenApiMetadata)
  ])
  .meta({
    type: 'object',
    description:
      'API Key 代理调用身份。仅开启 authProxy 的个人密钥可用；按团队成员 ID 或用户名指定，二者同时传入时优先使用 tmbId，解析时过滤 username；tmbId 无效时不回退到用户名'
  });
export type ChatAuthProxy = z.infer<typeof ChatAuthProxySchema>;

/** Query 将代理对象编码为 JSON 字符串；格式错误必须拒绝，不回退默认成员。 */
export const ChatAuthProxyQuerySchema = z
  .string()
  .transform((value, ctx) => {
    let input: unknown;
    try {
      input = JSON.parse(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'authProxy must be a JSON string' });
      return z.NEVER;
    }
    const result = ChatAuthProxySchema.safeParse(input);
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: 'Invalid authProxy' });
      return z.NEVER;
    }
    return result.data;
  })
  .meta({
    example: '{"tmbId":"68ad85a7463006c963799a06"}',
    description: '代理身份的 JSON 字符串，例如 {"tmbId":"团队成员ID"} 或 {"username":"用户名"}'
  });
export type ChatAuthProxyQuery = z.input<typeof ChatAuthProxyQuerySchema>;
