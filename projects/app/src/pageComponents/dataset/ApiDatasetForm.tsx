import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Flex, Input, Button, Box, Text } from '@chakra-ui/react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import type {
  APIFileServer,
  FeishuServer,
  YuqueServer
} from '@fastgpt/global/core/dataset/apiDataset';
import BaseUrlSelector from '@/pageComponents/dataset/detail/Import/diffSource/baseUrl';
import { getApiDatasetPaths, getApiDatasetCatalog } from '@/web/core/dataset/api';
import { GetResourceFolderListProps, ParentIdType } from '@fastgpt/global/common/parentFolder/type';

const ApiDatasetForm = ({
  type,
  form
}: {
  type: `${DatasetTypeEnum}`;
  form: UseFormReturn<
    {
      apiServer?: APIFileServer;
      feishuServer?: FeishuServer;
      yuqueServer?: YuqueServer;
    },
    any
  >;
}) => {
  const { t } = useTranslation();
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false);
  const { register, setValue, watch } = form;

  const yuqueUserId = watch('yuqueServer.userId');
  const yuqueToken = watch('yuqueServer.token');
  const yuqueBaseUrl = watch('yuqueServer.baseUrl');

  const feishuAppId = watch('feishuServer.appId');
  const feishuAppSecret = watch('feishuServer.appSecret');
  const feishuFolderToken = watch('feishuServer.folderToken');

  const apiBaseUrl = watch('apiServer.baseUrl');

  const [currentPath, setCurrentPath] = useState(t('dataset:loading'));
  const router = useRouter();
  const datasetId = router.query.datasetId as string;
  const parentId = yuqueBaseUrl || feishuFolderToken || apiBaseUrl;

  // Unified function to get the current path
  const fetchCurrentPath = async () => {
    if (!parentId) {
      setCurrentPath(t('dataset:rootdirectory'));
      return;
    }

    try {
      const params: any = { parentId };

      switch (type) {
        case DatasetTypeEnum.yuque:
          if (!yuqueUserId || !yuqueToken) return;
          params.yuqueServer = {
            userId: yuqueUserId,
            token: yuqueToken,
            baseUrl: yuqueBaseUrl || ''
          };
          break;
        case DatasetTypeEnum.feishu:
          if (!feishuAppId || !feishuAppSecret) return;
          params.feishuServer = {
            appId: feishuAppId,
            appSecret: feishuAppSecret,
            folderToken: feishuFolderToken || ''
          };
          break;
        case DatasetTypeEnum.apiDataset:
          if (!apiBaseUrl) return;
          params.apiServer = {
            baseUrl: apiBaseUrl
          };
          break;
      }

      const path = await getApiDatasetPaths(params);
      setCurrentPath(t('dataset:rootdirectory') + path);
    } catch (error) {
      setCurrentPath(t('dataset:rootdirectory'));
    }
  };

  // Get the path when initialized
  useEffect(() => {
    if (datasetId) {
      fetchCurrentPath();
    }
  }, [datasetId]);

  useEffect(() => {
    if (type === DatasetTypeEnum.yuque) {
      // Update the path when all the required fields are complete, or when the baseUrl changes
      if (
        (yuqueUserId && yuqueToken) ||
        yuqueBaseUrl !== undefined ||
        (feishuAppId && feishuAppSecret) ||
        feishuFolderToken !== undefined ||
        apiBaseUrl
      ) {
        fetchCurrentPath();
      }
    }
  }, [
    yuqueUserId,
    yuqueToken,
    yuqueBaseUrl,
    feishuAppId,
    feishuAppSecret,
    feishuFolderToken,
    apiBaseUrl,
    type
  ]);

  // Unified handling of directory selection
  const handleSelectDirectory = async (id: ParentIdType) => {
    const value = id === 'root' || id === null || id === undefined ? '' : String(id);
    switch (type) {
      case DatasetTypeEnum.yuque:
        setValue('yuqueServer.baseUrl', value);
        break;
      case DatasetTypeEnum.feishu:
        setValue('feishuServer.folderToken', value);
        break;
      case DatasetTypeEnum.apiDataset:
        setValue('apiServer.baseUrl', value);
        break;
    }

    setIsDirectoryModalOpen(false);
    await fetchCurrentPath();
  };

  const openDirectorySelector = () => {
    setIsDirectoryModalOpen(true);
  };

  const renderBaseUrlSelector = () => (
    <Flex mt={6}>
      <Flex
        alignItems={'center'}
        flex={['', '0 0 110px']}
        color={'myGray.900'}
        fontWeight={500}
        fontSize={'sm'}
      >
        Base URL
      </Flex>
      <Box
        px={2}
        py={1}
        borderRadius="md"
        fontSize="sm"
        overflow="auto"
        width="220px"
        display="flex"
        alignItems="center"
        style={{ whiteSpace: 'nowrap' }}
      >
        <Text fontSize={'sm'} fontWeight={500}>
          {currentPath}
        </Text>
      </Box>

      <Button
        ml={2}
        onClick={openDirectorySelector}
        isDisabled={
          (type === DatasetTypeEnum.yuque && (!yuqueUserId || !yuqueToken)) ||
          (type === DatasetTypeEnum.feishu && (!feishuAppId || !feishuAppSecret)) ||
          (type === DatasetTypeEnum.apiDataset && !apiBaseUrl)
        }
      >
        {t('dataset:selectDirectory')}
      </Button>
    </Flex>
  );

  // Render the directory selection modal
  const renderDirectoryModal = () =>
    isDirectoryModalOpen && (
      <BaseUrlSelector
        selectId={type === DatasetTypeEnum.yuque ? yuqueBaseUrl || 'root' : 'root'}
        server={async (e: GetResourceFolderListProps) => {
          const params: any = { parentId: e.parentId };

          switch (type) {
            case DatasetTypeEnum.yuque:
              params.yuqueServer = {
                userId: yuqueUserId,
                token: yuqueToken,
                baseUrl: ''
              };
              break;
            case DatasetTypeEnum.feishu:
              params.feishuServer = watch('feishuServer');
              break;
            case DatasetTypeEnum.apiDataset:
              params.apiServer = watch('apiServer');
              break;
          }

          return getApiDatasetCatalog(params);
        }}
        onConfirm={handleSelectDirectory}
        onClose={() => setIsDirectoryModalOpen(false)}
      />
    );

  return (
    <>
      {type === DatasetTypeEnum.apiDataset && (
        <>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              {t('dataset:api_url')}
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={t('dataset:api_url')}
              maxLength={200}
              {...register('apiServer.baseUrl', { required: true })}
            />
          </Flex>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              Authorization
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={t('dataset:request_headers')}
              maxLength={2000}
              {...register('apiServer.authorization')}
            />
          </Flex>
          {/* {renderBaseUrlSelector()}
          {renderDirectoryModal()} */}
        </>
      )}
      {type === DatasetTypeEnum.feishu && (
        <>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              App ID
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'App ID'}
              maxLength={200}
              {...register('feishuServer.appId', { required: true })}
            />
          </Flex>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              App Secret
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'App Secret'}
              maxLength={200}
              {...register('feishuServer.appSecret', { required: true })}
            />
          </Flex>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              Folder Token
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'Folder Token'}
              maxLength={200}
              {...register('feishuServer.folderToken', { required: true })}
            />
          </Flex>
          {/* {renderBaseUrlSelector()}
          {renderDirectoryModal()} */}
        </>
      )}
      {type === DatasetTypeEnum.yuque && (
        <>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              User ID
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'User ID'}
              maxLength={200}
              {...register('yuqueServer.userId', { required: true })}
            />
          </Flex>
          <Flex mt={6}>
            <Flex
              alignItems={'center'}
              flex={['', '0 0 110px']}
              color={'myGray.900'}
              fontWeight={500}
              fontSize={'sm'}
            >
              Token
            </Flex>
            <Input
              bg={'myWhite.600'}
              placeholder={'Token'}
              maxLength={200}
              {...register('yuqueServer.token', { required: true })}
            />
          </Flex>
          {renderBaseUrlSelector()}
          {renderDirectoryModal()}
        </>
      )}
    </>
  );
};

export default ApiDatasetForm;
