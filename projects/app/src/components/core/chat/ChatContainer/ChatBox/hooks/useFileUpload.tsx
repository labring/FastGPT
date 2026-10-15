import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { isOfficeLockFilename } from '@fastgpt/global/common/file/utils';
import { clone } from 'lodash-es';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  type FieldArrayWithId,
  type UseFieldArrayReturn,
  type UseFormGetValues
} from 'react-hook-form';
import { type ChatBoxInputFormType, type UserInputFileItemType } from '../type';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { useFileUploadLimits } from '@/web/common/file/hooks/useFileUploadLimits';
import { useUserStore } from '@/web/support/user/useUserStore';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import {
  getUploadChatFilePresignedUrl,
  getUploadDraftChatFilePresignedUrl
} from '@/web/common/file/api';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import { S3FileUploader } from '@fastgpt/web/common/file/uploader';
import { getUploadChatFileType } from '../utils/file';
import { safeAbortController } from '../utils/generate';
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
import { getFileAmountLimit, getFileSizeLimitBytes } from '@fastgpt/global/core/workflow/fileLimit';

type UseFileUploadOptions = {
  fileSelectConfig: AppFileSelectConfigType;
  fileCtrl: UseFieldArrayReturn<ChatBoxInputFormType, 'files', 'id'>;
  getValues: UseFormGetValues<ChatBoxInputFormType>;

  outLinkAuthData?: OutLinkChatAuthProps;
  sourceTarget: ChatSourceTarget;
  chatId: string;
};

type UploadFileField = FieldArrayWithId<ChatBoxInputFormType, 'files', 'id'>;

type UploadTaskState = {
  readonly ownerKey: string;
  controller: AbortController;
  canceled: boolean;
  started: boolean;
  cancelRead?: () => void;
  key?: string;
};

/**
 * 选择文件时固定成员/会话归属，统一管理预览读取、待上传和上传中的任务。
 * 离开后取消全部未完成任务，并按实时表单中的任务 ID 移除文件，避免误删新会话已恢复的附件。
 */
export const useFileUpload = (props: UseFileUploadOptions) => {
  const { fileSelectConfig, fileCtrl, getValues, outLinkAuthData, sourceTarget, chatId } = props;
  const fileUploadMode = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploadMode);
  const chatAuthTarget = useChatAuthApiTarget({ sourceTarget, outLinkAuthData });
  const { userInfo } = useUserStore();
  const uploadOwnerKey = JSON.stringify([
    userInfo?.team?.tmbId,
    sourceTarget,
    chatId,
    outLinkAuthData?.shareId,
    outLinkAuthData?.outLinkUid
  ]);
  const uploadOwnerRef = useRef(uploadOwnerKey);
  const uploadMountedRef = useRef(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { maxUploadFileCount, maxUploadFileSize } = useFileUploadLimits();

  const {
    update: updateFiles,
    remove: removeFiles,
    fields: fileList,
    replace: replaceFiles,
    append: appendFiles
  } = fileCtrl;
  const uploadTasksRef = useRef(new Map<string, UploadTaskState>());

  useLayoutEffect(() => {
    uploadOwnerRef.current = uploadOwnerKey;
  }, [uploadOwnerKey]);

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
  // Query 模块配额与用户配额取更小值。
  const maxSelectFiles = getFileAmountLimit({
    moduleMaxFileAmount: fileSelectConfig?.maxFiles,
    systemMaxFileAmount: maxUploadFileCount
  });
  const maxSize = getFileSizeLimitBytes({
    systemMaxFileSize: maxUploadFileSize
  });
  const canSelectFileAmount = Math.max(maxSelectFiles - fileList.length, 0);

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

  const registerUploadTask = useCallback(
    (uploadId: string) => {
      const currentTask = uploadTasksRef.current.get(uploadId);
      if (currentTask) return currentTask;

      const task: UploadTaskState = {
        ownerKey: uploadOwnerKey,
        controller: new AbortController(),
        canceled: false,
        started: false
      };

      uploadTasksRef.current.set(uploadId, task);
      return task;
    },
    [uploadOwnerKey]
  );

  const cancelUploadTask = useCallback((uploadId: string) => {
    const task = uploadTasksRef.current.get(uploadId);
    if (!task) return;

    task.canceled = true;
    task.cancelRead?.();
    safeAbortController(task.controller);
  }, []);

  const cleanupUploadTask = useCallback((uploadId: string, task?: UploadTaskState) => {
    if (task && uploadTasksRef.current.get(uploadId) !== task) return;

    uploadTasksRef.current.delete(uploadId);
  }, []);

  const cancelAllUploadTasks = useCallback(() => {
    uploadTasksRef.current.forEach((task) => {
      task.canceled = true;
      task.cancelRead?.();
      safeAbortController(task.controller);
    });
    uploadTasksRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    uploadMountedRef.current = true;
    const tasks = uploadTasksRef.current;
    return () => {
      uploadMountedRef.current = false;
      const unfinishedIds = new Set(tasks.keys());
      cancelAllUploadTasks();

      // 新草稿可能已回填，不能使用旧列表的 index 清理，也不能删除已成功的附件。
      const currentFiles = getValues('files');
      const nextFiles = currentFiles.filter(
        (file) => file.url || !unfinishedIds.has(getFileUploadId(file))
      );
      if (nextFiles.length !== currentFiles.length) {
        replaceFiles(nextFiles);
      }
    };
  }, [uploadOwnerKey, cancelAllUploadTasks, getValues, replaceFiles]);

  /**
   * 按当前 field array 状态安全写回上传结果。
   *
   * 上传进度和结果可能在用户删除文件后才返回，因此每次写回前都必须重新定位并检查任务状态。
   */
  const updateFileByUploadId = useCallback(
    (uploadId: string, patch: Partial<UserInputFileItemType>) => {
      const files = getValues('files');
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
      updateFiles(fileIndex, nextFile);

      return true;
    },
    [getValues, updateFiles]
  );

  const removeFileByUploadId = useCallback(
    (uploadId: string) => {
      const files = getValues('files');
      const fileIndex = findFileIndexByUploadId(files, uploadId);
      if (fileIndex === -1) return false;

      removeFiles(fileIndex);

      return true;
    },
    [getValues, removeFiles]
  );

  const cancelUploadFile = useCallback(
    (uploadId: string) => {
      cancelUploadTask(uploadId);
      removeFileByUploadId(uploadId);
      cleanupUploadTask(uploadId);
    },
    [cancelUploadTask, removeFileByUploadId, cleanupUploadTask]
  );

  const clearFiles = useCallback(() => {
    cancelAllUploadTasks();
    replaceFiles([]);
  }, [cancelAllUploadTasks, replaceFiles]);

  const onSelectFile = useCallback(
    async ({ files }: { files: File[] }) => {
      if (!uploadMountedRef.current || uploadOwnerRef.current !== uploadOwnerKey) return [];
      if (!files || files.length === 0) {
        return [];
      }

      // 选择器之外的调用入口也按当前列表重新计算，避免并发选择或配额下调后超限。
      const remainingFileAmount = Math.max(maxSelectFiles - getValues('files').length, 0);
      if (files.length > remainingFileAmount) {
        files = files.slice(0, remainingFileAmount);
        toast({
          status: 'warning',
          title: t('file:some_file_count_exceeds_limit', { maxCount: maxSelectFiles })
        });
      }

      if (files.length === 0) return [];

      const hasEmptyFile = files.some((file) => file.size <= 0);
      const hasLockFile = files.some((file) => isOfficeLockFilename(file.name));
      files = files.filter((file) => file.size > 0 && !isOfficeLockFilename(file.name));
      if (hasEmptyFile) {
        toast({
          status: 'warning',
          title: t('common:empty_file')
        });
      }
      if (hasLockFile) {
        toast({
          status: 'warning',
          title: t('common:error.s3_upload_invalid_file_type')
        });
      }
      if (files.length === 0) return [];

      // Filter files by max size
      const filterFilesByMaxSize = files.filter((file) => file.size <= maxSize);
      if (filterFilesByMaxSize.length < files.length) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      // 读取预览前就登记归属；取消状态属于这次任务，切走再切回也不能复活。
      const selectedFiles = filterFilesByMaxSize.map((file) => {
        const uploadId = createUploadId();
        return { file, id: getNanoid(6), uploadId, task: registerUploadTask(uploadId) };
      });
      const loadFiles = await Promise.all(
        selectedFiles.map(
          ({ file, id, uploadId, task }) =>
            new Promise<UserInputFileItemType | undefined>((resolve, reject) => {
              const chatFileType = getUploadChatFileType(file);
              if (chatFileType === ChatFileTypeEnum.image) {
                const reader = new FileReader();
                const cleanupRead = () => {
                  task.cancelRead = undefined;
                  reader.onload = null;
                  reader.onerror = null;
                  reader.onabort = null;
                };
                reader.onload = () => {
                  cleanupRead();
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
                  cleanupRead();
                  reject(reader.error);
                };
                reader.onabort = () => {
                  cleanupRead();
                  resolve(undefined);
                };
                task.cancelRead = () => {
                  // 即使读取已完成、load 事件尚未派发，取消也必须结束 Promise.all 的等待。
                  cleanupRead();
                  resolve(undefined);
                  reader.abort();
                };
                reader.readAsDataURL(file);
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
      ).catch((error) => {
        selectedFiles.forEach(({ uploadId, task }) => {
          cancelUploadTask(uploadId);
          cleanupUploadTask(uploadId, task);
        });
        throw error;
      });

      // FileReader 完成时可能已经切换会话，旧文件不能追加到新会话的输入列表。
      if (!uploadMountedRef.current || uploadOwnerRef.current !== uploadOwnerKey) return [];
      const ownedFiles = selectedFiles.flatMap(({ uploadId, task }, index) => {
        const file = loadFiles[index];
        if (!file || task.canceled) {
          cleanupUploadTask(uploadId, task);
          return [];
        }
        return [file];
      });
      if (ownedFiles.length > 0) appendFiles(ownedFiles);

      return ownedFiles;
    },
    [
      maxSelectFiles,
      appendFiles,
      toast,
      t,
      maxSize,
      uploadOwnerKey,
      getValues,
      registerUploadTask,
      cancelUploadTask,
      cleanupUploadTask
    ]
  );

  const uploadFiles = useCallback(async () => {
    if (!uploadMountedRef.current || uploadOwnerRef.current !== uploadOwnerKey) return;
    // 切换清理先更新表单，field array 的旧渲染快照不能被新会话重新认领。
    const filterFiles = getValues('files').filter((item) => item.status === 0 && item.rawFile);

    if (filterFiles.length === 0) return;

    await Promise.allSettled(
      filterFiles.map(async (file) => {
        const rawFile = file.rawFile;
        if (!rawFile) return;

        const uploadId = getFileUploadId(file);
        const task = registerUploadTask(uploadId);
        if (task.started || task.canceled || task.ownerKey !== uploadOwnerKey) return;
        task.started = true;
        // 进度与完成回调均归属于发起上传的会话，而不是回调执行时的当前表单。
        const updateOwnedFile = (patch: Partial<UserInputFileItemType>) =>
          uploadOwnerRef.current === uploadOwnerKey &&
          !task.canceled &&
          updateFileByUploadId(uploadId, patch);

        try {
          if (!updateOwnedFile({ status: 1, process: file.process ?? 0 })) {
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
          const uploadResult =
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
          const { key, previewUrl } = uploadResult;

          task.key = key;
          const uploader = new S3FileUploader({
            ...uploadResult,
            file: rawFile,
            onProgress: (loaded, total) => {
              if (!total) return;
              const percent = Math.round((loaded / total) * 100);
              updateOwnedFile({ process: percent, status: 1 });
            },
            signal: task.controller.signal,
            t
          });
          if (
            !canApplyUploadResult({
              files: getValues('files'),
              uploadId,
              canceled: task.canceled
            })
          ) {
            await uploader.abort();
            return;
          }

          // Upload File to S3
          await uploader.upload();

          // Update file url and key
          updateOwnedFile({
            url: previewUrl,
            key,
            process: 100,
            status: 1
          });
        } catch (error) {
          if (
            isUploadAbortError(error) ||
            task.canceled ||
            uploadOwnerRef.current !== uploadOwnerKey
          ) {
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
    uploadOwnerKey,
    getValues,
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
