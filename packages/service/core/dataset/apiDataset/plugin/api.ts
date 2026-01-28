import type {
  ApiFileReadContentResponse,
  ApiDatasetDetailResponse,
  PluginDatasetServerType
} from '@fastgpt/global/core/dataset/apiDataset/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';
import { readFileRawTextByUrl } from '../../read';
import { getS3RawTextSource } from '../../../../common/s3/sources/rawText';

export const usePluginDatasetRequest = (pluginServer: PluginDatasetServerType) => {
  const { pluginId, config } = pluginServer;

  const listFiles = async ({ parentId }: { searchKey?: string; parentId?: ParentIdType }) => {
    const res = await pluginClient.dataset.source.listFiles({
      body: {
        sourceId: pluginId,
        config,
        parentId: parentId ?? undefined
      }
    });

    if (res.status !== 200) {
      const errorBody = res.body as { error?: string };
      return Promise.reject(errorBody?.error || 'Failed to list files');
    }

    return res.body.map((file) => ({
      ...file,
      rawId: file.rawId || file.id,
      parentId: file.parentId ?? null,
      hasChild: file.hasChild ?? file.type === 'folder',
      updateTime: file.updateTime ? new Date(file.updateTime) : new Date(),
      createTime: file.createTime ? new Date(file.createTime) : new Date()
    }));
  };

  const getFileContent = async ({
    teamId,
    tmbId,
    apiFileId,
    customPdfParse,
    datasetId
  }: {
    teamId: string;
    tmbId: string;
    apiFileId: string;
    customPdfParse?: boolean;
    datasetId: string;
  }): Promise<ApiFileReadContentResponse> => {
    const res = await pluginClient.dataset.source.getContent({
      body: {
        sourceId: pluginId,
        config,
        fileId: apiFileId
      }
    });

    if (res.status !== 200) {
      const errorBody = res.body as { error?: string };
      return Promise.reject(errorBody?.error || 'Failed to get file content');
    }

    const { title, rawText, previewUrl } = res.body;

    // 如果插件返回了原始文本，直接使用
    if (rawText) {
      return { title, rawText };
    }

    // 如果插件返回了预览 URL，需要 FastGPT 去解析
    if (previewUrl) {
      // 先尝试从缓存获取
      const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
        sourceId: previewUrl,
        customPdfParse
      });
      if (rawTextBuffer) {
        return { title, rawText: rawTextBuffer.text };
      }

      // 缓存没有，去下载解析
      const { rawText: parsedText } = await readFileRawTextByUrl({
        teamId,
        tmbId,
        url: previewUrl,
        relatedId: apiFileId,
        datasetId,
        customPdfParse,
        getFormatText: true
      });

      // 存入缓存
      getS3RawTextSource().addRawTextBuffer({
        sourceId: previewUrl,
        sourceName: title || '',
        text: parsedText,
        customPdfParse
      });

      return { title, rawText: parsedText };
    }

    return Promise.reject('Invalid content type: rawText or previewUrl is required');
  };

  const getFilePreviewUrl = async ({ apiFileId }: { apiFileId: string }) => {
    const res = await pluginClient.dataset.source.getPreviewUrl({
      body: {
        sourceId: pluginId,
        config,
        fileId: apiFileId
      }
    });

    if (res.status !== 200) {
      const errorBody = res.body as { error?: string };
      return Promise.reject(errorBody?.error || 'Failed to get preview url');
    }

    return res.body.url;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<ApiDatasetDetailResponse> => {
    const res = await pluginClient.dataset.source.getDetail({
      body: {
        sourceId: pluginId,
        config,
        fileId: apiFileId
      }
    });

    if (res.status !== 200) {
      const errorBody = res.body as { error?: string };
      return Promise.reject(errorBody?.error || 'Failed to get file detail');
    }

    const file = res.body;
    return {
      id: file.id,
      rawId: file.rawId || file.id,
      name: file.name,
      parentId: file.parentId ?? '',
      type: file.type,
      updateTime: file.updateTime ? new Date(file.updateTime) : new Date(),
      createTime: file.createTime ? new Date(file.createTime) : new Date()
    };
  };

  const getFileRawId = (fileId: string) => fileId;

  return {
    listFiles,
    getFileContent,
    getFilePreviewUrl,
    getFileDetail,
    getFileRawId
  };
};
