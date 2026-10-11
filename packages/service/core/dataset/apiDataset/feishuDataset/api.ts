import type {
  APIFileItemType,
  ApiFileReadContentResponseType,
  ApiDatasetDetailResponse,
  ApiDatasetResult,
  FeishuServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  classifyApiDatasetError,
  toApiDatasetError,
  toApiDatasetSuccess
} from '@fastgpt/global/core/dataset/apiDataset/utils';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type Method } from 'axios';
import { createProxyAxios, axiosWithoutSSRF } from '../../../../common/api/axios';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';

type ResponseDataType = {
  code: number;
  msg?: string;
  data: any;
};

type FeishuFileListResponse = {
  files: {
    token: string;
    parent_token: string;
    name: string;
    type: string;
    modified_time: number;
    created_time: number;
    url: string;
    owner_id: string;
  }[];
  has_more: boolean;
  next_page_token: string;
};

const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);

export const useFeishuDatasetRequest = ({ feishuServer }: { feishuServer: FeishuServerType }) => {
  const feishuBaseUrl = serviceEnv.FEISHU_BASE_URL;
  // FEISHU_BASE_URL / 飞书文档接口由部署方配置，可能指向内网代理，不使用 SSRF 拦截器。
  const instance = createProxyAxios(
    {
      baseURL: feishuBaseUrl,
      timeout: 60000
    },
    false
  );

  // 添加请求拦截器
  instance.interceptors.request.use(async (config) => {
    if (!config.headers.Authorization) {
      const { data } = await axiosWithoutSSRF.post<{ tenant_access_token: string }>(
        `${feishuBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          app_id: feishuServer.appId,
          app_secret: feishuServer.appSecret
        }
      );

      config.headers['Authorization'] = `Bearer ${data.tenant_access_token}`;
      config.headers['Content-Type'] = 'application/json; charset=utf-8';
    }
    return config;
  });

  /**
   * 响应数据检查
   */
  const checkRes = (data: ResponseDataType) => {
    if (data === undefined) {
      logger.warn('Feishu dataset response data is empty');
      return Promise.reject('服务器异常');
    }
    if (data.code !== 0) {
      // 飞书业务失败可能仍返回 HTTP 200，不能让缺失 data 被解释为文件已删除。
      return Promise.reject({
        code: data.code,
        message: data.msg ?? '飞书接口异常',
        status: data.code === 1069701 ? 401 : data.code === 1069704 ? 503 : undefined
      });
    }
    return data.data;
  };
  const responseError = (err: any) => {
    logger.error('Feishu dataset request failed', { error: err });

    if (!err) {
      return Promise.reject({ message: '未知错误' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: err });
    }
    // 保留原始错误对象（含 status、code、response），避免下层无法识别真实 HTTP 状态
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

  const listFiles = async ({
    parentId
  }: {
    parentId?: ParentIdType;
  }): Promise<APIFileItemType[]> => {
    const fetchFiles = async (pageToken?: string): Promise<FeishuFileListResponse['files']> => {
      const data = await request<FeishuFileListResponse>(
        `/open-apis/drive/v1/files`,
        {
          folder_token: parentId || feishuServer.folderToken,
          page_size: 200,
          page_token: pageToken
        },
        'GET'
      );

      if (data.has_more) {
        const nextFiles = await fetchFiles(data.next_page_token);
        return [...data.files, ...nextFiles];
      }

      return data.files;
    };

    const allFiles = await fetchFiles();

    return allFiles
      .filter((file) => ['folder', 'docx'].includes(file.type))
      .map((file) => ({
        id: file.token,
        rawId: file.token,
        parentId: file.parent_token,
        name: file.name,
        type: file.type === 'folder' ? ('folder' as const) : ('file' as const),
        hasChild: file.type === 'folder',
        updateTime: new Date(file.modified_time * 1000),
        createTime: new Date(file.created_time * 1000)
      }));
  };

  const getFileContent = async ({
    apiFileId
  }: {
    apiFileId: string;
    usageId?: string;
  }): Promise<ApiFileReadContentResponseType> => {
    const [{ content }, { document }] = await Promise.all([
      request<{ content: string }>(
        `/open-apis/docx/v1/documents/${apiFileId}/raw_content`,
        {},
        'GET'
      ),
      request<{ document: { title: string } }>(
        `/open-apis/docx/v1/documents/${apiFileId}`,
        {},
        'GET'
      )
    ]);

    return {
      title: document?.title,
      rawText: content
    };
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }): Promise<string> => {
    const { metas } = await request<{ metas: { url: string }[] }>(
      `/open-apis/drive/v1/metas/batch_query`,
      {
        request_docs: [
          {
            doc_token: apiFileId,
            doc_type: 'docx'
          }
        ],
        with_url: true
      },
      'POST'
    );

    return metas[0].url;
  };

  /**
   * 元数据查询的 970005 同时表示类型不匹配或文件不存在，必须依次确认 docx 和 folder。
   * failed_list 的权限错误、未知错误以及缺失结果都不能作为同步删除依据。
   */
  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetResult<ApiDatasetDetailResponse>> => {
    /** 单次查询只把明确的类型不匹配/不存在转换为 NOT_FOUND，供外层继续探测。 */
    const queryMeta = async (docType: 'docx' | 'folder') => {
      try {
        const { metas, failed_list } = await request<{
          metas?: { title: string; doc_type: string }[];
          failed_list?: { token: string; code: number }[];
        }>(
          '/open-apis/drive/v1/metas/batch_query',
          { request_docs: [{ doc_token: apiFileId, doc_type: docType }] },
          'POST'
        );
        const failure = failed_list?.find((item) => item.token === apiFileId);
        if (failure) {
          if (failure.code === 970005)
            return toApiDatasetError('NOT_FOUND', '文件类型不匹配或不存在', 404);
          if (failure.code === 970003)
            return toApiDatasetError('UNAUTHORIZED', '无权限读取文件元数据', 403);
          return toApiDatasetError('UNKNOWN_ERROR', `飞书文件元数据查询失败（${failure.code}）`);
        }
        const meta = metas?.[0];
        if (!meta || meta.doc_type !== docType || typeof meta.title !== 'string') {
          return toApiDatasetError('UNKNOWN_ERROR', '飞书文件元数据响应缺失或格式错误');
        }
        return toApiDatasetSuccess(meta);
      } catch (error) {
        const classified = classifyApiDatasetError(error);
        if (classified.code !== 'NOT_FOUND') return classified;

        // 通用分类器保留自定义 API 的旧文案协议；飞书必须提供明确 HTTP 404 才可继续探测。
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null;
        const original = isRecord(error) ? error : {};
        const response = isRecord(original.response) ? original.response : {};
        const status = response.status ?? original.status ?? original.statusCode;
        return status === 404 ? classified : toApiDatasetError('UNKNOWN_ERROR', classified.message);
      }
    };

    for (const docType of ['docx', 'folder'] as const) {
      const result = await queryMeta(docType);
      if (!result.success) {
        if (result.code === 'NOT_FOUND') continue;
        return result;
      }
      const meta = result.data;
      return toApiDatasetSuccess({
        rawId: apiFileId,
        name: meta.title,
        parentId: null,
        id: apiFileId,
        type: meta.doc_type === 'folder' ? 'folder' : 'file',
        hasChild: meta.doc_type === 'folder',
        updateTime: new Date(),
        createTime: new Date()
      });
    }
    return toApiDatasetError('NOT_FOUND', '文件不存在', 404);
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
