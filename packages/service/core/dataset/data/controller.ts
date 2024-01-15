import { MongoDatasetData } from './schema';
import { deleteDatasetDataVector } from '../../../common/vectorStore/controller';

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
