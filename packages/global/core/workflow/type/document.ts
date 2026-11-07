import z from 'zod';
import { AppChatConfigTypeSchema } from '../../app/type';
import { StoreNodeItemTypeSchema } from './node';
import { WorkflowExecutionEdgeSchema } from './edge';

/** Core、CLI 和 API 共用的工作流静态契约；版本兼容和业务校验由 Core 处理。 */
export const WORKFLOW_DOCUMENT_SCHEMA_VERSION = 'fastgpt-workflow/v1' as const;
export const WorkflowDocumentSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_DOCUMENT_SCHEMA_VERSION).meta({
    description: 'WorkflowDocument schema 版本',
    example: 'fastgpt-workflow/v1'
  }),
  app: z
    .object({
      appId: z.string().optional(),
      name: z.string().optional(),
      intro: z.string().optional(),
      appType: z.string().optional(),
      baseVersionId: z.string().optional()
    })
    .meta({ description: '应用元数据' }),
  nodes: z.array(StoreNodeItemTypeSchema).meta({ description: '工作流节点' }),
  executionEdges: z.array(WorkflowExecutionEdgeSchema).meta({ description: '语义执行边' }),
  chatConfig: AppChatConfigTypeSchema.meta({ description: '工作流对话配置' })
});

export type WorkflowDocument = z.infer<typeof WorkflowDocumentSchema>;
