import { postCreateTrainingBill } from '@/api/common/bill';
import { postChunks2Dataset } from '@/api/core/dataset/data';
import { TrainingModeEnum } from '@/constants/plugin';
import type { DatasetDataItemType } from '@/types/core/dataset/data';
import { delay } from '@/utils/tools';

export async function chunksUpload({
  kbId,
  mode,
  chunks,
  prompt,
  rate = 50,
  onUploading
}: {
  kbId: string;
  mode: `${TrainingModeEnum}`;
  chunks: DatasetDataItemType[];
  prompt?: string;
  rate?: number;
  onUploading?: (insertLen: number, total: number) => void;
}) {
  // create training bill
  const billId = await postCreateTrainingBill({ name: 'dataset.Training Name' });

  async function upload(data: DatasetDataItemType[]) {
    return postChunks2Dataset({
      kbId,
      data,
      mode,
      prompt,
      billId
    });
  }

  let successInsert = 0;
  let retryTimes = 10;
  for (let i = 0; i < chunks.length; i += rate) {
    try {
      const { insertLen } = await upload(chunks.slice(i, i + rate));
      onUploading && onUploading(i + rate, chunks.length);
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
