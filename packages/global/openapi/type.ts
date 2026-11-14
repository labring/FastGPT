import z from 'zod';
import type { createDocument } from 'zod-openapi';

export type OpenAPIPath = Parameters<typeof createDocument>[0]['paths'];
/** 错误码和业务标识固定，message 是按请求语言生成的展示文案，不能声明为固定 key。 */
export const getErrorResponse = ({
  code = 500,
  statusText = 'error',
  message = ''
}: {
  code?: number;
  statusText?: string;
  message?: string;
}) => {
  return z.object({
    code: z.literal(code),
    statusText: z.literal(statusText),
    message: z.string().meta({
      description:
        '错误展示文案，已知词条按请求语言翻译；业务判断应使用 code 或 statusText。缺省语言为英文，翻译不可用时保留原文或词条 key。',
      example: message
    }),
    data: z.null().optional().default(null)
  });
};

export const formatSuccessResponse = <T>(data: T) => {
  return z.object({
    code: z.literal(200),
    statusText: z.string().optional().default(''),
    message: z.string().optional().default(''),
    data
  });
};
