import z from 'zod';
import { ensureHttpProtocol } from '../../../common/string/url';

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
// baseUrl 在 schema 内统一归一化：缺失协议时补 https://，避免 axios 抛 ERR_INVALID_URL。
// 该 schema 同时用于保存入参和详情响应解析，归一化放在这里，历史裸域名记录也能正常读取。
export const APIFileServerSchema = z
  .object({
    baseUrl: z.string().overwrite(ensureHttpProtocol),
    authorization: z.string().optional(),
    basePath: z.string().optional()
  })
  .meta({ description: 'API 服务器配置' });
export type APIFileServerType = z.infer<typeof APIFileServerSchema>;
export type APIFileServer = APIFileServerType;
export const FeishuServerSchema = z
  .object({
    appId: z.string(),
    appSecret: z.string().optional(),
    folderToken: z.string()
  })
  .meta({ description: '飞书服务器配置' });
export type FeishuServerType = z.infer<typeof FeishuServerSchema>;
export type FeishuServer = FeishuServerType;
export const YuqueServerSchema = z
  .object({
    userId: z.string(),
    token: z.string().optional(),
    basePath: z.string().optional()
  })
  .meta({ description: '语雀服务器配置' });
export type YuqueServerType = z.infer<typeof YuqueServerSchema>;
export type YuqueServer = YuqueServerType;
export const DingtalkServerSchema = z
  .object({
    appKey: z.string(),
    appSecret: z.string().optional(),
    userId: z.string(),
    operatorId: z.string().optional(),
    workspaceId: z.string().optional(),
    rootNodeId: z.string().optional(),
    workspaceName: z.string().optional()
  })
  .meta({ description: '钉钉知识库配置' });
export type DingtalkServerType = z.infer<typeof DingtalkServerSchema>;
export type DingtalkServer = DingtalkServerType;

export const ApiDatasetServerSchema = z
  .object({
    apiServer: APIFileServerSchema.optional(),
    feishuServer: FeishuServerSchema.optional(),
    yuqueServer: YuqueServerSchema.optional(),
    dingtalkServer: DingtalkServerSchema.optional()
  })
  .meta({ description: '第三方知识库配置' });
export type ApiDatasetServerType = z.infer<typeof ApiDatasetServerSchema>;

// Api dataset api
export const ApiFileReadContentResponseSchema = z.object({
  title: z.string().optional(),
  rawText: z.string()
});
export type ApiFileReadContentResponseType = z.infer<typeof ApiFileReadContentResponseSchema>;
export type ApiFileReadContentResponse = ApiFileReadContentResponseType;

export const APIFileReadResponseSchema = z.object({
  url: z.string()
});
export type APIFileReadResponseType = z.infer<typeof APIFileReadResponseSchema>;
export type APIFileReadResponse = APIFileReadResponseType;

export type ApiDatasetDetailResponse = APIFileItemType;

export type ApiDatasetErrorCode =
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'UNAUTHORIZED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'INVALID_PARAMS'
  | 'UNKNOWN_ERROR';

export type ApiDatasetResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      code: ApiDatasetErrorCode;
      message: string;
      status?: number;
    };
