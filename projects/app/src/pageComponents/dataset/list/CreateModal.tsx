import React, { useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalFooter,
  ModalBody,
  Input,
  HStack,
  Textarea,
  Switch
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
import { getDocPath } from '@/web/common/system/doc';
import ApiDatasetForm from '../ApiDatasetForm';
import { getWebDefaultEmbeddingModel, getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';

export type CreateDatasetType =
  | DatasetTypeEnum.dataset
  | DatasetTypeEnum.apiDataset
  | DatasetTypeEnum.websiteDataset
  | DatasetTypeEnum.feishu
  | DatasetTypeEnum.yuque
  | DatasetTypeEnum.database
  | DatasetTypeEnum.structureDocument;

// 扩展表单类型，包含接口暂不支持的字段（标记 TODO）
type CreateDatasetFormData = CreateDatasetParams & {
  // TODO: websiteConfig 字段接口暂不支持，待后续补充
  websiteConfig?: {
    url: string;
    selector: string;
  };
  // TODO: autoSync 字段接口暂不支持，待后续补充
  autoSync?: boolean;
};

const LABEL_WIDTH = '120px';

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

  const form = useForm<CreateDatasetFormData>({
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
      vlmModel: defaultModels.datasetImageLLM?.model,
      // TODO: websiteConfig 字段接口暂不支持，待后续补充
      websiteConfig: {
        url: '',
        selector: ''
      },
      // TODO: autoSync 字段接口暂不支持，待后续补充
      autoSync: false
    }
  });
  const { register, setValue, handleSubmit, watch } = form;
  const avatar = watch('avatar');
  const vectorModel = watch('vectorModel');
  const agentModel = watch('agentModel');
  const vlmModel = watch('vlmModel');
  const autoSync = watch('autoSync');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess: (avatarUrl: string) => {
        setValue('avatar', avatarUrl);
      }
    });

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    async (data: CreateDatasetFormData) => {
      const submitData: CreateDatasetParams = {
        parentId: data.parentId,
        type: data.type,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar,
        vectorModel: data.vectorModel,
        agentModel: data.agentModel,
        vlmModel: data.vlmModel,
        apiDatasetServer: data.apiDatasetServer
      };

      if (isStructureDocument) {
        delete submitData.vectorModel;
        delete submitData.agentModel;
        delete submitData.vlmModel;
      }

      // TODO: 以下字段接口暂不支持，待后续补充传入：
      // data.websiteConfig（网站地址和选择器，适用于 websiteDataset）
      // data.autoSync（自动同步，适用于 websiteDataset / apiDataset / feishu / yuque）

      return await postCreateDataset(submitData);
    },
    {
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed'),
      onSuccess(id) {
        router.push(`/dataset/detail?datasetId=${id}`);
      }
    }
  );

  const {
    agentModel: agentModelShowConfig,
    vlmModel: vlmModelShowConfig,
    vectorModel: vectorModelShowConfig
  } = DatasetTypeMap[type].formConfig || {};

  const isStructureDocument = type === DatasetTypeEnum.structureDocument;
  const isWebsite = type === DatasetTypeEnum.websiteDataset;
  const isDatabase = type === DatasetTypeEnum.database;
  const hasAutoSync =
    type === DatasetTypeEnum.websiteDataset ||
    type === DatasetTypeEnum.apiDataset ||
    type === DatasetTypeEnum.feishu ||
    type === DatasetTypeEnum.yuque;

  return (
    <MyModal
      title={
        <Flex alignItems={'center'}>
          {t('dataset:new_dataset_title', { name: t(DatasetTypeMap[type].label) })}
        </Flex>
      }
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      w={'600px'}
    >
      <ModalBody py={6} px={9}>
        {/* 图标 & 名称 */}
        <Flex alignItems={'center'}>
          <FormLabel flex={`0 0 ${LABEL_WIDTH}`} required>
            {t('dataset:icon_and_name')}
          </FormLabel>
          <Flex flex={1} alignItems={'center'}>
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
              ml={3}
              flex={1}
              autoFocus
              maxLength={30}
              {...register('name', { required: true })}
            />
          </Flex>
          {DatasetTypeMap[type]?.courseUrl && (
            <Flex
              as={'span'}
              alignItems={'center'}
              color={'primary.600'}
              fontSize={'sm'}
              cursor={'pointer'}
              ml={3}
              flexShrink={0}
              onClick={() => window.open(getDocPath(DatasetTypeMap[type].courseUrl!), '_blank')}
            >
              <MyIcon name={'book'} w={4} mr={0.5} />
              {t('common:Instructions')}
            </Flex>
          )}
        </Flex>

        {/* 描述 */}
        <Flex mt={6} alignItems={'flex-start'}>
          <FormLabel flex={`0 0 ${LABEL_WIDTH}`} pt={'6px'}>
            {t('dataset:description')}
          </FormLabel>
          <Textarea
            flex={1}
            resize={'vertical'}
            minH={'50px'}
            h={'50px'}
            {...register('intro')}
          />
        </Flex>

        {/* Web 站点特有字段 */}
        {isWebsite && (
          <>
            <Flex mt={6} alignItems={'center'}>
              <FormLabel flex={`0 0 ${LABEL_WIDTH}`} required>
                {t('dataset:website_url')}
              </FormLabel>
              <Input
                flex={1}
                placeholder={t('dataset:website_url_placeholder')}
                {
                  // TODO: websiteConfig.url 字段接口暂不支持，待后续补充
                  ...register('websiteConfig.url', { required: true })
                }
              />
            </Flex>
            <Flex mt={6} alignItems={'center'}>
              <FormLabel flex={`0 0 ${LABEL_WIDTH}`}>
                {t('dataset:website_selector_label')}
              </FormLabel>
              <Input
                flex={1}
                placeholder={t('dataset:website_selector_placeholder')}
                {
                  // TODO: websiteConfig.selector 字段接口暂不支持，待后续补充
                  ...register('websiteConfig.selector')
                }
              />
            </Flex>
          </>
        )}

        {/* apiDataset / feishu / yuque 特有字段（由 ApiDatasetForm 处理） */}
        {/* @ts-ignore */}
        <ApiDatasetForm type={type} form={form} />

        {/* 自动同步（websiteDataset / apiDataset / feishu / yuque） */}
        {hasAutoSync && (
          <Flex mt={6} alignItems={'center'}>
            <FormLabel flex={`0 0 ${LABEL_WIDTH}`}>
              <HStack spacing={1}>
                <Box>{t('dataset:sync_schedule')}</Box>
                <QuestionTip label={t('dataset:sync_schedule_tip')} />
              </HStack>
            </FormLabel>
            {/* TODO: autoSync 字段接口暂不支持，待后续补充 */}
            <Switch
              isChecked={autoSync}
              onChange={(e) => setValue('autoSync', e.target.checked)}
            />
          </Flex>
        )}

        {/* 向量模型 */}
        {!vectorModelShowConfig?.isHidden && (
          <Flex mt={6} alignItems={'center'}>
            <HStack spacing={1} flex={`0 0 ${LABEL_WIDTH}`}>
              <FormLabel required>{t('common:core.ai.model.Vector Model')}</FormLabel>
              <QuestionTip label={t('dataset:vector_model_tip')} />
            </HStack>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={vectorModel}
                list={filterNotHiddenVectorModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => setValue('vectorModel' as const, e)}
              />
            </Box>
          </Flex>
        )}

        {/* 知识增强模型（原文本理解模型） */}
        {!agentModelShowConfig?.isHidden && (
          <Flex mt={6} alignItems={'center'}>
            <HStack spacing={1} flex={`0 0 ${LABEL_WIDTH}`}>
              <FormLabel required>{t('dataset:agent_model_label')}</FormLabel>
              <QuestionTip label={t('dataset:agent_model_tip')} />
            </HStack>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={agentModel}
                list={datasetModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => setValue('agentModel', e)}
              />
            </Box>
          </Flex>
        )}

        {/* 图片解析模型（原图片理解模型） */}
        {!vlmModelShowConfig?.isHidden && (
          <Flex mt={6} alignItems={'center'}>
            <HStack spacing={1} flex={`0 0 ${LABEL_WIDTH}`}>
              <FormLabel>{t('dataset:vlm_model_label')}</FormLabel>
              <QuestionTip label={t('dataset:vlm_model_tip')} />
            </HStack>
            <Box flex={1}>
              <AIModelSelector
                w={'100%'}
                value={vlmModel}
                list={vllmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => setValue('vlmModel', e)}
              />
            </Box>
          </Flex>
        )}
      </ModalBody>

      <ModalFooter px={9}>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>

      <ComplianceTip pb={6} pt={0} px={9} type={'dataset'} />

      <AvatarUploader />
    </MyModal>
  );
};

export default CreateModal;
