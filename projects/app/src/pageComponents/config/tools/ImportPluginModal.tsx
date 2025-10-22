import React, { useState, useCallback, type DragEvent } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSelectFile } from '@fastgpt/web/common/file/hooks/useSelectFile';
import { getNanoid } from '@fastgpt/global/common/string/tools';
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

  const maxCount = 100;
  const maxSize = 100 * 1024 * 1024;

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.pkg.gz',
    multiple: true,
    maxCount
  });

  const handleSelectFiles = useCallback(
    (files: File[]) => {
      // 文件数量检查
      if (uploadFiles.length + files.length > maxCount) {
        toast({
          status: 'warning',
          title: `最多支持 ${maxCount} 个文件`
        });
        files = files.slice(0, maxCount - uploadFiles.length);
      }

      // 文件大小检查
      const validFiles = files.filter((file) => {
        if (file.size > maxSize) {
          toast({
            status: 'warning',
            title: `文件 ${file.name} 超过 100MB`
          });
          return false;
        }
        return true;
      });

      // 添加到列表
      const newFiles: UploadPluginFile[] = validFiles.map((file) => ({
        id: getNanoid(),
        file,
        name: file.name,
        avatar: 'core/app/type/pluginFill',
        tags: ['工具'],
        intro: '这是一段介绍这是一段介绍这是一段介绍这是一段介绍...',
        status: 'parsing'
      }));

      setUploadFiles((prev) => [...prev, ...newFiles]);

      // TODO: 这里应该调用解析文件的 API
      // 模拟解析过程
      setTimeout(() => {
        setUploadFiles((prev) =>
          prev.map((f) =>
            newFiles.find((nf) => nf.id === f.id) ? { ...f, status: 'success' as const } : f
          )
        );
      }, 1000);
    },
    [uploadFiles.length, maxCount, maxSize, toast]
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((file) => file.name.endsWith('.pkg.gz'));

    if (files.length === 0) {
      toast({
        status: 'warning',
        title: '请上传 .pkg.gz 格式的文件'
      });
      return;
    }

    handleSelectFiles(files);
  };

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
          onDragEnter={handleDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={onOpenSelectFile}
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
      <File onSelect={handleSelectFiles} />
    </MyRightDrawer>
  );
};

export default ImportPluginModal;
