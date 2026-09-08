import React from 'react';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { getDocPath } from '@/web/common/system/doc';
import { getModelDefault } from '@/web/core/ai/model/modelData';
import { postCreateDataset } from '@/web/core/dataset/api';
import { Box, Button, Flex, HStack, Input } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import type { CreateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import ApiDatasetForm from '../ApiDatasetForm';

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

  const form = useForm<CreateDatasetBody>({
    defaultValues: {
      parentId,
      type: type || DatasetTypeEnum.dataset,
      avatar: DatasetTypeMap[type].avatar,
      name: '',
      intro: '',
      vectorModelId: '',
      agentModelId: '',
      vlmModelId: ''
    }
  });
  const { register, setValue, handleSubmit, watch } = form;
  useEffect(() => {
    let active = true;
    Promise.all([
      getModelDefault({ modelType: ModelTypeEnum.embedding, excludeHidden: true }),
      getModelDefault({ modelType: ModelTypeEnum.llm, defaultKey: 'datasetTextLLM' }),
      getModelDefault({ modelType: ModelTypeEnum.llm, defaultKey: 'datasetImageLLM', vision: true })
    ])
      .then((models) => {
        if (!active) return;
        (['vectorModelId', 'agentModelId', 'vlmModelId'] as const).forEach((key, index) => {
          if (!form.getFieldState(key).isDirty && !form.getValues(key) && models[index])
            setValue(key, models[index].modelId);
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [form, setValue]);
  const avatar = watch('avatar');
  const vectorModelId = watch('vectorModelId');
  const agentModelId = watch('agentModelId');
  const vlmModelId = watch('vlmModelId');
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
      <Flex flexDirection={'column'} alignItems={'flex-start'}>
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
              <FormLabel required>{t('common:core.ai.model.Vector Model')}</FormLabel>
              <QuestionTip label={t('common:core.dataset.embedding model tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                modelType={ModelTypeEnum.embedding}
                excludeHidden
                w={['100%', '300px']}
                value={vectorModelId}
                onChange={(e) => {
                  setValue('vectorModelId' as const, e, { shouldDirty: true });
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
              <FormLabel required>{t('common:core.ai.model.Dataset Agent Model')}</FormLabel>
              <QuestionTip label={t('dataset:file_model_function_tip')} />
            </HStack>
            <Box w={['100%', '300px']}>
              <AIModelSelector
                modelType={ModelTypeEnum.llm}
                w={['100%', '300px']}
                value={agentModelId}
                onChange={(e) => {
                  setValue('agentModelId', e, { shouldDirty: true });
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
                modelType={ModelTypeEnum.llm}
                w={['100%', '300px']}
                value={vlmModelId ?? ''}
                canBeUnset
                unsetLabel={t('common:not_set')}
                vision
                onChange={(e) => {
                  setValue('vlmModelId', e, { shouldDirty: true });
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
