import { getFileViewUrl, postChunks2Dataset } from '@/web/core/dataset/api';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { delay } from '@fastgpt/global/common/system/utils';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import type {
  FileCreateDatasetCollectionParams,
  PushDatasetDataChunkProps
} from '@fastgpt/global/core/dataset/api.d';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { POST } from '@/web/common/api/request';

/* upload a file to create collection */
export const fileCollectionCreate = ({
  file,
  metadata = {},
  data,
  percentListen
}: {
  file: File;
  metadata?: Record<string, any>;
  data: FileCreateDatasetCollectionParams;
  percentListen: (percent: number) => void;
}) => {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  form.append('metadata', JSON.stringify(metadata));
  form.append('bucketName', BucketNameEnum.dataset);
  form.append('file', file, encodeURIComponent(file.name));

  return POST<string>(`/core/dataset/collection/create/file?datasetId=${data.datasetId}`, form, {
    timeout: 480000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen && percentListen(percent);
    },
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};

export async function chunksUpload({
  billId,
  collectionId,
  trainingMode,
  chunks,
  prompt,
  rate = 50,
  onUploading
}: {
  billId: string;
  collectionId: string;
  trainingMode: `${TrainingModeEnum}`;
  chunks: PushDatasetDataChunkProps[];
  prompt?: string;
  rate?: number;
  onUploading?: (rate: number) => void;
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
  chunks = chunks.map((chunk) => ({
    ...chunk,
    chunkIndex: chunk.chunkIndex
  }));

  let successInsert = 0;
  let retryTimes = 10;
  for (let i = 0; i < chunks.length; i += rate) {
    try {
      const uploadChunks = chunks.slice(i, i + rate);
      const { insertLen } = await upload(uploadChunks);
      if (onUploading) {
        onUploading(Math.round(((i + uploadChunks.length) / chunks.length) * 100));
      }
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
