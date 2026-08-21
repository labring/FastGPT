import z from 'zod';

export const SaveTemplateTypeBodySchema = z.object({
  typeId: z.string().meta({ description: '模板类型ID' }),
  typeName: z.string().meta({ description: '模板类型名称' }),
  typeOrder: z.number().meta({ description: '模板类型排序值' })
});

export const UpdateTemplateTypeOrderBodySchema = z.object({
  types: z
    .array(
      z.object({
        typeId: z.string().meta({ description: '模板类型ID' }),
        typeOrder: z.number().meta({ description: '排序值' })
      })
    )
    .meta({ description: '模板类型排序列表' })
});
