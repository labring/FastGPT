import type {
  APIFileItem,
  ApiFileReadContentResponse,
  ApiDatasetDetailResponse,
  FeishuKnowledgeServer
} from '@fastgpt/global/core/dataset/apiDataset';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import axios, { type Method } from 'axios';
import { addLog } from '../../../../common/system/log';

type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
};

/**
 * Request
 */
type FeishuFileListResponse = {
  items: {
    title: string;
    creator: string;
    has_child: boolean;
    parent_node_token: string;
    owner_id: string;
    space_id: string;
    node_token: string;
    node_type: string;
    node_create_time: number;
    obj_edit_time: number;
    obj_create_time: number;
    obj_token: string;
    obj_type: string;
    origin_node_token: string;
    origin_space_id: string;
  }[];
  has_more: boolean;
  next_page_token: string;
};

type FeishuSpaceListResponse = {
  code: number;
  msg: string;
  data: {
    items: {
      space_id: string;
      name: string;
      description: string;
      open_sharing: boolean;
      visibility: string;
      space_type: string;
    }[];
    has_more: boolean;
    page_token: string;
  };
};

type FeishuNodeResponse = {
  code: number;
  msg: string;
  data: {
    node: {
      title: string;
      creator: string;
      has_child: boolean;
      parent_node_token: string;
      owner_id: string;
      space_id: string;
      node_token: string;
      node_type: string;
      node_create_time: number;
      obj_edit_time: number;
      obj_create_time: number;
      obj_token: string;
      obj_type: string;
      origin_node_token: string;
      origin_space_id: string;
    };
  };
};

type FeishuSpaceResponse = {
  code: number;
  msg: string;
  data: {
    space: {
      description: string;
      name: string;
      open_sharing: boolean;
      space_id: string;
      space_type: string;
      visibility: string;
    };
  };
};

type FeishuDomainResponse = {
  code: number;
  msg: string;
  data: {
    tenant: {
      domain: string;
      name: string;
    };
  };
};

const feishuBaseUrl = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn';

export const useFeishuKnowledgeDatasetRequest = ({
  feishuKnowledgeServer
}: {
  feishuKnowledgeServer: FeishuKnowledgeServer;
}) => {
  const instance = axios.create({
    baseURL: feishuBaseUrl,
    timeout: 60000
  });

  // 添加请求拦截器
  instance.interceptors.request.use(async (config) => {
    if (!config.headers.Authorization) {
      config.headers['Authorization'] = `Bearer ${feishuKnowledgeServer.user_access_token}`;
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
    const fetchSpaces = async (
      pageToken?: string
    ): Promise<FeishuSpaceListResponse['data']['items']> => {
      const response = await request<FeishuSpaceListResponse['data']>(
        `/open-apis/wiki/v2/spaces`,
        {
          lang: 'zh',
          page_size: 50,
          page_token: pageToken
        },
        'GET'
      );

      if (response.has_more) {
        const nextFiles = await fetchSpaces(response.page_token);
        return [...response.items, ...nextFiles];
      }

      return response.items;
    };

    if (!parentId) {
      if (feishuKnowledgeServer.basePath) {
        parentId = feishuKnowledgeServer.basePath;
      } else {
        const spaces = await fetchSpaces();
        return spaces.map((space) => ({
          id: space.space_id,
          parentId: '',
          name: space.name,
          type: 'folder' as const,
          hasChild: true,
          updateTime: new Date(),
          createTime: new Date()
        }));
      }
    }
    const spaceId = parentId.split('-')[0];
    const parent_node_token = parentId.split('-')[1];

    const fetchFiles = async (pageToken?: string): Promise<FeishuFileListResponse['items']> => {
      const response = await request<FeishuFileListResponse>(
        `/open-apis/wiki/v2/spaces/${spaceId}/nodes`,
        {
          page_size: 50,
          page_token: pageToken,
          parent_node_token: parent_node_token
        },
        'GET'
      );

      if (response.has_more) {
        const nextFiles = await fetchFiles(response.next_page_token);
        return [...response.items, ...nextFiles];
      }

      return response.items;
    };
    const allFiles = await fetchFiles();
    const files = allFiles.filter((file) => ['folder', 'docx'].includes(file.obj_type));
    if (files.length === 0) {
      return Promise.reject('There are no doc files in the current directory.');
    }

    return files.map((file) => ({
      id: spaceId + '-' + file.node_token,
      parentId: file.parent_node_token ? spaceId + '-' + file.parent_node_token : spaceId,
      name: file.title,
      type: file.node_type === 'folder' ? ('folder' as const) : ('file' as const),
      hasChild: file.has_child,
      updateTime: new Date(file.obj_edit_time * 1000),
      createTime: new Date(file.obj_create_time * 1000)
    }));
  };

  const getNodeInfo = async (nodeToken: string) =>
    await request<FeishuNodeResponse['data']>(
      `/open-apis/wiki/v2/spaces/get_node`,
      {
        obj_type: 'wiki',
        token: nodeToken
      },
      'GET'
    );

  const getFileContent = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiFileReadContentResponse> => {
    const nodeToken = apiFileId.split('-')[1];
    const node = await getNodeInfo(nodeToken);
    const objToken = node.node.obj_token;

    const [{ content }, { document }] = await Promise.all([
      request<{ content: string }>(
        `/open-apis/docx/v1/documents/${objToken}/raw_content`,
        {},
        'GET'
      ),
      request<{ document: { title: string } }>(
        `/open-apis/docx/v1/documents/${objToken}`,
        {},
        'GET'
      )
    ]);

    return {
      title: document?.title,
      rawText: content
    };
  };

  const getFilePreviewUrl = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<FeishuDomainResponse['data']['tenant']['domain']> => {
    const nodeToken = apiFileId.split('-')[1];
    const response = await request<FeishuDomainResponse['data']>(
      `/open-apis/tenant/v2/tenant/query`,
      {},
      'GET'
    );

    return 'https://' + response.tenant.domain + '/wiki/' + nodeToken;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    const spaceId = apiFileId.split('-')[0];
    const nodeToken = apiFileId.split('-')[1];
    const getSpace = await request<FeishuSpaceResponse['data']>(
      `/open-apis/wiki/v2/spaces/${spaceId}`,
      {},
      'GET'
    );
    if (nodeToken !== undefined) {
      const getNode = await getNodeInfo(nodeToken);

      return {
        name: getNode.node.title,
        parentId: getNode.node.parent_node_token
          ? spaceId + '-' + getNode.node.parent_node_token
          : spaceId,
        id: apiFileId
      };
    }

    return {
      name: getSpace.space.name,
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
