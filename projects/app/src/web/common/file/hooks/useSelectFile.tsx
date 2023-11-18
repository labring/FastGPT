import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { useToast } from '@/web/common/hooks/useToast';
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

  const File = useCallback(
    ({ onSelect }: { onSelect: (e: File[]) => void }) => (
      <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input
          ref={SelectFileDom}
          type="file"
          accept={fileType}
          multiple={multiple}
          onChange={(e) => {
            if (!e.target.files || e.target.files?.length === 0) return;
            if (e.target.files.length > maxCount) {
              return toast({
                status: 'warning',
                title: t('file.Select a maximum of 10 files')
              });
            }
            onSelect(Array.from(e.target.files));
          }}
        />
      </Box>
    ),
    [fileType, maxCount, multiple, t, toast]
  );

  const onOpen = useCallback(() => {
    SelectFileDom.current && SelectFileDom.current.click();
  }, []);

  return {
    File,
    onOpen
  };
};
