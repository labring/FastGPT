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
    if (
      files.some(
        (file) =>
          !file ||
          typeof file !== 'object' ||
          typeof file.id !== 'string' ||
          !file.id ||
          typeof file.name !== 'string' ||
          !file.name ||
          (file.type !== 'file' && file.type !== 'folder')
      )
    ) {
      return Promise.reject('Invalid file data format');
    }

    const formattedFiles = files.map((file) => ({
      ...file,
      rawId: file.id,
      // 自定义接口特殊：folder 可以没有子级、file 也可以挂子级（语雀一类），
      // 因此只在对方没给 hasChild 时才回退到 type，不能反过来由 type 覆盖
      hasChild: typeof file.hasChild === 'boolean' ? file.hasChild : file.type === 'folder'
    }));

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

      // success:true 但 data 为空或非对象时，删除证据不足，不能归类为 NOT_FOUND 以免误删本地集合。
      if (!fileData || typeof fileData !== 'object' || Array.isArray(fileData)) {
        return toApiDatasetError({
          code: 'INVALID_RESPONSE',
          message: 'Invalid file detail response: empty data'
        });
      }

      // 校验详情对象关键字段：错误 id、缺失 name 或非法 type 均视为无效响应。
      if (typeof fileData.id !== 'string' || !fileData.id || fileData.id !== apiFileId) {
        return toApiDatasetError({
          code: 'INVALID_RESPONSE',
          message: 'Invalid file detail response: mismatched id'
        });
      }
      if (typeof fileData.name !== 'string' || !fileData.name) {
        return toApiDatasetError({
          code: 'INVALID_RESPONSE',
          message: 'Invalid file detail response: missing name'
        });
      }
      if (fileData.type !== 'file' && fileData.type !== 'folder') {
        return toApiDatasetError({
          code: 'INVALID_RESPONSE',
          message: 'Invalid file detail response: invalid type'
        });
      }

      return toApiDatasetSuccess({
        id: fileData.id,
        rawId: apiFileId,
        name: fileData.name,
        parentId: fileData.parentId === null ? '' : fileData.parentId,
        type: fileData.type,
        // 与 listFiles 同一口径。同步拿它当根种子：漏了 hasChild 会退化为 false，
        // 子树不再被遍历 → 后代全部落入删除集，整棵删掉
        hasChild:
          typeof fileData.hasChild === 'boolean' ? fileData.hasChild : fileData.type === 'folder',
        updateTime: fileData.updateTime,
        createTime: fileData.createTime
      });
    } catch (err: any) {
      // 网关/框架路由缺失 404（HTML、Express Cannot GET、Go 404、FastAPI {"detail":"Not Found"} 等非协议体）
      // 不能归类为资源级 NOT_FOUND，避免触发同步删除。
      const isRouteMissingDetailError = (error: unknown): boolean => {
        if (!error || typeof error !== 'object') return false;
        const record = error as Record<string, unknown>;
        const response =
          record.response && typeof record.response === 'object'
            ? (record.response as Record<string, unknown>)
            : undefined;
        const status = response?.status ?? record.status ?? record.statusCode;
        if (status !== 404) return false;

        const body = response?.data;
        if (typeof body === 'string') {
          return /(?:cannot\s+(?:get|post|put|delete|patch)\b|<!doctype\s+html|<html[\s>]|404\s+page\s+not\s+found|(?:route|endpoint|path|api|method)\s+not\s+found)/i.test(
            body
          );
        }
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const bodyRecord = body as Record<string, unknown>;
          if (
            bodyRecord.success === undefined &&
            bodyRecord.message === undefined &&
            bodyRecord.msg === undefined &&
            typeof bodyRecord.detail === 'string' &&
            /^not found$/i.test(bodyRecord.detail.trim())
          ) {
            return true;
          }
          if (
            bodyRecord.success === undefined &&
            bodyRecord.message === undefined &&
            typeof bodyRecord.path === 'string' &&
            bodyRecord.path.includes('/v1/file/detail')
          ) {
            return true;
          }
        }
        return false;
      };
      if (isRouteMissingDetailError(err)) {
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
