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

const batchDownloadSubmitCooldownMs = 600;
const batchDownloadIframeCleanupMs = 24 * 60 * 60 * 1000;

export const canBatchDownloadDatasetCollections = (datasetType: DatasetTypeEnum) =>
  datasetType === DatasetTypeEnum.dataset;

/**
 * 创建集合 ZIP 下载提交器：原生 form 让浏览器处理大文件下载，iframe 负责识别响应开始前的 JSON/HTML 错误。
 */
export const createBatchDownloadDatasetCollectionsSubmitter = () => {
  let isSubmitting = false;
  const releaseCallbacks = new Set<() => void>();

  const submit = ({
    collectionIds,
    onSubmittingChange,
    onPreflightError
  }: {
    collectionIds: string[];
    onSubmittingChange?: (isSubmitting: boolean) => void;
    onPreflightError?: (error: unknown) => void;
  }) => {
    if (isSubmitting || collectionIds.length === 0) return false;

    isSubmitting = true;
    onSubmittingChange?.(true);

    const iframe = document.createElement('iframe');
    iframe.name = `batch-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    iframe.style.display = 'none';

    const form = document.createElement('form');
    form.method = 'post';
    form.action = getWebReqUrl('/api/core/dataset/collection/batchDownload');
    form.target = iframe.name;
    form.style.display = 'none';

    collectionIds.forEach((collectionId) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'collectionIds';
      input.value = collectionId;
      form.append(input);
    });

    let hasReportedPreflightError = false;
    let submissionCooldownExpired = false;
    let iframeCleanupTimer: number | undefined;
    // 组件卸载只释放回调；iframe 由 document 持有，SPA 切页不会取消准备中的请求。
    const release = () => {
      onSubmittingChange = undefined;
      onPreflightError = undefined;
      releaseCallbacks.delete(release);
    };
    releaseCallbacks.add(release);
    const reportPreflightError = (error?: unknown) => {
      if (hasReportedPreflightError) return;

      hasReportedPreflightError = true;
      if (iframeCleanupTimer !== undefined) {
        window.clearTimeout(iframeCleanupTimer);
        iframeCleanupTimer = undefined;
      }
      iframe.remove();
      onPreflightError?.(error);
      if (submissionCooldownExpired) release();
    };
    iframe.addEventListener('load', () => {
      try {
        const responseText = iframe.contentDocument?.body.textContent?.trim();
        if (!responseText) return;

        const response = JSON.parse(responseText);

        if (response && typeof response === 'object' && 'code' in response) {
          const { code } = response;
          if (typeof code === 'number' && code >= 400) {
            reportPreflightError(response);
            return;
          }
        }

        reportPreflightError();
      } catch {
        // 网关可能返回 HTML；只要响应正文非空，就按通用下载错误反馈。
        reportPreflightError();
      }
    });
    iframe.addEventListener('error', () => reportPreflightError());

    // Attachment 不提供可靠的完成事件；保留足够长的传输窗口后兜底回收 DOM 和回调。
    iframeCleanupTimer = window.setTimeout(() => {
      iframeCleanupTimer = undefined;
      iframe.remove();
      release();
    }, batchDownloadIframeCleanupMs);
    document.body.append(iframe, form);
    form.requestSubmit();

    // Attachment 成功不保证触发 load；不能在短提交状态结束时移除 iframe。
    window.setTimeout(() => form.remove(), 0);
    window.setTimeout(() => {
      isSubmitting = false;
      submissionCooldownExpired = true;
      onSubmittingChange?.(false);
      if (hasReportedPreflightError) release();
    }, batchDownloadSubmitCooldownMs);

    return true;
  };

  const cleanup = () => {
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
