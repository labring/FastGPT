import type {
  APIFileItemType,
  ApiFileReadContentResponseType,
  ApiDatasetDetailResponse,
  FeishuServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type Method } from 'axios';
import { createProxyAxios, axiosWithoutSSRF } from '../../../../common/api/axios';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';

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

const feishuBaseUrl = serviceEnv.FEISHU_BASE_URL;
const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);

export const useFeishuDatasetRequest = ({ feishuServer }: { feishuServer: FeishuServerType }) => {
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
   * 飞书特殊：`/open-apis/docx/v1/documents/{token}` 只认云文档，传 folder token 必定报错，
   * 而同步流程会对每个本地根节点都调一次 getFileDetail —— 于是「只同步一个子文件夹」会整轮失败。
   * 改用 drive 的 metas 接口（doc_type 必须与 token 的真实类型一致），先按 docx 查，失败再按 folder 查。
   */
  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    const queryMeta = async (docType: 'docx' | 'folder') => {
      const { metas } = await request<{ metas: { title: string; doc_type: string }[] }>(
        `/open-apis/drive/v1/metas/batch_query`,
        {
          request_docs: [
            {
              doc_token: apiFileId,
              doc_type: docType
            }
          ]
        },
        'POST'
      );
      return metas?.[0];
    };

    let meta = await queryMeta('docx').catch(() => undefined);

    // batch_query 在类型不匹配时也可能正常返回、但 metas 为空；这种情况不会进入 catch，
    // 仍需按 folder 再查一次，避免把真实文件夹误判成「文件不存在」。
    if (!meta) {
      // 两种类型都查不到时统一 reject，让调用方按「远端已删除」处理
      meta = await queryMeta('folder').catch(() => undefined);
    }

    if (!meta) {
      return Promise.reject('文件不存在');
    }

    return {
      rawId: apiFileId,
      name: meta.title,
      parentId: null,
      id: apiFileId,
      type: meta.doc_type === 'folder' ? ('folder' as const) : ('file' as const),
      hasChild: meta.doc_type === 'folder',
      updateTime: new Date(),
      createTime: new Date()
    };
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
