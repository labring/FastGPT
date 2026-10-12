import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  datasetDataRebuildIndexProcessingStatuses,
  datasetDataRebuildSynonymProcessingStatuses
} from '@fastgpt/global/core/dataset/data/utils';

/** 只统计重建状态，列表和详情无需计算已就绪数量，可由集合状态索引覆盖查询。 */
export const datasetDataRebuildStatusCountFields = {
  rebuildIndexActiveCount: {
    $sum: {
      $cond: [
        {
          $in: ['$indexStatus', datasetDataRebuildIndexProcessingStatuses]
        },
        1,
        0
      ]
    }
  },
  rebuildSynonymActiveCount: {
    $sum: {
      $cond: [
        {
          $in: ['$indexStatus', datasetDataRebuildSynonymProcessingStatuses]
        },
        1,
        0
      ]
    }
  },
  rebuildSynonymFailedCount: {
    $sum: {
      $cond: [{ $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildSynonymFailed] }, 1, 0]
    }
  },
  rebuildIndexFailedCount: {
    $sum: {
      $cond: [{ $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildIndexFailed] }, 1, 0]
    }
  }
};

/** 弹窗还需统计已就绪数量；缺失状态的历史数据按已就绪处理，null 不计入。 */
export const datasetDataStatusCountFields = {
  count: { $sum: 1 },
  trainedCount: {
    $sum: {
      // 索引中的 missing 会变成 null，必须读取原始文档才能保留历史数据的就绪判断。
      $let: {
        vars: { data: '$$ROOT' },
        in: {
          $cond: [
            {
              $or: [
                { $eq: ['$$data.indexStatus', DatasetDataIndexStatusEnum.indexed] },
                { $eq: [{ $type: '$$data.indexStatus' }, 'missing'] }
              ]
            },
            1,
            0
          ]
        }
      }
    }
  },
  ...datasetDataRebuildStatusCountFields
};

export type DatasetDataRebuildStatusCounts = {
  rebuildIndexActiveCount: number;
  rebuildIndexFailedCount: number;
  rebuildSynonymActiveCount: number;
  rebuildSynonymFailedCount: number;
};

export type DatasetDataStatusCounts = DatasetDataRebuildStatusCounts & {
  count: number;
  trainedCount: number;
};
