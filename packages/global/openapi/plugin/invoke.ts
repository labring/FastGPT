import z from 'zod';

/* ============================================================================
 * API: 获取反向调用用户信息
 * Route: POST /api/invoke/userInfo
 * Method: POST
 * Description: 通过 invoke token 获取当前运行上下文的用户信息
 * Tags: ['Plugin', 'Invoke', 'Read']
 * ============================================================================ */
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

/* ============================================================================
 * API: 获取反向调用企微企业访问凭证
 * Route: POST /api/invoke/wecom/corpToken
 * Method: POST
 * Description: 通过 invoke token 获取当前运行团队的企微企业短期访问凭证
 * Tags: ['Plugin', 'Invoke', 'Wecom', 'Read']
 * ============================================================================ */
export const InvokeWecomCorpTokenBodySchema = z.object({});

export const InvokeWecomCorpTokenQuerySchema = z.object({});

export const InvokeWecomCorpTokenResponseSchema = z.object({
  accessToken: z.string().describe('企微企业访问凭证'),
  expiresIn: z.number().describe('凭证有效期，单位秒')
});

export type InvokeWecomCorpTokenBodyType = z.infer<typeof InvokeWecomCorpTokenBodySchema>;
export type InvokeWecomCorpTokenQueryType = z.infer<typeof InvokeWecomCorpTokenQuerySchema>;
export type InvokeWecomCorpTokenResponseType = z.infer<
  typeof InvokeWecomCorpTokenResponseSchema
>;

/* ============================================================================
 * API: 反向调用文件上传
 * Route: POST /api/invoke/fileUpload
 * Method: POST
 * Description: 通过 invoke token 上传 multipart/form-data 文件到当前对话文件目录
 * Tags: ['Plugin', 'Invoke', 'Write']
 * ============================================================================ */
export const InvokeFileUploadBodySchema = z.object({});

export const InvokeFileUploadQuerySchema = z.object({});

export const InvokeFileUploadResponseSchema = z.object({
  url: z.string().describe('上传后的文件访问 URL')
});

export type InvokeFileUploadBodyType = z.infer<typeof InvokeFileUploadBodySchema>;
export type InvokeFileUploadQueryType = z.infer<typeof InvokeFileUploadQuerySchema>;
export type InvokeFileUploadResponseType = z.infer<typeof InvokeFileUploadResponseSchema>;
