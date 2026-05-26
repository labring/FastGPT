import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

export const getUploadChatFileType = (file: File) => {
  if (file.type.includes('image')) return ChatFileTypeEnum.image;
  if (file.type.includes('audio')) return ChatFileTypeEnum.audio;
  if (file.type.includes('video')) return ChatFileTypeEnum.video;
  return ChatFileTypeEnum.file;
};
