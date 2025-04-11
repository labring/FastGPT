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
import { getYuquePathApi } from '@/web/core/dataset/api';
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
  const [currentPath, setCurrentPath] = useState(t('dataset:loading'));
  const router = useRouter();
  const [isPathLoading, setIsPathLoading] = useState(false);
  const datasetId = router.query.datasetId as string;

  const fetchCurrentPath = async () => {
    if (type !== DatasetTypeEnum.yuque) return;

    if (datasetId || (yuqueUserId && yuqueToken && yuqueBaseUrl)) {
      try {
        const path = await getYuquePathApi({
          yuqueServer: {
            userId: yuqueUserId || '',
            token: yuqueToken || '',
            baseUrl: yuqueBaseUrl || ''
          },
          datasetId: datasetId as string
        });
        setCurrentPath(path);
        return;
      } catch (error) {
        setCurrentPath(t('dataset:rootdirectory'));
      }
    }
  };

  useEffect(() => {
    if (type === DatasetTypeEnum.yuque) {
      fetchCurrentPath();
    }
  }, [datasetId, type]);

  useEffect(() => {
    if (type === DatasetTypeEnum.yuque && yuqueUserId && yuqueToken) {
      fetchCurrentPath();
    }
  }, [yuqueUserId, yuqueToken, yuqueBaseUrl, type, currentPath]);

  useEffect(() => {
    const baseUrl = form.getValues('yuqueServer.baseUrl');
    console.log('baseUrl', baseUrl);
    if (!baseUrl) {
      setCurrentPath(t('dataset:rootdirectory')); // 更新路径为根目录
    }
  }, [form.getValues('yuqueServer.baseUrl')]);

  const handleSelectDirectory = (id: string) => {
    if (id === 'root') {
      setValue('yuqueServer.baseUrl', undefined);
      console.log('yuqueServer.baseUrl', form.getValues('yuqueServer.baseUrl'));
    } else {
      setValue('yuqueServer.baseUrl', id);
    }
    setIsDirectoryModalOpen(false);
  };

  const openDirectorySelector = () => {
    if (!yuqueUserId || !yuqueToken) {
      alert(t('dataset:pleaseFillUserIdAndToken'));
      return;
    }

    setIsDirectoryModalOpen(true);
  };

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
                {`${currentPath}`}
              </Text>
            </Box>

            <Button ml={2} onClick={openDirectorySelector} isDisabled={!yuqueUserId || !yuqueToken}>
              {t('dataset:selectDirectory')}
            </Button>
          </Flex>

          {isDirectoryModalOpen && (
            <BaseUrlSelector
              onSelect={handleSelectDirectory}
              yuqueServer={{
                userId: form.getValues('yuqueServer.userId') || '',
                token: form.getValues('yuqueServer.token') || '',
                baseUrl: form.getValues('yuqueServer.baseUrl') || ''
              }}
              onClose={() => setIsDirectoryModalOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
};

export default ApiDatasetForm;
