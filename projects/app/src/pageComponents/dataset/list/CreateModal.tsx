import React, { useMemo } from 'react';
import { Box, Flex, Button, Input, HStack } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { postCreateDataset } from '@/web/core/dataset/api';
import type { CreateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { useTranslation } from 'next-i18next';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';
import ApiDatasetForm from '../ApiDatasetForm';
import { getWebDefaultEmbeddingModel, getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

export type CreateDatasetType =
  | DatasetTypeEnum.dataset
  | DatasetTypeEnum.apiDataset
  | DatasetTypeEnum.websiteDataset
  | DatasetTypeEnum.feishu
  | DatasetTypeEnum.yuque
  | DatasetTypeEnum.dingtalk;

const CreateModal = ({
  onClose,
  parentId,
  type
}: {
  onClose: () => void;
  parentId?: string;
  type: CreateDatasetType;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { defaultModels, embeddingModelList, llmModelList, getVlmModelList } = useSystemStore();

  const filterNotHiddenVectorModelList = embeddingModelList.filter((item) => !item.hidden);

  const vllmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);

  const form = useForm<CreateDatasetBody>({
    defaultValues: {
      parentId,
      type: type || DatasetTypeEnum.dataset,
      avatar: DatasetTypeMap[type].avatar,
      name: '',
      intro: '',
      vectorModel:
        defaultModels.embedding?.model || getWebDefaultEmbeddingModel(embeddingModelList)?.model,
      agentModel: defaultModels.datasetTextLLM?.model || getWebDefaultLLMModel(llmModelList)?.model,
      vlmModel: defaultModels.datasetImageLLM?.model
    }
  });
  const { register, setValue, handleSubmit, watch } = form;
  const avatar = watch('avatar');
  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');
  const vlmModel = watch('vlmModel');
  const showApiDatasetForm =
    type === DatasetTypeEnum.apiDataset ||
    type === DatasetTypeEnum.feishu ||
    type === DatasetTypeEnum.yuque ||
    type === DatasetTypeEnum.dingtalk;

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess: (avatar: string) => {
        setValue('avatar', avatar);
      }
    });

  /* create a new kb and router to it */
  const { runAsync: onclickCreate, loading: creating } = useRequest(
    async (data: CreateDatasetBody) => await postCreateDataset(data),
    {
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed'),
      onSuccess(id) {
        router.push(`/dataset/detail?datasetId=${id}`);
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      size={'md'}
      isCentered
      title={t('dataset:create_dataset_title', { name: t(DatasetTypeMap[type].label) })}
      borderRadius={'10px'}
      footer={
        <>
          <Button variant={'whiteBase'} fontSize={'12px'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            fontSize={'12px'}
            isLoading={creating}
            onClick={handleSubmit((data) => onclickCreate(data))}
          >
            {t('common:Create')}
          </Button>
        </>
      }
    >
      <Flex
        flexDirection={'column'}
        alignItems={'flex-start'}
        minH={showApiDatasetForm ? undefined : '338px'}
      >
        <Flex w={'100%'} flexDirection={'column'} gap={4}>
          <Box w={'100%'}>
            <Flex justify={'space-between'}>
              <Box color={'myGray.900'} fontWeight={500} fontSize={'sm'}>
                {t('common:Name')}
              </Box>
              {DatasetTypeMap[type]?.courseUrl && (
                <Flex
                  as={'span'}
                  alignItems={'center'}
                  color={'primary.600'}
                  fontSize={'sm'}
                  cursor={'pointer'}
                  onClick={() => window.open(getDocPath(DatasetTypeMap[type].courseUrl!), '_blank')}
                >
                  <MyIcon name={'book'} w={4} mr={0.5} />
                  {t('common:Instructions')}
                </Flex>
              )}
            </Flex>
            <Flex mt={'12px'} alignItems={'center'}>
              <MyTooltip label={t('common:click_select_avatar')}>
                <Avatar
                  flexShrink={0}
                  src={avatar}
                  w={['28px', '32px']}
                  h={['28px', '32px']}
                  cursor={'pointer'}
                  borderRadius={'md'}
                  onClick={handleAvatarSelectorOpen}
                />
              </MyTooltip>
              <Input
                ml={4}
                flex={1}
                autoFocus
                bg={'myWhite.600'}
                fontSize={'14px'}
                placeholder={t('dataset:dataset_name_placeholder')}
                maxLength={30}
                {...register('name', {
                  required: true
                })}
              />
            </Flex>
          </Box>

          <Flex
            w={'100%'}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              alignItems={'center'}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <Box>{t('common:core.ai.model.Vector Model')}</Box>
              <QuestionTip label={t('common:core.dataset.embedding model tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                w={['100%', '300px']}
                value={vectorModel}
                list={filterNotHiddenVectorModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => {
                  setValue('vectorModel' as const, e);
                }}
              />
            </Box>
          </Flex>

          <Flex
            w={'100%'}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <Box>{t('common:core.ai.model.Dataset Agent Model')}</Box>
              <QuestionTip label={t('dataset:file_model_function_tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                w={['100%', '300px']}
                value={agentModel}
                list={llmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => {
                  setValue('agentModel', e);
                }}
              />
            </Box>
          </Flex>

          <Flex
            w={'100%'}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              alignItems={'center'}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <Box>{t('dataset:vllm_model')}</Box>
              <QuestionTip label={t('dataset:vllm_model_tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                w={['100%', '300px']}
                value={vlmModel}
                list={vllmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => {
                  setValue('vlmModel', e);
                }}
              />
            </Box>
          </Flex>
        </Flex>

        {showApiDatasetForm && (
          <Box
            mt={4}
            w={'100%'}
            sx={{
              '& > *:first-of-type': {
                mt: '0 !important'
              }
            }}
          >
            <ApiDatasetForm type={type} form={form} controlWidth={['100%', '300px']} />
          </Box>
        )}

        <ComplianceTip pb={0} pt={0} px={0} type={'dataset'} />

        <AvatarUploader />
      </Flex>
    </MyModal>
  );
};

export default CreateModal;
