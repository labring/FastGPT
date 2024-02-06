import MyBox from '@/components/common/MyBox';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { Box, FlexProps } from '@chakra-ui/react';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { DragEvent, useCallback, useState } from 'react';

export type SelectFileItemType = {
  folderPath: string;
  file: File;
};

const FileSelector = ({
  fileType,
  multiple,
  maxCount,
  maxSize,
  isLoading,
  onSelectFile,
  ...props
}: {
  fileType: string;
  multiple?: boolean;
  maxCount?: number;
  maxSize?: number;
  isLoading?: boolean;
  onSelectFile: (e: SelectFileItemType[]) => any;
} & FlexProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({
    fileType,
    multiple,
    maxCount
  });
  const [isDragging, setIsDragging] = useState(false);

  const filterTypeReg = new RegExp(
    `(${fileType
      .split(',')
      .map((item) => item.trim())
      .join('|')})$`,
    'i'
  );

  const selectFileCallback = useCallback(
    (files: SelectFileItemType[]) => {
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
    [maxSize, onSelectFile, t, toast]
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
      cursor={'pointer'}
      _hover={{
        bg: 'primary.50',
        borderColor: 'primary.600'
      }}
      {...(isDragging
        ? {
            borderColor: 'primary.600'
          }
        : {
            borderColor: 'borderColor.high'
          })}
      {...props}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onOpen}
    >
      <MyIcon name={'common/uploadFileFill'} w={'32px'} />
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
              folderPath: '',
              file
            }))
          )
        }
      />
    </MyBox>
  );
};

export default React.memo(FileSelector);
