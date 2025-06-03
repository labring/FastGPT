import type {
  APIFileItem,
  ApiFileReadContentResponse,
  ApiDatasetDetailResponse,
  FeishuServer
} from '@fastgpt/global/core/dataset/apiDataset/type';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import axios, { type Method } from 'axios';
import { addLog } from '../../../../common/system/log';

type ResponseDataType = {
  success: boolean;
  message: string;
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

const feishuBaseUrl = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn';

export const useFeishuDatasetRequest = ({ feishuServer }: { feishuServer: FeishuServer }) => {
  const instance = axios.create({
    baseURL: feishuBaseUrl,
    timeout: 60000
  });

  // 添加请求拦截器
  instance.interceptors.request.use(async (config) => {
    if (!config.headers.Authorization) {
      const { data } = await axios.post<{ tenant_access_token: string }>(
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
      addLog.info('yuque dataset data is empty');
      return Promise.reject('服务器异常');
    }
    return data.data;
  };
  const responseError = (err: any) => {
    console.log('error->', '请求错误', err);

    if (!err) {
      return Promise.reject({ message: '未知错误' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: err });
    }
    if (typeof err.message === 'string') {
      return Promise.reject({ message: err.message });
    }
    if (typeof err.data === 'string') {
      return Promise.reject({ message: err.data });
    }
    if (err?.response?.data) {
      return Promise.reject(err?.response?.data);
    }
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

  const listFiles = async ({ parentId }: { parentId?: ParentIdType }): Promise<APIFileItem[]> => {
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
  }): Promise<ApiFileReadContentResponse> => {
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

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    const { document } = await request<{ document: { title: string } }>(
      `/open-apis/docx/v1/documents/${apiFileId}`,
      {},
      'GET'
    );

    return {
      name: document?.title,
      parentId: null,
      id: apiFileId
    };
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl,
    getFileDetail
  };
};
