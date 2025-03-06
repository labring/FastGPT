import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Input,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure,
  Checkbox,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionDataProcessModeMap
} from '@fastgpt/global/core/dataset/constants';
import { ChunkSettingModeEnum } from '@/web/core/dataset/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { shadowLight } from '@fastgpt/web/styles/theme';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useToast } from '@fastgpt/web/hooks/useToast';

function DataProcess() {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();

  const { goToNext, processParamsForm, chunkSizeField, minChunkSize, maxChunkSize } =
    useContextSelector(DatasetImportContext, (v) => v);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const { getValues, setValue, register, watch } = processParamsForm;
  const trainingType = watch('trainingType');
  const chunkSettingMode = watch('chunkSettingMode');

  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  const trainingModeList = useMemo(() => {
    const list = Object.entries(DatasetCollectionDataProcessModeMap);
    return list
      .filter(([key]) => key !== DatasetCollectionDataProcessModeEnum.auto)
      .map(([key, value]) => ({
        title: t(value.label as any),
        value: key as DatasetCollectionDataProcessModeEnum,
        tooltip: t(value.tooltip as any)
      }));
  }, []);

  const Title = useCallback(({ title }: { title: string }) => {
    return (
      <AccordionButton bg={'none !important'} p={2}>
        <Box w={'3px'} h={'16px'} bg={'primary.600'} borderRadius={'2px'} mr={2} />
        <Box color={'myGray.900'} flex={'1 0 0'} textAlign={'left'}>
          {title}
        </Box>
        <AccordionIcon />
      </AccordionButton>
    );
  }, []);

  // Adapt auto training
  useEffect(() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.auto) {
      setValue('autoIndexes', true);
      setValue('trainingType', DatasetCollectionDataProcessModeEnum.chunk);
    }
  }, [trainingType, setValue]);

  const showFileParseSetting = feConfigs?.showCustomPdfParse;
  const showQAPromptInput = trainingType === DatasetCollectionDataProcessModeEnum.qa;

  return (
    <>
      <Box flex={'1 0 0'} maxW={['90vw', '640px']} m={'auto'} overflow={'auto'}>
        <Accordion allowMultiple reduceMotion defaultIndex={[0, 1, 2]}>
          {showFileParseSetting && (
            <AccordionItem border={'none'} borderBottom={'base'} pb={4}>
              <Title title={t('dataset:import_file_parse_setting')} />

              <AccordionPanel p={2}>
                <Flex
                  flexDirection={'column'}
                  gap={3}
                  border={'1px solid'}
                  borderColor={'primary.600'}
                  borderRadius={'md'}
                  boxShadow={shadowLight}
                  p={4}
                >
                  {feConfigs.showCustomPdfParse && (
                    <HStack spacing={1}>
                      <Checkbox {...register('customPdfParse')}>
                        <FormLabel>{t('dataset:pdf_enhance_parse')}</FormLabel>
                      </Checkbox>
                      <QuestionTip label={t('dataset:pdf_enhance_parse_tips')} />
                      {feConfigs?.show_pay && (
                        <MyTag
                          type={'borderSolid'}
                          borderColor={'myGray.200'}
                          bg={'myGray.100'}
                          color={'primary.600'}
                          py={1.5}
                          borderRadius={'md'}
                          px={3}
                          whiteSpace={'wrap'}
                          ml={1}
                        >
                          {t('dataset:pdf_enhance_parse_price', {
                            price: feConfigs.customPdfParsePrice || 0
                          })}
                        </MyTag>
                      )}
                    </HStack>
                  )}
                </Flex>
              </AccordionPanel>
            </AccordionItem>
          )}

          <AccordionItem mt={4} border={'none'}>
            <Title title={t('dataset:import_data_process_setting')} />

            <AccordionPanel p={2}>
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
              {trainingType === DatasetCollectionDataProcessModeEnum.chunk && feConfigs?.isPlus && (
                <Box mt={6}>
                  <Box fontSize={'sm'} mb={2} color={'myGray.600'}>
                    {t('dataset:enhanced_indexes')}
                  </Box>
                  <HStack gap={[3, 7]}>
                    <HStack flex={'1'} spacing={1}>
                      <Checkbox {...register('autoIndexes')}>
                        <FormLabel>{t('dataset:auto_indexes')}</FormLabel>
                      </Checkbox>
                      <QuestionTip label={t('dataset:auto_indexes_tips')} />
                    </HStack>
                    <HStack flex={'1'} spacing={1}>
                      <MyTooltip
                        label={!datasetDetail?.vlmModel ? t('common:error_vlm_not_config') : ''}
                      >
                        <Checkbox isDisabled={!datasetDetail?.vlmModel} {...register('imageIndex')}>
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
                            <Flex alignItems={'center'}>
                              <Box>{t('dataset:ideal_chunk_length')}</Box>
                              <QuestionTip label={t('dataset:ideal_chunk_length_tips')} />
                            </Flex>
                            <Box
                              mt={1}
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
                                  name={chunkSizeField}
                                  min={minChunkSize}
                                  max={maxChunkSize}
                                  size={'sm'}
                                  step={100}
                                />
                              </MyTooltip>
                            </Box>
                          </Box>

                          <Box mt={3}>
                            <Box>
                              {t('common:core.dataset.import.Custom split char')}
                              <QuestionTip
                                label={t('common:core.dataset.import.Custom split char Tips')}
                              />
                            </Box>
                            <Box mt={1}>
                              <Input
                                size={'sm'}
                                bg={'myGray.50'}
                                defaultValue={''}
                                placeholder="\n;======;==SPLIT=="
                                {...register('customSplitChar')}
                              />
                            </Box>
                          </Box>

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
                                {getValues('qaPrompt')}

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
            </AccordionPanel>
          </AccordionItem>

          {/* <AccordionItem mt={4} border={'none'}>
            <Title title={t('dataset:import_model_config')} />
            <AccordionPanel p={2} fontSize={'sm'}>
              <Box>
                <Box>{t('common:core.ai.model.Dataset Agent Model')}</Box>
                <Box mt={1}>
                  <AIModelSelector
                    w={'100%'}
                    value={llmModel}
                    list={datasetModelList.map((item) => ({
                      label: item.name,
                      value: item.model
                    }))}
                    onchange={(e) => {
                      setValue('llmModel', e);
                    }}
                  />
                </Box>
              </Box>
              <Box pt={5}>
                <Box>{t('dataset:vllm_model')}</Box>
                <Box mt={1}>
                  <AIModelSelector
                    w={'100%'}
                    value={vlmModel}
                    list={vllmModelList.map((item) => ({
                      label: item.name,
                      value: item.model
                    }))}
                    onchange={(e) => {
                      setValue('vlmModel', e);
                    }}
                  />
                </Box>
              </Box>
            </AccordionPanel>
          </AccordionItem> */}

          <Flex mt={5} gap={3} justifyContent={'flex-end'}>
            <Button
              onClick={() => {
                goToNext();
              }}
            >
              {t('common:common.Next Step')}
            </Button>
          </Flex>
        </Accordion>
      </Box>

      {isOpenCustomPrompt && (
        <PromptTextarea
          defaultValue={getValues('qaPrompt')}
          onChange={(e) => {
            setValue('qaPrompt', e);
          }}
          onClose={onCloseCustomPrompt}
        />
      )}
    </>
  );
}

export default React.memo(DataProcess);

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
