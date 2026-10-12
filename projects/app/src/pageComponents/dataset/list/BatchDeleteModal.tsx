import React, { useMemo } from 'react';
import CommonBatchDeleteModal from '@/components/common/batch/BatchDeleteModal';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { batchDeleteDatasets } from '@/web/core/dataset/api';
import type { BatchResourceActionResponse } from '@fastgpt/global/openapi/common/batch/api';

type BatchDeleteModalProps = {
  datasets: DatasetListItemType[];
  onClose: () => void;
  onSuccess: (result: BatchResourceActionResponse) => void;
};

/**
 * 知识库批量删除确认弹窗组件（委托至通用 CommonBatchDeleteModal）：
 * 1. 过滤无 Owner 权限的资源，并提示「已过滤无删除权限的知识库」。
 * 2. 动态展示删除描述（区分纯知识库、纯文件夹、知识库与文件夹混选）。
 * 3. 展现待删除清单（文件夹保持文件夹图标，知识库统一使用正方体图标）。
 * 4. 2 个及以上输入「确认删除」确认；单个对象沿用输入对象名称确认。
 */
const BatchDeleteModal = ({ datasets, onClose, onSuccess }: BatchDeleteModalProps) => {
  const items = useMemo(
    () =>
      datasets.map((dataset) => ({
        ...dataset,
        isFolder: dataset.type === DatasetTypeEnum.folder
      })),
    [datasets]
  );

  return (
    <CommonBatchDeleteModal
      type={'dataset'}
      items={items}
      onClose={onClose}
      onSuccess={onSuccess}
      onDelete={async (deletableDatasets) => {
        return batchDeleteDatasets({ ids: deletableDatasets.map((item) => item._id) });
      }}
    />
  );
};

export default React.memo(BatchDeleteModal);
