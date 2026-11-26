import {
  DatasetQaTrainingSchema,
  type DatasetQaTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { connectionMongo, defineIndex, getMongoModel, Types } from '../../../common/mongo';
import { readFromSecondary } from '../../../common/mongo/utils';

const { Schema } = connectionMongo;

export const DatasetQaTrainingCollectionName = 'dataset_qa_trainings';

export type DatasetQaTrainingCounts = {
  _id: string;
  activeCount: number;
  finalErrorCount: number;
};

const DatasetQaTrainingMongoSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, required: true },
    tmbId: { type: Schema.Types.ObjectId, required: true },
    datasetId: { type: Schema.Types.ObjectId, required: true },
    collectionId: { type: Schema.Types.ObjectId, required: true },
    q: { type: String, default: '' },
    chunkIndex: { type: Number, default: 0 },
    dataMetadata: Object,
    status: {
      type: String,
      enum: DatasetQaTrainingSchema.shape.status.options,
      required: true,
      default: 'active'
    },
    errorMsg: String
  },
  { timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' } }
);

defineIndex(DatasetQaTrainingMongoSchema, {
  key: { teamId: 1, datasetId: 1, collectionId: 1, status: 1, chunkIndex: 1, _id: 1 },
  options: { name: 'fg_dataset_qa_training_scope_stage_order' }
});

export const MongoDatasetQaTraining = getMongoModel<DatasetQaTrainingSchemaType>(
  DatasetQaTrainingCollectionName,
  DatasetQaTrainingMongoSchema
);

/** 按集合汇总 QA 待处理与失败数，供集合列表、详情与训练详情共用。 */
export const countDatasetQaTrainingByCollection = async ({
  teamId,
  datasetId,
  collectionIds,
  useReadReplica
}: {
  teamId: string;
  datasetId: string;
  collectionIds: string[];
  useReadReplica?: boolean;
}): Promise<DatasetQaTrainingCounts[]> => {
  if (collectionIds.length === 0) return [];
  const rows = await MongoDatasetQaTraining.aggregate<{
    _id: Types.ObjectId;
    activeCount: number;
    finalErrorCount: number;
  }>(
    [
      {
        $match: {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(datasetId),
          collectionId: { $in: collectionIds.map((id) => new Types.ObjectId(id)) }
        }
      },
      {
        $group: {
          _id: '$collectionId',
          activeCount: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          finalErrorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } }
        }
      }
    ],
    useReadReplica ? readFromSecondary : undefined
  );
  return rows.map((row) => ({ ...row, _id: String(row._id) }));
};
