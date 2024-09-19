import { useCallback, useMemo } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { uploadFile2DB } from '@/web/common/file/controller';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { clone } from 'lodash';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { Control, useFieldArray } from 'react-hook-form';
import { ChatBoxInputFormType, UserInputFileItemType } from '../type';
import { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';

interface UseFileUploadOptions {
  outLinkAuthData: any;
  chatId: string;
  fileSelectConfig: AppFileSelectConfigType;
  control: Control<ChatBoxInputFormType, any>;
}

export const useFileUpload = (props: UseFileUploadOptions) => {
  const { outLinkAuthData, chatId, fileSelectConfig, control } = props;
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const {
    update: updateFiles,
    remove: removeFiles,
    fields: fileList,
    replace: replaceFiles
  } = useFieldArray({
    control: control,
    name: 'files'
  });

  const showSelectFile = fileSelectConfig?.canSelectFile;
  const showSelectImg = fileSelectConfig?.canSelectImg;
  const maxSelectFiles = fileSelectConfig?.maxFiles ?? 10;
  const maxSize = (feConfigs?.uploadFileMaxSize || 1024) * 1024 * 1024; // nkb

  const { icon: selectFileIcon, label: selectFileLabel } = useMemo(() => {
    if (showSelectFile && showSelectImg) {
      return {
        icon: 'core/chat/fileSelect',
        label: t('chat:select_file_img')
      };
    } else if (showSelectFile) {
      return {
        icon: 'core/chat/fileSelect',
        label: t('chat:select_file')
      };
    } else if (showSelectImg) {
      return {
        icon: 'core/chat/imgSelect',
        label: t('chat:select_img')
      };
    }
    return {};
  }, [showSelectFile, showSelectImg, t]);

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: `${showSelectImg ? 'image/*,' : ''} ${showSelectFile ? documentFileType : ''}`,
    multiple: true,
    maxCount: maxSelectFiles
  });

  const onSelectFile = useCallback(
    async ({ files, fileList }: { files: File[]; fileList: UserInputFileItemType[] }) => {
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

      // Document, image
      const concatFileList = clone(
        fileList.concat(loadFiles).sort((a, b) => {
          if (a.type === ChatFileTypeEnum.image && b.type === ChatFileTypeEnum.file) {
            return 1;
          } else if (a.type === ChatFileTypeEnum.file && b.type === ChatFileTypeEnum.image) {
            return -1;
          }
          return 0;
        })
      );
      replaceFiles(concatFileList);

      return loadFiles;
    },
    [maxSelectFiles, replaceFiles, toast, t, maxSize]
  );

  const uploadFiles = async () => {
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

          // Start upload and update process
          const { previewUrl } = await uploadFile2DB({
            file: copyFile.rawFile,
            bucketName: 'chat',
            outLinkAuthData,
            metadata: {
              chatId
            },
            percentListen(e) {
              copyFile.process = e;
              if (!copyFile.url) {
                updateFiles(fileIndex, copyFile);
              }
            }
          });

          // Update file url
          copyFile.url = `${location.origin}${previewUrl}`;
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
  };

  return {
    File,
    onOpenSelectFile,
    fileList,
    onSelectFile,
    uploadFiles,
    selectFileIcon,
    selectFileLabel,
    showSelectFile,
    showSelectImg,
    removeFiles,
    replaceFiles
  };
};
