import MyBox from '@fastgpt/web/components/common/MyBox';
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
import { useI18n } from '@/web/context/I18n';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

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
  const { fileT } = useI18n();

  const { toast } = useToast();
  const { feConfigs } = useSystemStore();

  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
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
              const { fileId: uploadFileId } = await uploadFile2DB({
                file,
                bucketName: BucketNameEnum.dataset,
                data: {
                  datasetId
                },
                percentListen: (e) => {
                  setSelectFiles((state) =>
                    state.map((item) =>
                      item.id === fileId
                        ? {
                            ...item,
                            uploadedFileRate: item.uploadedFileRate
                              ? Math.max(e, item.uploadedFileRate)
                              : e
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
                        isUploading: false,
                        uploadedFileRate: 100
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
          title: fileT('some_file_count_exceeds_limit', { maxCount })
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
          title: fileT('some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      return onSelectFile(filterFiles);
    },
    [fileT, maxCount, maxSize, onSelectFile, selectFiles.length, toast]
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

    const firstEntry = items[0].webkitGetAsEntry();

    if (firstEntry?.isDirectory && items.length === 1) {
      {
        const readFile = (entry: any) => {
          return new Promise((resolve) => {
            entry.file((file: File) => {
              const folderPath = (entry.fullPath || '').split('/').slice(2, -1).join('/');

              if (filterTypeReg.test(file.name)) {
                fileList.push({
                  fileId: getNanoid(),
                  folderPath,
                  file
                });
              }
              resolve(file);
            });
          });
        };
        const traverseFileTree = (dirReader: any) => {
          return new Promise((resolve) => {
            let fileNum = 0;
            dirReader.readEntries(async (entries: any[]) => {
              for await (const entry of entries) {
                if (entry.isFile) {
                  await readFile(entry);
                  fileNum++;
                } else if (entry.isDirectory) {
                  await traverseFileTree(entry.createReader());
                }
              }

              // chrome: readEntries will return 100 entries at most
              if (fileNum === 100) {
                await traverseFileTree(dirReader);
              }
              resolve('');
            });
          });
        };

        for await (const item of items) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isFile) {
              await readFile(entry);
            } else if (entry.isDirectory) {
              //@ts-ignore
              await traverseFileTree(entry.createReader());
            }
          }
        }
      }
    } else if (firstEntry?.isFile) {
      const files = Array.from(e.dataTransfer.files);
      let isErr = files.some((item) => item.type === '');
      if (isErr) {
        return toast({
          title: t('file:upload_error_description'),
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
    } else {
      return toast({
        title: fileT('upload_error_description'),
        status: 'error'
      });
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
            {t('file:reached_max_file_count')}
          </Box>
        </>
      ) : (
        <>
          <Box fontWeight={'bold'}>
            {isDragging
              ? fileT('release_the_mouse_to_upload_the_file')
              : fileT('select_and_drag_file_tip')}
          </Box>
          {/* file type */}
          <Box color={'myGray.500'} fontSize={'xs'}>
            {fileT('support_file_type', { fileType })}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'}>
            {/* max count */}
            {maxCount && fileT('support_max_count', { maxCount })}
            {/* max size */}
            {maxSize && fileT('support_max_size', { maxSize: formatFileSize(maxSize) })}
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
