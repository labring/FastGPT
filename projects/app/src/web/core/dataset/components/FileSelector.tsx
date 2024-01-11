import MyBox from '@/components/common/MyBox';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@/web/common/hooks/useToast';
import { Box, Flex, FlexProps } from '@chakra-ui/react';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { DragEvent, useCallback, useState } from 'react';

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
  onSelectFile: (e: File[], sign?: any) => any;
} & FlexProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({
    fileType,
    multiple,
    maxCount
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      const fileList: File[] = [];

      if (e.dataTransfer.items.length <= 1) {
        const traverseFileTree = async (item: any) => {
          return new Promise<void>((resolve, reject) => {
            if (item.isFile) {
              item.file((file: File) => {
                fileList.push(file);
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

        for (let i = 0; i < items.length; i++) {
          const item = items[i].webkitGetAsEntry();
          if (item) {
            await traverseFileTree(item);
          }
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

        for (let i = 0; i < files.length; i++) {
          fileList.push(files[i]);
        }
      }

      onSelectFile(fileList.slice(0, maxCount));
    },
    [maxCount, onSelectFile, t, toast]
  );

  return (
    <MyBox
      isLoading={isDragging || isLoading}
      display={'flex'}
      flexDirection={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      px={3}
      py={[4, 7]}
      borderWidth={'1.5px'}
      borderStyle={'dashed'}
      borderColor={'borderColor.high'}
      borderRadius={'md'}
      cursor={'pointer'}
      _hover={{
        bg: 'primary.50',
        borderColor: 'primary.600'
      }}
      {...props}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onOpen}
    >
      <MyIcon name={'common/uploadFileFill'} w={'32px'} />
      <Box fontWeight={'bold'}>{t('common.file.Select and drag file tip')}</Box>
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

      <File onSelect={onSelectFile} />
    </MyBox>
  );
};

export default FileSelector;
