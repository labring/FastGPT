import { z } from 'zod';
import { FlowNodeInputTypeEnum } from '../../../node/constant';
import { WorkflowIOValueTypeEnum } from '../../../constants';
import { VariableUpdateOperatorEnum } from './constants';

const ReferenceItemValueSchema = z.tuple([z.string(), z.union([z.string(), z.undefined()])]);

export const UpdateListItemSchema = z.object({
  variable: ReferenceItemValueSchema.optional(),
  valueType: z.enum(WorkflowIOValueTypeEnum).optional(),
  renderType: z.union([
    z.literal(FlowNodeInputTypeEnum.input),
    z.literal(FlowNodeInputTypeEnum.reference)
  ]),

  updateType: z.enum(VariableUpdateOperatorEnum).optional(),
  referenceValue: ReferenceItemValueSchema.optional(),
  inputValue: z.any().optional(),

  /** @deprecated 旧格式字段，运行时由 normalizeUpdateItem 转换为 updateType + inputValue/referenceValue */
  value: z.any().optional()
});

export type TUpdateListItem = z.infer<typeof UpdateListItemSchema>;
