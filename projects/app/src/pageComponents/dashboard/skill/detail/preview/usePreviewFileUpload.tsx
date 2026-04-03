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
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getPresignedChatFileGetUrl, getUploadChatFilePresignedUrl } from '@/web/common/file/api';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import type { PreviewInputFormType, UserInputFileItemType } from './type';

// 支持图片 + 文档，固定配置
const ACCEPTED_FILE_TYPE = 'image/*, .txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx';

type UsePreviewFileUploadOptions = {
  fileCtrl: UseFieldArrayReturn<PreviewInputFormType, 'files', 'id'>;
  appId: string;
  chatId: string; // TODO: 运行预览时生成或获取 chatId
};

export const usePreviewFileUpload = ({ fileCtrl, appId, chatId }: UsePreviewFileUploadOptions) => {
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

  const hasFileUploading = fileList.some((item) => !item.url);

  const maxSelectFiles =
    teamPlanStatus?.standard?.maxUploadFileCount || feConfigs?.uploadFileMaxAmount || 10;
  const maxSize =
    (teamPlanStatus?.standard?.maxUploadFileSize || feConfigs?.uploadFileMaxSize || 500) *
    1024 *
    1024;

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: ACCEPTED_FILE_TYPE,
    multiple: true,
    maxCount: maxSelectFiles - fileList.length
  });

  const onSelectFile = useCallback(
    async ({ files }: { files: File[] }) => {
      if (!files || files.length === 0) return [];

      let validFiles = files.slice(0, maxSelectFiles);
      if (files.length > maxSelectFiles) {
        toast({ status: 'warning', title: t('chat:file_amount_over', { max: maxSelectFiles }) });
      }

      validFiles = validFiles.filter((file) => file.size <= maxSize);
      if (validFiles.length < files.length) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      const loadFiles = await Promise.all(
        validFiles.map(
          (file) =>
            new Promise<UserInputFileItemType>((resolve, reject) => {
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () =>
                  resolve({
                    id: getNanoid(6),
                    rawFile: file,
                    type: ChatFileTypeEnum.image,
                    name: file.name,
                    icon: reader.result as string,
                    status: 0
                  });
                reader.onerror = () => reject(reader.error);
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
    [maxSelectFiles, maxSize, appendFiles, toast, t]
  );

  const uploadFiles = useCallback(async () => {
    const pendingFiles = fileList.filter((item) => item.status === 0);
    if (pendingFiles.length === 0) return;

    replaceFiles(fileList.map((item) => ({ ...item, status: 1 })));
    const errorIndexes: number[] = [];

    await Promise.allSettled(
      pendingFiles.map(async (file) => {
        const copyFile = clone(file);
        copyFile.status = 1;
        if (!copyFile.rawFile) return;

        try {
          const fileIndex = fileList.findIndex((item) => item.id === file.id);

          // TODO: 替换为 skill 运行预览专用的文件上传 API
          const {
            url,
            key,
            headers,
            maxSize: uploadMaxSize
          } = await getUploadChatFilePresignedUrl({
            filename: copyFile.rawFile.name,
            appId,
            chatId,
            outLinkAuthData: undefined
          });

          await putFileToS3({
            url,
            file: copyFile.rawFile,
            headers,
            onUploadProgress: (e) => {
              if (!e.total) return;
              copyFile.process = Math.round((e.loaded / e.total) * 100);
              updateFiles(fileIndex, copyFile);
            },
            t,
            maxSize: uploadMaxSize
          });

          // TODO: 替换为 skill 运行预览专用的文件预览 API
          const previewUrl = await getPresignedChatFileGetUrl({
            key,
            appId,
            outLinkAuthData: undefined
          });
          copyFile.url = previewUrl;
          copyFile.key = key;
          updateFiles(fileIndex, copyFile);
        } catch (error) {
          errorIndexes.push(fileList.findIndex((item) => item.id === file.id));
          toast({
            status: 'warning',
            title: t(
              getErrText(error, t('common:error.upload_file_error_filename', { name: file.name }))
            )
          });
        }
      })
    );

    removeFiles(errorIndexes);
  }, [appId, chatId, fileList, removeFiles, replaceFiles, t, toast, updateFiles]);

  const sortFileList = useMemo(
    () =>
      clone(fileList).sort((a, b) => {
        if (a.type === ChatFileTypeEnum.image && b.type === ChatFileTypeEnum.file) return 1;
        if (a.type === ChatFileTypeEnum.file && b.type === ChatFileTypeEnum.image) return -1;
        return 0;
      }),
    [fileList]
  );

  return {
    File,
    onOpenSelectFile,
    fileList: sortFileList,
    onSelectFile,
    uploadFiles,
    removeFiles,
    replaceFiles,
    hasFileUploading,
    selectFileIcon: 'core/chat/fileSelect' as const,
    selectFileLabel: t('chat:select_file')
  };
};
