import z from 'zod';

export const ShareChatAuthSchema = z.object({
  shareId: z.string().optional().describe('分享链接ID'),
  outLinkUid: z.string().optional().describe('外链用户ID')
});
export type ShareChatAuthProps = z.infer<typeof ShareChatAuthSchema>;

/**
 * 解析 API 边界传入的外链鉴权数据。
 *
 * GET query 会把对象序列化成字符串；这里统一兼容 JSON string，让业务层只处理对象形态。
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

export const OutLinkChatAuthSchema = z.union([
  ShareChatAuthSchema,
  z.string().transform((value, ctx) => {
    const parsedValue = parseOutLinkChatAuthInput(value);
    const parsedAuth = ShareChatAuthSchema.safeParse(parsedValue);

    if (!parsedAuth.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid outLinkAuthData'
      });
      return z.NEVER;
    }

    return parsedAuth.data;
  })
]);
export type OutLinkChatAuthProps = z.infer<typeof OutLinkChatAuthSchema>;
