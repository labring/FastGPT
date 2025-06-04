import type {
  APIFileItem,
  ApiFileReadContentResponse,
  YuqueServer,
  ApiDatasetDetailResponse
} from '@fastgpt/global/core/dataset/apiDataset/type';
import axios, { type Method } from 'axios';
import { addLog } from '../../../../common/system/log';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';

type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
};

type YuqueRepoListResponse = {
  id: string;
  name: string;
  title: string;
  book_id: string | null;
  type: string;
  updated_at: Date;
  created_at: Date;
  slug?: string;
}[];

type YuqueTocListResponse = {
  uuid: string;
  type: string;
  title: string;
  url: string;
  slug: string;
  id: string;
  doc_id: string;
  prev_uuid: string;
  sibling_uuid: string;
  child_uuid: string;
  parent_uuid: string;
}[];

const yuqueBaseUrl = process.env.YUQUE_DATASET_BASE_URL || 'https://www.yuque.com';

export const useYuqueDatasetRequest = ({ yuqueServer }: { yuqueServer: YuqueServer }) => {
  const instance = axios.create({
    baseURL: yuqueBaseUrl,
    timeout: 60000, // 超时时间
    headers: {
      'X-Auth-Token': yuqueServer.token
    }
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

  const listFiles = async ({ parentId }: { parentId?: ParentIdType }) => {
    // Auto set baseurl to parentId
    if (!parentId) {
      if (yuqueServer.basePath) parentId = yuqueServer.basePath;
    }

    let files: APIFileItem[] = [];

    if (!parentId) {
      const limit = 100;
      let offset = 0;
      let allData: YuqueRepoListResponse = [];

      while (true) {
        const data = await request<YuqueRepoListResponse>(
          `/api/v2/groups/${yuqueServer.userId}/repos`,
          {
            offset,
            limit
          },
          'GET'
        );

        if (!data || data.length === 0) break;

        allData = [...allData, ...data];
        if (data.length < limit) break;

        offset += limit;
      }

      files = allData.map((item) => {
        return {
          id: item.id,
          name: item.name,
          parentId: null,
          type: 'folder',
          updateTime: item.updated_at,
          createTime: item.created_at,
          hasChild: true,
          slug: item.slug
        };
      });
    } else {
      if (typeof parentId === 'number') {
        const data = await request<YuqueTocListResponse>(
          `/api/v2/repos/${parentId}/toc`,
          {},
          'GET'
        );

        return data
          .filter((item) => !item.parent_uuid && item.type !== 'LINK')
          .map((item) => ({
            id: `${parentId}-${item.id}-${item.uuid}`,
            name: item.title,
            parentId: item.parent_uuid,
            type: item.type === 'TITLE' ? ('folder' as const) : ('file' as const),
            updateTime: new Date(),
            createTime: new Date(),
            uuid: item.uuid,
            slug: item.slug,
            hasChild: !!item.child_uuid
          }));
      } else {
        const [repoId, uuid, parentUuid] = parentId.split(/-(.*?)-(.*)/);
        const data = await request<YuqueTocListResponse>(`/api/v2/repos/${repoId}/toc`, {}, 'GET');

        return data
          .filter((item) => item.parent_uuid === parentUuid)
          .map((item) => ({
            id: `${repoId}-${item.id}-${item.uuid}`,
            name: item.title,
            parentId: item.parent_uuid,
            type: item.type === 'TITLE' ? ('folder' as const) : ('file' as const),
            updateTime: new Date(),
            createTime: new Date(),
            uuid: item.uuid,
            slug: item.slug,
            hasChild: !!item.child_uuid
          }));
      }
    }

    if (!Array.isArray(files)) {
      return Promise.reject('Invalid file list format');
    }
    if (files.some((file) => !file.id || !file.name || typeof file.type === 'undefined')) {
      return Promise.reject('Invalid file data format');
    }
    return files;
  };

  const getFileContent = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiFileReadContentResponse> => {
    const [parentId, fileId] = apiFileId.split(/-(.*?)-(.*)/);

    const data = await request<{ title: string; body: string }>(
      `/api/v2/repos/${parentId}/docs/${fileId}`,
      {},
      'GET'
    );

    return {
      title: data.title,
      rawText: data.body
    };
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    const [parentId, fileId] = apiFileId.split(/-(.*?)-(.*)/);

    const { slug: parentSlug } = await request<{ slug: string }>(
      `/api/v2/repos/${parentId}`,
      { id: apiFileId },
      'GET'
    );

    const { slug: fileSlug } = await request<{ slug: string }>(
      `/api/v2/repos/${parentId}/docs/${fileId}`,
      {},
      'GET'
    );

    return `${yuqueBaseUrl}/${yuqueServer.userId}/${parentSlug}/${fileSlug}`;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    //如果id是数字，认为是知识库，获取知识库列表
    if (typeof apiFileId === 'number' || !isNaN(Number(apiFileId))) {
      const limit = 100;
      let offset = 0;
      let allData: YuqueRepoListResponse = [];

      while (true) {
        const data = await request<YuqueRepoListResponse>(
          `/api/v2/groups/${yuqueServer.userId}/repos`,
          {
            offset,
            limit
          },
          'GET'
        );

        if (!data || data.length === 0) break;

        allData = [...allData, ...data];
        if (data.length < limit) break;

        offset += limit;
      }

      const file = allData.find((item) => Number(item.id) === Number(apiFileId));
      if (!file) {
        return Promise.reject('文件不存在');
      }
      return {
        id: file.id,
        name: file.name,
        parentId: null
      };
    } else {
      const [repoId, parentUuid, fileId] = apiFileId.split(/-(.*?)-(.*)/);
      const data = await request<YuqueTocListResponse>(`/api/v2/repos/${repoId}/toc`, {}, 'GET');
      const file = data.find((item) => item.uuid === fileId);
      if (!file) {
        return Promise.reject('文件不存在');
      }
      const parentfile = data.find((item) => item.uuid === file.parent_uuid);
      const parentId = `${repoId}-${parentfile?.id}-${parentfile?.uuid}`;

      //判断如果parent_uuid为空，则认为是知识库的根目录，返回知识库
      if (file.parent_uuid) {
        return {
          id: file.id,
          name: file.title,
          parentId: parentId
        };
      } else {
        return {
          id: file.id,
          name: file.title,
          parentId: repoId
        };
      }
    }
  };

  return {
    getFileContent,
    listFiles,
    getFilePreviewUrl,
    getFileDetail
  };
};
