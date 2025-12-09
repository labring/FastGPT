import { useCallback, useMemo } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { clone } from 'lodash';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type UseFieldArrayReturn } from 'react-hook-form';
import { type ChatBoxInputFormType, type UserInputFileItemType } from '../type';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getPresignedChatFileGetUrl, getUploadChatFilePresignedUrl } from '@/web/common/file/api';
import { POST } from '@/web/common/api/request';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import { parseS3UploadError } from '@fastgpt/global/common/error/s3';

type UseFileUploadOptions = {
  fileSelectConfig: AppFileSelectConfigType;
  fileCtrl: UseFieldArrayReturn<ChatBoxInputFormType, 'files', 'id'>;

  outLinkAuthData?: OutLinkChatAuthProps;
  appId: string;
  chatId: string;
};

export const useFileUpload = (props: UseFileUploadOptions) => {
  const { fileSelectConfig, fileCtrl, outLinkAuthData, appId, chatId } = props;
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const {
    update: updateFiles,
    remove: removeFiles,
    fields: fileList,
    replace: replaceFiles,
    append: appendFiles
  } = fileCtrl;
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
  const maxSelectFiles = fileSelectConfig?.maxFiles ?? 10;
  const maxSize = (feConfigs?.uploadFileMaxSize || 1024) * 1024 * 1024; // nkb
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
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item: UserInputFileItemType = {
                    id: getNanoid(6),
                    rawFile: file,
                    type: ChatFileTypeEnum.image,
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
                  id: getNanoid(6),
                  rawFile: file,
                  type: ChatFileTypeEnum.file,
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
    const filterFiles = fileList.filter((item) => item.status === 0);

    if (filterFiles.length === 0) return;

    replaceFiles(fileList.map((item) => ({ ...item, status: 1 })));
    let errorFileIndex: number[] = [];

    await Promise.allSettled(
      filterFiles.map(async (file) => {
        const copyFile = clone(file);
        copyFile.status = 1;
        if (!copyFile.rawFile) return;

        try {
          const fileIndex = fileList.findIndex((item) => item.id === file.id)!;

          // Get Upload Post Presigned URL
          const { url, fields, maxSize } = await getUploadChatFilePresignedUrl({
            filename: copyFile.rawFile.name,
            appId,
            chatId,
            outLinkAuthData
          });

          // Upload File to S3
          const formData = new FormData();
          Object.entries(fields).forEach(([k, v]) => formData.set(k, v));
          formData.set('file', copyFile.rawFile);
          await POST(url, formData, {
            onUploadProgress: (e) => {
              if (!e.total) return;
              const percent = Math.round((e.loaded / e.total) * 100);
              copyFile.process = percent;
              updateFiles(fileIndex, copyFile);
            },
            timeout: 5 * 60 * 1000 // 5 minutes
          }).catch((error) => Promise.reject(parseS3UploadError({ t, error, maxSize })));

          const previewUrl = await getPresignedChatFileGetUrl({
            key: fields.key,
            appId,
            outLinkAuthData
          });

          // Update file url and key
          copyFile.url = previewUrl;
          copyFile.key = fields.key;
          updateFiles(fileIndex, copyFile);
        } catch (error) {
          errorFileIndex.push(fileList.findIndex((item) => item.id === file.id)!);
          toast({
            status: 'warning',
            title: t(
              getErrText(error, t('common:error.upload_file_error_filename', { name: file.name }))
            )
          });
        }
      })
    );

    removeFiles(errorFileIndex);
  }, [appId, chatId, fileList, outLinkAuthData, removeFiles, replaceFiles, t, toast, updateFiles]);

  const sortFileList = useMemo(() => {
    // Sort: Document, image
    const sortResult = clone(fileList).sort((a, b) => {
      if (a.type === ChatFileTypeEnum.image && b.type === ChatFileTypeEnum.file) {
        return 1;
      } else if (a.type === ChatFileTypeEnum.file && b.type === ChatFileTypeEnum.image) {
        return -1;
      }
      return 0;
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
    removeFiles,
    replaceFiles,
    hasFileUploading
  };
};
