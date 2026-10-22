import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';

/** 两种重建分别维护 data 状态，普通训练始终使用首次索引状态。 */
export const getTrainingDataIndexStatuses = (mode: TrainingModeEnum) => {
  if (mode === TrainingModeEnum.rebuildIndex)
    return {
      running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
      failed: DatasetDataIndexStatusEnum.rebuildIndexFailed
    };
  if (mode === TrainingModeEnum.rebuildSynonym)
    return {
      running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
      failed: DatasetDataIndexStatusEnum.rebuildSynonymFailed
    };
  return { running: DatasetDataIndexStatusEnum.indexing, failed: DatasetDataIndexStatusEnum.error };
};

/** 恢复可领取状态；是否重新启用 TTL 由业务入口明确决定，默认保留原过期策略。 */
export const getTrainingTaskReadyUpdate = ({
  restoreExpiration = false
}: { restoreExpiration?: boolean } = {}) => ({
  $set: {
    retryCount: 3,
    lockTime: new Date(0),
    ...(restoreExpiration ? { expireAt: new Date() } : {})
  },
  $unset: { errorMsg: '' }
});
