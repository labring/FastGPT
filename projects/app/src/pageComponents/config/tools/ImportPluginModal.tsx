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
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';

type UploadedPluginFile = SelectFileItemType & {
  status: 'uploading' | 'parsing' | 'success' | 'error';
  errorMsg?: string;
  toolId?: string; // 解析后的 toolId
  toolName?: string; // 工具名称
  toolIntro?: string; // 工具简介
  toolTags?: string[]; // 工具标签
};

const ImportPluginModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPluginFile[]>([]);
  console.log('uploadedFiles', uploadedFiles);

  // 步骤1: 上传并解析单个文件
  const uploadAndParseFile = async (file: SelectFileItemType | UploadedPluginFile) => {
    // 找到该文件在 uploadedFiles 中的索引
    const fileIndex = uploadedFiles.findIndex((f) => f.name === file.name);

    try {
      // 更新状态为上传中
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, status: 'uploading', errorMsg: undefined } : f
        )
      );

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
        prev.map((f) => (f.name === file.name ? { ...f, status: 'parsing' } : f))
      );

      // 解析上传的插件
      const parseResult = await parseUploadedPlugin({ objectName: presignedData.objectName });
      console.log('parseResult', parseResult);

      // 获取 parentId (toolId)
      const parentId = parseResult.find((item) => !item.parentId)?.toolId;
      if (!parentId) {
        return Promise.reject(new Error(`未找到插件 ID`));
      }
      const toolDetail = parseResult.find((item) => item.toolId === parentId);

      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.name === file.name
            ? {
                ...f,
                status: 'success',
                toolId: parentId,
                toolName: parseI18nString(toolDetail?.name || '', i18n.language),
                icon: toolDetail?.icon || '',
                toolIntro: parseI18nString(toolDetail?.description || '', i18n.language) || '',
                toolTags: toolDetail?.tags || []
              }
            : f
        )
      );
    } catch (error: any) {
      // 更新为错误状态
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, status: 'error', errorMsg: error.message } : f
        )
      );
      throw error;
    }
  };

  // 步骤2: 批量上传新增的文件
  const { runAsync: handleBatchUpload, loading: uploadLoading } = useRequest2(
    async () => {
      // 找出未上传的新文件(不在 uploadedFiles 中的文件)
      const uploadedFileNames = new Set(uploadedFiles.map((f) => f.name));
      const newFiles = selectFiles.filter((f) => !uploadedFileNames.has(f.name));

      if (newFiles.length === 0) return;

      // 将新文件添加到 uploadedFiles,初始状态为 uploading
      const newUploadedFiles: UploadedPluginFile[] = newFiles.map((f) => ({
        ...f,
        status: 'uploading' as const
      }));
      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

      // 依次上传所有新文件
      for (const file of newFiles) {
        try {
          await uploadAndParseFile(file);
        } catch (error) {
          console.error(`上传文件 ${file.name} 失败:`, error);
        }
      }
    },
    {
      manual: true
    }
  );

  const handleRetry = async (file: UploadedPluginFile) => {
    try {
      await uploadAndParseFile(file);
    } catch (error) {
      console.error(`重试上传文件 ${file.name} 失败:`, error);
    }
  };

  const handleDelete = (file: UploadedPluginFile) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== file.name));
    setSelectFiles((prev) => prev.filter((f) => f.name !== file.name));
  };

  const { runAsync: handleConfirmImport, loading: confirmLoading } = useRequest2(
    async () => {
      const successToolIds = uploadedFiles
        .filter((file) => file.status === 'success' && file.toolId)
        .map((file) => file.toolId!);

      await confirmPluginUpload({ toolIds: successToolIds });
    },
    {
      manual: true,
      onSuccess: () => {
        setUploadedFiles([]);
        onSuccess?.(); // 调用父组件的 onSuccess 回调刷新列表
        onClose();
      }
    }
  );

  useEffect(() => {
    if (selectFiles.length > 0) {
      handleBatchUpload();
    }
  }, [selectFiles.length]);

  return (
    <MyRightDrawer
      onClose={onClose}
      title="导入/更新资源"
      maxW={['90vw', '1054px']}
      h={'98%'}
      mt={'1%'}
      px={0}
    >
      <Flex justify={'flex-end'} px={8} pt={4} pb={3}>
        <Button
          variant={'link'}
          size={'sm'}
          leftIcon={<MyIcon name={'book'} w={'14px'} />}
          color={'primary.600'}
        >
          {t('common:Instructions')}
        </Button>
      </Flex>

      <Box flex={1} px={8} overflow={'auto'}>
        <FileSelectorBox
          maxCount={100}
          maxSize="100MB"
          fileType=".pkg"
          selectFiles={selectFiles}
          setSelectFiles={setSelectFiles}
        />

        <Flex
          w={'full'}
          fontSize={'12px'}
          fontWeight={'medium'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          mt={4}
        >
          <Box w={'20%'} px={1} py={'15px'}>
            {t('common:name')}
          </Box>
          <Box w={'20%'} px={1} py={'15px'}>
            {t('app:toolkit_tags')}
          </Box>
          <Box w={'40%'} px={1} py={'15px'}>
            {t('common:Intro')}
          </Box>
          <Box w={'10%'} px={1} py={'15px'}>
            {t('common:Status')}
          </Box>
          <Box w={'10%'} px={1} py={'15px'}>
            {t('common:Action')}
          </Box>
        </Flex>

        {uploadedFiles.length > 0 && (
          <VStack mt={1} gap={1}>
            {uploadedFiles.map((item, index) => (
              <Flex
                key={index}
                w={'full'}
                fontSize={'12px'}
                borderBottom={'1px solid'}
                borderColor={'myGray.100'}
              >
                <Flex w={'20%'} px={1} py={'15px'} align={'center'} gap={2}>
                  <Avatar src={item.icon} borderRadius={'xs'} w={'20px'} />
                  <Box
                    color={'myGray.900'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {item.status === 'success' && item.toolName ? item.toolName : item.name}
                  </Box>
                </Flex>
                <Flex w={'20%'} px={1} py={'15px'} align={'center'} gap={1} flexWrap={'wrap'}>
                  {item.status === 'success' && item.toolTags && item.toolTags.length > 0 ? (
                    item.toolTags.map((tag, tagIndex) => (
                      <Box
                        key={tagIndex}
                        px={2}
                        py={0.5}
                        bg={'primary.50'}
                        color={'primary.600'}
                        borderRadius={'sm'}
                        fontSize={'11px'}
                      >
                        {tag}
                      </Box>
                    ))
                  ) : (
                    <Box color={'myGray.400'}>-</Box>
                  )}
                </Flex>
                <Flex
                  w={'40%'}
                  px={1}
                  py={'15px'}
                  color={'myGray.600'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                  alignItems={'center'}
                >
                  {item.status === 'success' && item.toolIntro ? item.toolIntro : '-'}
                </Flex>
                <Flex w={'10%'} px={1} py={'15px'}>
                  {item.status === 'uploading' && (
                    <Flex alignItems={'center'} fontSize={'xs'} color={'blue.500'}>
                      {t('app:custom_plugin_uploading')}
                    </Flex>
                  )}
                  {item.status === 'parsing' && (
                    <Flex alignItems={'center'} fontSize={'xs'} color={'blue.500'}>
                      {t('app:custom_plugin_parsing')}
                    </Flex>
                  )}
                  {item.status === 'success' && (
                    <MyIcon name={'common/check'} w={'1rem'} color={'green.500'} />
                  )}
                  {item.status === 'error' && (
                    <MyIcon name={'common/error'} w={'1rem'} color={'red.500'} />
                  )}
                </Flex>
                <Flex w={'10%'} px={1} py={'15px'} align={'center'} gap={2}>
                  <Box
                    p={2}
                    onClick={() => handleRetry(item)}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.100',
                      rounded: 'md',
                      color: 'primary.600'
                    }}
                  >
                    <MyIcon name={'common/confirm/restoreTip'} w={4} />
                  </Box>
                  <Box
                    p={2}
                    onClick={() => handleDelete(item)}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.100',
                      rounded: 'md',
                      color: 'red.600'
                    }}
                  >
                    <MyIcon name={'delete'} w={4} />
                  </Box>
                </Flex>
              </Flex>
            ))}
          </VStack>
        )}
      </Box>

      <Flex justify={'flex-end'} gap={2} p={4}>
        <Button variant="whiteBase" onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          onClick={handleConfirmImport}
          isDisabled={
            uploadedFiles.length === 0 || uploadedFiles.every((f) => f.status !== 'success')
          }
          isLoading={confirmLoading || uploadLoading}
        >
          {t('common:comfirm_import')}
        </Button>
      </Flex>
    </MyRightDrawer>
  );
};

export default ImportPluginModal;
