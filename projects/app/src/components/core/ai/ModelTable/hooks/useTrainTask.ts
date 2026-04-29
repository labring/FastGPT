import { useCallback, useState } from 'react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import {
  deleteEmbeddingTrainTask,
  deleteRerankTrainTask,
  retryEmbeddingTrainTask,
  retryRerankTrainTask
} from '@/web/core/app/api/train';
import type { I18nT } from '../types';

type UseTrainTaskProps = {
  t: I18nT;
  baseModelType: ModelTypeEnum.embedding | ModelTypeEnum.rerank;
  onSuccess?: () => void;
  refreshList: (options?: { silent?: boolean }) => void;
};

export const useTrainTask = ({ t, baseModelType, onSuccess, refreshList }: UseTrainTaskProps) => {
  const isRerank = baseModelType === ModelTypeEnum.rerank;
  const [retryingTaskIds, setRetryingTaskIds] = useState<Set<string>>(new Set());
  const [deletingTaskIds, setDeletingTaskIds] = useState<Set<string>>(new Set());
  const [downloadingTaskIds, setDownloadingTaskIds] = useState<Set<string>>(new Set());

  const { openConfirm: openDeleteConfirm, ConfirmModal: DeleteConfirmModal } = useConfirm({
    type: 'delete',
    title: t('common:Delete'),
    content: t('account_model:train_detail_confirm_delete')
  });

  const { runAsync: onRetryTask } = useRequest(
    async (taskId: string) => {
      if (retryingTaskIds.has(taskId)) return;

      setRetryingTaskIds((prev) => new Set(prev).add(taskId));
      try {
        if (isRerank) {
          return await retryRerankTrainTask({ taskId });
        }
        return await retryEmbeddingTrainTask({ taskId });
      } finally {
        setRetryingTaskIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    },
    {
      errorToast: t('app:operation_failed'),
      successToast: t('app:operation_success'),
      onSuccess: () => {
        refreshList();
        onSuccess?.();
      }
    }
  );

  const { runAsync: onDeleteTask } = useRequest(
    async (taskId: string) => {
      if (deletingTaskIds.has(taskId)) return;

      setDeletingTaskIds((prev) => new Set(prev).add(taskId));
      try {
        if (isRerank) {
          return await deleteRerankTrainTask({ taskId, force: 'true' });
        }
        return await deleteEmbeddingTrainTask({ taskId, force: 'true' });
      } finally {
        setDeletingTaskIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    },
    {
      errorToast: t('app:operation_failed'),
      successToast: t('app:operation_success'),
      onSuccess: () => {
        refreshList();
        onSuccess?.();
      }
    }
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (deletingTaskIds.has(taskId)) return;

      return openDeleteConfirm({
        onConfirm: async () => {
          await onDeleteTask(taskId);
        }
      })();
    },
    [deletingTaskIds, onDeleteTask, openDeleteConfirm]
  );

  const handleDownloadData = useCallback(
    async (taskId: string) => {
      if (!taskId) throw new Error('Task ID is required');
      if (downloadingTaskIds.has(taskId)) return;

      setDownloadingTaskIds((prev) => new Set(prev).add(taskId));
      try {
        const headers = {
          question: t('app:eval_detail_question_column'),
          bestMatchContext: t('app:eval_detail_best_match_context_column'),
          collectionName: t('app:eval_detail_collection_name_column'),
          rankBefore: t(
            isRerank
              ? 'app:eval_detail_rank_before_rerank_column'
              : 'app:eval_detail_rank_before_column'
          ),
          rankAfter: t(
            isRerank
              ? 'app:eval_detail_rank_after_rerank_column'
              : 'app:eval_detail_rank_after_column'
          ),
          improvement: t('app:eval_detail_improvement_column')
        };

        const path = isRerank
          ? '/api/core/train/rerank/task/eval-report'
          : '/api/core/train/embedding/task/eval-report';

        const response = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            taskId,
            headers
          })
        });

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = t(errorData.message) || errorData.error || errorMessage;
          } catch {
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const contentType = response.headers.get('Content-Type');
        if (
          !contentType?.includes(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ) &&
          !contentType?.includes('application/octet-stream')
        ) {
          throw new Error('download error.');
        }

        const shortCode = taskId.slice(-6);
        const filename = `${t('app:eval_detail_filename')}_${shortCode}.xlsx`;

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
      } finally {
        setDownloadingTaskIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    },
    [downloadingTaskIds, isRerank, t]
  );

  const { runAsync: onDownloadData } = useRequest(handleDownloadData, {
    errorToast: t('app:download_failed')
  });

  return {
    DeleteConfirmModal,
    retryingTaskIds,
    deletingTaskIds,
    downloadingTaskIds,
    onRetryTask,
    onDownloadData,
    handleDeleteTask
  };
};
