import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';

const SandboxBaseSchema = z.object({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  chatId: z.string().meta({
    example: 'bEdzC6PNupZrr1RoVutMF2DL',
    description: '对话 ID'
  }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

/**
 * 列出目录 - 请求/响应
 */
export const SandboxListBodySchema = SandboxBaseSchema.extend({
  path: z.string().default('.').describe('目录路径')
});
export type SandboxListBody = z.infer<typeof SandboxListBodySchema>;

export const SandboxFileItemSchema = z.object({
  name: z.string().describe('文件名'),
  path: z.string().describe('完整路径'),
  type: z.enum(['file', 'directory']).describe('文件类型'),
  size: z.number().optional().describe('文件大小(字节数)')
});
export type SandboxFileItem = z.infer<typeof SandboxFileItemSchema>;

export const SandboxListResponseSchema = z.object({
  files: z.array(SandboxFileItemSchema)
});
export type SandboxListResponse = z.infer<typeof SandboxListResponseSchema>;

/* ============================================================================
 * API: 递归列出沙盒目录
 * Route: POST /api/core/ai/sandbox/listRecursive
 * Method: POST
 * Description: 一次性获取指定目录下的文件树，用于 Skill Edit 初始化文件列表
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */
export const SandboxListRecursiveBodySchema = SandboxListBodySchema.extend({
  excludeNames: z
    .array(z.string())
    .optional()
    .meta({
      example: ['node_modules', '.git', 'dist'],
      description: '需要跳过的文件或目录名称，仅按文件名匹配'
    }),
  maxDepth: z.number().int().min(0).max(20).default(20).meta({
    example: 20,
    description: '最大递归深度，0 表示只返回当前目录的直接子项'
  })
});
export type SandboxListRecursiveBody = z.input<typeof SandboxListRecursiveBodySchema>;

export type SandboxFileTreeItem = SandboxFileItem & {
  children?: SandboxFileTreeItem[];
  level: number;
  loaded?: boolean;
};

export const SandboxFileTreeItemSchema: z.ZodType<SandboxFileTreeItem> =
  SandboxFileItemSchema.extend({
    children: z
      .lazy(() => z.array(SandboxFileTreeItemSchema))
      .optional()
      .meta({
        description: '子节点。文件没有该字段，目录在未加载到更深层时可能为空数组'
      }),
    level: z.number().int().nonnegative().meta({
      example: 0,
      description: '节点层级，相对于请求 path 的直接子项为 0'
    }),
    loaded: z.boolean().optional().meta({
      example: true,
      description: '目录子节点是否已完整加载；达到 maxDepth 截断时为 false'
    })
  });

export const SandboxListRecursiveResponseSchema = z.object({
  files: z.array(SandboxFileTreeItemSchema).meta({
    description: '递归目录树',
    example: [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        level: 1,
        loaded: true,
        children: [
          {
            name: 'index.ts',
            path: 'src/index.ts',
            type: 'file',
            size: 128,
            level: 2
          }
        ]
      }
    ]
  }),
  expandedPaths: z.array(z.string()).meta({
    example: ['src'],
    description: '默认展开的目录路径'
  })
});
export type SandboxListRecursiveResponse = z.infer<typeof SandboxListRecursiveResponseSchema>;

/**
 * 写入文件 - 请求/响应
 */
export const SandboxWriteBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径'),
  content: z.string().describe('文件内容')
});
export type SandboxWriteBody = z.infer<typeof SandboxWriteBodySchema>;

export const SandboxWriteResponseSchema = z.object({
  success: z.boolean()
});
export type SandboxWriteResponse = z.infer<typeof SandboxWriteResponseSchema>;

/**
 * 读取文件内容 - 请求体（响应为原始文件流）
 */
export const SandboxReadBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径')
});
export type SandboxReadBody = z.infer<typeof SandboxReadBodySchema>;

export const SandboxReadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件内容流' });

/**
 * 下载文件或目录 - 请求体（响应为文件流或 ZIP）
 */
export const SandboxDownloadBodySchema = SandboxBaseSchema.extend({
  path: z.string().optional().default('.').describe('要下载的路径(文件或目录)')
});
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodySchema = SandboxBaseSchema;
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
});
export type SandboxCheckExistBody = z.infer<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/**
 * 获取 HTML 预览链接 - 请求/响应
 */
export const SandboxGetHtmlPreviewLinkBodySchema = SandboxBaseSchema.extend({
  filePath: z.string().describe('文件路径')
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().describe('HTML 预览链接');
export type SandboxGetHtmlPreviewLinkBody = z.infer<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;

/**
 * 文件系统操作 - 请求/响应
 */
export const SandboxFileOpBodySchema = SandboxBaseSchema.extend({
  type: z.enum(['mkdir', 'delete', 'move', 'copy']).describe('操作类型'),
  path: z.string().describe('当前路径'),
  destPath: z.string().optional().describe('目标路径')
});
export type SandboxFileOpBody = z.infer<typeof SandboxFileOpBodySchema>;

export const SandboxFileOpResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional()
});
export type SandboxFileOpResponse = z.infer<typeof SandboxFileOpResponseSchema>;
