/* eslint-disable react-hooks/preserve-manual-memoization -- File is exposed as a stable component. */
import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';

export const useSelectFile = (props?: {
  fileType?: string;
  multiple?: boolean;
  maxCount?: number;
}) => {
  const { fileType = '*', multiple = false } = props || {};
  const SelectFileDom = useRef<HTMLInputElement>(null);
  const openSign = useRef<any>();

  const File = useCallback(
    ({ onSelect }: { onSelect: (e: File[], sign?: any) => void }) => (
      <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input
          ref={SelectFileDom}
          type="file"
          accept={fileType}
          multiple={multiple}
          onChange={(e) => {
            const files = e.target.files;

            if (!files || files?.length === 0) return;

            const fileList = Array.from(files);
            onSelect(fileList, openSign.current);

            e.target.value = '';
          }}
        />
      </Box>
    ),
    [fileType, multiple]
  );

  const onOpen = useCallback((sign?: any) => {
    openSign.current = sign;
    SelectFileDom.current?.click();
  }, []);

  return {
    File,
    onOpen
  };
};
