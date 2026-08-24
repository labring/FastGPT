/* eslint-disable react-hooks/preserve-manual-memoization -- File is exposed as a stable component and the native input key must follow upload config changes. */
import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';

export const useSelectFile = (props?: {
  fileType?: string;
  multiple?: boolean;
  maxCount?: number;
}) => {
  const { fileType = '*', multiple = false, maxCount = 10 } = props || {};
  const SelectFileDom = useRef<HTMLInputElement>(null);
  const openSign = useRef<any>();

  // 不用 useMemoizedFn：其稳定引用会让部分浏览器（尤其 macOS/WebKit）在 accept 变更后仍沿用旧 <input>。
  // key 强制在 fileType/multiple/maxCount 变化时重建 input，保证系统文件选择器读到最新 accept。

  // File 作为组件对外暴露，需要保持引用稳定；原生 input 的 key 负责随配置变化重建。
  const File = useCallback(
    ({ onSelect }: { onSelect: (e: File[], sign?: any) => void }) => (
      <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input
          key={`${fileType}__${multiple}__${maxCount}`}
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
    [fileType, multiple, maxCount]
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
