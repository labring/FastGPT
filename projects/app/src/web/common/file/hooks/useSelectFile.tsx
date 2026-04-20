import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

export const useSelectFile = (props?: {
  fileType?: string;
  multiple?: boolean;
  maxCount?: number;
}) => {
  const { t } = useTranslation();
  const { fileType = '*', multiple = false, maxCount = 10 } = props || {};
  const { toast } = useToast();
  const SelectFileDom = useRef<HTMLInputElement>(null);
  const openSign = useRef<any>();

  // 不用 useMemoizedFn：其稳定引用会让部分浏览器（尤其 macOS/WebKit）在 accept 变更后仍沿用旧 <input>。
  // key 强制在 fileType/multiple/maxCount 变化时重建 input，保证系统文件选择器读到最新 accept。
  const inputMountKey = `${fileType}__${multiple}__${maxCount}`;

  const File = useCallback(
    ({ onSelect }: { onSelect: (e: File[], sign?: any) => void }) => (
      <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input
          key={inputMountKey}
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
            onSelect(fileList, openSign.current);

            e.target.value = '';
          }}
        />
      </Box>
    ),
    [fileType, multiple, maxCount, t, toast]
  );

  const onOpen = useCallback((sign?: any) => {
    openSign.current = sign;
    SelectFileDom.current && SelectFileDom.current.click();
  }, []);

  return {
    File,
    onOpen
  };
};
