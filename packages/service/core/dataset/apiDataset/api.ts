import type {
  APIFileContentResponse,
  APIFileListResponse,
  APIFileReadResponse,
  APIFileServer
} from '@fastgpt/global/core/dataset/apiDataset';
import axios, { Method } from 'axios';
import { addLog } from '../../../common/system/log';
import { readFileRawTextByUrl } from '../read';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
};

export const useApiDatasetRequest = ({ apiServer }: { apiServer: APIFileServer }) => {
  const instance = axios.create({
    baseURL: apiServer.baseUrl,
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
      addLog.info('Api dataset data is empty');
      return Promise.reject('服务器异常');
    } else if (!data.success) {
      return Promise.reject(data);
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
        parentId
      },
      'POST'
    );

    if (!Array.isArray(files)) {
      return Promise.reject('Invalid file list format');
    }
    if (files.some((file) => !file.id || !file.name || typeof file.type === 'undefined')) {
      return Promise.reject('Invalid file data format');
    }
    return files;
  };

  const getFileContent = async ({ teamId, apiFileId }: { teamId: string; apiFileId: string }) => {
    const data = await request<APIFileContentResponse>(
      `/v1/file/content`,
      { id: apiFileId },
      'GET'
    );
    const content = data.content;
    const previewUrl = data.previewUrl;

    if (content) {
      return content;
    }
    if (previewUrl) {
      const rawText = await readFileRawTextByUrl({
        teamId,
        url: previewUrl,
        relatedId: apiFileId
      });
      return rawText;
    }
    return Promise.reject('Invalid content type: content or previewUrl is required');
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    const { url } = await request<APIFileReadResponse>(`/v1/file/read`, { id: apiFileId }, 'GET');

    if (!url || typeof url !== 'string') {
      return Promise.reject('Invalid response url');
    }

    return url;
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl
  };
};
