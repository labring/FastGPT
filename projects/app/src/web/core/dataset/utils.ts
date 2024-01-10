import { getFileViewUrl, postChunks2Dataset } from '@/web/core/dataset/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';
import { delay } from '@fastgpt/global/common/system/utils';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';

export async function chunksUpload({
  billId,
  collectionId,
  trainingMode,
  chunks,
  prompt,
  rate = 150,
  onUploading
}: {
  billId: string;
  collectionId: string;
  trainingMode: `${TrainingModeEnum}`;
  chunks: PushDatasetDataChunkProps[];
  prompt?: string;
  rate?: number;
  onUploading?: (insertLen: number, total: number) => void;
}) {
  async function upload(data: PushDatasetDataChunkProps[]) {
    return postChunks2Dataset({
      collectionId,
      trainingMode,
      data,
      prompt,
      billId
    });
  }

  // add chunk index
  chunks = chunks.map((chunk, i) => ({
    ...chunk,
    chunkIndex: i
  }));

  let successInsert = 0;
  let retryTimes = 10;
  for (let i = 0; i < chunks.length; i += rate) {
    try {
      const { insertLen } = await upload(chunks.slice(i, i + rate));
      onUploading && onUploading(insertLen, chunks.length);
      successInsert += insertLen;
    } catch (error) {
      if (retryTimes === 0) {
        return Promise.reject(error);
      }
      await delay(1000);
      retryTimes--;
      i -= rate;
    }
  }

  return { insertLen: successInsert };
}

export async function getFileAndOpen(fileId: string) {
  if (strIsLink(fileId)) {
    return window.open(fileId, '_blank');
  }
  const url = await getFileViewUrl(fileId);
  const asPath = `${location.origin}${url}`;
  window.open(asPath, '_blank');
}
