import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Flex, Input, Button, Spinner } from '@chakra-ui/react';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { GetApiDatasetCataLogProps } from '@/pages/api/core/dataset/apiDataset/getCatalog';
import type { GetApiDatasetPathBody } from '@/pages/api/core/dataset/apiDataset/getPath';
import MyBox from '@fastgpt/web/components/common/MyBox';

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
  const router = useRouter();
  const { register, setValue, watch } = form;

  const yuqueServer = watch('yuqueServer');
  const feishuServer = watch('feishuServer');
  const apiServer = watch('apiServer');

  const [currentPath, setCurrentPath] = useState(t('dataset:yuque_field'));
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false);

  const datasetId = router.query.datasetId as string;
  const parentId = yuqueServer?.baseUrl || feishuServer?.folderToken || apiServer?.baseUrl;

  const isButtonDisabled = useMemo(() => {
    switch (type) {
      case DatasetTypeEnum.yuque:
        return !yuqueServer?.userId || !yuqueServer?.token;
      case DatasetTypeEnum.feishu:
        return !feishuServer?.appId || !feishuServer?.appSecret;
      case DatasetTypeEnum.apiDataset:
        return !apiServer?.baseUrl;
      default:
        return true;
    }
  }, [
    type,
    yuqueServer?.token,
    yuqueServer?.userId,
    feishuServer?.appId,
    feishuServer?.appSecret,
    apiServer?.baseUrl
  ]);

  // Unified function to get the current path
  const { runAsync: fetchCurrentPath, loading: isFetching } = useRequest2(async () => {
    if (!parentId) {
      setCurrentPath(t('dataset:rootdirectory'));
      return;
    }

    try {
      const params: GetApiDatasetPathBody = { parentId };

      switch (type) {
        case DatasetTypeEnum.yuque:
          if (!yuqueServer?.userId || !yuqueServer?.token) return;
          params.yuqueServer = yuqueServer;
          break;
        case DatasetTypeEnum.feishu:
          if (!feishuServer?.appId || !feishuServer?.appSecret) return;
          params.feishuServer = feishuServer;
          break;
        case DatasetTypeEnum.apiDataset:
          if (!apiServer?.baseUrl) return;
          params.apiServer = apiServer;
          break;
      }

      const path = await getApiDatasetPaths(params);
      setCurrentPath(t('dataset:rootdirectory') + path);
    } catch (error) {
      setCurrentPath(t('dataset:rootdirectory'));
    }
  });

  // Get the path when initialized
  useEffect(() => {
    if (datasetId) {
      fetchCurrentPath();
    }
  }, [datasetId, fetchCurrentPath]);

  useEffect(() => {
    // Update the path when all the required fields are complete, or when the baseUrl changes
    if (
      (yuqueServer?.userId && yuqueServer?.token) ||
      yuqueServer?.baseUrl !== undefined ||
      (feishuServer?.appId && feishuServer?.appSecret) ||
      feishuServer?.folderToken !== undefined ||
      apiServer?.baseUrl
    ) {
      fetchCurrentPath();
    }
  }, [
    yuqueServer?.token,
    yuqueServer?.userId,
    yuqueServer?.baseUrl,
    feishuServer?.appId,
    feishuServer?.appSecret,
    feishuServer?.folderToken,
    apiServer?.baseUrl,
    fetchCurrentPath
  ]);

  // Unified handling of directory selection
  const handleSelectDirectory = async (id: ParentIdType) => {
    const value = id === 'root' || id === null || id === undefined ? '' : id;
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
      <MyBox
        px={2}
        py={1}
        fontSize={'sm'}
        flex={'1 0 0'}
        width="220px"
        borderRadius="md"
        display={'flex'}
        alignItems="center"
        overflow="auto"
        style={{
          whiteSpace: 'nowrap',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,0,0,0.1) transparent'
        }}
        sx={{
          '&::-webkit-scrollbar': {
            width: '2px',
            height: '2px'
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '2px'
          },
          '&::-webkit-scrollbar-button': {
            display: 'none'
          }
        }}
        isLoading={isFetching}
        size={'sm'}
      >
        {isFetching ? ' ' : currentPath}
      </MyBox>

      <Button
        ml={2}
        variant={'whiteBase'}
        onClick={openDirectorySelector}
        isDisabled={isButtonDisabled}
      >
        {t('dataset:selectDirectory')}
      </Button>
    </Flex>
  );

  // Render the directory selection modal
  const renderDirectoryModal = () =>
    isDirectoryModalOpen && (
      <BaseUrlSelector
        selectId={type === DatasetTypeEnum.yuque ? yuqueServer?.baseUrl || 'root' : 'root'}
        server={async (e: GetResourceFolderListProps) => {
          const params: GetApiDatasetCataLogProps = { parentId: e.parentId };

          switch (type) {
            case DatasetTypeEnum.yuque:
              params.yuqueServer = {
                userId: yuqueServer?.userId || '',
                token: yuqueServer?.token || '',
                baseUrl: ''
              };
              break;
            // 飞书语雀暂时没有这种baseurl
            case DatasetTypeEnum.feishu:
              params.feishuServer = {
                appId: feishuServer?.appId || '',
                appSecret: feishuServer?.appSecret || '',
                folderToken: feishuServer?.folderToken || ''
              };
              break;
            case DatasetTypeEnum.apiDataset:
              params.apiServer = {
                baseUrl: apiServer?.baseUrl || '',
                authorization: apiServer?.authorization || ''
              };
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
