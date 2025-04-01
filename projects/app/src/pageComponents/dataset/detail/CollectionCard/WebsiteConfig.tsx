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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Link,
  Flex,
  Input,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure,
  Checkbox,
  HStack,
  Stack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import {
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionDataProcessModeMap
} from '@fastgpt/global/core/dataset/constants';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { useContextSelector } from 'use-context-selector';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MySelect from '@fastgpt/web/components/common/MySelect';
import {
  getIndexSizeSelectList,
  getLLMMaxChunkSize,
  getMaxIndexSize
} from '@fastgpt/global/core/dataset/training/utils';
import RadioGroup from '@fastgpt/web/components/common/Radio/RadioGroup';

export type WebsiteConfigFormType = {
  url: string;
  selector?: string | undefined;
  autoIndexes?: boolean;
  imageIndex?: boolean;
  trainingType: DatasetCollectionDataProcessModeEnum;
  chunkSettingMode?: ChunkSettingModeEnum;
  chunkSplitMode?: DataChunkSplitModeEnum;
  chunkSize?: number;
  indexSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
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
    register: registerForm1,
    handleSubmit: handleSubmitForm1,
    getValues: getValuesForm1
  } = useForm({
    defaultValues: {
      url: websiteConfig?.url || '',
      selector: websiteConfig?.selector || ''
    }
  });

  const vectorModel = datasetDetail.vectorModel;
  const agentModel = datasetDetail.agentModel;

  const isEdit = !!websiteConfig?.url;
  const confirmTip = isEdit
    ? t('common:core.dataset.website.Confirm Update Tips')
    : t('common:core.dataset.website.Confirm Create Tips');

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'common'
  });

  const { activeStep, goToPrevious, goToNext, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const minChunkSize = 1000;
  const maxChunkSize = getLLMMaxChunkSize(agentModel);
  const maxIndexSize = getMaxIndexSize(vectorModel);

  const { setValue, register, watch, getValues, handleSubmit } = useForm({
    defaultValues: {
      imageIndex: chunkSettings?.imageIndex || false,
      autoIndexes: chunkSettings?.autoIndexes || false,
      trainingType: chunkSettings?.trainingType || DatasetCollectionDataProcessModeEnum.chunk,
      chunkSettingMode: chunkSettings?.chunkSettingMode || ChunkSettingModeEnum.auto,
      chunkSplitMode: chunkSettings?.chunkSplitMode || DataChunkSplitModeEnum.size,
      chunkSize: chunkSettings?.chunkSize || 2000,
      indexSize: chunkSettings?.indexSize || vectorModel?.defaultToken || 512,
      chunkSplitter: chunkSettings?.chunkSplitter || '',
      qaPrompt: chunkSettings?.qaPrompt || Prompt_AgentQA.description
    }
  });

  const trainingType = watch('trainingType');
  const indexSize = watch('indexSize');

  const trainingModeList = useMemo(() => {
    const list = Object.entries(DatasetCollectionDataProcessModeMap);
    return list
      .filter(([key]) => key !== DatasetCollectionDataProcessModeEnum.auto)
      .map(([key, value]) => ({
        title: t(value.label as any),
        value: key as DatasetCollectionDataProcessModeEnum,
        tooltip: t(value.tooltip as any)
      }));
  }, [t]);

  const chunkSettingMode = watch('chunkSettingMode');
  const chunkSplitMode = watch('chunkSplitMode');

  const customSplitList = [
    { label: t('dataset:split_sign_null'), value: '' },
    { label: t('dataset:split_sign_break'), value: '\\n' },
    { label: t('dataset:split_sign_break2'), value: '\\n\\n' },
    { label: t('dataset:split_sign_period'), value: '.|。' },
    { label: t('dataset:split_sign_exclamatiob'), value: '!|！' },
    { label: t('dataset:split_sign_question'), value: '?|？' },
    { label: t('dataset:split_sign_semicolon'), value: ';|；' },
    { label: '=====', value: '=====' },
    { label: t('dataset:split_sign_custom'), value: 'Other' }
  ];

  const [customListSelectValue, setCustomListSelectValue] = useState(getValues('chunkSplitter'));
  useEffect(() => {
    if (customListSelectValue === 'Other') {
      setValue('chunkSplitter', '');
    } else {
      setValue('chunkSplitter', customListSelectValue);
    }
  }, [customListSelectValue, setValue]);

  // Index size
  const indexSizeSeletorList = useMemo(() => getIndexSizeSelectList(maxIndexSize), [maxIndexSize]);

  // QA
  const qaPrompt = watch('qaPrompt');
  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  // Adapt auto training
  useEffect(() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.auto) {
      setValue('autoIndexes', true);
      setValue('trainingType', DatasetCollectionDataProcessModeEnum.chunk);
    }
  }, [trainingType, setValue]);

  const showQAPromptInput = trainingType === DatasetCollectionDataProcessModeEnum.qa;

  return (
    <MyModal
      isOpen
      iconSrc="core/dataset/websiteDataset"
      title={t('common:core.dataset.website.Config')}
      onClose={onClose}
      w={'500px'}
    >
      <ModalBody w={'full'}>
        <Stack w={'75%'} marginX={'auto'}>
          <MyStep />
        </Stack>
        <MyDivider />
        {activeStep == 0 && (
          <>
            <Box
              fontSize={'sm'}
              color={'myGray.900'}
              bgColor={'blue.50'}
              padding={'16px'}
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
                {...registerForm1('url', {
                  required: true
                })}
              />
            </Box>
            <Box mt={3}>
              <Box>
                {t('common:core.dataset.website.Selector')}({t('common:common.choosable')})
              </Box>
              <Input {...registerForm1('selector')} placeholder="body .content #document" />
            </Box>
          </>
        )}
        {activeStep == 1 && (
          <>
            <Box mt={2}>
              <Box fontSize={'sm'} mb={2} color={'myGray.600'}>
                {t('dataset:training_mode')}
              </Box>
              <LeftRadio<DatasetCollectionDataProcessModeEnum>
                list={trainingModeList}
                px={3}
                py={2.5}
                value={trainingType}
                onChange={(e) => {
                  setValue('trainingType', e);
                }}
                defaultBg="white"
                activeBg="white"
                gridTemplateColumns={'repeat(2, 1fr)'}
              />
            </Box>
            {trainingType === DatasetCollectionDataProcessModeEnum.chunk && (
              <Box mt={6}>
                <Box fontSize={'sm'} mb={2} color={'myGray.600'}>
                  {t('dataset:enhanced_indexes')}
                </Box>
                <HStack gap={[3, 7]}>
                  <HStack flex={'1'} spacing={1}>
                    <MyTooltip
                      label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}
                    >
                      <Checkbox isDisabled={!feConfigs?.isPlus} {...register('autoIndexes')}>
                        <FormLabel>{t('dataset:auto_indexes')}</FormLabel>
                      </Checkbox>
                    </MyTooltip>
                    <QuestionTip label={t('dataset:auto_indexes_tips')} />
                  </HStack>
                  <HStack flex={'1'} spacing={1}>
                    <MyTooltip
                      label={
                        !feConfigs?.isPlus
                          ? t('common:commercial_function_tip')
                          : !datasetDetail?.vlmModel
                            ? t('common:error_vlm_not_config')
                            : ''
                      }
                    >
                      <Checkbox
                        isDisabled={!feConfigs?.isPlus || !datasetDetail?.vlmModel}
                        {...register('imageIndex')}
                      >
                        <FormLabel>{t('dataset:image_auto_parse')}</FormLabel>
                      </Checkbox>
                    </MyTooltip>
                    <QuestionTip label={t('dataset:image_auto_parse_tips')} />
                  </HStack>
                </HStack>
              </Box>
            )}
            <Box mt={6}>
              <Box fontSize={'sm'} mb={2} color={'myGray.600'}>
                {t('dataset:params_setting')}
              </Box>
              <LeftRadio<ChunkSettingModeEnum>
                list={[
                  {
                    title: t('dataset:default_params'),
                    desc: t('dataset:default_params_desc'),
                    value: ChunkSettingModeEnum.auto
                  },
                  {
                    title: t('dataset:custom_data_process_params'),
                    desc: t('dataset:custom_data_process_params_desc'),
                    value: ChunkSettingModeEnum.custom,
                    children: chunkSettingMode === ChunkSettingModeEnum.custom && (
                      <Box mt={5}>
                        <Box>
                          <RadioGroup<DataChunkSplitModeEnum>
                            list={[
                              {
                                title: t('dataset:split_chunk_size'),
                                value: DataChunkSplitModeEnum.size
                              },
                              {
                                title: t('dataset:split_chunk_char'),
                                value: DataChunkSplitModeEnum.char,
                                tooltip: t('dataset:custom_split_sign_tip')
                              }
                            ]}
                            value={chunkSplitMode}
                            onChange={(e) => {
                              setValue('chunkSplitMode', e);
                            }}
                          />

                          {chunkSplitMode === DataChunkSplitModeEnum.size && (
                            <Box
                              mt={1.5}
                              css={{
                                '& > span': {
                                  display: 'block'
                                }
                              }}
                            >
                              <MyTooltip
                                label={t('common:core.dataset.import.Chunk Range', {
                                  min: minChunkSize,
                                  max: maxChunkSize
                                })}
                              >
                                <MyNumberInput
                                  register={register}
                                  name="chunkSize"
                                  min={minChunkSize}
                                  max={maxChunkSize}
                                  size={'sm'}
                                  step={100}
                                />
                              </MyTooltip>
                            </Box>
                          )}

                          {chunkSplitMode === DataChunkSplitModeEnum.char && (
                            <HStack mt={1.5}>
                              <Box flex={'1 0 0'}>
                                <MySelect<string>
                                  list={customSplitList}
                                  size={'sm'}
                                  bg={'myGray.50'}
                                  value={customListSelectValue}
                                  h={'32px'}
                                  onChange={(val) => {
                                    setCustomListSelectValue(val);
                                  }}
                                />
                              </Box>
                              {customListSelectValue === 'Other' && (
                                <Input
                                  flex={'1 0 0'}
                                  h={'32px'}
                                  size={'sm'}
                                  bg={'myGray.50'}
                                  placeholder="\n;======;==SPLIT=="
                                  {...register('chunkSplitter')}
                                />
                              )}
                            </HStack>
                          )}
                        </Box>

                        {trainingType === DatasetCollectionDataProcessModeEnum.chunk && (
                          <Box>
                            <Flex alignItems={'center'} mt={3}>
                              <Box>{t('dataset:index_size')}</Box>
                              <QuestionTip label={t('dataset:index_size_tips')} />
                            </Flex>
                            <Box mt={1}>
                              <MySelect<number>
                                bg={'myGray.50'}
                                list={indexSizeSeletorList}
                                value={indexSize}
                                onChange={(val) => {
                                  setValue('indexSize', val);
                                }}
                              />
                            </Box>
                          </Box>
                        )}

                        {showQAPromptInput && (
                          <Box mt={3}>
                            <Box>{t('common:core.dataset.collection.QA Prompt')}</Box>
                            <Box
                              position={'relative'}
                              py={2}
                              px={3}
                              bg={'myGray.50'}
                              fontSize={'xs'}
                              whiteSpace={'pre-wrap'}
                              border={'1px'}
                              borderColor={'borderColor.base'}
                              borderRadius={'md'}
                              maxH={'140px'}
                              overflow={'auto'}
                              _hover={{
                                '& .mask': {
                                  display: 'block'
                                }
                              }}
                            >
                              {qaPrompt}

                              <Box
                                display={'none'}
                                className="mask"
                                position={'absolute'}
                                top={0}
                                right={0}
                                bottom={0}
                                left={0}
                                background={
                                  'linear-gradient(182deg, rgba(255, 255, 255, 0.00) 1.76%, #FFF 84.07%)'
                                }
                              >
                                <Button
                                  size="xs"
                                  variant={'whiteBase'}
                                  leftIcon={<MyIcon name={'edit'} w={'13px'} />}
                                  color={'black'}
                                  position={'absolute'}
                                  right={2}
                                  bottom={2}
                                  onClick={onOpenCustomPrompt}
                                >
                                  {t('common:core.dataset.import.Custom prompt')}
                                </Button>
                              </Box>
                            </Box>
                          </Box>
                        )}
                      </Box>
                    )
                  }
                ]}
                gridGap={3}
                px={3}
                py={3}
                defaultBg="white"
                activeBg="white"
                value={chunkSettingMode}
                w={'100%'}
                onChange={(e) => {
                  setValue('chunkSettingMode', e);
                }}
              />
            </Box>
            {isOpenCustomPrompt && (
              <PromptTextarea
                defaultValue={qaPrompt}
                onChange={(e) => {
                  setValue('qaPrompt', e);
                }}
                onClose={onCloseCustomPrompt}
              />
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {activeStep == 0 && (
          <>
            <Button variant={'whiteBase'} onClick={onClose}>
              {t('common:common.Close')}
            </Button>
            <Button
              ml={2}
              onClick={handleSubmitForm1((data) => {
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
              onClick={handleSubmit((data) => {
                const form1Data = getValuesForm1();
                const result = {
                  ...form1Data,
                  ...data,
                  qaPrompt:
                    data.trainingType === DatasetCollectionDataProcessModeEnum.qa
                      ? data.qaPrompt
                      : undefined
                };
                openConfirm(
                  () => {
                    onSuccess(result);
                  },
                  undefined,
                  confirmTip
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
