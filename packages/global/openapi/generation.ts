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

/** 仅在文档生成时修正 ObjectId preprocess 的必填标记，不修改共享 Zod Schema。 */
export const openApiDocumentOptions: CreateDocumentOptions = {
  override: ({ jsonSchema, zodSchema, io }) => {
    if (io !== 'input' || !(zodSchema instanceof z.ZodObject)) return;
    const required = new Set(jsonSchema.required ?? []);
    for (const [key, schema] of Object.entries(zodSchema.shape)) {
      if (!isObjectIdInput(schema)) continue;
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
