import type {
  APIFileItemType,
  ApiFileReadContentResponse,
  ApiDatasetDetailResponse,
  FeishuServer
} from '@fastgpt/global/core/dataset/apiDataset/type';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type Method } from 'axios';
import { createProxyAxios, axios } from '../../../../common/api/axios';
import { getLogger, LogCategories } from '../../../../common/logger';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);

const cleanupImageDir = (dirPath: string) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    logger.warn('Failed to cleanup Feishu temp image directory', { dirPath, error: err });
  }
};

/**
 * Create a patched FeishuDoc2Markdown subclass that uses the configured
 * feishuBaseUrl instead of hardcoded 'https://open.feishu.cn'.
 * This ensures both Feishu (China) and Lark (International) work correctly.
 */
const createPatchedHandler = async (params: {
  appId: string;
  appSecret: string;
  docToken: string;
  imageStorageTarget: string;
  disableImageCache: boolean;
  handleImage: (imageUrl: string) => Promise<string>;
}) => {
  const { FeishuDoc2Markdown } = await import('doc2markdown/dist/src/doc/impl/feishu');

  // @ts-expect-error - Subclass overrides TS-private methods that are runtime-accessible prototype methods
  class PatchedFeishuHandler extends FeishuDoc2Markdown {
    // Override getAccessToken to use configurable base URL
    async getAccessToken() {
      const apiUrl = `${feishuBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`;
      const { appId, appSecret } = this.params;
      const { data } = await axios.post(
        apiUrl,
        {
          app_id: appId,
          app_secret: appSecret
        },
        {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
      const { tenant_access_token: accessToken, code, msg, expire } = data;
      if (code !== 0) {
        throw new Error(`Failed to get Feishu access token: ${msg}`);
      }
      return {
        expireTime: Date.now() + expire * 1000 - 3000,
        accessToken
      };
    }

    // Override getDocMetadata to use configurable base URL
    async getDocMetadata(documentId: string) {
      const api = `${feishuBaseUrl}/open-apis/docx/v1/documents/${documentId}`;
      const { data } = await axios.get(api, { headers: this.getHeaders() });
      const metadata = data?.data?.document;
      return {
        ...metadata,
        id: metadata.document_id,
        token: metadata.document_id,
        url: metadata.url,
        name: metadata.title
      };
    }

    // Override getRawDocContent to use configurable base URL
    async getRawDocContent(documentId: string) {
      const apiUrl = `${feishuBaseUrl}/open-apis/docx/v1/documents/${documentId}/blocks`;
      const { data } = await axios.get(apiUrl, { headers: this.getHeaders() });
      return data?.data;
    }

    // @ts-ignore - handleFeishuImage is TS-private but prototype-based, override works at runtime
    async handleFeishuImage(
      documentId: string,
      resourceToken: string,
      imageMeta: Record<string, any> = {}
    ): Promise<string> {
      const { imageStorageTarget, disableImageCache, skipMediaCheck } = this.params;
      const downloadUrl = `${feishuBaseUrl}/open-apis/drive/v1/medias/${resourceToken}/download`;

      let imagePath: string;
      if (typeof imageStorageTarget === 'function') {
        imagePath = imageStorageTarget(downloadUrl, documentId, {
          token: resourceToken,
          ...imageMeta
        });
      } else {
        const baseDir = typeof imageStorageTarget === 'string' ? imageStorageTarget : process.cwd();
        const imagesDir = path.join(baseDir, `${documentId}_images`);
        if (!fs.existsSync(imagesDir)) {
          fs.mkdirSync(imagesDir, { recursive: true });
        }
        imagePath = path.join(imagesDir, `${resourceToken}.jpg`);
      }

      if (fs.existsSync(imagePath)) {
        if (skipMediaCheck) return imagePath;
        if (!disableImageCache) {
          try {
            const headResp = await axios.head(downloadUrl, { headers: this.getHeaders() });
            const remoteSize = parseInt(headResp.headers['content-length'] ?? '0', 10);
            const localSize = fs.statSync(imagePath).size;
            if (remoteSize > 0 && remoteSize === localSize) return imagePath;
          } catch {}
        }
      }

      const parentDir = path.dirname(imagePath);
      fs.mkdirSync(parentDir, { recursive: true });

      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        headers: this.getHeaders(),
        responseType: 'stream'
      });
      const writer = fs.createWriteStream(imagePath);
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      }).catch(() => {});

      return imagePath;
    }

    // @ts-ignore - getFileList is TS-private but prototype-based, override works at runtime
    async getFileList(folderToken: string, nextPageToken?: string): Promise<any> {
      const api = `${feishuBaseUrl}/open-apis/drive/v1/files`;
      const reqParams: Record<string, any> = {
        folder_token: folderToken,
        page_size: (this.params as any).pageSize || 200
      };
      if (nextPageToken) reqParams.page_token = nextPageToken;
      const { data } = await axios.get(api, {
        headers: this.getHeaders(),
        params: reqParams
      });
      return data?.data;
    }
  }

  const handler = new PatchedFeishuHandler({
    type: 'feishu' as const,
    appId: params.appId,
    appSecret: params.appSecret,
    docToken: params.docToken,
    imageStorageTarget: params.imageStorageTarget,
    disableImageCache: params.disableImageCache,
    handleImage: params.handleImage
  });

  return handler;
};

export const useFeishuDatasetRequest = ({ feishuServer }: { feishuServer: FeishuServer }) => {
  const instance = createProxyAxios({
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

  // Use doc2markdown to fetch rich content with images as base64-embedded markdown.
  // The caller (readDatasetSourceRawText) handles S3 upload through the standard
  // knowledge base image processing pipeline.
  const getFileContent = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiFileReadContentResponse> => {
    const tmpBaseDir = os.tmpdir();
    const imageDirPath = path.join(tmpBaseDir, `${apiFileId}_images`);

    try {
      const handler = await createPatchedHandler({
        appId: feishuServer.appId,
        appSecret: feishuServer.appSecret!,
        docToken: apiFileId,
        imageStorageTarget: tmpBaseDir,
        disableImageCache: true,
        handleImage: async (localImagePath: string) => {
          try {
            const buffer = await fs.promises.readFile(localImagePath);
            const ext = path.extname(localImagePath).toLowerCase().replace('.', '');
            const mime =
              (
                { png: 'image/png', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>
              )[ext] || 'image/jpeg';
            return `data:${mime};base64,${buffer.toString('base64')}`;
          } catch (err) {
            logger.warn('Failed to read Feishu image', { localImagePath, error: err });
            return '';
          }
        }
      });

      await handler.getCachedAccessToken();
      const tasks = await handler.getDocTaskList();

      for (const task of tasks) {
        await handler.getCachedAccessToken();
        const result = await handler.handleDocTask(task);
        cleanupImageDir(imageDirPath);
        return {
          title: task.name || task.id,
          rawText: result || ''
        };
      }

      cleanupImageDir(imageDirPath);
      return getFileContentRaw({ apiFileId });
    } catch (err) {
      cleanupImageDir(imageDirPath);
      logger.warn('doc2markdown failed, falling back to raw text API', { apiFileId, error: err });
      return getFileContentRaw({ apiFileId });
    }
  };

  const getFileContentRaw = async ({
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
    const { document } = await request<{ document: { title: string; type: string } }>(
      `/open-apis/docx/v1/documents/${apiFileId}`,
      {},
      'GET'
    );

    return {
      rawId: apiFileId,
      name: document?.title,
      parentId: null,
      id: apiFileId,
      type: document.type === 'folder' ? ('folder' as const) : ('file' as const),
      hasChild: document.type === 'folder',
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
