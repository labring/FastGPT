import { describe, expect, it, vi } from 'vitest';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { ERROR_ENUM, ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserConfigError, UserError } from '@fastgpt/global/common/error/utils';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import {
  createApiI18n,
  getRequestLocale,
  translateApiMessage
} from '@fastgpt/service/common/i18n/request';

vi.unmock('@fastgpt/service/common/response');
import { getSseErrorResponse, jsonRes, sseErrRes } from '@fastgpt/service/common/response';

const withI18n = createApiI18n(generatedLoaders);
const key = ERROR_RESPONSE[ERROR_ENUM.unAuthorization].message;

/** 构造只承载请求语言和响应结果的 HTTP 边界，不依赖业务鉴权或数据库。 */
const httpObjects = (headers: Record<string, string> = {}) => {
  const req = { headers } as NodeApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    write: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn()
  } as unknown as NodeApiResponse;
  return { req, res };
};

describe('createApiI18n and translateApiMessage', () => {
  it.each([
    ['zh-CN', '凭证错误'],
    ['en', 'Unauthorized'],
    ['zh-Hant', '憑證錯誤'],
    ['ko-KR', '인증 정보 오류']
  ])(
    'translates JSON and SSE in %s without mutating the error registry',
    async (locale, message) => {
      const { req, res } = httpObjects({ 'x-fastgpt-language': locale });
      await withI18n({ req, res }, () => {
        jsonRes(res, { code: 500, error: ERROR_ENUM.unAuthorization });
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 401, statusText: ERROR_ENUM.unAuthorization, message })
        );
        expect(JSON.parse(getSseErrorResponse(ERROR_ENUM.unAuthorization, res).data)).toMatchObject(
          {
            code: 401,
            statusText: ERROR_ENUM.unAuthorization,
            message
          }
        );
      });
      expect(ERROR_RESPONSE[ERROR_ENUM.unAuthorization].message).toBe(key);
      expect(getRequestLocale()).toBeUndefined();
      expect(translateApiMessage(key)).toBe(key);
    }
  );

  it('isolates concurrent languages and keeps the response language outside the async scope', async () => {
    const chinese = httpObjects({ 'x-fastgpt-language': 'zh-CN' });
    const english = httpObjects({ 'x-fastgpt-language': 'en' });
    await Promise.all(
      [chinese, english].map((http) =>
        withI18n(http, async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          expect(getRequestLocale()).toBe(http.req.headers['x-fastgpt-language']);
          expect(translateApiMessage(key)).toBe(http === chinese ? '凭证错误' : 'Unauthorized');
        })
      )
    );
    // 模拟 SDK 在请求作用域外触发 TTS / SSE 错误回调。
    jsonRes(chinese.res, { error: ERROR_ENUM.unAuthorization });
    expect(chinese.res.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: '凭证错误' })
    );
    sseErrRes(english.res, ERROR_ENUM.unAuthorization);
    expect(english.res.write).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
  });

  it('handles displayMessage, direct keys and explicit 4xx messages without translating data or raw text', async () => {
    const http = httpObjects({ cookie: 'NEXT_LOCALE=zh-CN', 'x-fastgpt-share-language': 'en' });
    await withI18n(http, () => {
      const error = new UserConfigError('Internal diagnostic', 'dataset:search_targets_required');
      jsonRes(http.res, { code: 500, error });
      expect(http.res.status).toHaveBeenLastCalledWith(400);
      expect(http.res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: 'At least one dataset is required',
          errorType: 'UserError'
        })
      );
      jsonRes(http.res, {
        error: new UserError(ERROR_ENUM.unAuthorization, 'common:error.missingParams')
      });
      expect(http.res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 401, message: 'Insufficient parameters' })
      );
      jsonRes(http.res, {
        error: 'common:error.missingParams',
        message: 'common:api_error.validation_error'
      });
      expect(http.res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Data validation error' })
      );
      const data = { errorText: key };
      jsonRes(http.res, { code: 400, message: key, data });
      expect(http.res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Unauthorized', data })
      );
      const upstream = { code: 401, statusText: 'unAuthorization', message: '凭证错误' };
      jsonRes(http.res, { code: 500, error: upstream });
      expect(http.res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({
          code: 401,
          statusText: 'unAuthorization',
          message: 'Unauthorized'
        })
      );
      expect(JSON.parse(getSseErrorResponse(upstream, http.res).data)).toMatchObject({
        code: 401,
        message: 'Unauthorized'
      });
      jsonRes(http.res, {
        code: 500,
        error: { ...upstream, code: 999, message: 'Original reason' }
      });
      expect(http.res.json).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 500, message: 'Original reason' })
      );
      for (const original of [
        'common:missing_key:keep_the_whole_string',
        'unknown:message',
        'https://example.com/common:Confirm',
        'Upstream error: common:Confirm',
        '{"message":"common:Confirm"}',
        'Confirm',
        ''
      ]) {
        expect(translateApiMessage(original)).toBe(original);
      }
    });
  });

  it('preserves business execution on resource failure and retries loading on the next request', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('resource unavailable'))
      .mockResolvedValue({
        default: { message: 'English fallback' }
      });
    const loaders = {
      en: { common: load },
      'zh-CN': { common: async () => ({ default: {} }) },
      'zh-Hant': { common: load },
      'ko-KR': { common: load }
    };
    const run = createApiI18n(loaders);
    const http = httpObjects({ 'x-fastgpt-language': 'zh-CN' });
    const business = vi.fn(() => translateApiMessage('common:message'));
    expect(await run(http, business)).toBe('common:message');
    expect(await run(http, business)).toBe('English fallback');
    expect(await run(http, business)).toBe('English fallback');
    expect(load).toHaveBeenCalledTimes(2);
    expect(business).toHaveBeenCalledTimes(3);
  });

  it('defaults requests without language preferences to English', async () => {
    const http = httpObjects();
    await withI18n(http, () => expect(translateApiMessage(key)).toBe('Unauthorized'));
  });
});
