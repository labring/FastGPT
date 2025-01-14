import React from 'react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Flex, Input } from '@chakra-ui/react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import type {
  APIFileServer,
  FeishuServer,
  YuqueServer
} from '@fastgpt/global/core/dataset/apiDataset';

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
  const { register } = form;

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
              maxLength={200}
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
        </>
      )}
    </>
  );
};

export default ApiDatasetForm;
