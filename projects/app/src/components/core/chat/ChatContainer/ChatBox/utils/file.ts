import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { ChatTypeEnum } from '../constants';

/**
 * 决定 Chat 文件上传使用正式策略还是客户端草稿策略。
 * 只有编辑态测试使用临时配置；Home Chat 和 Helper 都是服务端授权的正式运行态。
 */
export const resolveChatFileUploadMode = ({
  chatType,
  sourceType
}: {
  chatType: ChatTypeEnum;
  sourceType: ChatSourceTypeEnum;
}): 'runtime' | 'draft' => {
  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) return 'runtime';
  if (chatType === ChatTypeEnum.test) return 'draft';
  return 'runtime';
};

export const getUploadChatFileType = (file: File) => {
  if (file.type.includes('image')) return ChatFileTypeEnum.image;
  if (file.type.includes('audio')) return ChatFileTypeEnum.audio;
  if (file.type.includes('video')) return ChatFileTypeEnum.video;
  return ChatFileTypeEnum.file;
};

/**
 * 按 Chat 文件选择配置判断拖拽或粘贴文件是否允许上传。
 *
 * 优先使用文件名后缀，与文件选择器的 accept 和服务端上传策略保持一致。只有文件名没有
 * 后缀时，才根据 MIME 大类兼容剪贴板或浏览器生成的匿名媒体文件。
 */
export const isChatFileAllowedBySelectConfig = ({
  file,
  fileSelectConfig
}: {
  file: Pick<File, 'name' | 'type'>;
  fileSelectConfig: AppFileSelectConfigType;
}) => {
  const normalizeExtension = (extension: string) => {
    const normalized = extension.trim().toLowerCase();
    if (!normalized) return '';
    return normalized.startsWith('.') ? normalized : `.${normalized}`;
  };

  const allowedExtensions = getUploadFileType({
    canSelectFile: fileSelectConfig.canSelectFile,
    canSelectImg: fileSelectConfig.canSelectImg,
    canSelectVideo: fileSelectConfig.canSelectVideo,
    canSelectAudio: fileSelectConfig.canSelectAudio,
    canSelectCustomFileExtension: fileSelectConfig.canSelectCustomFileExtension,
    customFileExtensionList: fileSelectConfig.customFileExtensionList
  })
    .split(',')
    .map(normalizeExtension)
    .filter(Boolean);
  const normalizedFilename = file.name.trim().toLowerCase();
  const lastDotIndex = normalizedFilename.lastIndexOf('.');
  const fileExtension = lastDotIndex >= 0 ? normalizedFilename.slice(lastDotIndex) : '';

  if (fileExtension) {
    return allowedExtensions.includes(fileExtension);
  }

  const mimeCategory = file.type.trim().toLowerCase().split('/')[0];
  if (mimeCategory === 'image') return !!fileSelectConfig.canSelectImg;
  if (mimeCategory === 'audio') return !!fileSelectConfig.canSelectAudio;
  if (mimeCategory === 'video') return !!fileSelectConfig.canSelectVideo;

  return false;
};
