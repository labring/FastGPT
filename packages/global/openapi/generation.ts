import z from 'zod';
import type { CreateDocumentOptions } from 'zod-openapi';
/** 仅在文档生成时隐藏禁用字段，并按请求实际可省略语义修正必填标记；不修改运行时校验和响应契约。 */
export const openApiDocumentOptions: CreateDocumentOptions = {
  override: ({ jsonSchema, zodSchema, io }) => {
    if (!(zodSchema instanceof z.ZodObject)) return;

    /** 剥离 optional/catch；nullable(never) 仍允许 null，不能作为禁用字段隐藏。 */
    const isNeverProperty = (schema: z.core.$ZodType): boolean => {
      if (schema instanceof z.ZodOptional || schema instanceof z.ZodCatch) {
        return isNeverProperty(schema.unwrap());
      }
      return schema instanceof z.ZodNever;
    };

    const required = new Set(jsonSchema.required ?? []);
    for (const [key, schema] of Object.entries(zodSchema.shape)) {
      if (isNeverProperty(schema)) {
        delete jsonSchema.properties?.[key];
        required.delete(key);
        continue;
      }
      if (io !== 'input') continue;
      try {
        // preprocess/default 等包装会影响静态识别；以 Schema 是否接受省略为准，default 注解不代表可选。
        if (schema.safeParse(undefined).success) {
          required.delete(key);
        } else {
          required.add(key);
        }
      } catch {
        // 异步校验或自定义转换不能同步探测时沿用生成器结果，避免阻断整份文档生成。
      }
    }
    if (required.size > 0) jsonSchema.required = [...required];
    else delete jsonSchema.required;
  }
};
