import z from 'zod';
import {
  FlowNodeTemplateTypeSchema,
  NodeTemplateListItemTypeSchema
} from '../../../../core/workflow/type/node';
import { OpenAPIFlowNodeOutputItemTypeSchema } from '../../workflow/node';
import { BoolSchema } from '../../../../common/zod';

const ToolNodeTemplateListItemSchema = NodeTemplateListItemTypeSchema.extend({
  toolDescription: z.string().optional().meta({
    description: '工具调用描述'
  })
}).catchall(z.any());

const ToolPreviewNodeResponseSchema = FlowNodeTemplateTypeSchema.omit({
  outputs: true
}).extend({
  outputs: z.array(OpenAPIFlowNodeOutputItemTypeSchema)
});

/* ============================================================================
 * API: 获取系统工具模板列表
 * Route: POST /api/core/app/tool/getSystemToolTemplates
 * Method: POST
 * Description: 获取可添加到工作流中的系统工具模板列表，支持搜索、标签筛选和工具集子工具查询
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetSystemToolTemplatesBodySchema = z.object({
  getAll: z.boolean().optional().meta({
    example: false,
    description: '是否获取全部工具。当前接口保留该字段用于兼容旧调用'
  }),
  searchKey: z.string().optional().meta({
    example: 'weather',
    description: '搜索关键字，会匹配工具名称、简介、工具描述和标签'
  }),
  parentId: z.string().nullish().meta({
    example: 'systemTool-map',
    description: '工具集父工具 ID。传入后返回该工具集下的子工具模板'
  }),
  tags: z
    .array(z.string())
    .optional()
    .meta({
      example: ['search'],
      description: '工具标签筛选条件'
    })
});

export type GetSystemToolTemplatesBodyType = z.infer<typeof GetSystemToolTemplatesBodySchema>;

export const GetSystemToolTemplatesResponseSchema = z.array(ToolNodeTemplateListItemSchema);
export type GetSystemToolTemplatesResponseType = z.infer<
  typeof GetSystemToolTemplatesResponseSchema
>;

/* ============================================================================
 * API: 获取工具路径
 * Route: GET /api/core/app/tool/path
 * Method: GET
 * Description: 获取系统工具或工具集子工具在工具树中的路径
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetToolPathQuerySchema = z.object({
  sourceId: z.string().nullish().meta({
    example: 'systemTool-map/geocode',
    description: '工具 ID。为空时返回空路径'
  }),
  type: z.enum(['current', 'parent']).optional().meta({
    example: 'current',
    description: '路径类型：current 返回当前工具路径，parent 只返回父工具路径'
  })
});

export type GetToolPathQueryType = z.infer<typeof GetToolPathQuerySchema>;

export const ToolPathItemSchema = z.object({
  parentId: z.string().meta({
    example: 'systemTool-map',
    description: '路径节点 ID'
  }),
  parentName: z.string().meta({
    example: 'Map',
    description: '路径节点名称'
  })
});

export const GetToolPathResponseSchema = z.array(ToolPathItemSchema);
export type GetToolPathResponseType = z.infer<typeof GetToolPathResponseSchema>;

/* ============================================================================
 * API: 获取工具预览节点
 * Route: GET /api/core/app/tool/getPreviewNode
 * Method: GET
 * Description: 根据工具 ID 和版本配置生成可插入工作流画布的工具节点模板，支持系统工具和我的工具（MCP、HTTP、工作流工具）
 * Tags: ['系统工具', 'HTTP 工具管理', 'MCP 工具管理', '团队插件管理', 'Read']
 * ============================================================================ */

const GetPreviewNodeBaseQuerySchema = z.object({
  appId: z.string().meta({
    example: 'systemTool-weather',
    description:
      '工具 ID，支持系统工具 systemTool/commercial、我的工具 personal/mcp/http 组合 ID 及工具集子工具 ID'
  })
});

export const GetPreviewNodeQuerySchema = z.union([
  GetPreviewNodeBaseQuerySchema.extend({
    versionId: z.string().meta({
      example: '68ad85a7463006c963799a05',
      description:
        '工具版本 ID，与 getLatestVersion 必须二选一。传空字符串时返回最新版节点数据，但响应中的 version 为空'
    }),
    getLatestVersion: z.undefined().optional()
  }),
  GetPreviewNodeBaseQuerySchema.extend({
    versionId: z.undefined().optional(),
    getLatestVersion: BoolSchema.refine((value) => value === true, {
      message: 'getLatestVersion must be true when provided'
    }).meta({
      example: true,
      description:
        '是否获取最新版本 ID，与 versionId 必须二选一。只能传 true，表示返回最新版节点数据并带上具体 version'
    })
  })
]);

export type GetPreviewNodeQuery = z.infer<typeof GetPreviewNodeQuerySchema>;

export const GetPreviewNodeQueryOpenAPISchema = GetPreviewNodeBaseQuerySchema.extend({
  versionId: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description:
      '工具版本 ID，与 getLatestVersion 必须二选一。传空字符串时返回最新版节点数据，但响应中的 version 为空'
  }),
  getLatestVersion: BoolSchema.optional().meta({
    example: true,
    description:
      '是否获取最新版本 ID，与 versionId 必须二选一。只能传 true，表示返回最新版节点数据并带上具体 version'
  })
}).meta({
  description:
    'OpenAPI 文档参数模型。运行时仍由 GetPreviewNodeQuerySchema 校验 versionId/getLatestVersion 的二选一约束。'
});

export const GetPreviewNodeResponseSchema = ToolPreviewNodeResponseSchema;
export type GetPreviewNodeResponse = z.infer<typeof GetPreviewNodeResponseSchema>;
