import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { getS3ChatSource } from '../../common/s3/sources/chat';

export const addPreviewUrlToChatItems = async (histories: ChatItemType[]) => {
  // Presign file urls
  const s3ChatSource = getS3ChatSource();
  for await (const item of histories) {
    for await (const value of item.value) {
      if (value.type === ChatItemValueTypeEnum.file && value.file && value.file.key) {
        value.file.url = await s3ChatSource.createGetChatFileURL({
          key: value.file.key,
          external: true
        });
      }
    }
  }
};
