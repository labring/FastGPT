import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import type {
  ParentTreePathItemType,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import type { DatasetCollectionItemType, DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import type {
  CreateApiCollectionV2BodyType,
  ExternalFileCreateDatasetCollectionParams,
  CreateCollectionByFileIdBodyType,
  ReTrainingCollectionBodyType,
  CreateLinkCollectionBodyType,
  CreateTextCollectionBodyType,
  CreateCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import type {
  BatchSetCollectionTagsParams,
  CreateDatasetCollectionTagParams,
  SetCollectionTagsParams,
  UpdateDatasetCollectionTagParams
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionsListItemType,
  ChangeCollectionOwnerBody,
  DeleteCollectionBodyType,
  GetTagFilterOptionsResponseType,
  GetCollectionCollaboratorListResponse,
  ReadCollectionSourceBodyType,
  ReadCollectionSourceResponseType,
  UpdateCollectionCollaboratorBody,
  UpdateDatasetCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type {
  GetDownloadTicketDatasetCollectionsBodyType,
  GetDownloadTicketDatasetCollectionsResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';

const batchDownloadHandoffTimeoutMs = 3000;
const batchDownloadRetryDelayMs = 1000;
const batchDownloadMaxRetryDelayMs = 5000;
const batchDownloadIframeCleanupMs = 24 * 60 * 60 * 1000;

const isRetryableArchiveLeaseError = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;

  const statusText = Reflect.get(error, 'statusText');
  return (
    statusText === DatasetErrEnum.archiveUnavailable ||
    statusText === DatasetErrEnum.archiveMemberBusy
  );
};

export const canBatchDownloadDatasetCollections = (datasetType: DatasetTypeEnum) =>
  datasetType === DatasetTypeEnum.dataset;

export const postGetDatasetCollectionsDownloadTicket = (
  data: GetDownloadTicketDatasetCollectionsBodyType
) =>
  POST<GetDownloadTicketDatasetCollectionsResponseType>(
    '/core/dataset/collection/getDownloadTicket',
    data,
    { timeout: 0 }
  );

/**
 * 创建集合 ZIP 下载提交器：先申请短效 Ticket，再交给浏览器原生下载器处理大文件响应。
 * 阶段二容量竞争会复用同一 Ticket 有限重试；成功下载无法可靠感知完成，因此使用保守期限
 * 回收隐藏 iframe，避免长时间停留在列表页时持续积累 DOM 和闭包。
 */
export const createBatchDownloadDatasetCollectionsSubmitter = ({
  startDownload
}: {
  startDownload?: (props: {
    url: string;
    onError: (error: unknown) => void;
  }) => (() => void) | void;
} = {}) => {
  let nextSubmissionId = 0;
  let activeSubmissionId: number | undefined;
  let ownerActive = true;
  const releaseCallbacks = new Set<() => void>();
  const startNativeDownload =
    startDownload ??
    (({ url, onError }) => {
      const iframe = document.createElement('iframe');
      iframe.hidden = true;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('error', handleError);
        iframe.remove();
      };
      const reportError = (error?: unknown) => {
        cleanup();
        onError(error);
      };
      // 同源下载接口的非流式失败会加载统一 JSON；成功的 attachment 不会替换页面。
      const handleLoad = () => {
        const text = (() => {
          try {
            return iframe.contentDocument?.body?.textContent?.trim();
          } catch {
            return undefined;
          }
        })();
        if (!text) return;

        try {
          const error = JSON.parse(text) as { code?: unknown };
          if (typeof error?.code === 'number' && (error.code < 200 || error.code >= 400)) {
            reportError(error);
            return;
          }
        } catch {
          // 网关可能返回 HTML；统一回退为页面上的通用下载错误。
        }

        reportError();
      };
      const handleError = () => reportError();

      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('error', handleError);
      iframe.src = url;
      document.body.appendChild(iframe);
      return cleanup;
    });

  const submit = ({
    datasetId,
    collectionIds,
    onSubmittingChange,
    onError
  }: {
    datasetId: string;
    collectionIds: string[];
    onSubmittingChange?: (isSubmitting: boolean) => void;
    onError?: (error: unknown) => void;
  }) => {
    if (!ownerActive || activeSubmissionId !== undefined || collectionIds.length === 0) {
      return false;
    }

    const submissionId = ++nextSubmissionId;
    activeSubmissionId = submissionId;
    onSubmittingChange?.(true);

    let callbacksActive = true;
    const release = () => {
      callbacksActive = false;
      onSubmittingChange = undefined;
      onError = undefined;
      releaseCallbacks.delete(release);
    };
    const setSubmitting = (value: boolean) => {
      if (value) {
        if (activeSubmissionId !== undefined && activeSubmissionId !== submissionId) {
          return false;
        }
        activeSubmissionId = submissionId;
      } else {
        if (activeSubmissionId !== submissionId) return false;
        activeSubmissionId = undefined;
      }

      if (callbacksActive) onSubmittingChange?.(value);
      return true;
    };
    releaseCallbacks.add(release);

    const requestBody: GetDownloadTicketDatasetCollectionsBodyType = {
      datasetId,
      collectionIds
    };
    void postGetDatasetCollectionsDownloadTicket(requestBody)
      .then(({ ticket, expiresAt }) => {
        const reportDownloadError = onError;
        const downloadUrl = `${getWebReqUrl('/api/core/dataset/collection/batchDownload')}?ticket=${encodeURIComponent(ticket)}`;
        const ticketExpiresAt = Date.parse(expiresAt);
        let retryCount = 0;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        let handoffTimer: ReturnType<typeof setTimeout> | undefined;
        let currentDownloadCleanup: (() => void) | undefined;
        let sessionClosed = false;

        const cleanupDownloadSession = () => {
          if (sessionClosed) return;
          sessionClosed = true;
          if (retryTimer) clearTimeout(retryTimer);
          if (handoffTimer) clearTimeout(handoffTimer);
          clearTimeout(lifecycleTimer);
          currentDownloadCleanup?.();
          currentDownloadCleanup = undefined;
        };
        const startDownloadAttempt = () => {
          if (sessionClosed) return;

          setSubmitting(true);
          let attemptSettledSynchronously = false;
          try {
            const cleanupDownload = startNativeDownload({
              url: downloadUrl,
              onError: (error) => {
                if (sessionClosed) return;
                attemptSettledSynchronously = true;
                if (handoffTimer) {
                  clearTimeout(handoffTimer);
                  handoffTimer = undefined;
                }
                currentDownloadCleanup?.();
                currentDownloadCleanup = undefined;

                const retryDelay = Math.min(
                  batchDownloadRetryDelayMs * 2 ** retryCount,
                  batchDownloadMaxRetryDelayMs
                );
                if (
                  isRetryableArchiveLeaseError(error) &&
                  Number.isFinite(ticketExpiresAt) &&
                  Date.now() + retryDelay < ticketExpiresAt
                ) {
                  // 下载交接后允许发起新任务；旧任务只有在没有新任务占用时才能恢复重试。
                  if (!setSubmitting(true)) {
                    cleanupDownloadSession();
                    release();
                    return;
                  }
                  retryCount += 1;
                  retryTimer = setTimeout(() => {
                    retryTimer = undefined;
                    startDownloadAttempt();
                  }, retryDelay);
                  return;
                }

                cleanupDownloadSession();
                setSubmitting(false);
                if (ownerActive) reportDownloadError?.(error);
                release();
              }
            });

            if (attemptSettledSynchronously) {
              cleanupDownload?.();
            } else {
              currentDownloadCleanup = cleanupDownload ?? undefined;
              handoffTimer = setTimeout(() => {
                handoffTimer = undefined;
                setSubmitting(false);
              }, batchDownloadHandoffTimeoutMs);
            }
          } catch (error) {
            cleanupDownloadSession();
            setSubmitting(false);
            if (ownerActive) reportDownloadError?.(error);
            release();
          }
        };

        const lifecycleTimer = setTimeout(() => {
          cleanupDownloadSession();
          setSubmitting(false);
          release();
        }, batchDownloadIframeCleanupMs);
        startDownloadAttempt();
      })
      .catch((error) => {
        setSubmitting(false);
        if (ownerActive) onError?.(error);
        release();
      });

    return true;
  };

  const cleanup = () => {
    ownerActive = false;
    releaseCallbacks.forEach((release) => release());
  };

  return { submit, cleanup };
};

/* ============================= collections ==================================== */
export const getDatasetCollections = (data: GetDatasetCollectionsProps) =>
  POST<PaginationResponse<DatasetCollectionsListItemType>>(`/core/dataset/collection/listV2`, data);
export const getDatasetCollectionPathById = (sourceId: ParentIdType) =>
  GET<ParentTreePathItemType[]>(`/core/dataset/collection/paths`, { sourceId });
export const getDatasetCollectionById = (id: string) =>
  GET<DatasetCollectionItemType>(`/core/dataset/collection/detail`, { id });
export const putDatasetCollectionById = (data: UpdateDatasetCollectionBodyType) =>
  POST(`/core/dataset/collection/update`, data);
export const delDatasetCollectionById = (params: DeleteCollectionBodyType) =>
  POST(`/core/dataset/collection/delete`, params);
export const postLinkCollectionSync = (collectionId: string) =>
  POST<DatasetCollectionSyncResultEnum>(`/core/dataset/collection/sync`, {
    collectionId
  });

export const getDatasetCollectionTrainingDetail = (collectionId: string) =>
  GET<GetCollectionTrainingDetailResponseType>(`/core/dataset/collection/trainingDetail`, {
    collectionId
  });

/* ========================== collection create ========================== */
export const postDatasetCollection = (data: CreateCollectionBodyType) =>
  POST<string>(`/core/dataset/collection/create`, data);
export const postCreateDatasetFileCollection = (data: CreateCollectionByFileIdBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/fileId`, data, {
    timeout: 360000
  });
export const postReTrainingDatasetFileCollection = (data: ReTrainingCollectionBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/reTrainingCollection`, data, {
    timeout: 360000
  });
export const postCreateDatasetLinkCollection = (data: CreateLinkCollectionBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/link`, data);
export const postCreateDatasetTextCollection = (data: CreateTextCollectionBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/text`, data);
export const postCreateDatasetApiDatasetCollection = (data: CreateApiCollectionV2BodyType) =>
  POST(`/core/dataset/collection/create/apiCollectionV2`, data, {
    timeout: 360000
  });
/** @deprecated */
export const postCreateDatasetExternalFileCollection = (
  data: ExternalFileCreateDatasetCollectionParams
) =>
  POST<{ collectionId: string }>(`/proApi/core/dataset/collection/create/externalFileUrl`, data, {
    timeout: 360000
  });

export const postBackupDatasetCollection = ({
  file,
  percentListen,
  datasetId
}: {
  file: File;
  percentListen: (percent: number) => void;
  datasetId: string;
}) => {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('data', JSON.stringify({ datasetId }));

  return POST(`/core/dataset/collection/create/backup`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    }
  });
};
export const postTemplateDatasetCollection = ({
  file,
  percentListen,
  datasetId
}: {
  file: File;
  percentListen: (percent: number) => void;
  datasetId: string;
}) => {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('data', JSON.stringify({ datasetId }));

  return POST(`/core/dataset/collection/create/template`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    }
  });
};

/* =============================== tag ==================================== */
export const postCreateDatasetCollectionTag = (data: CreateDatasetCollectionTagParams) =>
  POST(`/proApi/core/dataset/tag/create`, data);
export const delDatasetCollectionTag = (data: { id: string; datasetId: string }) =>
  DELETE(`/proApi/core/dataset/tag/delete`, data);
export const updateDatasetCollectionTag = (data: UpdateDatasetCollectionTagParams) =>
  POST(`/proApi/core/dataset/tag/update`, data);
export const getAllTags = (datasetId: string) =>
  GET<{ list: DatasetTagType[] }>(`/proApi/core/dataset/tag/getAllTags?datasetId=${datasetId}`);
export const getDatasetTagFilterOptions = (datasetId: string) =>
  GET<GetTagFilterOptionsResponseType>(
    `/core/dataset/collection/tagFilterOptions?datasetId=${datasetId}`
  );
export const postSetCollectionTags = (data: SetCollectionTagsParams) =>
  POST(`/proApi/core/dataset/tag/setCollectionTags`, data);
export const postBatchSetCollectionTags = (data: BatchSetCollectionTagsParams) =>
  POST(`/proApi/core/dataset/tag/batchSetCollectionTags`, data);

/* ================== read source ======================== */
export const getCollectionSource = (data: ReadCollectionSourceBodyType) =>
  POST<ReadCollectionSourceResponseType>('/core/dataset/collection/read', data);

/* ================== collection permission ======================== */
export const getCollectionCollaboratorList = (collectionId: string) =>
  GET<GetCollectionCollaboratorListResponse>(`/proApi/core/dataset/collection/collaborator/list`, {
    collectionId
  });
export const postUpdateCollectionCollaborators = (body: UpdateCollectionCollaboratorBody) =>
  POST(`/proApi/core/dataset/collection/collaborator/update`, body);
export const putResumeCollectionInheritPermission = (collectionId: string) =>
  PUT(`/core/dataset/collection/resumeInheritPermission`, { collectionId });
export const postChangeCollectionOwner = (body: ChangeCollectionOwnerBody) =>
  POST(`/proApi/core/dataset/collection/changeOwner`, body);
