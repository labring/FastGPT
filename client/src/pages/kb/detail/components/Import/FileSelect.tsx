import React from 'react';
import { Box, Flex, type BoxProps } from '@chakra-ui/react';
import { useLoading } from '@/hooks/useLoading';
import { useSelectFile } from '@/hooks/useSelectFile';

import MyIcon from '@/components/Icon';

interface Props extends BoxProps {
  fileExtension: string;
  tipText?: string;
  onSelectFile: (files: File[]) => Promise<void>;
  isLoading?: boolean;
}

const FileSelect = ({ fileExtension, onSelectFile, isLoading, tipText, ...props }: Props) => {
  const { Loading: FileSelectLoading } = useLoading();

  const { File, onOpen } = useSelectFile({
    fileType: fileExtension,
    multiple: true
  });

  return (
    <Box
      display={'inline-block'}
      textAlign={'center'}
      bg={'myWhite.400'}
      p={5}
      borderRadius={'lg'}
      border={'1px dashed'}
      borderColor={'myGray.300'}
      w={'100%'}
      position={'relative'}
      {...props}
    >
      <Flex justifyContent={'center'} alignItems={'center'}>
        <MyIcon mr={1} name={'uploadFile'} w={'16px'} />
        {/* 拖拽文件至此，或{' '} */}
        点击
        <Box ml={1} as={'span'} cursor={'pointer'} color={'myBlue.700'} onClick={onOpen}>
          选择文件
        </Box>
      </Flex>
      <Box mt={1}>支持 {fileExtension} 文件</Box>
      {tipText && (
        <Box mt={1} fontSize={'sm'} color={'myGray.600'}>
          {tipText}
        </Box>
      )}
      <FileSelectLoading loading={isLoading} fixed={false} />
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default FileSelect;
