import z from 'zod';

export const TeamPluginEmptyResponseSchema = z.undefined().meta({
  description: '操作成功'
});
export type TeamPluginEmptyResponseType = z.infer<typeof TeamPluginEmptyResponseSchema>;
