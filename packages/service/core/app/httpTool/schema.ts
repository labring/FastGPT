import {
  getErrorMessage,
  isServerConfigError,
  isUserConfigError,
  UserConfigError
} from '@fastgpt/global/common/error/utils';
import {
  bundleOpenAPISchema,
  parseOpenAPISchemaString
} from '@fastgpt/global/common/string/swagger';
import { axios } from '../../../common/api/axios';
import { checkUrlSafety } from '../../../common/system/utils';

const DEFAULT_FETCH_SCHEMA_ERROR = 'Failed to fetch OpenAPI Schema URL';

const getFetchErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const message = getErrorMessage(error, DEFAULT_FETCH_SCHEMA_ERROR);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
};

/**
 * 从用户配置的 URL 受控下载并解析 OpenAPI Schema。
 *
 * 先执行 SSRF/协议校验，再通过禁用重定向的 axios 拉取文本并在本地完成解析与 bundle；
 * 用户侧 URL 非法、远端下载失败及非有效 OpenAPI 文档均归类为 UserConfigError，
 * 显式 ServerConfigError 原样透传。
 */
export const fetchOpenAPISchemaByUrl = async (url: string): Promise<Record<string, any>> => {
  await checkUrlSafety(url, 'OpenAPI Schema URL');

  const { data } = await axios
    .get<string>(url, {
      responseType: 'text',
      maxRedirects: 0,
      timeout: 30000,
      transformResponse: (value) => value
    })
    .catch((error: unknown) => {
      if (isServerConfigError(error) || isUserConfigError(error)) {
        throw error;
      }
      throw new UserConfigError(getFetchErrorMessage(error), undefined, {
        cause: error
      });
    });

  return await bundleOpenAPISchema(parseOpenAPISchemaString(data));
};
