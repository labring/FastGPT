import React, { useMemo } from 'react';
import CommonBatchDeleteModal from '@/components/common/batch/BatchDeleteModal';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { batchDeleteApps } from '@/web/core/app/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { BatchResourceActionResponse } from '@fastgpt/global/openapi/common/batch/api';

type BatchDeleteModalProps = {
  apps: AppListItemType[];
  onClose: () => void;
  onSuccess: (result: BatchResourceActionResponse) => void;
};

/**
 * 批量删除确认弹窗组件（委托至通用 CommonBatchDeleteModal）：
 * 1. 过滤无 Owner 权限的资源，并提示「已过滤无删除权限的应用」。
 * 2. 动态展示删除描述（区分纯应用、纯文件夹、应用与文件夹混选）。
 * 3. 展现待删除清单（文件夹保持文件夹图标，所有应用统一使用正方体图标）。
 * 4. 2 个及以上输入「确认删除」确认；单个对象沿用输入对象名称确认。
 */
const BatchDeleteModal = ({ apps, onClose, onSuccess }: BatchDeleteModalProps) => {
  const { lastChatAppId, setLastChatAppId } = useChatStore();
  const items = useMemo(
    () =>
      apps.map((app) => ({
        ...app,
        isFolder: AppFolderTypeList.includes(app.type)
      })),
    [apps]
  );

  return (
    <CommonBatchDeleteModal
      type={'app'}
      items={items}
      onClose={onClose}
      onSuccess={onSuccess}
      onDelete={async (deletableApps) => {
        const result = await batchDeleteApps({
          ids: deletableApps.map((item) => item._id)
        });
        result.affectedIds.forEach((appId) => {
          localStorage.removeItem(`app_log_keys_${appId}`);
        });
        if (lastChatAppId && result.affectedIds.includes(lastChatAppId)) {
          setLastChatAppId('');
        }
        return result;
      }}
    />
  );
};

export default React.memo(BatchDeleteModal);
