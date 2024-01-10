import { MongoDatasetData } from './schema';
import { MongoDatasetTraining } from '../training/schema';
import { delFileByFileIdList, delFileByMetadata } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoDatasetCollection } from '../collection/schema';
import { delay } from '@fastgpt/global/common/system/utils';
import { delImgByFileIdList } from '../../../common/file/image/controller';
import { deleteDatasetDataVector } from '../../../common/vectorStore/controller';

/* delete all data by datasetIds */
export async function delDatasetRelevantData({ datasetIds }: { datasetIds: string[] }) {
  datasetIds = datasetIds.map((item) => String(item));

  // delete training data(There could be a training mission)
  await MongoDatasetTraining.deleteMany({
    datasetId: { $in: datasetIds }
  });

  await delay(2000);

  // delete dataset.datas
  await MongoDatasetData.deleteMany({ datasetId: { $in: datasetIds } });
  // delete pg data
  await deleteDatasetDataVector({ datasetIds });

  // delete collections
  await MongoDatasetCollection.deleteMany({
    datasetId: { $in: datasetIds }
  });

  // delete related files
  await Promise.all(
    datasetIds.map((id) => delFileByMetadata({ bucketName: BucketNameEnum.dataset, datasetId: id }))
  );
}
/**
 * delete all data by collectionIds
 */
export async function delCollectionRelevantData({
  collectionIds,
  fileIds
}: {
  collectionIds: string[];
  fileIds: string[];
}) {
  collectionIds = collectionIds.filter(Boolean).map((item) => String(item));
  const filterFileIds = fileIds.filter(Boolean).map((item) => String(item));

  // delete training data
  await MongoDatasetTraining.deleteMany({
    collectionId: { $in: collectionIds }
  });

  await delay(2000);

  // delete dataset.datas
  await MongoDatasetData.deleteMany({ collectionId: { $in: collectionIds } });
  // delete pg data
  await deleteDatasetDataVector({ collectionIds });

  // delete collections
  await MongoDatasetCollection.deleteMany({
    _id: { $in: collectionIds }
  });

  // delete file and imgs
  await Promise.all([
    delImgByFileIdList(filterFileIds),
    delFileByFileIdList({
      bucketName: BucketNameEnum.dataset,
      fileIdList: filterFileIds
    })
  ]);
}
/**
 * delete one data by mongoDataId
 */
export async function delDatasetDataByDataId({
  collectionId,
  mongoDataId
}: {
  collectionId: string;
  mongoDataId: string;
}) {
  await deleteDatasetDataVector({ collectionId, dataIds: [mongoDataId] });
  await MongoDatasetData.findByIdAndDelete(mongoDataId);
}
