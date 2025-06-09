import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import React from 'react';
import { Box, Link, Input, Button, ModalBody, ModalFooter, Stack } from '@chakra-ui/react';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import CollectionChunkForm, { type CollectionChunkFormType } from '../Form/CollectionChunkForm';
import { type ChunkSettingsType } from '@fastgpt/global/core/dataset/type';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { defaultFormData } from '../Import/Context';
import { computedCollectionChunkSettings } from '@fastgpt/global/core/dataset/training/utils';

export type WebsiteConfigFormType = {
  websiteConfig: {
    url: string;
    selector: string;
  };
  chunkSettings: ChunkSettingsType;
};

const WebsiteConfigModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (data: WebsiteConfigFormType) => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const steps = [
    {
      title: t('dataset:website_info')
    },
    {
      title: t('dataset:params_config')
    }
  ];

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const websiteConfig = datasetDetail.websiteConfig;
  const chunkSettings = datasetDetail.chunkSettings;

  const {
    register: websiteInfoForm,
    handleSubmit: websiteInfoHandleSubmit,
    getValues: websiteInfoGetValues
  } = useForm({
    defaultValues: {
      url: websiteConfig?.url || '',
      selector: websiteConfig?.selector || ''
    }
  });

  const isEdit = !!websiteConfig?.url;

  const { activeStep, goToPrevious, goToNext, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const form = useForm<CollectionChunkFormType>({
    defaultValues: {
      trainingType: chunkSettings?.trainingType || defaultFormData.trainingType,

      chunkTriggerType: chunkSettings?.chunkTriggerType || defaultFormData.chunkTriggerType,
      chunkTriggerMinSize:
        chunkSettings?.chunkTriggerMinSize || defaultFormData.chunkTriggerMinSize,

      dataEnhanceCollectionName:
        chunkSettings?.dataEnhanceCollectionName || defaultFormData.dataEnhanceCollectionName,

      imageIndex: chunkSettings?.imageIndex || defaultFormData.imageIndex,
      autoIndexes: chunkSettings?.autoIndexes || defaultFormData.autoIndexes,

      chunkSettingMode: chunkSettings?.chunkSettingMode || defaultFormData.chunkSettingMode,
      chunkSplitMode: chunkSettings?.chunkSplitMode || defaultFormData.chunkSplitMode,

      paragraphChunkAIMode:
        chunkSettings?.paragraphChunkAIMode || defaultFormData.paragraphChunkAIMode,
      paragraphChunkDeep: chunkSettings?.paragraphChunkDeep || defaultFormData.paragraphChunkDeep,
      paragraphChunkMinSize:
        chunkSettings?.paragraphChunkMinSize || defaultFormData.paragraphChunkMinSize,

      chunkSize: chunkSettings?.chunkSize || defaultFormData.chunkSize,

      chunkSplitter: chunkSettings?.chunkSplitter || defaultFormData.chunkSplitter,

      indexSize: chunkSettings?.indexSize || defaultFormData.indexSize,

      qaPrompt: chunkSettings?.qaPrompt || Prompt_AgentQA.description
    }
  });

  return (
    <MyModal
      isOpen
      iconSrc="core/dataset/websiteDataset"
      title={t('common:core.dataset.website.Config')}
      onClose={onClose}
      w={'550px'}
    >
      <ModalBody w={'full'}>
        <Stack w={'75%'} marginX={'auto'}>
          <MyStep />
        </Stack>
        <MyDivider />
        {activeStep == 0 && (
          <>
            <Box
              fontSize={'xs'}
              color={'myGray.900'}
              bgColor={'blue.50'}
              padding={'4'}
              borderRadius={'8px'}
            >
              {t('common:core.dataset.website.Config Description')}
              {feConfigs?.docUrl && (
                <Link
                  href={getDocPath('/docs/guide/knowledge_base/websync/')}
                  target="_blank"
                  textDecoration={'underline'}
                  color={'blue.700'}
                >
                  {t('common:read_course')}
                </Link>
              )}
            </Box>
            <Box mt={2}>
              <Box>{t('common:core.dataset.website.Base Url')}</Box>
              <Input
                placeholder={t('common:core.dataset.collection.Website Link')}
                {...websiteInfoForm('url', {
                  required: true
                })}
              />
            </Box>
            <Box mt={3}>
              <Box>
                {t('common:core.dataset.website.Selector')}({t('common:choosable')})
              </Box>
              <Input {...websiteInfoForm('selector')} placeholder="body .content #document" />
            </Box>
          </>
        )}
        {activeStep == 1 && <CollectionChunkForm form={form} />}
      </ModalBody>
      <ModalFooter>
        {activeStep == 0 && (
          <>
            <Button variant={'whiteBase'} onClick={onClose}>
              {t('common:Close')}
            </Button>
            <Button
              ml={2}
              onClick={websiteInfoHandleSubmit((data) => {
                if (!data.url) return;
                // check is link
                if (!strIsLink(data.url)) {
                  return toast({
                    status: 'warning',
                    title: t('common:link.UnValid')
                  });
                }
                goToNext();
              })}
            >
              {t('common:next_step')}
            </Button>
          </>
        )}
        {activeStep == 1 && (
          <>
            <Button variant={'whiteBase'} onClick={goToPrevious}>
              {t('common:last_step')}
            </Button>
            <PopoverConfirm
              Trigger={<Button ml={2}>{t('common:core.dataset.website.Start Sync')}</Button>}
              content={
                isEdit
                  ? t('common:core.dataset.website.Confirm Update Tips')
                  : t('common:core.dataset.website.Confirm Create Tips')
              }
              onConfirm={() =>
                form.handleSubmit((data) =>
                  onSuccess({
                    websiteConfig: websiteInfoGetValues(),
                    chunkSettings: computedCollectionChunkSettings({
                      ...data,
                      llmModel: datasetDetail.agentModel,
                      vectorModel: datasetDetail.vectorModel
                    })
                  })
                )()
              }
            />
          </>
        )}
      </ModalFooter>
    </MyModal>
  );
};

export default WebsiteConfigModal;
