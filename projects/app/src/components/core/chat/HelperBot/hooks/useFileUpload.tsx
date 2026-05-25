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
import type { ChatBoxInputFormType, UserInputFileItemType } from '../../ChatContainer/ChatBox/type';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import type { HelperBotTypeEnumType } from '@fastgpt/global/core/chat/helperBot/type';
import { getHelperBotFilePresign } from '../api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { getUploadChatFileType } from '../../ChatContainer/ChatBox/utils/file';

type UseFileUploadOptions = {
  fileSelectConfig?: AppFileSelectConfigType;
  fileCtrl: UseFieldArrayReturn<ChatBoxInputFormType, 'files', 'id'>;

  type: HelperBotTypeEnumType;
  chatId: string;
};

export const useFileUpload = (props: UseFileUploadOptions) => {
  const { fileSelectConfig, fileCtrl, type, chatId } = props;
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
              const chatFileType = getUploadChatFileType(file);
              if (chatFileType === ChatFileTypeEnum.image) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item: UserInputFileItemType = {
                    id: getNanoid(6),
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
                  id: getNanoid(6),
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
    const filterFiles = fileList.filter((item) => item.status === 0);

    if (filterFiles.length === 0) return;

    replaceFiles(fileList.map((item) => ({ ...item, status: 1 })));
    const errorFileIndex: number[] = [];

    await Promise.allSettled(
      filterFiles.map(async (file) => {
        const copyFile = clone(file);
        copyFile.status = 1;
        if (!copyFile.rawFile) return;

        try {
          const fileIndex = fileList.findIndex((item) => item.id === file.id)!;

          // Get Upload Post Presigned URL
          const { url, key, headers, maxSize, previewUrl } = await getHelperBotFilePresign({
            type,
            chatId,
            filename: copyFile.rawFile.name
          });

          // Upload File to S3
          await putFileToS3({
            url,
            file: copyFile.rawFile,
            headers,
            onUploadProgress: (e) => {
              if (!e.total) return;
              const percent = Math.round((e.loaded / e.total) * 100);
              copyFile.process = percent;
              updateFiles(fileIndex, copyFile);
            },
            t,
            maxSize
          });

          // Update file url and key
          copyFile.url = previewUrl;
          copyFile.key = key;
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
  }, [chatId, fileList, removeFiles, replaceFiles, t, toast, type, updateFiles]);

  const sortFileList = useMemo(() => {
    // Sort: Document/audio/video, image
    const sortResult = clone(fileList).sort((a, b) => {
      return Number(a.type === ChatFileTypeEnum.image) - Number(b.type === ChatFileTypeEnum.image);
    });
    return sortResult;
  }, [fileList]);

  // Upload files
  useRequest(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, type, chatId]
  });

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
