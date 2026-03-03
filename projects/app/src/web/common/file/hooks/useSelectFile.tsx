import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { formatFileSize } from '@fastgpt/global/common/file/tools';

export const useSelectFile = (props?: {
  fileType?: string;
  multiple?: boolean;
  maxCount?: number;
  maxSize?: number;
}) => {
  const { t } = useTranslation();
  const { fileType = '*', multiple = false, maxCount = 10, maxSize } = props || {};
  const { toast } = useToast();
  const SelectFileDom = useRef<HTMLInputElement>(null);
  const openSign = useRef<any>();

  const File = useMemoizedFn(({ onSelect }: { onSelect: (e: File[], sign?: any) => void }) => (
    <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
      <input
        ref={SelectFileDom}
        type="file"
        accept={fileType}
        multiple={multiple}
        onChange={(e) => {
          const files = e.target.files;

          if (!files || files?.length === 0) return;

          let fileList = Array.from(files);
          if (fileList.length > maxCount) {
            toast({
              status: 'warning',
              title: t('file:select_file_amount_limit', { max: maxCount })
            });
            fileList = fileList.slice(0, maxCount);
          }
          if (!maxSize) {
            onSelect(fileList, openSign.current);
          } else {
            const filterFiles = fileList.filter((item) => item.size <= maxSize);
            if (filterFiles.length < fileList.length) {
              toast({
                status: 'warning',
                title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
              });
            }
            onSelect(filterFiles, openSign.current);
          }

          e.target.value = '';
        }}
      />
    </Box>
  ));

  const onOpen = useCallback((sign?: any) => {
    openSign.current = sign;
    SelectFileDom.current && SelectFileDom.current.click();
  }, []);

  return {
    File,
    onOpen
  };
};
