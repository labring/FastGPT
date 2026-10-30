import z from 'zod';
import { ensureHttpProtocol } from '../../../common/string/url';
import {
  ManageRoleVal,
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '../../../support/permission/constant';

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

/** 外部权限项允许的 role，与 ACL 行取值对齐；掩码（7/6/…）和其他数字一律非法。 */
export const ApiDatasetPermissionRoleSchema = z.union([
  z.literal(ReadRoleVal),
  z.literal(WriteRoleVal),
  z.literal(ManageRoleVal),
  z.literal(OwnerRoleVal)
]);

/**
 * 外部文件权限项：主体四选一。`username` 只在 dataset 所属团队内解析成 tmbId，
 * 不落库、不打日志；其余三类是 FastGPT 自身的稳定 ID。
 */
export const ApiDatasetPermissionItemSchema = z
  .object({
    username: z.string().optional(),
    tmbId: z.string().optional(),
    groupId: z.string().optional(),
    orgId: z.string().optional(),
    /** role 位：4=只读 2=读写 1=管理 4294967295=owner；无管理主体时同步流程会补本地 owner 兜底行 */
    permission: ApiDatasetPermissionRoleSchema
  })
  .superRefine((value, ctx) => {
    const subjects = [value.username, value.tmbId, value.groupId, value.orgId].filter(
      (item) => item !== undefined && item !== ''
    );
    if (subjects.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'permissions item must contain exactly one of username/tmbId/groupId/orgId'
      });
    }
  })
  .meta({ description: '外部文件权限项' });
export type ApiDatasetPermissionItemType = z.infer<typeof ApiDatasetPermissionItemSchema>;

export const ApiDatasetServerSchema = z
  .object({
    apiServer: APIFileServerSchema.optional(),
    feishuServer: FeishuServerSchema.optional(),
    yuqueServer: YuqueServerSchema.optional(),
    dingtalkServer: DingtalkServerSchema.optional(),

    // 三个开关均省略即 false。用 optional 而不是 default：schema 同时用于详情响应解析，
    // default 会把字段补进来，破坏「存量记录原样返回」和既有精确断言。
    /** 外部文件权限同步。仅 custom apiServer 支持；开启即由外部列表全量接管 collection ACL */
    permissionSync: z.boolean().optional(),
    /** 关闭 root/团队 owner 在知识库**管理侧**（Dataset / Collection 鉴权、列表、导出）的旁路；检索不读取该开关 */
    disableSuperAdmin: z.boolean().optional(),
    /** 整库同步：每日同步的根范围来自知识库根目录，而不是本地最外层节点 */
    syncAllFiles: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    // 其他 provider 的文件权限协议未实现，开启同步会让快照永远无法写入
    if (value.permissionSync === true && !value.apiServer) {
      ctx.addIssue({
        code: 'custom',
        path: ['permissionSync'],
        message: 'permissionSync is only supported with apiServer'
      });
    }
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

/** 文件详情：`permissions` 仅在自定义 API 返回时存在，缺失即表示外部未提供权限 */
export type ApiDatasetDetailResponse = APIFileItemType & {
  permissions?: ApiDatasetPermissionItemType[];
};

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
