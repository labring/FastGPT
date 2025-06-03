import React, { useMemo } from 'react';
import { Box, Flex, Button, ModalFooter, ModalBody, Input, HStack } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { postCreateDataset } from '@/web/core/dataset/api';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { useTranslation } from 'next-i18next';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';
import ApiDatasetForm from '../ApiDatasetForm';
import { getWebDefaultEmbeddingModel, getWebDefaultLLMModel } from '@/web/common/system/utils';

export type CreateDatasetType =
  | DatasetTypeEnum.dataset
  | DatasetTypeEnum.apiDataset
  | DatasetTypeEnum.websiteDataset
  | DatasetTypeEnum.feishu
  | DatasetTypeEnum.yuque;

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
  const { defaultModels, embeddingModelList, datasetModelList, getVlmModelList } = useSystemStore();
  const { isPc } = useSystem();

  const filterNotHiddenVectorModelList = embeddingModelList.filter((item) => !item.hidden);

  const vllmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);

  const form = useForm<CreateDatasetParams>({
    defaultValues: {
      parentId,
      type: type || DatasetTypeEnum.dataset,
      avatar: DatasetTypeMap[type].avatar,
      name: '',
      intro: '',
      vectorModel:
        defaultModels.embedding?.model || getWebDefaultEmbeddingModel(embeddingModelList)?.model,
      agentModel:
        defaultModels.datasetTextLLM?.model || getWebDefaultLLMModel(datasetModelList)?.model,
      vlmModel: defaultModels.datasetImageLLM?.model
    }
  });
  const { register, setValue, handleSubmit, watch } = form;
  const avatar = watch('avatar');
  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');
  const vlmModel = watch('vlmModel');

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  /* create a new kb and router to it */
  const { run: onclickCreate, loading: creating } = useRequest2(
    async (data: CreateDatasetParams) => await postCreateDataset(data),
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
      title={
        <Flex alignItems={'center'} ml={-3}>
          <Avatar
            w={'20px'}
            h={'20px'}
            borderRadius={'xs'}
            src={DatasetTypeMap[type].avatar}
            pr={'10px'}
          />
          {t('common:core.dataset.Create dataset', { name: t(DatasetTypeMap[type].label) })}
        </Flex>
      }
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      w={'490px'}
    >
      <ModalBody py={6} px={9}>
        <Box>
          <Flex justify={'space-between'}>
            <Box color={'myGray.900'} fontWeight={500} fontSize={'sm'}>
              {t('common:input_name')}
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
                onClick={onOpenSelectFile}
              />
            </MyTooltip>
            <Input
              ml={3}
              flex={1}
              autoFocus
              bg={'myWhite.600'}
              placeholder={t('common:Name')}
              maxLength={30}
              {...register('name', {
                required: true
              })}
            />
          </Flex>
        </Box>

        <Flex
          mt={6}
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
          mt={6}
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
              list={datasetModelList.map((item) => ({
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
          mt={6}
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
            <Box>{t('dataset:vllm_model')}</Box>
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

        {/* @ts-ignore */}
        <ApiDatasetForm type={type} form={form} />
      </ModalBody>

      <ModalFooter px={9}>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
          {t('common:comfirn_create')}
        </Button>
      </ModalFooter>

      <ComplianceTip pb={6} pt={0} px={9} type={'dataset'} />

      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </MyModal>
  );
};

export default CreateModal;
