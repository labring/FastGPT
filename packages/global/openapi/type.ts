import z from 'zod';
import type { createDocument } from 'zod-openapi';

type RawOpenAPIPaths = NonNullable<Parameters<typeof createDocument>[0]['paths']>;
type RawOpenAPIPathItem = NonNullable<RawOpenAPIPaths[string]>;
type HttpMethodKey = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

/**
 * 开放路由到官方多语言 SDK 领域树与方法名的显式映射元数据。
 *
 * 通过显式声明隔离历史非标 URL（如 listV2 / getRecords_v2 / /proApi/*），
 * 避免代码生成器依赖路径正则猜测命名；流式双模态接口通过 streamMethod 声明成对流式方法。
 */
export const FastGptSdkMetaSchema = z.object({
  resource: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/)
    .meta({ description: 'SDK 领域资源点分路径（小驼峰），例如 chat.histories、datasets.data' }),
  method: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/)
    .meta({ description: 'SDK 方法名（小驼峰），例如 list、completionsV2' }),
  streamMethod: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*$/)
    .optional()
    .meta({ description: '双模态流式配套方法名，例如 completionsV2Stream' })
});
export type FastGptSdkMeta = z.infer<typeof FastGptSdkMetaSchema>;

type OpenAPIPathItemWithSdkMeta = Omit<RawOpenAPIPathItem, HttpMethodKey> & {
  [K in HttpMethodKey]?: NonNullable<RawOpenAPIPathItem[K]> & {
    'x-fastgpt-sdk'?: FastGptSdkMeta;
  };
};

export type OpenAPIPath = Record<string, OpenAPIPathItemWithSdkMeta>;
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
