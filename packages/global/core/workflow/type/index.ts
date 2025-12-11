import { StoreEdgeItemTypeSchema } from './edge';
import { AppChatConfigTypeSchema } from '../../app/type';
import { ParentIdSchema } from '../../../common/parentFolder/type';
import { AppTypeEnum } from '../../app/constants';
import { StoreNodeItemTypeSchema } from './node';
import { I18nStringSchema } from '../../../common/i18n/type';
import z from 'zod';

export const WorkflowTemplateBasicTypeSchema = z.object({
  nodes: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  chatConfig: AppChatConfigTypeSchema.optional()
});
export type WorkflowTemplateBasicType = z.infer<typeof WorkflowTemplateBasicTypeSchema>;

export const WorkflowTemplateTypeSchema = z.object({
  id: z.string(),
  parentId: ParentIdSchema.optional(),
  isFolder: z.boolean().optional(),

  avatar: z.string().optional(),
  name: z.union([I18nStringSchema, z.string()]),
  intro: z.union([I18nStringSchema, z.string()]).optional(),
  toolDescription: z.string().optional(),

  author: z.string().optional(),
  courseUrl: z.string().optional(),
  weight: z.number().optional(),

  version: z.string().optional(),
  workflow: WorkflowTemplateBasicTypeSchema
});
export type WorkflowTemplateType = z.infer<typeof WorkflowTemplateTypeSchema>;

// template market
export const TemplateMarketItemTypeSchema = WorkflowTemplateTypeSchema.and(
  z.object({
    tags: z.array(z.string()),
    type: z.enum([AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.workflowTool])
  })
);
export type TemplateMarketItemType = z.infer<typeof TemplateMarketItemTypeSchema>;

// template market list
export const TemplateMarketListItemTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  intro: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()),
  type: z.enum([AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.workflowTool]),
  avatar: z.string()
});
export type TemplateMarketListItemType = z.infer<typeof TemplateMarketListItemTypeSchema>;
