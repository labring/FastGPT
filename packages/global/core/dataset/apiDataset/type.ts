import z from 'zod';

export const APIFileItemSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  parentId: z.string().nullish(),
  name: z.string(),
  type: z.enum(['file', 'folder']),
  updateTime: z.coerce.date(),
  createTime: z.coerce.date(),
  hasChild: z.boolean().optional()
});
export type APIFileItemType = z.infer<typeof APIFileItemSchema>;

// Api dataset config
export const APIFileServerSchema = z
  .object({
    baseUrl: z.string(),
    authorization: z.string().optional(),
    basePath: z.string().optional()
  })
  .meta({ description: 'API 服务器配置' });
export type APIFileServerType = z.infer<typeof APIFileServerSchema>;
export const FeishuServerSchema = z
  .object({
    appId: z.string(),
    appSecret: z.string().optional(),
    folderToken: z.string()
  })
  .meta({ description: '飞书服务器配置' });
export type FeishuServerType = z.infer<typeof FeishuServerSchema>;
export const YuqueServerSchema = z
  .object({
    userId: z.string(),
    token: z.string().optional(),
    basePath: z.string().optional()
  })
  .meta({ description: '语雀服务器配置' });
export type YuqueServerType = z.infer<typeof YuqueServerSchema>;

export const ApiDatasetServerSchema = z
  .object({
    apiServer: APIFileServerSchema.optional(),
    feishuServer: FeishuServerSchema.optional(),
    yuqueServer: YuqueServerSchema.optional()
  })
  .meta({ description: '第三方知识库配置' });
export type ApiDatasetServerType = z.infer<typeof ApiDatasetServerSchema>;

// Api dataset api
export const ApiFileReadContentResponseSchema = z.object({
  title: z.string().optional(),
  rawText: z.string()
});
export type ApiFileReadContentResponseType = z.infer<typeof ApiFileReadContentResponseSchema>;

export const APIFileReadResponseSchema = z.object({
  url: z.string()
});
export type APIFileReadResponseType = z.infer<typeof APIFileReadResponseSchema>;

export type ApiDatasetDetailResponse = APIFileItemType;
