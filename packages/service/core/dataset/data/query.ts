import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';

/** 集合 data 一次聚合统计总量、已就绪及重建状态；缺失状态的历史数据按已就绪处理。 */
export const datasetDataStatusCountFields = {
  count: { $sum: 1 },
  trainedCount: {
    $sum: {
      $cond: [
        {
          $or: [
            { $eq: ['$indexStatus', DatasetDataIndexStatusEnum.indexed] },
            { $eq: [{ $type: '$indexStatus' }, 'missing'] }
          ]
        },
        1,
        0
      ]
    }
  },
  rebuildIndexActiveCount: {
    $sum: {
      $cond: [
        {
          $in: [
            '$indexStatus',
            [
              DatasetDataIndexStatusEnum.rebuildIndexPending,
              DatasetDataIndexStatusEnum.rebuildIndexRunning
            ]
          ]
        },
        1,
        0
      ]
    }
  },
  rebuildIndexFailedCount: {
    $sum: {
      $cond: [{ $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildIndexFailed] }, 1, 0]
    }
  }
};

export type DatasetDataStatusCounts = {
  count: number;
  trainedCount: number;
  rebuildIndexActiveCount: number;
  rebuildIndexFailedCount: number;
};
