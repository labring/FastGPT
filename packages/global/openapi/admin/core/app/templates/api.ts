import { AppTypeEnum } from '../../../../../core/app/constants';
import { AppFormEditFormV1TypeSchema } from '../../../../../core/app/formEdit/type';
import { AppTemplateSchema, AppTemplateStorageSchema } from '../../../../../core/app/type';
import { StoreEdgeItemTypeSchema } from '../../../../../core/workflow/type/edge';
import { OpenAPIAppChatConfigSchema } from '../../../../core/app/common/api';
import {
  OpenAPIFlowNodeInputItemTypeSchema,
  OpenAPIFlowNodeOutputItemTypeSchema,
  OpenAPIStoreNodeItemTypeSchema
} from '../../../../core/workflow/node';
import z from 'zod';

const adminTemplateTypes = new Set<string>([
  AppTypeEnum.simple,
  AppTypeEnum.workflow,
  AppTypeEnum.workflowTool
]);
const AdminTemplateTypeSchema = z
  .string()
  .refine((type) => adminTemplateTypes.has(type), '不支持的模板类型');

const AdminTemplateBaseSchema = AppTemplateStorageSchema.omit({
  templateId: true,
  type: true,
  workflow: true,
  isQuickTemplate: true,
  order: true
});

const AdminWorkflowNodeSchema = OpenAPIStoreNodeItemTypeSchema.extend({
  inputs: z.array(OpenAPIFlowNodeInputItemTypeSchema),
  outputs: z.array(OpenAPIFlowNodeOutputItemTypeSchema)
});

const AdminWorkflowTemplateSchema = z.object({
  nodes: z.array(AdminWorkflowNodeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  chatConfig: OpenAPIAppChatConfigSchema.optional()
});

const AdminSimpleTemplateSchema = AppFormEditFormV1TypeSchema.extend({
  chatConfig: OpenAPIAppChatConfigSchema
});
const AdminTemplateWorkflowSchema = z.union([
  AdminSimpleTemplateSchema,
  AdminWorkflowTemplateSchema
]);

/** 校验模板类型与配置结构一致，避免表单配置和节点工作流被交叉存储。 */
const isTemplateWorkflowMatched = ({ type, workflow }: { type: string; workflow: unknown }) => {
  const workflowSchema =
    type === AppTypeEnum.simple ? AdminSimpleTemplateSchema : AdminWorkflowTemplateSchema;
  return workflowSchema.safeParse(workflow).success;
};

/* ============================================================================
 * API: 创建应用模板
 * Route: POST /api/admin/core/app/templates/create
 * Method: POST
 * Description: 管理员创建应用模板，并按应用类型校验模板配置。
 * Tags: ['Admin', 'Template', 'Write']
 * ============================================================================ */

export const CreateTemplateBodySchema = AdminTemplateBaseSchema.extend({
  type: AdminTemplateTypeSchema.meta({ description: '模板类型' }),
  workflow: AdminTemplateWorkflowSchema.meta({ description: '模板配置' })
}).superRefine((data, ctx) => {
  if (isTemplateWorkflowMatched(data)) return;

  ctx.addIssue({
    code: 'custom',
    path: ['workflow'],
    message: 'workflow 与模板 type 不匹配'
  });
});
export type CreateTemplateBodyType = z.infer<typeof CreateTemplateBodySchema>;

/* ============================================================================
 * API: 更新应用模板
 * Route: PUT /api/admin/core/app/templates/update
 * Method: PUT
 * Description: 管理员更新应用模板；更新模板配置时必须同时提交模板类型。
 * Tags: ['Admin', 'Template', 'Write']
 * ============================================================================ */

export const UpdateTemplateBodySchema = AdminTemplateBaseSchema.partial()
  .extend({
    templateId: AppTemplateSchema.shape.templateId,
    type: AdminTemplateTypeSchema.optional().meta({ description: '模板类型' }),
    workflow: AdminTemplateWorkflowSchema.optional().meta({ description: '模板配置' })
  })
  .superRefine((data, ctx) => {
    if ((data.type === undefined) !== (data.workflow === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: data.type === undefined ? ['type'] : ['workflow'],
        message: '更新模板类型或配置时，type 和 workflow 必须同时提交'
      });
      return;
    }

    if (data.type === undefined || data.workflow === undefined) return;

    if (isTemplateWorkflowMatched({ type: data.type, workflow: data.workflow })) return;

    ctx.addIssue({
      code: 'custom',
      path: ['workflow'],
      message: 'workflow 与模板 type 不匹配'
    });
  });
export type UpdateTemplateBodyType = z.infer<typeof UpdateTemplateBodySchema>;

/* ============================================================================
 * API: 更新应用模板排序
 * Route: PUT /api/admin/core/app/templates/updateOrder
 * Method: PUT
 * Description: 管理员批量更新应用模板排序。
 * Tags: ['Admin', 'Template', 'Write']
 * ============================================================================ */

export const UpdateTemplateOrderBodySchema = z.object({
  templates: z
    .array(
      z.object({
        templateId: z.string().meta({ description: '模板ID' }),
        order: z.number().meta({ description: '排序值' })
      })
    )
    .meta({ description: '模板排序列表' })
});
export type UpdateTemplateOrderBodyType = z.infer<typeof UpdateTemplateOrderBodySchema>;

/* ============================================================================
 * API: 设置快捷应用模板
 * Route: PUT /api/admin/core/app/templates/updateQuickTemplate
 * Method: PUT
 * Description: 管理员设置快捷应用模板。
 * Tags: ['Admin', 'Template', 'Write']
 * ============================================================================ */

export const UpdateQuickTemplateBodySchema = z.object({
  templateIds: z.array(z.string()).meta({ description: '设置为快捷模板的模板ID列表' })
});
export type UpdateQuickTemplateBodyType = z.infer<typeof UpdateQuickTemplateBodySchema>;
