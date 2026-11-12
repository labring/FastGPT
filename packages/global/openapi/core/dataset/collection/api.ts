import { ChatIdSchema } from '../../../../core/chat/schema';
import { requiredAlternatives } from '../../../../common/zod/openapi';
import {
  FolderAccessModeSchema,
  GetPathPropsSchema,
  ParentIdSchema,
  ParentTreePathItemSchema
} from '../../../../common/parentFolder/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '../../../../core/dataset/constants';
import {
  CollectionTagFilterItemSchema,
  CollectionTagLabelSchema,
  CollectionTrainingStatusSchema,
  DatasetCollectionItemSchema,
  DatasetCollectionSchema
} from '../../../../core/dataset/type';
import { PermissionSchema } from '../../../../support/permission/controller';
import {
  CollaboratorListSchema,
  CollaboratorUpdateListSchema
} from '../../../../support/permission/collaborator.schema';
import { PaginationResponseSchema, createPaginationSchema } from '../../../api';
import z from 'zod';
import type { ZodOpenApiMetadata } from 'zod-openapi';
import {
  createOptionalOutLinkChatTargetInputSchema,
  createOutLinkChatTargetInputSchema,
  transformChatAuthTargetInput,
  transformOptionalChatAuthTargetInput
} from '../../chat/api';

// ============= Update Collection =============
export const UpdateDatasetCollectionBodySchema = z
  .object({
    id: ObjectIdSchema.optional().describe('集合ID，与 datasetId+externalFileId 二选一'),
    parentId: ParentIdSchema.describe('父级目录ID'),
    name: z.string().optional().describe('集合名称'),
    tags: z
      .array(CollectionTagLabelSchema)
      .optional()
      .describe('标签列表（支持 String 旧格式 或 { tag, value } 新格式）'),
    forbid: z.boolean().optional().describe('是否禁用'),
    createTime: z.coerce.date().optional().describe('创建时间'),
    datasetId: z.string().optional().describe('数据集ID，配合 externalFileId 使用'),
    externalFileId: z.string().optional().describe('外部文件ID，配合 datasetId 使用')
  })
  .meta(requiredAlternatives([['id'], ['datasetId', 'externalFileId']]));
export type UpdateDatasetCollectionBodyType = z.infer<typeof UpdateDatasetCollectionBodySchema>;

// ============= Export Collection =============
// Schema 1: Basic collection export with authentication
const chatExportKeys = [
  'customUid',
  'authProxy',
  'appId',
  'skillId',
  'sourceType',
  'outLinkAuthData',
  'chatId',
  'chatItemDataId',
  'chatTime'
] as const;
const BasicExportSchema = z
  .object({
    collectionId: ObjectIdSchema.describe('集合ID')
  })
  .passthrough()
  .superRefine((data, ctx) => {
    // 先检查原始键再清洗，避免无效聊天鉴权参数被 union 降级为普通登录态导出。
    const invalidKey = chatExportKeys.find((key) => data[key] !== undefined);

    if (invalidKey) {
      ctx.addIssue({
        code: 'custom',
        path: [invalidKey],
        message: '聊天态导出字段不能用于普通导出'
      });
    }
  })
  .transform(({ collectionId }) => ({ collectionId }))
  .meta({
    description: '通过资源自身权限导出集合，不接受 customUid、authProxy、appId 或会话上下文字段。',
    override: ({ jsonSchema }) => {
      // 与运行时拒绝键一致，同时兼容其他无关字段的历史清洗行为。
      jsonSchema.not = { anyOf: chatExportKeys.map((key) => ({ required: [key] })) };
    },
    example: {
      collectionId: '68ad85a7463006c963799a05'
    }
  } satisfies ZodOpenApiMetadata);

// Schema 2: Export from chat context with app/skill/outLink authentication
const ChatExportRawSchema = createOutLinkChatTargetInputSchema({
  collectionId: ObjectIdSchema.describe('集合ID'),
  chatId: ChatIdSchema.min(1).describe('会话ID'),
  chatItemDataId: z.string().min(1).max(256).describe('对话ID'),
  chatTime: z.coerce.date().optional().describe('对话时间')
}).meta({
  description: '对话中导出集合，可通过 chatId 等身份信息',
  example: {
    collectionId: '68ad85a7463006c963799a05',
    chatId: '1234567890',
    chatItemDataId: '1234567890',
    chatTime: '2025-12-30T00:00:00.000Z',
    outLinkAuthData: {
      shareId: '1234567890',
      outLinkUid: '1234567890'
    }
  }
});

export const ExportCollectionBodyRawSchema = z.union([ChatExportRawSchema, BasicExportSchema]);
export const ExportCollectionBodySchema = z.union([
  ChatExportRawSchema.transform(transformChatAuthTargetInput),
  BasicExportSchema
]);
export type ExportCollectionBodyType = z.infer<typeof ExportCollectionBodyRawSchema>;
export type ExportCollectionRuntimeBodyType = z.infer<typeof ExportCollectionBodySchema>;

// ============= Delete Collection =============
/** 已弃用：仅为兼容旧调用方保留，新调用方应使用 body.id。 */
export const DeleteCollectionQuerySchema = z.object({
  id: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '旧版用于指定单个集合 ID，已弃用，请改用 body.id',
    deprecated: true
  })
});
export type DeleteCollectionQueryType = z.infer<typeof DeleteCollectionQuerySchema>;

const DeleteCollectionByIdBodySchema = z
  .strictObject({
    id: z.string().min(1).meta({
      example: '68ad85a7463006c963799a05',
      description: '集合 ID，删除该集合及其全部子集合'
    })
  })
  .meta({
    title: '按集合 ID 删除',
    description: '删除单个集合及其全部子集合'
  });

const DeleteCollectionByCollectionIdsBodySchema = z
  .strictObject({
    collectionIds: z
      .array(z.string().min(1))
      .min(1)
      .meta({
        example: ['68ad85a7463006c963799a05'],
        description: '集合 ID 列表，删除每个集合及其全部子集合'
      })
  })
  .meta({
    title: '按集合 ID 列表删除',
    description: '批量删除多个集合及其全部子集合'
  });

const DeleteCollectionByApiFileIdsBodySchema = z
  .strictObject({
    datasetId: z.string().min(1).meta({
      example: '68ad85a7463006c963799a05',
      description: 'API 文件库对应的知识库 ID'
    }),
    apiFileIds: z
      .array(z.string().min(1))
      .min(1)
      .meta({
        example: ['6893c04c0a1c3e0012a3b4c5'],
        description: 'API 文件库的外部文件或目录 ID 列表；全部未命中时返回集合不存在'
      })
  })
  .meta({
    title: '按 API 文件 ID 删除',
    description:
      '外部集成只知道外部文件或目录 ID 时使用：在指定知识库内按 apiFileId 定位集合，删除命中的集合及其全部子集合'
  });

/**
 * 三种定位方式互斥，按 body 分支表达。各分支使用 strictObject：
 * 混用其他定位字段或夹带不完整外部参数时没有任何分支能匹配，请求在数据变更前被拒绝，
 * 而不是按分支顺序静默丢弃多余字段。缺失 body 或严格空对象仅用于兼容旧版 query.id，
 * 是否提供了有效定位参数由路由统一判断；空对象分支不能清洗非法字段后放行。
 */
export const DeleteCollectionBodySchema = z
  .union([
    DeleteCollectionByIdBodySchema,
    DeleteCollectionByCollectionIdsBodySchema,
    DeleteCollectionByApiFileIdsBodySchema,
    z.strictObject({}).meta({
      title: '旧版 query.id 兼容',
      description: '仅通过旧版 query.id 定位时允许空请求体；未提供任何定位参数时拒绝请求'
    })
  ])
  .optional();
export type DeleteCollectionBodyType = z.infer<typeof DeleteCollectionBodySchema>;

// ============= Get Collection Detail =============
export const GetCollectionDetailQuerySchema = z.object({
  id: z.string().meta({ description: '集合 ID' })
});
export type GetCollectionDetailQueryType = z.infer<typeof GetCollectionDetailQuerySchema>;

export const GetCollectionDetailResponseSchema = DatasetCollectionItemSchema.meta({
  description: '集合详情'
});
export type GetCollectionDetailResponseType = z.infer<typeof GetCollectionDetailResponseSchema>;

// ============= List Collections V2 =============
export const ListCollectionV2BodySchema = createPaginationSchema({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: z.string().nullable().optional().default(null).meta({ description: '父级目录 ID' }),
  searchText: z.string().max(100).optional().default('').meta({ description: '搜索文本' }),
  selectFolder: z.boolean().optional().default(false).meta({ description: '只返回文件夹' }),
  tagFilters: z.array(CollectionTagFilterItemSchema).optional().default([]).meta({
    description: '按标签值过滤。同一标签多值为 OR，不同标签为 AND'
  }),
  simple: z.boolean().optional().default(false).meta({ description: '简单模式（不统计数量）' })
});
export type ListCollectionV2BodyType = z.infer<typeof ListCollectionV2BodySchema>;

// ============= List Collections V2 Response =============
export const DatasetCollectionsListItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({ description: '集合 ID' }),
    parentId: DatasetCollectionSchema.shape.parentId,
    tmbId: DatasetCollectionSchema.shape.tmbId,
    name: DatasetCollectionSchema.shape.name,
    type: DatasetCollectionSchema.shape.type,
    createTime: DatasetCollectionSchema.shape.createTime,
    updateTime: DatasetCollectionSchema.shape.updateTime,
    forbid: DatasetCollectionSchema.shape.forbid,
    trainingType: DatasetCollectionSchema.shape.trainingType,
    tags: DatasetCollectionItemSchema.shape.tags,

    externalFileId: z.string().optional().meta({ description: '外部文件 ID' }),

    fileId: z.string().optional().meta({ description: '文件 ID' }),
    rawLink: z.string().optional().meta({ description: '原始链接' }),
    permission: PermissionSchema,
    dataAmount: z.number().meta({ description: '数据数量' }),
    folderAccessMode: FolderAccessModeSchema.optional().meta({
      example: 'navigate',
      description: '文件夹访问方式；navigate 仅允许浏览可读后代，不授予真实读取权限'
    })
  })
  .merge(CollectionTrainingStatusSchema);
export type DatasetCollectionsListItemType = z.infer<typeof DatasetCollectionsListItemSchema>;
export const ListCollectionV2ResponseSchema = PaginationResponseSchema(
  DatasetCollectionsListItemSchema
);
export type ListCollectionV2ResponseType = z.infer<typeof ListCollectionV2ResponseSchema>;

// ============= Get Collection Paths =============
export const GetCollectionPathsQuerySchema = GetPathPropsSchema;
export type GetCollectionPathsQueryType = z.infer<typeof GetCollectionPathsQuerySchema>;

export const GetCollectionPathsResponseSchema = z.array(ParentTreePathItemSchema);
export type GetCollectionPathsResponseType = z.infer<typeof GetCollectionPathsResponseSchema>;

// ============= Read Collection Source =============
export const ReadCollectionSourceBodyRawSchema = createOptionalOutLinkChatTargetInputSchema(
  {
    collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
    chatId: ChatIdSchema.min(1).optional().meta({ description: '对话 ID（对话中使用）' }),
    chatItemDataId: z.string().min(1).optional().meta({ description: '对话消息 ID（对话中使用）' })
  },
  { requiredIdentityFields: ['chatId', 'chatItemDataId'] }
);
export const ReadCollectionSourceBodySchema = ReadCollectionSourceBodyRawSchema.transform(
  transformOptionalChatAuthTargetInput
);
export type ReadCollectionSourceBodyType = z.infer<typeof ReadCollectionSourceBodyRawSchema>;
export type ReadCollectionSourceRuntimeBodyType = z.infer<typeof ReadCollectionSourceBodySchema>;

export const ReadCollectionSourceResponseSchema = z.object({
  type: z.literal('url').meta({ description: '资源类型' }),
  value: z.string().meta({ description: '资源 URL' })
});
export type ReadCollectionSourceResponseType = z.infer<typeof ReadCollectionSourceResponseSchema>;

// ============= Training Detail =============
export const GetCollectionTrainingDetailQuerySchema = z.object({
  collectionId: z.string().meta({ description: '集合 ID' })
});
export type GetCollectionTrainingDetailQueryType = z.infer<
  typeof GetCollectionTrainingDetailQuerySchema
>;

const TrainingCountsSchema = z
  .record(z.enum(TrainingModeEnum), z.number())
  .meta({ description: '各训练模式数量' });

export const GetCollectionTrainingDetailResponseSchema = z.object({
  trainingType: z
    .enum(DatasetCollectionDataProcessModeEnum)
    .optional()
    .meta({ description: '训练类型' }),
  advancedTraining: z
    .object({
      customPdfParse: z.boolean().meta({ description: '自定义 PDF 解析' }),
      imageIndex: z.boolean().meta({ description: '图片索引' }),
      autoIndexes: z.boolean().meta({ description: '自动索引' })
    })
    .meta({ description: '高级训练配置' }),
  queuedCounts: TrainingCountsSchema.meta({
    description: '排队数量；rebuildIndex/rebuildSynonym 分别按 data 的 Pending 状态统计'
  }),
  trainingCounts: TrainingCountsSchema.meta({
    description: '处理中数量；rebuildIndex/rebuildSynonym 分别按 data 的 Running 状态统计'
  }),
  errorCounts: TrainingCountsSchema.meta({
    description: '错误数量；rebuildIndex/rebuildSynonym 按 data 各自 Failed 状态统计'
  }),
  trainedCount: z.number().meta({ description: '已训练数据量' })
});
export type GetCollectionTrainingDetailResponseType = z.infer<
  typeof GetCollectionTrainingDetailResponseSchema
>;

// ============= Sync Collection =============
export const SyncCollectionBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' })
});
export type SyncCollectionBodyType = z.infer<typeof SyncCollectionBodySchema>;

export const SyncCollectionResponseSchema = z.enum(DatasetCollectionSyncResultEnum).meta({
  description: '同步结果'
});
export type SyncCollectionResponseType = z.infer<typeof SyncCollectionResponseSchema>;

/* ============================================================================
 * API: 获取知识库标签筛选项
 * Route: GET /api/core/dataset/collection/tagFilterOptions
 * Method: GET
 * Description: 获取知识库下当前已被文件使用的标签值，供详情页双栏筛选使用。标签名和类型由 getAllTags 提供。
 * Tags: ['Dataset']
 * ============================================================================ */
export const GetTagFilterOptionsQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '数据集 ID'
  })
});

const TagFilterOptionItemSchema = z.object({
  tagId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '标签 ID' }),
  values: z
    .array(z.union([z.string(), z.number()]))
    .meta({ example: ['PRD'], description: '当前已被文件使用的标签值' })
});
export type TagFilterOptionItemType = z.infer<typeof TagFilterOptionItemSchema>;

export const GetTagFilterOptionsResponseSchema = z.object({
  list: z.array(TagFilterOptionItemSchema).meta({ description: '已用标签值列表' })
});
export type GetTagFilterOptionsResponseType = z.infer<typeof GetTagFilterOptionsResponseSchema>;

/* ============================================================================
 * API: 获取集合协作者
 * Route: GET /proApi/core/dataset/collection/collaborator/list
 * ============================================================================ */
export const GetCollectionCollaboratorListQuerySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '集合 ID'
  })
});
export type GetCollectionCollaboratorListQuery = z.infer<
  typeof GetCollectionCollaboratorListQuerySchema
>;

export const GetCollectionCollaboratorListResponseSchema = CollaboratorListSchema;
export type GetCollectionCollaboratorListResponse = z.infer<
  typeof GetCollectionCollaboratorListResponseSchema
>;

/* ============================================================================
 * API: 更新集合协作者
 * Route: POST /proApi/core/dataset/collection/collaborator/update
 * Method: POST
 * Description: 覆盖更新集合的协作者权限；配置即视为已设置 collection 权限（dataset 短路失效）。
 * Tags: ['协作者管理', '知识库权限管理']
 * ============================================================================ */
export const UpdateCollectionCollaboratorBodySchema = z
  .object({
    collectionId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '集合 ID'
    }),
    // 暂沿用共享协作者 schema：当前仅校验正整数，未收紧为 collection 的 1/2/4/6/7 枚举。
    // owner 必须随完整列表提交，并由服务端校验只能属于 collection.tmbId。
    collaborators: CollaboratorUpdateListSchema.meta({
      description:
        '更新后的完整协作者权限列表（必须包含 owner），至少包含一个协作者且目标不可重复；权限值枚举校验待后续统一收紧'
    })
  })
  .meta({
    example: {
      collectionId: '68ad85a7463006c963799a05',
      collaborators: [{ tmbId: '68ad85a7463006c963799a06', permission: 4 }]
    }
  });
export type UpdateCollectionCollaboratorBody = z.infer<
  typeof UpdateCollectionCollaboratorBodySchema
>;

export const UpdateCollectionCollaboratorResponseSchema = z.undefined().meta({
  description: '操作成功'
});
export type UpdateCollectionCollaboratorResponse = z.infer<
  typeof UpdateCollectionCollaboratorResponseSchema
>;

/* ============================================================================
 * API: 恢复集合继承权限
 * Route: PUT /core/dataset/collection/resumeInheritPermission
 * Method: PUT
 * Description: 将集合从独立态恢复为继承态（保留相对当前父级独有的权限位并同步子树）。
 * Tags: ['知识库权限管理']
 * ============================================================================ */
export const ResumeCollectionInheritPermissionBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '集合 ID'
  })
});
export type ResumeCollectionInheritPermissionBody = z.infer<
  typeof ResumeCollectionInheritPermissionBodySchema
>;

/* ============================================================================
 * API: 转让集合所有权
 * Route: POST /proApi/core/dataset/collection/changeOwner
 * Method: POST
 * Description: 将集合（含其 parentId 子树）所有权转让给指定团队成员。
 * Tags: ['资源权限', '知识库权限管理']
 * ============================================================================ */
export const ChangeCollectionOwnerBodySchema = z
  .object({
    collectionId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '集合 ID'
    }),
    ownerId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '新的所有者团队成员 ID'
    })
  })
  .meta({
    example: {
      collectionId: '68ad85a7463006c963799a05',
      ownerId: '68ad85a7463006c963799a06'
    }
  });
export type ChangeCollectionOwnerBody = z.infer<typeof ChangeCollectionOwnerBodySchema>;

export const ChangeCollectionOwnerResponseSchema = z.undefined().meta({ description: '转让成功' });
export type ChangeCollectionOwnerResponse = z.infer<typeof ChangeCollectionOwnerResponseSchema>;
