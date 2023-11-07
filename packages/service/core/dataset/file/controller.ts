import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getGFSCollection } from '../../../common/file/gridfs/controller';

export async function delDatasetFiles({ datasetId }: { datasetId: string }) {
  const db = getGFSCollection(BucketNameEnum.dataset);
  await db.deleteMany({
    'metadata.datasetId': String(datasetId)
  });
}
