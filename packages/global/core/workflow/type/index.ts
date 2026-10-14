import { StoreEdgeItemTypeSchema } from './edge';
import { AppChatConfigTypeSchema } from '../../app/type';
import { ParentIdSchema } from '../../../common/parentFolder/type';
import { StoreNodeItemTypeSchema } from './node';
import { WorkflowReferenceSnapshotSchema } from './io';
import { I18nStringSchema } from '../../../common/i18n/type';
import z from 'zod';

export const WorkflowTemplateBasicTypeSchema = z.object({
  nodes: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  chatConfig: AppChatConfigTypeSchema.optional(),
  referenceSnapshots: z.array(WorkflowReferenceSnapshotSchema).optional()
});
export type WorkflowTemplateBasicType = z.infer<typeof WorkflowTemplateBasicTypeSchema>;

export const WorkflowTemplateTypeSchema = z.object({
  id: z.string(),
  parentId: ParentIdSchema.optional(),
  isFolder: z.boolean().optional(),

  avatar: z.string().optional(),
  name: z.union([I18nStringSchema, z.string()]),
  intro: z.union([I18nStringSchema, z.string()]).optional(),
  toolDescription: z.string().optional().meta({
    description: '已废弃：节点作为工具被调用时的能力说明',
    deprecated: true
  }),

  author: z.string().optional(),
  courseUrl: z.string().optional(),
  weight: z.number().optional(),

  version: z.string().optional(),
  workflow: WorkflowTemplateBasicTypeSchema
});
export type WorkflowTemplateType = z.infer<typeof WorkflowTemplateTypeSchema>;
