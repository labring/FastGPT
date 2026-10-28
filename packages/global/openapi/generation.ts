import z from 'zod';
import type { CreateDocumentOptions } from 'zod-openapi';
import { ObjectIdSchema } from '../common/type/mongo';

/** 识别 ObjectId 的公开包装类型；保留 optional/default 等运行时的可省略语义。 */
const isObjectIdInput = (schema: z.core.$ZodType): boolean => {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    return isObjectIdInput(schema.unwrap());
  }
  return schema instanceof z.ZodPipe && schema.out === ObjectIdSchema.out;
};

/** 仅在文档生成时隐藏 never 字段并修正 ObjectId 入参必填标记，不修改共享 Zod Schema。 */
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
      if (io !== 'input' || !isObjectIdInput(schema)) continue;
      if (schema.safeParse(undefined).success) {
        required.delete(key);
      } else {
        required.add(key);
      }
    }
    if (required.size > 0) jsonSchema.required = [...required];
    else delete jsonSchema.required;
  }
};
