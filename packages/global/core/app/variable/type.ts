import z from 'zod';
import { VariableInputEnum } from '../../workflow/constants';
import { InputComponentPropsTypeSchema } from '../../workflow/type/io';
import { AppFileSelectConfigTypeSchema } from '../type/config.schema';

/**
 * 应用变量定义放在独立叶子模块中，避免变量校验工具反向依赖聚合的应用类型，
 * 从而与工作流节点和 HTTP 工具 schema 形成循环初始化。
 */
export const VariableItemTypeSchema = AppFileSelectConfigTypeSchema.extend(
  InputComponentPropsTypeSchema.shape
).extend({
  type: z.enum(VariableInputEnum).meta({
    description: '变量输入组件类型'
  }),
  description: z.string().meta({
    description: '变量用途说明'
  })
});
export type VariableItemType = z.infer<typeof VariableItemTypeSchema>;
