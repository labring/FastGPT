import React, { useState } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';

type UploadPluginFile = {
  id: string;
  file: File;
  name: string;
  avatar?: string;
  tags: string[];
  intro: string;
  status: 'parsing' | 'error' | 'duplicate' | 'uploading' | 'success';
  errorMsg?: string;
};

const ImportPluginModal = ({ onClose }: { onClose: () => void }) => {
  const { toast } = useToast();
  const [uploadFiles, setUploadFiles] = useState<UploadPluginFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <MyRightDrawer onClose={onClose} title="导入/更新资源" maxW={['90vw', '1054px']}>
      <Flex flex={1} flexDirection={'column'} px={4}>
        <Flex justify={'flex-end'} mb={3}>
          <Button
            variant={'link'}
            size={'sm'}
            leftIcon={<MyIcon name={'book'} w={'14px'} />}
            color={'primary.600'}
          >
            使用说明
          </Button>
        </Flex>

        <MyBox
          display={'flex'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
          px={3}
          py={7}
          borderWidth={'1.5px'}
          borderStyle={'dashed'}
          borderRadius={'md'}
          borderColor={isDragging ? 'primary.600' : 'borderColor.high'}
          bg={isDragging ? 'primary.50' : 'white'}
          cursor={'pointer'}
          _hover={{
            bg: 'primary.50',
            borderColor: 'primary.600'
          }}
        >
          <MyIcon name={'common/uploadFileFill'} w={'32px'} />
          <Box fontWeight={'bold'} mt={2}>
            {isDragging ? '松开鼠标上传文件' : '点击或拖拽文件到此上传'}
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'} mt={1}>
            仅支持 .pkg.gz 文件，最多支持 100 个文件，单个文件最大 100MB
          </Box>
        </MyBox>
      </Flex>
      <Flex mt={4} p={4} justify={'flex-end'}>
        <Button isDisabled={uploadFiles.length === 0}>确认导入</Button>
      </Flex>
    </MyRightDrawer>
  );
};

export default ImportPluginModal;
