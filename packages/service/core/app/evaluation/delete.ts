import { MongoEvaluation } from './evalSchema';
import { MongoEvalItem } from './evalItemSchema';

/**
 * 删除团队下的评估及其评估项。
 * 评估项只保存 evalId，因此必须先保留父记录 ID 并删除子项，再删除父记录，确保失败重试时仍可定位子项。
 */
export const deleteEvaluationsByTeamId = async (teamId: string) => {
  const evaluations = await MongoEvaluation.find({ teamId }, '_id').lean();
  const evalIds = evaluations.map((evaluation) => evaluation._id);

  if (evalIds.length > 0) {
    await MongoEvalItem.deleteMany({
      evalId: { $in: evalIds }
    });
  }

  await MongoEvaluation.deleteMany({ teamId });
};
