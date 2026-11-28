import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  isSameSomarkBaseUrl,
  normalizeDocumentParseUrl
} from '@fastgpt/global/common/system/config/schemas/providers';
import {
  TestDocumentParseBodySchema,
  TestDocumentParseResponseSchema,
  type TestDocumentParseBody,
  type TestDocumentParseResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/testDocumentParse';
import { getDomainConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { testDocumentParseProvider } from '@fastgpt/service/common/file/read/testDocumentParse';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';

const resolveSecret = ({
  draft,
  stored,
  label,
  allowStoredFallback
}: {
  draft: string | undefined;
  stored: unknown;
  label: string;
  allowStoredFallback: boolean;
}): string => {
  if (draft !== undefined) return draft;
  if (!allowStoredFallback) return '';
  if (stored === undefined || stored === null) return '';
  if (typeof stored !== 'string') {
    throw new ApiHttpError(400, `Invalid stored ${label}`);
  }
  return stored;
};

const readStoredUrl = (stored: unknown): string =>
  typeof stored === 'string' ? normalizeDocumentParseUrl(stored) : '';

/**
 * Admin API - 使用内置单页测试 PDF 验证文档增强解析服务配置
 * 仅超级管理员 root 可调用；地址与密钥按同一凭据组解析，仅当目标地址未变更或省略时才复用已保存密钥，
 * 避免草稿修改服务地址后把原服务凭据发送到新目标。
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
    (body.provider === 'somark' &&
      (body.somarkBaseUrl === undefined || body.somarkApiKey === undefined)) ||
    (body.provider === 'doc2x' && body.doc2xKey === undefined) ||
    ((body.provider === 'textin' || body.provider === 'textln') &&
      (body.textinAppId === undefined || body.textinSecretCode === undefined)) ||
    ((body.provider === 'customPdf' || body.provider === 'custom' || body.provider === 'sangfor') &&
      (body.url === undefined || body.key === undefined));

  const storedDocParse = needsStoredConfig
    ? (await getDomainConfig('providers')).effectiveConfig.documentParse
    : undefined;

  const result = await testDocumentParseProvider(
    (() => {
      if (body.provider === 'somark') {
        const storedBaseUrl = readStoredUrl(storedDocParse?.customPdf?.somarkBaseUrl);
        const resolvedBaseUrl =
          body.somarkBaseUrl !== undefined ? body.somarkBaseUrl : storedBaseUrl;
        const targetMatchesStored = isSameSomarkBaseUrl(resolvedBaseUrl, storedBaseUrl);
        return {
          provider: body.provider,
          somarkBaseUrl: resolvedBaseUrl,
          somarkApiKey: resolveSecret({
            draft: body.somarkApiKey,
            stored: storedDocParse?.customPdf?.somarkApiKey,
            label: 'Somark API Key',
            allowStoredFallback: targetMatchesStored
          })
        };
      }

      if (body.provider === 'doc2x') {
        return {
          provider: body.provider,
          doc2xKey: resolveSecret({
            draft: body.doc2xKey,
            stored: storedDocParse?.customPdf?.doc2xKey,
            label: 'Doc2X Key',
            allowStoredFallback: true
          })
        };
      }

      if (body.provider === 'textin' || body.provider === 'textln') {
        return {
          provider: body.provider,
          textinAppId: resolveSecret({
            draft: body.textinAppId,
            stored: storedDocParse?.customPdf?.textinAppId,
            label: 'TextIn AppId',
            allowStoredFallback: true
          }),
          textinSecretCode: resolveSecret({
            draft: body.textinSecretCode,
            stored: storedDocParse?.customPdf?.textinSecretCode,
            label: 'TextIn Secret Code',
            allowStoredFallback: true
          })
        };
      }

      const isSangfor = body.provider === 'sangfor';
      const storedGroup = isSangfor ? storedDocParse?.sangfor : storedDocParse?.customPdf;
      const storedUrl = readStoredUrl(storedGroup?.url);
      const resolvedUrl = body.url !== undefined ? normalizeDocumentParseUrl(body.url) : storedUrl;
      const targetMatchesStored = Boolean(storedUrl) && resolvedUrl === storedUrl;

      return {
        provider: body.provider,
        url: resolvedUrl,
        key: resolveSecret({
          draft: body.key,
          stored: storedGroup?.key,
          label: isSangfor ? 'Sangfor key' : 'Custom PDF parser key',
          allowStoredFallback: targetMatchesStored
        })
      };
    })()
  );

  return TestDocumentParseResponseSchema.parse(result);
}

export default NextAPI(handler);
