import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { clone } from 'lodash-es';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type FieldArrayWithId, type UseFieldArrayReturn } from 'react-hook-form';
import { type ChatBoxInputFormType, type UserInputFileItemType } from '../type';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import {
  getUploadChatFilePresignedUrl,
  getUploadDraftChatFilePresignedUrl
} from '@/web/common/file/api';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { getUploadChatFileType } from '../utils/file';
import { type ChatSourceTarget, useChatAuthApiTarget } from '@/web/core/chat/utils';
import {
  canApplyUploadResult,
  createUploadId,
  findFileIndexByUploadId,
  getFileUploadId,
  isUploadAbortError
} from '../utils/uploadTask';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';

type UseFileUploadOptions = {
  fileSelectConfig: AppFileSelectConfigType;
  fileCtrl: UseFieldArrayReturn<ChatBoxInputFormType, 'files', 'id'>;

  outLinkAuthData?: OutLinkChatAuthProps;
  sourceTarget: ChatSourceTarget;
  chatId: string;
};

type UploadFileField = FieldArrayWithId<ChatBoxInputFormType, 'files', 'id'>;

type UploadTaskState = {
  controller: AbortController;
  canceled: boolean;
  key?: string;
};

export const useFileUpload = (props: UseFileUploadOptions) => {
  const { fileSelectConfig, fileCtrl, outLinkAuthData, sourceTarget, chatId } = props;
  const fileUploadMode = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploadMode);
  const chatAuthTarget = useChatAuthApiTarget({ sourceTarget, outLinkAuthData });
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  const {
    update: updateFiles,
    remove: removeFiles,
    fields: fileList,
    replace: replaceFiles,
    append: appendFiles
  } = fileCtrl;
  const uploadTasksRef = useRef(new Map<string, UploadTaskState>());
  const fileListRef = useRef<UploadFileField[]>(fileList);

  useEffect(() => {
    fileListRef.current = fileList;
  }, [fileList]);

  const hasFileUploading = fileList.some((item) => !item.url);

  const showSelectFile = fileSelectConfig?.canSelectFile;
  const showSelectImg = fileSelectConfig?.canSelectImg;
  const showSelectVideo = fileSelectConfig?.canSelectVideo;
  const showSelectAudio = fileSelectConfig?.canSelectAudio;
  const showSelectCustomFileExtension = fileSelectConfig?.canSelectCustomFileExtension;
  const canUploadFile =
    showSelectFile ||
    showSelectImg ||
    showSelectVideo ||
    showSelectAudio ||
    showSelectCustomFileExtension;
  // 文件数量限制：配置的maxFiles || 团队套餐 || 系统配置 || 默认值
  const maxSelectFiles =
    fileSelectConfig?.maxFiles ||
    teamPlanStatus?.standard?.maxUploadFileCount ||
    feConfigs?.uploadFileMaxAmount ||
    10;
  // 文件大小限制（MB）：团队套餐 || 系统配置 || 默认值
  const maxSize =
    (teamPlanStatus?.standard?.maxUploadFileSize || feConfigs?.uploadFileMaxSize || 500) *
    1024 *
    1024;
  const canSelectFileAmount = maxSelectFiles - fileList.length;

  const { icon: selectFileIcon, label: selectFileLabel } = useMemo(() => {
    if (canUploadFile) {
      return {
        icon: 'core/chat/fileSelect',
        label: t('chat:select_file')
      };
    }
    return {};
  }, [canUploadFile, t]);

  const fileType = useMemo(() => {
    return getUploadFileType({
      canSelectFile: showSelectFile,
      canSelectImg: showSelectImg,
      canSelectVideo: showSelectVideo,
      canSelectAudio: showSelectAudio,
      canSelectCustomFileExtension: showSelectCustomFileExtension,
      customFileExtensionList: fileSelectConfig?.customFileExtensionList
    });
  }, [
    fileSelectConfig?.customFileExtensionList,
    showSelectAudio,
    showSelectCustomFileExtension,
    showSelectFile,
    showSelectImg,
    showSelectVideo
  ]);

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType,
    multiple: true,
    maxCount: canSelectFileAmount
  });

  const syncFileListRef = useCallback((nextFiles: UploadFileField[]) => {
    fileListRef.current = nextFiles;
  }, []);

  const registerUploadTask = useCallback((uploadId: string) => {
    const currentTask = uploadTasksRef.current.get(uploadId);
    if (currentTask) return currentTask;

    const task: UploadTaskState = {
      controller: new AbortController(),
      canceled: false
    };

    uploadTasksRef.current.set(uploadId, task);
    return task;
  }, []);

  const cancelUploadTask = useCallback((uploadId: string) => {
    const task = uploadTasksRef.current.get(uploadId);
    if (!task) return;

    task.canceled = true;
    task.controller.abort();
  }, []);

  const cleanupUploadTask = useCallback((uploadId: string, task?: UploadTaskState) => {
    if (task && uploadTasksRef.current.get(uploadId) !== task) return;

    uploadTasksRef.current.delete(uploadId);
  }, []);

  const cancelAllUploadTasks = useCallback(() => {
    uploadTasksRef.current.forEach((task) => {
      task.canceled = true;
      task.controller.abort();
    });
    uploadTasksRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      cancelAllUploadTasks();
    };
  }, [cancelAllUploadTasks]);

  /**
   * 按当前 field array 状态安全写回上传结果。
   *
   * 上传进度和结果可能在用户删除文件后才返回，因此每次写回前都必须重新定位并检查任务状态。
   */
  const updateFileByUploadId = useCallback(
    (uploadId: string, patch: Partial<UserInputFileItemType>) => {
      const files = fileListRef.current;
      const task = uploadTasksRef.current.get(uploadId);

      if (!canApplyUploadResult({ files, uploadId, canceled: task?.canceled })) {
        return false;
      }

      const fileIndex = findFileIndexByUploadId(files, uploadId);
      if (fileIndex === -1) return false;

      const nextFile: UploadFileField = {
        ...files[fileIndex],
        ...patch
      };
      const nextFiles = [...files];
      nextFiles[fileIndex] = nextFile;
      syncFileListRef(nextFiles);
      updateFiles(fileIndex, nextFile);

      return true;
    },
    [syncFileListRef, updateFiles]
  );

  const removeFileByUploadId = useCallback(
    (uploadId: string) => {
      const files = fileListRef.current;
      const fileIndex = findFileIndexByUploadId(files, uploadId);
      if (fileIndex === -1) return false;

      syncFileListRef(files.filter((_, index) => index !== fileIndex));
      removeFiles(fileIndex);

      return true;
    },
    [removeFiles, syncFileListRef]
  );

  const cancelUploadFile = useCallback(
    (uploadId: string) => {
      cancelUploadTask(uploadId);
      removeFileByUploadId(uploadId);
    },
    [cancelUploadTask, removeFileByUploadId]
  );

  const clearFiles = useCallback(() => {
    cancelAllUploadTasks();
    syncFileListRef([]);
    replaceFiles([]);
  }, [cancelAllUploadTasks, replaceFiles, syncFileListRef]);

  const onSelectFile = useCallback(
    async ({ files }: { files: File[] }) => {
      if (!files || files.length === 0) {
        return [];
      }

      // Filter max files
      if (files.length > maxSelectFiles) {
        files = files.slice(0, maxSelectFiles);
        toast({
          status: 'warning',
          title: t('chat:file_amount_over', { max: maxSelectFiles })
        });
      }

      // Filter files by max size
      const filterFilesByMaxSize = files.filter((file) => file.size <= maxSize);
      if (filterFilesByMaxSize.length < files.length) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      // Convert files to UserInputFileItemType
      const loadFiles = await Promise.all(
        filterFilesByMaxSize.map(
          (file) =>
            new Promise<UserInputFileItemType>((resolve, reject) => {
              const chatFileType = getUploadChatFileType(file);
              const id = getNanoid(6);
              const uploadId = createUploadId();
              if (chatFileType === ChatFileTypeEnum.image) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item: UserInputFileItemType = {
                    id,
                    uploadId,
                    rawFile: file,
                    type: chatFileType,
                    name: file.name,
                    icon: reader.result as string,
                    status: 0
                  };
                  resolve(item);
                };
                reader.onerror = () => {
                  reject(reader.error);
                };
              } else {
                resolve({
                  id,
                  uploadId,
                  rawFile: file,
                  type: chatFileType,
                  name: file.name,
                  icon: getFileIcon(file.name),
                  status: 0
                });
              }
            })
        )
      );

      appendFiles(loadFiles);

      return loadFiles;
    },
    [maxSelectFiles, appendFiles, toast, t, maxSize]
  );

  const uploadFiles = useCallback(async () => {
    const filterFiles = fileListRef.current.filter((item) => item.status === 0 && item.rawFile);

    if (filterFiles.length === 0) return;

    await Promise.allSettled(
      filterFiles.map(async (file) => {
        const rawFile = file.rawFile;
        if (!rawFile) return;

        const uploadId = getFileUploadId(file);
        if (uploadTasksRef.current.has(uploadId)) return;

        const task = registerUploadTask(uploadId);

        try {
          if (!updateFileByUploadId(uploadId, { status: 1, process: file.process ?? 0 })) {
            task.canceled = true;
            return;
          }

          // Get Upload Post Presigned URL
          const uploadParams = {
            filename: rawFile.name,
            contentType: rawFile.type || undefined,
            size: rawFile.size,
            ...chatAuthTarget,
            chatId
          };
          const { url, key, headers, maxSize, previewUrl } =
            fileUploadMode === 'draft'
              ? await getUploadDraftChatFilePresignedUrl(
                  {
                    ...uploadParams,
                    fileSelectConfig
                  },
                  { cancelToken: task.controller }
                )
              : await getUploadChatFilePresignedUrl(uploadParams, {
                  cancelToken: task.controller
                });

          task.key = key;
          if (
            !canApplyUploadResult({
              files: fileListRef.current,
              uploadId,
              canceled: task.canceled
            })
          ) {
            return;
          }

          // Upload File to S3
          await putFileToS3({
            url,
            file: rawFile,
            headers,
            onUploadProgress: (e) => {
              if (!e.total) return;
              const percent = Math.round((e.loaded / e.total) * 100);
              updateFileByUploadId(uploadId, { process: percent, status: 1 });
            },
            signal: task.controller.signal,
            t,
            maxSize
          });

          // Update file url and key
          updateFileByUploadId(uploadId, {
            url: previewUrl,
            key,
            process: 100,
            status: 1
          });
        } catch (error) {
          if (isUploadAbortError(error) || task.canceled) {
            return;
          }

          toast({
            status: 'warning',
            title: t(
              getErrText(error, t('common:error.upload_file_error_filename', { name: file.name }))
            )
          });
          removeFileByUploadId(uploadId);
        } finally {
          cleanupUploadTask(uploadId, task);
        }
      })
    );
  }, [
    chatAuthTarget,
    chatId,
    cleanupUploadTask,
    fileSelectConfig,
    fileUploadMode,
    registerUploadTask,
    removeFileByUploadId,
    t,
    toast,
    updateFileByUploadId
  ]);

  const sortFileList = useMemo(() => {
    // Sort: Document/audio/video, image
    const sortResult = clone(fileList).sort((a, b) => {
      return Number(a.type === ChatFileTypeEnum.image) - Number(b.type === ChatFileTypeEnum.image);
    });
    return sortResult;
  }, [fileList]);

  return {
    File,
    onOpenSelectFile,
    fileList: sortFileList,
    onSelectFile,
    uploadFiles,
    selectFileIcon,
    selectFileLabel,
    showSelectFile,
    showSelectImg,
    showSelectVideo,
    showSelectAudio,
    showSelectCustomFileExtension,
    cancelUploadFile,
    clearFiles,
    replaceFiles,
    hasFileUploading
  };
};
