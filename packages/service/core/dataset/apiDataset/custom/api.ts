import type {
  ApiFileReadContentResponseType,
  APIFileReadResponseType,
  ApiDatasetDetailResponse,
  ApiDatasetResult,
  APIFileServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  classifyApiDatasetError,
  toApiDatasetError,
  toApiDatasetSuccess
} from '@fastgpt/global/core/dataset/apiDataset/utils';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import type { IultmzhFileParseConfigType } from '@fastgpt/global/core/dataset/type';
import { type Method } from 'axios';
import { createProxyAxios } from '../../../../common/api/axios';
import { readFileRawTextByUrl } from '../../read';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { getS3RawTextSource } from '../../../../common/s3/sources/rawText';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ensureHttpProtocol } from '@fastgpt/global/common/string/url';
import { getLogger, LogCategories } from '../../../../common/logger';

type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
};

type APIFileListResponse = {
  id: string;
  parentId: ParentIdType;
  name: string;
  type: 'file' | 'folder';
  updateTime: Date;
  createTime: Date;
  hasChild?: boolean;
};

type ParsedCustomApiFileMeta = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  hasChild: boolean;
};

type CustomApiFileMetaResult =
  | { ok: true; meta: ParsedCustomApiFileMeta }
  | {
      ok: false;
      reason: 'empty data' | 'mismatched id' | 'missing name' | 'invalid type' | 'invalid hasChild';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 统一校验并归一化自定义 API 文件库的列表项与详情关键字段。
 * 协议仅允许 hasChild 为 boolean 或缺省（undefined/null）；显式非法值直接拒收，
 * 避免带子级的文件节点被静默降级为 false 后触发同步误删。
 */
const parseCustomApiFileMeta = (item: unknown, expectedId?: string): CustomApiFileMetaResult => {
  if (!isRecord(item)) {
    return { ok: false, reason: 'empty data' };
  }
  if (
    typeof item.id !== 'string' ||
    !item.id ||
    (expectedId !== undefined && item.id !== expectedId)
  ) {
    return { ok: false, reason: 'mismatched id' };
  }
  if (typeof item.name !== 'string' || !item.name) {
    return { ok: false, reason: 'missing name' };
  }
  if (item.type !== 'file' && item.type !== 'folder') {
    return { ok: false, reason: 'invalid type' };
  }
  const rawHasChild = item.hasChild;
  if (rawHasChild !== undefined && rawHasChild !== null && typeof rawHasChild !== 'boolean') {
    return { ok: false, reason: 'invalid hasChild' };
  }

  return {
    ok: true,
    meta: {
      id: item.id,
      name: item.name,
      type: item.type,
      // 自定义接口特殊：folder 可以没有子级、file 也可以挂子级（语雀一类），
      // 因此只在对方缺省 hasChild 时回退到 type，不能反过来由 type 覆盖。
      hasChild: typeof rawHasChild === 'boolean' ? rawHasChild : item.type === 'folder'
    }
  };
};

/**
 * 判断异常是否为不符合自定义 API 协议信封（{ success: false, ... }）的 HTTP 404。
 * 网关/框架路由缺失 404（HTML、Express、Go、FastAPI、Spring、AWS API Gateway、APISIX 等）
 * 均不携带协议信封，不能作为资源级 NOT_FOUND 删除依据。
 */
const isNonProtocolNotFoundError = (error: unknown): boolean => {
  if (!isRecord(error)) return false;
  const response = isRecord(error.response) ? error.response : undefined;
  const status = response?.status ?? error.status ?? error.statusCode;
  if (status !== 404) return false;

  const body = response?.data;
  return !isRecord(body) || body.success !== false;
};

export const useApiDatasetRequest = ({ apiServer }: { apiServer: APIFileServerType }) => {
  const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);
  const instance = createProxyAxios({
    // 兜底未经过 schema 解析的历史配置（如后台任务直接读库），补齐协议后再交给 axios，
    // 避免请求阶段直接抛 ERR_INVALID_URL。
    baseURL: ensureHttpProtocol(apiServer.baseUrl),
    timeout: 60000, // 超时时间
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiServer.authorization}`
    }
  });

  /**
   * 响应数据检查
   */
  const checkRes = (data: ResponseDataType) => {
    if (data === undefined) {
      logger.warn('API dataset response data is empty');
      return Promise.reject('服务器异常');
    }
    // 拦截网关 HTML 或非协议对象响应，避免文本里的 "not found" 被误分类为 NOT_FOUND 触发误删。
    if (typeof data !== 'object' || data === null || typeof data.success !== 'boolean') {
      logger.warn('API dataset response format is invalid');
      return Promise.reject({ code: 'INVALID_RESPONSE', message: '服务器返回格式异常' });
    }
    if (!data.success) {
      return Promise.reject(data);
    }
    return data.data;
  };
  const responseError = (err: any) => {
    logger.error('API dataset request failed', { error: err });

    if (!err) {
      return Promise.reject({ message: '未知错误' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: err });
    }
    // 保留 HTTP 状态、网络错误码和响应体，详情层统一分类时不能丢失删除判断依据。
    return Promise.reject(err);
  };

  const request = <T>(url: string, data: any, method: Method): Promise<T> => {
    /* 去空 */
    for (const key in data) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    return instance
      .request({
        url,
        method,
        data: ['POST', 'PUT'].includes(method) ? data : undefined,
        params: !['POST', 'PUT'].includes(method) ? data : undefined
      })
      .then((res) => checkRes(res.data))
      .catch((err) => responseError(err));
  };

  const getPreviewUrlFilename = (previewUrl: string) => {
    const parseFilename = (pathname: string) => {
      const filename = pathname.split('/').pop() || '';
      if (!filename) return '';

      try {
        return decodeURIComponent(filename);
      } catch {
        return filename;
      }
    };

    try {
      return parseFilename(new URL(previewUrl).pathname);
    } catch {
      return parseFilename(previewUrl.split('?')[0].split('#')[0]);
    }
  };

  const getFallbackTitle = async ({
    apiFileId,
    previewUrl
  }: {
    apiFileId: string;
    previewUrl: string;
  }) => {
    try {
      const fileDetailRes = await getFileDetail({ apiFileId });
      if (fileDetailRes.success && fileDetailRes.data.name) {
        return fileDetailRes.data.name;
      }
    } catch (error) {
      logger.warn('Get api dataset file detail for title fallback failed', {
        apiFileId,
        error
      });
    }

    return getPreviewUrlFilename(previewUrl) || getNanoid();
  };

  const listFiles = async ({
    searchKey,
    parentId
  }: {
    searchKey?: string;
    parentId?: ParentIdType;
  }) => {
    const files = await request<APIFileListResponse>(
      `/v1/file/list`,
      {
        searchKey,
        parentId: parentId || apiServer.basePath
      },
      'POST'
    );

    if (!Array.isArray(files)) {
      return Promise.reject('Invalid file list format');
    }

    const formattedFiles = [];
    for (const file of files) {
      const parsed = parseCustomApiFileMeta(file);
      if (!parsed.ok) {
        return Promise.reject('Invalid file data format');
      }
      formattedFiles.push({
        ...file,
        rawId: parsed.meta.id,
        hasChild: parsed.meta.hasChild
      });
    }

    return formattedFiles;
  };

  const getFileContent = async ({
    teamId,
    tmbId,
    apiFileId,
    customPdfParse,
    sangforFileParseConfig,
    datasetId,
    usageId
  }: {
    teamId: string;
    tmbId: string;
    apiFileId: string;
    customPdfParse?: boolean;
    sangforFileParseConfig?: IultmzhFileParseConfigType;
    datasetId: string;
    usageId?: string;
  }): Promise<ApiFileReadContentResponseType> => {
    const data = await request<
      {
        title?: string;
      } & RequireOnlyOne<{
        content: string;
        previewUrl: string;
      }>
    >(`/v1/file/content`, { id: apiFileId }, 'GET');
    const title = data.title;
    const content = data.content;
    const previewUrl = data.previewUrl;

    if (content) {
      return {
        title,
        rawText: content
      };
    }
    if (previewUrl) {
      const fallbackTitle = title || (await getFallbackTitle({ apiFileId, previewUrl }));

      // Get from buffer
      const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
        sourceId: previewUrl,
        customPdfParse,
        sangforFileParseConfig
      });
      if (rawTextBuffer) {
        return {
          title: title || rawTextBuffer.filename || fallbackTitle,
          rawText: rawTextBuffer.text
        };
      }

      const { rawText } = await readFileRawTextByUrl({
        teamId,
        tmbId,
        url: previewUrl,
        relatedId: apiFileId,
        datasetId,
        customPdfParse,
        sangforFileParseConfig,
        usageId,
        getFormatText: true
      });

      const sourceName = fallbackTitle;

      getS3RawTextSource().addRawTextBuffer({
        sourceId: previewUrl,
        sourceName,
        text: rawText,
        customPdfParse,
        sangforFileParseConfig
      });

      return {
        title: fallbackTitle,
        rawText
      };
    }
    return Promise.reject('Invalid content type: content or previewUrl is required');
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    const { url } = await request<APIFileReadResponseType>(
      `/v1/file/read`,
      { id: apiFileId },
      'GET'
    );

    if (!url || typeof url !== 'string') {
      return Promise.reject('Invalid response url');
    }

    return url;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetResult<ApiDatasetDetailResponse>> => {
    try {
      const fileData = await request<ApiDatasetDetailResponse>(
        `/v1/file/detail`,
        {
          id: apiFileId
        },
        'GET'
      );

      // 统一校验详情响应对象及关键字段，防止空数据、错误 id、非法 type/hasChild 被当作合法节点或触发误删。
      const parsed = parseCustomApiFileMeta(fileData, apiFileId);
      if (!parsed.ok) {
        return toApiDatasetError({
          code: 'INVALID_RESPONSE',
          message: `Invalid file detail response: ${parsed.reason}`
        });
      }

      return toApiDatasetSuccess({
        id: parsed.meta.id,
        rawId: apiFileId,
        name: parsed.meta.name,
        parentId: fileData.parentId === null ? '' : fileData.parentId,
        type: parsed.meta.type,
        hasChild: parsed.meta.hasChild,
        updateTime: fileData.updateTime,
        createTime: fileData.createTime
      });
    } catch (err: any) {
      if (isNonProtocolNotFoundError(err)) {
        return toApiDatasetError({
          code: 'INVALID_RESPONSE',
          message: getErrorMessage(err) || 'Detail endpoint not found',
          status: 404
        });
      }
      return classifyApiDatasetError(err);
    }
  };

  const getFileRawId = (fileId: string) => {
    return fileId;
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl,
    getFileDetail,
    getFileRawId
  };
};
