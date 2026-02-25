import { ObjectIdSchema } from '../../../common/type/mongo';
import { z } from 'zod';

// Query Params
export const GetLLMRequestRecordParamsSchema = z.object({
  requestId: z.string().meta({
    example: 'V1StGXR8_Z5jdHi6B-myT',
    description: 'LLM 请求追踪 ID'
  })
});

export type GetLLMRequestRecordParamsType = z.infer<typeof GetLLMRequestRecordParamsSchema>;

// Response
export const LLMRequestRecordSchema = z.object({
  _id: ObjectIdSchema,
  requestId: z.string().meta({
    example: 'V1StGXR8_Z5jdHi6B-myT',
    description: '请求追踪 ID'
  }),
  body: z.record(z.string(), z.any()).meta({
    description: 'LLM 请求体'
  }),
  response: z.record(z.string(), z.any()).meta({
    description: 'LLM 响应内容'
  }),
  createdAt: z.date().meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '创建时间'
  })
});

export type LLMRequestRecordSchemaType = z.infer<typeof LLMRequestRecordSchema>;
