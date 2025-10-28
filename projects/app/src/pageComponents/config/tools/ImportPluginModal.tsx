import React, { useState, useEffect } from 'react';
import { Box, Button, Flex, HStack, VStack } from '@chakra-ui/react';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import FileSelectorBox, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import { postS3UploadFile } from '@/web/common/file/api';
import {
  getPluginUploadURL,
  parseUploadedPlugin,
  confirmPluginUpload
} from '@/web/core/app/api/plugin';

type UploadedPluginFile = SelectFileItemType & {
  status: 'uploading' | 'parsing' | 'success' | 'error';
  errorMsg?: string;
  toolId?: string; // 解析后的 toolId
};

const ImportPluginModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPluginFile[]>([]);

  // 步骤1: 上传并解析单个文件
  const uploadAndParseFile = async (file: SelectFileItemType, fileIndex: number) => {
    const uploadedFile: UploadedPluginFile = {
      ...file,
      status: 'uploading'
    };

    // 添加到上传列表
    setUploadedFiles((prev) => [...prev, uploadedFile]);

    try {
      // 获取预签名上传 URL
      const presignedData = await getPluginUploadURL({ filename: file.name });

      // 上传文件到 S3
      const formData = new FormData();
      Object.entries(presignedData.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file.file);

      await postS3UploadFile(presignedData.postURL, formData);

      // 更新状态为解析中
      setUploadedFiles((prev) =>
        prev.map((f, i) => (i === fileIndex ? { ...f, status: 'parsing' } : f))
      );

      // 解析上传的插件
      const parseResult = await parseUploadedPlugin({ objectName: presignedData.objectName });

      // 获取 parentId (toolId)
      const parentId = parseResult.find((item) => !item.parentId)?.toolId;
      if (!parentId) {
        return Promise.reject(new Error(`未找到插件 ID`));
      }

      // 更新为成功状态
      setUploadedFiles((prev) =>
        prev.map((f, i) => (i === fileIndex ? { ...f, status: 'success', toolId: parentId } : f))
      );
    } catch (error: any) {
      // 更新为错误状态
      setUploadedFiles((prev) =>
        prev.map((f, i) =>
          i === fileIndex ? { ...f, status: 'error', errorMsg: error.message } : f
        )
      );
      throw error;
    }
  };

  // 步骤2: 批量上传所有文件
  const { runAsync: handleBatchUpload, loading: uploadLoading } = useRequest2(
    async () => {
      // 清空之前的上传记录
      setUploadedFiles([]);

      // 依次上传所有文件
      for (let i = 0; i < selectFiles.length; i++) {
        await uploadAndParseFile(selectFiles[i], i);
      }
    },
    {
      manual: true,
      successToast: '所有文件上传解析完成',
      errorToast: '部分文件上传失败',
      onSuccess: () => {
        setSelectFiles([]);
      }
    }
  );

  // 步骤3: 确认导入所有成功的插件
  const { runAsync: handleConfirmImport, loading: confirmLoading } = useRequest2(
    async () => {
      // 获取所有成功解析的 toolId
      const successToolIds = uploadedFiles
        .filter((file) => file.status === 'success' && file.toolId)
        .map((file) => file.toolId!);

      if (successToolIds.length === 0) {
        throw new Error('没有可导入的插件');
      }

      // 批量确认导入
      await confirmPluginUpload({ toolIds: successToolIds });
    },
    {
      manual: true,
      successToast: '插件导入成功',
      errorToast: '插件导入失败',
      onSuccess: () => {
        setUploadedFiles([]);
        onClose();
      }
    }
  );

  // 监听文件选择,自动开始上传
  useEffect(() => {
    if (selectFiles.length > 0 && uploadedFiles.length === 0 && !uploadLoading) {
      handleBatchUpload();
    }
  }, [selectFiles]);

  return (
    <MyRightDrawer
      onClose={onClose}
      title="导入/更新资源"
      maxW={['90vw', '1054px']}
      h={'98%'}
      mt={'1%'}
      px={0}
    >
      <Flex justify={'flex-end'} px={4} pt={4} pb={3}>
        <Button
          variant={'link'}
          size={'sm'}
          leftIcon={<MyIcon name={'book'} w={'14px'} />}
          color={'primary.600'}
        >
          {t('common:Instructions')}
        </Button>
      </Flex>

      <Box flex={1} px={4} overflow={'auto'}>
        <FileSelectorBox
          maxCount={100}
          maxSize="100MB"
          fileType=".pkg"
          selectFiles={selectFiles}
          setSelectFiles={setSelectFiles}
        />

        {uploadedFiles.length > 0 && (
          <VStack mt={4} gap={2}>
            {uploadedFiles.map((item, index) => (
              <HStack key={index} w={'100%'} p={2} bg={'myGray.50'} borderRadius={'md'}>
                <MyIcon name={item.icon as any} w={'1rem'} />
                <Box color={'myGray.900'} flex={1}>
                  {item.name}
                </Box>
                <Box fontSize={'xs'} color={'myGray.500'}>
                  {item.size}
                </Box>
                {item.status === 'uploading' && (
                  <Box fontSize={'xs'} color={'blue.500'}>
                    上传中...
                  </Box>
                )}
                {item.status === 'parsing' && (
                  <Box fontSize={'xs'} color={'blue.500'}>
                    解析中...
                  </Box>
                )}
                {item.status === 'success' && (
                  <MyIcon name={'common/check'} w={'1rem'} color={'green.500'} />
                )}
                {item.status === 'error' && (
                  <MyIcon name={'common/error'} w={'1rem'} color={'red.500'} />
                )}
              </HStack>
            ))}
          </VStack>
        )}
      </Box>

      <Flex justify={'flex-end'} gap={2} p={4}>
        <Button variant="whiteBase" onClick={onClose}>
          取消
        </Button>
        <Button
          onClick={handleConfirmImport}
          isDisabled={
            uploadedFiles.length === 0 || uploadedFiles.every((f) => f.status !== 'success')
          }
          isLoading={confirmLoading || uploadLoading}
        >
          确认导入
        </Button>
      </Flex>
    </MyRightDrawer>
  );
};

export default ImportPluginModal;
