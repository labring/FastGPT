import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';

export const useSelectFile = (props?: { fileType?: string; multiple?: boolean }) => {
  const { fileType = '*', multiple = false } = props || {};
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
            onSelect(Array.from(e.target.files));
          }}
        />
      </Box>
    ),
    [fileType, multiple]
  );

  const onOpen = useCallback(() => {
    SelectFileDom.current && SelectFileDom.current.click();
  }, []);

  return {
    File,
    onOpen
  };
};
