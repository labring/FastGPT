import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { Box, type FlexProps } from '@chakra-ui/react';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React, { type DragEvent, useCallback, useMemo, useState } from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type EvaluationFileItemType = {
  id: string;
  createStatus: string;
  file: File;
  sourceName: string;
  sourceSize: string;
  icon: string;
  isUploading: boolean;
  uploadedFileRate: number;
  dbFileId?: string;
  errorMsg?: string;
};

export type SelectFileItemType = {
  fileId: string;
  folderPath: string;
  file: File;
};

const FileSelector = ({
  fileType,
  selectFiles,
  onSelectFiles,
  ...props
}: {
  fileType: string;
  selectFiles: EvaluationFileItemType[];
  onSelectFiles: (e: SelectFileItemType[]) => any;
} & FlexProps) => {
  const { t } = useTranslation();

  const { toast } = useToast();
  const { feConfigs } = useSystemStore();

  const maxCount = 20;
  const maxSize = 100 * 1024 * 1024;

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

  const selectFileCallback = useCallback(
    (files: SelectFileItemType[]) => {
      if (selectFiles.length + files.length > maxCount) {
        files = files.slice(0, maxCount - selectFiles.length);
        toast({
          status: 'warning',
          title: t('file:some_file_count_exceeds_limit', { maxCount })
        });
      }
      // size check
      if (!maxSize) {
        return onSelectFiles(files);
      }
      const filterFiles = files.filter((item) => item.file.size <= maxSize);

      if (filterFiles.length < files.length) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      return onSelectFiles(filterFiles);
    },
    [t, maxCount, maxSize, onSelectFiles, selectFiles.length, toast]
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

    if (firstEntry?.isFile) {
      const files = Array.from(e.dataTransfer.files);

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
        title: t('file:upload_error_description'),
        status: 'error'
      });
    }

    selectFileCallback(fileList.slice(0, maxCount));
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
              ? t('file:release_the_mouse_to_upload_the_file')
              : t('file:select_and_drag_file_tip')}
          </Box>
          {/* file type */}
          <Box color={'myGray.500'} fontSize={'xs'}>
            {t('file:support_file_type', { fileType })}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'}>
            {/* max count */}
            {maxCount && t('file:support_max_count', { maxCount })}
            {/* max size */}
            {maxSize && t('file:support_max_size', { maxSize: formatFileSize(maxSize) })}
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
