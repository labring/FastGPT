import type {
  APIFileItem,
  ApiFileReadContentResponse,
  ApiDatasetDetailResponse,
  FeishuPrivateServer
} from '@fastgpt/global/core/dataset/apiDataset';
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
    shortcut_info?: {
      target_token: string;
      target_type: string;
    };
  }[];
  has_more: boolean;
  next_page_token: string;
};

type FeishuFileDetailResponse = {
  code: number;
  msg: string;
  data: {
    name: string;
    parentId: string;
  };
};

const feishuBaseUrl = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn';

export const useFeishuPrivateDatasetRequest = ({
  feishuPrivateServer
}: {
  feishuPrivateServer: FeishuPrivateServer;
}) => {
  const instance = axios.create({
    baseURL: feishuBaseUrl,
    timeout: 60000
  });

  instance.defaults.headers.common['Authorization'] =
    `Bearer ${feishuPrivateServer.user_access_token}`;
  instance.defaults.headers.common['Content-Type'] = 'application/json; charset=utf-8';

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
    const fetchFiles = async (
      pageToken?: string,
      parentId?: ParentIdType
    ): Promise<FeishuFileListResponse['files']> => {
      const data = await request<FeishuFileListResponse>(
        `/open-apis/drive/v1/files`,
        {
          page_size: 200,
          page_token: pageToken,
          folder_token: parentId ? parentId : undefined
        },
        'GET'
      );
      if (data.has_more) {
        const nextFiles = await fetchFiles(data.next_page_token);
        return [...data.files, ...nextFiles];
      }

      return data.files;
    };
    if (!parentId) {
      parentId = feishuPrivateServer.basePath?.split('-').slice(-1)[0];
    }
    const parent = parentId ? parentId.split('-').slice(-1)[0] : undefined;

    const allFiles = await fetchFiles(undefined, parent);

    return allFiles
      .filter((file) => {
        if (file.type === 'shortcut') {
          return (
            file.shortcut_info?.target_type === 'docx' ||
            file.shortcut_info?.target_type === 'folder'
          );
        }
        return file.type === 'folder' || file.type === 'docx';
      })
      .map((file) => ({
        id:
          file.type === 'shortcut'
            ? parentId + '-' + file.shortcut_info!.target_token
            : parentId + '-' + file.token,
        parentId: parentId,
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
    const fileId = apiFileId.split('-')[1];
    const [{ content }, { document }] = await Promise.all([
      request<{ content: string }>(`/open-apis/docx/v1/documents/${fileId}/raw_content`, {}, 'GET'),
      request<{ document: { title: string } }>(`/open-apis/docx/v1/documents/${fileId}`, {}, 'GET')
    ]);

    return {
      title: document?.title,
      rawText: content
    };
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }): Promise<string> => {
    const fileId = apiFileId.split('-')[1];
    const { metas } = await request<{ metas: { url: string }[] }>(
      `/open-apis/drive/v1/metas/batch_query`,
      {
        request_docs: [
          {
            doc_token: fileId,
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
    const parentId = apiFileId.split('-').slice(0, -1).join('-');
    const fileId = apiFileId.split('-').slice(-1)[0];

    const fileDetail = await request<FeishuFileDetailResponse['data']>(
      `/open-apis/drive/explorer/v2/folder/${fileId}/meta`,
      {},
      'GET'
    );

    if (!fileDetail) {
      return {
        name: '',
        parentId: null,
        id: apiFileId
      };
    }

    return {
      name: fileDetail?.name,
      parentId: parentId !== 'null' ? parentId : null,
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
