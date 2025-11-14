import React, { useState, useCallback } from 'react';
import { Box, Button, Flex, HStack, VStack } from '@chakra-ui/react';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import FileSelectorBox, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import { postS3UploadFile } from '@/web/common/file/api';
import {
  getPkgPluginUploadURL,
  parseUploadedPkgPlugin,
  confirmPkgPluginUpload
} from '@/web/core/plugin/admin/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getDocPath } from '@/web/common/system/doc';
import { getMarketPlaceToolTags } from '@/web/core/plugin/marketplace/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type UploadedPluginFile = SelectFileItemType & {
  status: 'uploading' | 'parsing' | 'success' | 'error' | 'duplicate';
  errorMsg?: string;
  toolId?: string;
  toolName?: string;
  toolIntro?: string;
  toolTags?: string[];
};

const ImportPluginModal = ({
  onClose,
  onSuccess,
  tools
}: {
  onClose: () => void;
  onSuccess?: () => void;
  tools: GetAdminSystemToolsResponseType;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPluginFile[]>([]);

  const { data: allTags = [] } = useRequest2(getMarketPlaceToolTags, {
    manual: false
  });

  const uploadAndParseFile = async (file: UploadedPluginFile) => {
    try {
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.name === file.name ? { ...f, status: 'uploading', errorMsg: undefined } : f
        )
      );

      const presignedData = await getPkgPluginUploadURL({ filename: file.name });

      const formData = new FormData();
      Object.entries(presignedData.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file.file);

      await postS3UploadFile(presignedData.postURL, formData);

      setUploadedFiles((prev) =>
        prev.map((f) => (f.name === file.name ? { ...f, status: 'parsing' } : f))
      );

      const parseResult = await parseUploadedPkgPlugin({ objectName: presignedData.objectName });

      const parentId = parseResult.find((item) => !item.parentId)?.toolId;
      if (!parentId) {
        return Promise.reject(new Error(`${t('app:custom_plugin_parse_error')}`));
      }
      const toolDetail = parseResult.find((item) => item.toolId === parentId);
      if (!toolDetail) {
        return Promise.reject(new Error(`${t('app:custom_plugin_parse_error')}`));
      }
      const isDuplicated = tools.some((tool) => tool.id.includes(toolDetail.toolId));

      setUploadedFiles((prev) =>
        prev.map((prevFile) =>
          prevFile.name === file.name
            ? {
                ...prevFile,
                status: isDuplicated ? 'duplicate' : 'success',
                toolId: parentId,
                toolName: parseI18nString(toolDetail.name || '', i18n.language),
                icon: toolDetail.icon || '',
                toolIntro: parseI18nString(toolDetail.description || '', i18n.language) || '',
                toolTags:
                  toolDetail.tags?.map((tag) => {
                    const currentTag = allTags.find((item) => item.tagId === tag);
                    return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
                  }) || []
              }
            : prevFile
        )
      );
    } catch (error: any) {
      setUploadedFiles((prev) =>
        prev.map((prevFile) =>
          prevFile.name === file.name
            ? { ...prevFile, status: 'error', errorMsg: error.message }
            : prevFile
        )
      );
    }
  };

  const { runAsync: handleBatchUpload, loading: uploadLoading } = useRequest2(
    async (files: SelectFileItemType[]) => {
      const newUploadedFiles: UploadedPluginFile[] = files.map((f) => ({
        ...f,
        status: 'uploading' as const
      }));
      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

      for (const file of newUploadedFiles) {
        await uploadAndParseFile(file);
      }
    },
    {
      manual: true
    }
  );

  const onSelectFiles = useCallback(
    (files: SelectFileItemType[]) => {
      const currentUploadFiles = files.filter(
        (file) => !selectFiles.some((f) => f.name === file.name)
      );
      const filteredFiles = files.filter(
        (file) => !uploadedFiles.some((f) => f.name === file.name)
      );

      if (filteredFiles.length !== currentUploadFiles.length) {
        toast({
          title: t('app:upload_file_exists_filtered'),
          status: 'info'
        });
      }
      setSelectFiles(filteredFiles);

      if (filteredFiles.length > 0) {
        handleBatchUpload(filteredFiles);
      }
    },
    [handleBatchUpload, t, toast, uploadedFiles]
  );

  const handleRetry = async (file: UploadedPluginFile) => {
    await uploadAndParseFile(file);
  };

  const handleDelete = (file: UploadedPluginFile) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== file.name));
    setSelectFiles((prev) => prev.filter((f) => f.name !== file.name));
  };

  const { runAsync: handleConfirmImport, loading: confirmLoading } = useRequest2(
    async () => {
      const successToolIds = uploadedFiles
        .filter((file) => (file.status === 'success' || file.status === 'duplicate') && file.toolId)
        .map((file) => file.toolId!);

      await confirmPkgPluginUpload({ toolIds: successToolIds });
    },
    {
      manual: true,
      onSuccess: () => {
        setUploadedFiles([]);
        onSuccess?.();
        onClose();
      }
    }
  );

  return (
    <MyRightDrawer
      onClose={onClose}
      title={t('app:toolkit_import_resource')}
      maxW={['90vw', '900px']}
      h={'98%'}
      mt={'0.5%'}
      px={0}
    >
      <Flex justify={'flex-end'} px={8} pt={4} pb={3}>
        <Button
          variant={'link'}
          size={'sm'}
          leftIcon={<MyIcon name={'book'} w={'14px'} />}
          color={'primary.600'}
          onClick={() => {
            window.open(
              getDocPath('/docs/introduction/guide/plugins/upload_system_tool'),
              '_blank'
            );
          }}
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
          setSelectFiles={onSelectFiles}
          h={120}
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
              <Flex key={index} w={'full'} fontSize={'12px'}>
                <Flex w={'20%'} px={1} py={'15px'} align={'center'} gap={2}>
                  <Avatar src={item.icon} borderRadius={'xs'} w={'20px'} />
                  <Box
                    color={'myGray.900'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {(item.status === 'success' || item.status === 'duplicate') && item.toolName
                      ? item.toolName
                      : item.name}
                  </Box>
                </Flex>
                <Flex w={'20%'} px={1} py={'15px'} align={'center'} gap={1} flexWrap={'wrap'}>
                  {(item.status === 'success' || item.status === 'duplicate') &&
                  item.toolTags &&
                  item.toolTags.length > 0 ? (
                    item.toolTags.map((tag, tagIndex) => (
                      <Box
                        key={tagIndex}
                        as={'span'}
                        bg={'myGray.100'}
                        px={2}
                        py={1}
                        color={'myGray.700'}
                        borderRadius={'8px'}
                        fontSize={'xs'}
                        flexShrink={0}
                        data-tag-item
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
                  color={'myGray.600'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                  alignItems={'center'}
                >
                  {(item.status === 'success' || item.status === 'duplicate') && item.toolIntro
                    ? item.toolIntro
                    : '-'}
                </Flex>
                <Flex w={'10%'} px={1} py={'15px'}>
                  {(item.status === 'uploading' || item.status === 'parsing') && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'blue.500'}
                    >
                      {item.status === 'uploading'
                        ? t('app:custom_plugin_uploading')
                        : t('app:custom_plugin_parsing')}
                    </Flex>
                  )}
                  {item.status === 'duplicate' && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'yellow.500'}
                      gap={1}
                    >
                      {t('app:custom_plugin_duplicate')}
                      <QuestionTip label={t('app:custom_plugin_duplicate_tip')} />
                    </Flex>
                  )}
                  {item.status === 'success' && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'green.500'}
                    >
                      {t('app:custom_plugin_uploaded')}
                    </Flex>
                  )}
                  {item.status === 'error' && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'red.500'}
                      gap={1}
                    >
                      {t('app:custom_plugin_upload_failed')}
                      <QuestionTip label={item.errorMsg} />
                    </Flex>
                  )}
                </Flex>
                <Flex w={'10%'} px={1} py={'15px'} align={'center'} gap={2}>
                  {item.status === 'error' && (
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
                  )}
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
            uploadedFiles.length === 0 ||
            uploadedFiles.every((f) => f.status !== 'success' && f.status !== 'duplicate')
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
