import type { DatasetSearchTrackProps } from '@fastgpt/global/core/dataset/api';
import { addLog } from '../../../../common/system/log';

export async function datasetSearchTrack(data: DatasetSearchTrackProps) {
  try {
    return await global.trackDatasetSearchHandler(data);
  } catch (error) {
    addLog.error('trackDatasetSearchHandler error', error);
  }
}
