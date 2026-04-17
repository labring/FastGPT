import { z } from 'zod';
export const InvokeUserInfoBodySchema = z.object({});

export const InvokeUserInfoQuerySchema = z.object({});

export const InvokeUserInfoResponseSchema = z.object({
  username: z.string().describe('账号'),
  contact: z.string().nullish().describe('联系方式'),
  memberName: z.string().nullish().describe('成员名称'),
  orgs: z.array(
    z.object({
      pathId: z.string().describe('组织路径ID'),
      name: z.string().describe('组织名称')
    })
  ),
  groups: z.array(z.object({ name: z.string().describe('群组名称') }))
});

export type InvokeUserInfoBodyType = z.infer<typeof InvokeUserInfoBodySchema>;
export type InvokeUserInfoQueryType = z.infer<typeof InvokeUserInfoQuerySchema>;
export type InvokeUserInfoResponseType = z.infer<typeof InvokeUserInfoResponseSchema>;
