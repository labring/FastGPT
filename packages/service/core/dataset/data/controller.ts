import { MongoDatasetData } from './schema';
import { deletePgDataById } from './pg';
import { MongoDatasetTraining } from '../training/schema';
import { delFileById } from '../../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoDatasetCollection } from '../collection/schema';
import { delDatasetFiles } from '../file/controller';
import { delay } from '@fastgpt/global/common/system/utils';

/* delete all data by datasetIds */
export async function delDatasetRelevantData({ datasetIds }: { datasetIds: string[] }) {
  datasetIds = datasetIds.map((item) => String(item));

  // delete training data(There could be a training mission)
  await MongoDatasetTraining.deleteMany({
    datasetId: { $in: datasetIds }
  });

  // delete related files
  await Promise.all(datasetIds.map((id) => delDatasetFiles({ datasetId: id })));

  await delay(1000);

  // delete pg data
  await deletePgDataById(`dataset_id IN ('${datasetIds.join("','")}')`);
  // delete dataset.datas
  await MongoDatasetData.deleteMany({ datasetId: { $in: datasetIds } });

  // delete collections
  await MongoDatasetCollection.deleteMany({
    datasetId: { $in: datasetIds }
  });
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
  collectionIds = collectionIds.map((item) => String(item));
  const filterFileIds = fileIds.filter(Boolean);

  // delete training data
  await MongoDatasetTraining.deleteMany({
    collectionId: { $in: collectionIds }
  });

  // delete file
  await Promise.all(
    filterFileIds.map((fileId) => {
      return delFileById({
        bucketName: BucketNameEnum.dataset,
        fileId
      });
    })
  );

  await delay(1000);

  // delete pg data
  await deletePgDataById(`collection_id IN ('${collectionIds.join("','")}')`);
  // delete dataset.datas
  await MongoDatasetData.deleteMany({ collectionId: { $in: collectionIds } });
}
/**
 * delete one data by mongoDataId
 */
export async function delDatasetDataByDataId(mongoDataId: string) {
  await deletePgDataById(['data_id', mongoDataId]);
  await MongoDatasetData.findByIdAndDelete(mongoDataId);
}
