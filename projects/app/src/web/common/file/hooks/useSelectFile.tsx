import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useI18n } from '@/web/context/I18n';
import { useMemoizedFn } from 'ahooks';

export const useSelectFile = (props?: {
  fileType?: string;
  multiple?: boolean;
  maxCount?: number;
}) => {
  const { fileT } = useI18n();
  const { fileType = '*', multiple = false, maxCount = 10 } = props || {};
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
              title: fileT('select_file_amount_limit', { max: maxCount })
            });
            fileList = fileList.slice(0, maxCount);
          }
          onSelect(fileList, openSign.current);

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
