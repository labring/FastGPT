import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Input,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { TrainingModeEnum, TrainingTypeMap } from '@fastgpt/global/core/dataset/constants';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import Preview from '../components/Preview';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { useToast } from '@fastgpt/web/hooks/useToast';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

function DataProcess({ showPreviewChunks = true }: { showPreviewChunks: boolean }) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const {
    goToNext,
    processParamsForm,
    chunkSizeField,
    minChunkSize,
    showChunkInput,
    showPromptInput,
    maxChunkSize,
    priceTip
  } = useContextSelector(DatasetImportContext, (v) => v);
  const { getValues, setValue, register, watch } = processParamsForm;
  const { toast } = useToast();
  const mode = watch('mode');
  const way = watch('way');

  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  const trainingModeList = useMemo(() => {
    const list = Object.entries(TrainingTypeMap);
    return list;
  }, []);

  const onSelectTrainWay = useCallback(
    (e: TrainingModeEnum) => {
      if (!feConfigs?.isPlus && !TrainingTypeMap[e]?.openSource) {
        return toast({
          status: 'warning',
          title: t('common.system.Commercial version function')
        });
      }
      setValue('mode', e);
    },
    [feConfigs?.isPlus, setValue, t, toast]
  );

  return (
    <Box h={'100%'} display={['block', 'flex']} gap={5} fontSize={'sm'}>
      <Box flex={'1 0 0'} minW={['auto', '540px']} maxW={'600px'}>
        <Flex alignItems={'center'}>
          <MyIcon name={'common/settingLight'} w={'20px'} />
          <Box fontSize={'md'}>{t('core.dataset.import.Data process params')}</Box>
        </Flex>

        <Flex mt={4} alignItems={'center'}>
          <FormLabel flex={'0 0 100px'}>{t('core.dataset.import.Training mode')}</FormLabel>
          <LeftRadio
            list={trainingModeList.map(([key, value]) => ({
              title: t(value.label),
              value: key,
              tooltip: t(value.tooltip)
            }))}
            px={3}
            py={2}
            value={mode}
            onChange={onSelectTrainWay}
            defaultBg="white"
            activeBg="white"
            display={'flex'}
            flexWrap={'wrap'}
          />
        </Flex>
        <Flex mt={5}>
          <FormLabel flex={'0 0 100px'}>{t('core.dataset.import.Process way')}</FormLabel>
          <LeftRadio
            list={[
              {
                title: t('core.dataset.import.Auto process'),
                desc: t('core.dataset.import.Auto process desc'),
                value: ImportProcessWayEnum.auto
              },
              {
                title: t('core.dataset.import.Custom process'),
                desc: t('core.dataset.import.Custom process desc'),
                value: ImportProcessWayEnum.custom,
                children: way === ImportProcessWayEnum.custom && (
                  <Box mt={5}>
                    {showChunkInput && chunkSizeField && (
                      <Box>
                        <Flex alignItems={'center'}>
                          <Box>{t('core.dataset.import.Ideal chunk length')}</Box>
                          <MyTooltip
                            label={t('core.dataset.import.Ideal chunk length Tips')}
                            forceShow
                          >
                            <MyIcon
                              name={'common/questionLight'}
                              ml={1}
                              w={'14px'}
                              color={'myGray.500'}
                            />
                          </MyTooltip>
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
                            label={t('core.dataset.import.Chunk Range', {
                              min: minChunkSize,
                              max: maxChunkSize
                            })}
                          >
                            <NumberInput
                              size={'sm'}
                              step={100}
                              min={minChunkSize}
                              max={maxChunkSize}
                              onChange={(e) => {
                                setValue(chunkSizeField, +e);
                              }}
                            >
                              <NumberInputField
                                min={minChunkSize}
                                max={maxChunkSize}
                                {...register(chunkSizeField, {
                                  min: minChunkSize,
                                  max: maxChunkSize,
                                  valueAsNumber: true
                                })}
                              />
                              <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                              </NumberInputStepper>
                            </NumberInput>
                          </MyTooltip>
                        </Box>
                      </Box>
                    )}

                    <Box mt={3}>
                      <Box>
                        {t('core.dataset.import.Custom split char')}
                        <MyTooltip
                          label={t('core.dataset.import.Custom split char Tips')}
                          forceShow
                        >
                          <MyIcon
                            name={'common/questionLight'}
                            ml={1}
                            w={'14px'}
                            color={'myGray.500'}
                          />
                        </MyTooltip>
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

                    {showPromptInput && (
                      <Box mt={3}>
                        <Box>{t('core.dataset.collection.QA Prompt')}</Box>
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
                              {t('core.dataset.import.Custom prompt')}
                            </Button>
                          </Box>
                        </Box>
                      </Box>
                    )}
                  </Box>
                )
              }
            ]}
            px={3}
            py={3}
            defaultBg="white"
            activeBg="white"
            value={way}
            w={'100%'}
            onChange={(e) => {
              setValue('way', e);
            }}
          ></LeftRadio>
        </Flex>
        <Flex mt={5} alignItems={'center'} pl={'100px'} gap={3}>
          {feConfigs?.show_pay && (
            <MyTooltip label={priceTip}>
              <MyTag colorSchema={'gray'} py={'6px'} borderRadius={'md'} px={3}>
                {priceTip}
              </MyTag>
            </MyTooltip>
          )}
        </Flex>
        <Flex mt={5} gap={3} justifyContent={'flex-end'}>
          <Button
            onClick={() => {
              goToNext();
            }}
          >
            {t('common.Next Step')}
          </Button>
        </Flex>
      </Box>
      <Box flex={'1 0 0'} w={'0'}>
        <Preview showPreviewChunks={showPreviewChunks} />
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
    </Box>
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
      title={t('core.dataset.import.Custom prompt')}
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
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
