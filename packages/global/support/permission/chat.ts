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
