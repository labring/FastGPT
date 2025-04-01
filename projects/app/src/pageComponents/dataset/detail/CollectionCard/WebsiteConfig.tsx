import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import React, { useRef } from 'react';
import {
  Box,
  Link,
  Input,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  Stack
} from '@chakra-ui/react';
import {
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import CollectionChunkForm, {
  collectionChunkForm2StoreChunkData,
  type CollectionChunkFormType
} from '../Form/CollectionChunkForm';
import { getLLMDefaultChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { ChunkSettingsType } from '@fastgpt/global/core/dataset/type';

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

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'common'
  });

  const { activeStep, goToPrevious, goToNext, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const form = useForm<CollectionChunkFormType>({
    defaultValues: {
      trainingType: chunkSettings?.trainingType || DatasetCollectionDataProcessModeEnum.chunk,
      imageIndex: chunkSettings?.imageIndex || false,
      autoIndexes: chunkSettings?.autoIndexes || false,

      chunkSettingMode: chunkSettings?.chunkSettingMode || ChunkSettingModeEnum.auto,
      chunkSplitMode: chunkSettings?.chunkSplitMode || DataChunkSplitModeEnum.size,
      embeddingChunkSize: chunkSettings?.chunkSize || 2000,
      qaChunkSize: chunkSettings?.chunkSize || getLLMDefaultChunkSize(datasetDetail.agentModel),
      indexSize: chunkSettings?.indexSize || datasetDetail.vectorModel?.defaultToken || 512,

      chunkSplitter: chunkSettings?.chunkSplitter || '',
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
                  {t('common:common.course.Read Course')}
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
                {t('common:core.dataset.website.Selector')}({t('common:common.choosable')})
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
              {t('common:common.Close')}
            </Button>
            <Button
              ml={2}
              onClick={websiteInfoHandleSubmit((data) => {
                if (!data.url) return;
                // check is link
                if (!strIsLink(data.url)) {
                  return toast({
                    status: 'warning',
                    title: t('common:common.link.UnValid')
                  });
                }
                goToNext();
              })}
            >
              {t('common:common.Next Step')}
            </Button>
          </>
        )}
        {activeStep == 1 && (
          <>
            <Button variant={'whiteBase'} onClick={goToPrevious}>
              {t('common:common.Last Step')}
            </Button>
            <Button
              ml={2}
              onClick={form.handleSubmit((data) => {
                openConfirm(
                  () =>
                    onSuccess({
                      websiteConfig: websiteInfoGetValues(),
                      chunkSettings: collectionChunkForm2StoreChunkData({
                        ...data,
                        agentModel: datasetDetail.agentModel,
                        vectorModel: datasetDetail.vectorModel
                      })
                    }),
                  undefined,
                  isEdit
                    ? t('common:core.dataset.website.Confirm Update Tips')
                    : t('common:core.dataset.website.Confirm Create Tips')
                )();
              })}
            >
              {t('common:core.dataset.website.Start Sync')}
            </Button>
          </>
        )}
      </ModalFooter>
      <ConfirmModal />
    </MyModal>
  );
};

export default WebsiteConfigModal;

const PromptTextarea = ({
  defaultValue,
  onChange,
  onClose
}: {
  defaultValue: string;
  onChange: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen
      title={t('common:core.dataset.import.Custom prompt')}
      iconSrc="modal/edit"
      w={'600px'}
      onClose={onClose}
    >
      <ModalBody whiteSpace={'pre-wrap'} fontSize={'sm'} px={[3, 6]} pt={[3, 6]}>
        <Textarea ref={ref} rows={8} fontSize={'sm'} defaultValue={defaultValue} />
        <Box>{Prompt_AgentQA.fixedText}</Box>
      </ModalBody>
      <ModalFooter>
        <Button
          onClick={() => {
            const val = ref.current?.value || Prompt_AgentQA.description;
            onChange(val);
            onClose();
          }}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
