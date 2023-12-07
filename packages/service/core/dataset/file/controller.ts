import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getGFSCollection } from '../../../common/file/gridfs/controller';
import { delImgByFileIdList } from '../../../common/file/image/controller';

export async function delDatasetFiles({ datasetId }: { datasetId: string }) {
  const db = getGFSCollection(BucketNameEnum.dataset);

  const fileIds = await db
    .find(
      {
        'metadata.datasetId': String(datasetId)
      },
      {
        projection: {
          _id: 1
        }
      }
    )
    .toArray();

  const fileIdList = fileIds.map((item) => String(item._id));
  await delImgByFileIdList(fileIdList);

  await db.deleteMany({
    'metadata.datasetId': String(datasetId)
  });
}
