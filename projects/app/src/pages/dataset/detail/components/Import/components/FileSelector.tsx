import MyBox from '@/components/common/MyBox';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { Box, FlexProps } from '@chakra-ui/react';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { DragEvent, useCallback, useMemo, useState } from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { uploadFile2DB } from '@/web/common/file/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { ImportSourceItemType } from '@/web/core/dataset/type';

export type SelectFileItemType = {
  fileId: string;
  folderPath: string;
  file: File;
};

const FileSelector = ({
  fileType,
  selectFiles,
  setSelectFiles,
  onStartSelect,
  onFinishSelect,
  ...props
}: {
  fileType: string;
  selectFiles: ImportSourceItemType[];
  setSelectFiles: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
  onStartSelect: () => void;
  onFinishSelect: () => void;
} & FlexProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();

  const maxCount = feConfigs?.uploadFileMaxAmount || 1000;
  const maxSize = (feConfigs?.uploadFileMaxSize || 1024) * 1024 * 1024;

  const { File, onOpen } = useSelectFile({
    fileType,
    multiple: true,
    maxCount
  });
  const [isDragging, setIsDragging] = useState(false);
  const isMaxSelected = useMemo(
    () => selectFiles.length >= maxCount,
    [maxCount, selectFiles.length]
  );

  const filterTypeReg = new RegExp(
    `(${fileType
      .split(',')
      .map((item) => item.trim())
      .join('|')})$`,
    'i'
  );

  const { mutate: onSelectFile, isLoading } = useRequest({
    mutationFn: async (files: SelectFileItemType[]) => {
      {
        onStartSelect();
        setSelectFiles((state) => {
          const formatFiles = files.map<ImportSourceItemType>((selectFile) => {
            const { fileId, file } = selectFile;

            return {
              id: fileId,
              createStatus: 'waiting',
              file,
              sourceName: file.name,
              sourceSize: formatFileSize(file.size),
              icon: getFileIcon(file.name),
              isUploading: true,
              uploadedFileRate: 0
            };
          });
          const results = formatFiles.concat(state).slice(0, maxCount);
          return results;
        });
        try {
          // upload file
          await Promise.all(
            files.map(async ({ fileId, file }) => {
              const uploadFileId = await uploadFile2DB({
                file,
                bucketName: BucketNameEnum.dataset,
                percentListen: (e) => {
                  setSelectFiles((state) =>
                    state.map((item) =>
                      item.id === fileId
                        ? {
                            ...item,
                            uploadedFileRate: e
                          }
                        : item
                    )
                  );
                }
              });
              setSelectFiles((state) =>
                state.map((item) =>
                  item.id === fileId
                    ? {
                        ...item,
                        dbFileId: uploadFileId,
                        isUploading: false
                      }
                    : item
                )
              );
            })
          );
        } catch (error) {
          console.log(error);
        }
        onFinishSelect();
      }
    }
  });

  const selectFileCallback = useCallback(
    (files: SelectFileItemType[]) => {
      if (selectFiles.length + files.length > maxCount) {
        files = files.slice(0, maxCount - selectFiles.length);
        toast({
          status: 'warning',
          title: t('common.file.Some file count exceeds limit', { maxCount })
        });
      }
      // size check
      if (!maxSize) {
        return onSelectFile(files);
      }
      const filterFiles = files.filter((item) => item.file.size <= maxSize);

      if (filterFiles.length < files.length) {
        toast({
          status: 'warning',
          title: t('common.file.Some file size exceeds limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      return onSelectFile(filterFiles);
    },
    [maxCount, maxSize, onSelectFile, selectFiles.length, t, toast]
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const fileList: SelectFileItemType[] = [];

    if (e.dataTransfer.items.length <= 1) {
      const traverseFileTree = async (item: any) => {
        return new Promise<void>((resolve, reject) => {
          if (item.isFile) {
            item.file((file: File) => {
              const folderPath = (item.fullPath || '').split('/').slice(2, -1).join('/');

              if (filterTypeReg.test(file.name)) {
                fileList.push({
                  fileId: getNanoid(),
                  folderPath,
                  file
                });
              }
              resolve();
            });
          } else if (item.isDirectory) {
            const dirReader = item.createReader();
            dirReader.readEntries(async (entries: any[]) => {
              for (let i = 0; i < entries.length; i++) {
                await traverseFileTree(entries[i]);
              }
              resolve();
            });
          }
        });
      };

      for await (const item of items) {
        await traverseFileTree(item.webkitGetAsEntry());
      }
    } else {
      const files = Array.from(e.dataTransfer.files);
      let isErr = files.some((item) => item.type === '');
      if (isErr) {
        return toast({
          title: t('file.upload error description'),
          status: 'error'
        });
      }

      fileList.push(
        ...files
          .filter((item) => filterTypeReg.test(item.name))
          .map((file) => ({
            fileId: getNanoid(),
            folderPath: '',
            file
          }))
      );
    }

    selectFileCallback(fileList.slice(0, maxCount));
  };

  return (
    <MyBox
      isLoading={isLoading}
      display={'flex'}
      flexDirection={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      px={3}
      py={[4, 7]}
      borderWidth={'1.5px'}
      borderStyle={'dashed'}
      borderRadius={'md'}
      {...(isMaxSelected
        ? {}
        : {
            cursor: 'pointer',
            _hover: {
              bg: 'primary.50',
              borderColor: 'primary.600'
            },
            borderColor: isDragging ? 'primary.600' : 'borderColor.high',
            onDragEnter: handleDragEnter,
            onDragOver: (e) => e.preventDefault(),
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
            onClick: onOpen
          })}
      {...props}
    >
      <MyIcon name={'common/uploadFileFill'} w={'32px'} />
      {isMaxSelected ? (
        <>
          <Box color={'myGray.500'} fontSize={'xs'}>
            已达到最大文件数量
          </Box>
        </>
      ) : (
        <>
          <Box fontWeight={'bold'}>
            {isDragging
              ? t('file.Release the mouse to upload the file')
              : t('common.file.Select and drag file tip')}
          </Box>
          {/* file type */}
          <Box color={'myGray.500'} fontSize={'xs'}>
            {t('common.file.Support file type', { fileType })}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'}>
            {/* max count */}
            {maxCount && t('common.file.Support max count', { maxCount })}
            {/* max size */}
            {maxSize && t('common.file.Support max size', { maxSize: formatFileSize(maxSize) })}
          </Box>

          <File
            onSelect={(files) =>
              selectFileCallback(
                files.map((file) => ({
                  fileId: getNanoid(),
                  folderPath: '',
                  file
                }))
              )
            }
          />
        </>
      )}
    </MyBox>
  );
};

export default React.memo(FileSelector);
