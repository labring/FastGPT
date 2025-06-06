import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { Box, type FlexProps } from '@chakra-ui/react';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { type DragEvent, useCallback, useMemo, useState } from 'react';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type SelectFileItemType = {
  file: File;
  icon: string;
  name: string;
  size: string;
};

const FileSelector = ({
  fileType,
  selectFiles,
  setSelectFiles,
  maxCount = 1000,
  maxSize,
  FileTypeNode,
  ...props
}: {
  fileType: string;
  selectFiles: SelectFileItemType[];
  setSelectFiles: (files: SelectFileItemType[]) => void;
  maxCount?: number;
  maxSize?: string;
  FileTypeNode?: React.ReactNode;
} & FlexProps) => {
  const { t } = useTranslation();

  const { toast } = useToast();
  const { feConfigs } = useSystemStore();

  const systemMaxSize = (feConfigs?.uploadFileMaxSize || 1024) * 1024 * 1024;
  const displayMaxSize = maxSize || formatFileSize(systemMaxSize);

  const { File, onOpen } = useSelectFile({
    fileType,
    multiple: maxCount > 1,
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

  const onSelectFile = useCallback(
    async (files: File[]) => {
      const fileList = files.map((file) => ({
        file,
        icon: getFileIcon(file.name),
        name: file.name,
        size: formatFileSize(file.size)
      }));

      const newFiles = [...fileList, ...selectFiles].slice(0, maxCount);
      setSelectFiles(newFiles);
    },
    [maxCount, selectFiles, setSelectFiles]
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

    const firstEntry = items[0].webkitGetAsEntry();

    if (firstEntry?.isDirectory && items.length === 1) {
      {
        const readFile = (entry: any) => {
          return new Promise((resolve) => {
            entry.file((file: File) => {
              if (filterTypeReg.test(file.name)) {
                onSelectFile([file]);
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

      onSelectFile(files.filter((item) => filterTypeReg.test(item.name)));
    } else {
      return toast({
        title: t('file:upload_error_description'),
        status: 'error'
      });
    }
  };

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      px={3}
      py={[4, 7]}
      borderWidth={'1.5px'}
      borderStyle={'dashed'}
      borderRadius={'md'}
      userSelect={'none'}
      {...(isMaxSelected
        ? {
            cursor: 'not-allowed'
          }
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
          <Box fontWeight={'500'} fontSize={'sm'}>
            {t('file:reached_max_file_count')}
          </Box>
        </>
      ) : (
        <>
          <Box fontWeight={'500'} fontSize={'sm'}>
            {isDragging
              ? t('file:release_the_mouse_to_upload_the_file')
              : t('file:select_and_drag_file_tip')}
          </Box>
          {/* file type, max count, max size */}
          <>
            {FileTypeNode ? (
              FileTypeNode
            ) : (
              <Box color={'myGray.500'} fontSize={'xs'}>
                {t('file:support_file_type', { fileType })}
              </Box>
            )}
            <Box color={'myGray.500'} fontSize={'xs'}>
              {/* max count */}
              {maxCount && <>{t('file:support_max_count', { maxCount })}, </>}
              {/* max size */}
              {t('file:support_max_size', { maxSize: displayMaxSize })}
            </Box>
          </>

          <File onSelect={(files) => onSelectFile(files)} />
        </>
      )}
    </MyBox>
  );
};

export default React.memo(FileSelector);
