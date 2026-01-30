import type {
  PluginFileReadContentResponse,
  PluginDatasetDetailResponse,
  PluginDatasetServerType
} from '@fastgpt/global/core/dataset/pluginDataset/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';
import { readFileRawTextByUrl } from '../../read';
import { getS3RawTextSource } from '../../../../common/s3/sources/rawText';

export const usePluginDatasetRequest = (pluginServer: PluginDatasetServerType) => {
  const { pluginId, config } = pluginServer;

  const listFiles = async ({ parentId }: { searchKey?: string; parentId?: ParentIdType }) => {
    const files = await pluginClient.dataset.listFiles({
      sourceId: pluginId,
      config,
      parentId: parentId ?? undefined
    });

    return files.map((file) => ({
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
  }): Promise<PluginFileReadContentResponse> => {
    const contentRes = await pluginClient.dataset.getContent({
      sourceId: pluginId,
      config,
      fileId: apiFileId
    });

    const { title, rawText, previewUrl } = contentRes;

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
    const res = await pluginClient.dataset.getPreviewUrl({
      sourceId: pluginId,
      config,
      fileId: apiFileId
    });

    return res.url;
  };

  const getFileDetail = async ({
    apiFileId
  }: {
    apiFileId: string;
  }): Promise<PluginDatasetDetailResponse> => {
    const file = await pluginClient.dataset.getDetail({
      sourceId: pluginId,
      config,
      fileId: apiFileId
    });

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
