import React from 'react';
import { Box, Flex, type BoxProps } from '@chakra-ui/react';
import { useLoading } from '@/hooks/useLoading';
import { useSelectFile } from '@/hooks/useSelectFile';

import MyIcon from '@/components/Icon';
import { fileDownload } from '@/utils/file';

interface Props extends BoxProps {
  fileExtension: string;
  tipText?: string;
  onSelectFile: (files: File[]) => Promise<void>;
  isLoading?: boolean;
  isCsv?: boolean;
}

const FileSelect = ({
  fileExtension,
  onSelectFile,
  isLoading,
  tipText,
  isCsv = false,
  ...props
}: Props) => {
  const { Loading: FileSelectLoading } = useLoading();
  const csvTemplate = `question,answer,source\n"什么是 laf","laf 是一个云函数开发平台……","laf git doc"\n"什么是 sealos","Sealos 是以 kubernetes 为内核的云操作系统发行版,可以……","sealos git doc"`;

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
      {isCsv && (
        <Box
          mt={1}
          cursor={'pointer'}
          textDecoration={'underline'}
          color={'myBlue.600'}
          fontSize={'12px'}
          onClick={() =>
            fileDownload({
              text: csvTemplate,
              type: 'text/csv',
              filename: 'template.csv'
            })
          }
        >
          点击下载 CSV 模板
        </Box>
      )}
      <FileSelectLoading loading={isLoading} fixed={false} />
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default FileSelect;
