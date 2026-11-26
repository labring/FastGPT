import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestDocumentParseBodySchema,
  TestDocumentParseResponseSchema,
  type TestDocumentParseBody,
  type TestDocumentParseResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/testDocumentParse';
import { getDomainConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { testDocumentParseProvider } from '@fastgpt/service/common/file/read/testDocumentParse';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';

const resolveSecret = (draft: string | undefined, stored: unknown, label: string): string => {
  if (draft !== undefined) return draft;
  if (stored === undefined || stored === null) return '';
  if (typeof stored !== 'string') {
    throw new ApiHttpError(400, `Invalid stored ${label}`);
  }
  return stored;
};

/**
 * Admin API - 使用内置单页测试 PDF 验证文档增强解析服务配置
 * 仅超级管理员 root 可调用；草稿省略的密钥字段自动复用服务端已保存凭据。
 */
async function handler(
  req: ApiRequestProps<TestDocumentParseBody>
): Promise<TestDocumentParseResponse> {
  await authSystemAdmin({ req });

  const { body } = parseApiInput({
    req,
    bodySchema: TestDocumentParseBodySchema
  });

  const needsStoredConfig =
    (body.provider === 'somark' && body.somarkApiKey === undefined) ||
    (body.provider === 'doc2x' && body.doc2xKey === undefined) ||
    ((body.provider === 'textin' || body.provider === 'textln') &&
      (body.textinAppId === undefined || body.textinSecretCode === undefined)) ||
    ((body.provider === 'customPdf' || body.provider === 'custom' || body.provider === 'sangfor') &&
      body.key === undefined);

  const storedDocParse = needsStoredConfig
    ? (await getDomainConfig('providers')).effectiveConfig.documentParse
    : undefined;

  const baseParams = {
    provider: body.provider,
    url: body.url,
    somarkBaseUrl: body.somarkBaseUrl
  };

  const result = await testDocumentParseProvider(
    body.provider === 'somark'
      ? {
          ...baseParams,
          somarkApiKey: resolveSecret(
            body.somarkApiKey,
            storedDocParse?.customPdf?.somarkApiKey,
            'Somark API Key'
          )
        }
      : body.provider === 'doc2x'
        ? {
            ...baseParams,
            doc2xKey: resolveSecret(body.doc2xKey, storedDocParse?.customPdf?.doc2xKey, 'Doc2X Key')
          }
        : body.provider === 'textin' || body.provider === 'textln'
          ? {
              ...baseParams,
              textinAppId: resolveSecret(
                body.textinAppId,
                storedDocParse?.customPdf?.textinAppId,
                'TextIn AppId'
              ),
              textinSecretCode: resolveSecret(
                body.textinSecretCode,
                storedDocParse?.customPdf?.textinSecretCode,
                'TextIn Secret Code'
              )
            }
          : {
              ...baseParams,
              key:
                body.provider === 'sangfor'
                  ? resolveSecret(body.key, storedDocParse?.sangfor?.key, 'Sangfor key')
                  : resolveSecret(body.key, storedDocParse?.customPdf?.key, 'Custom PDF parser key')
            }
  );

  return TestDocumentParseResponseSchema.parse(result);
}

export default NextAPI(handler);
