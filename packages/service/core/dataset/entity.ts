import type { ClientSession } from '../../common/mongo';
import { MongoDataset } from './schema';

/** 查询指定团队内可用于索引模型校验的知识库引用。 */
export const findDatasetIndexModelReferences = ({
  datasetIds,
  teamId,
  session
}: {
  datasetIds: string[];
  teamId: string;
  session?: ClientSession;
}) =>
  MongoDataset.find(
    { _id: { $in: datasetIds }, teamId, deleteTime: null },
    'vectorModelId vectorModel'
  )
    .session(session ?? null)
    .lean();
