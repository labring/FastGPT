import React, { useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
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
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

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
    priceTip,
    chunkSize
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
          title: t('common:common.system.Commercial version function')
        });
      }
      setValue('mode', e);
    },
    [feConfigs?.isPlus, setValue, t, toast]
  );

  return (
    <Box h={'100%'} display={['block', 'flex']} fontSize={'sm'}>
      <Box
        flex={'1 0 0'}
        minW={['auto', '500px']}
        maxW={'600px'}
        h={['auto', '100%']}
        overflow={'auto'}
        pr={[0, 3]}
      >
        <Flex alignItems={'center'}>
          <MyIcon name={'common/settingLight'} w={'20px'} />
          <Box fontSize={'md'}>{t('dataset:data_process_setting')}</Box>
        </Flex>

        <Box display={['block', 'flex']} mt={4} alignItems={'center'}>
          <FormLabel flex={'0 0 100px'}>{t('dataset:training_mode')}</FormLabel>
          <LeftRadio
            list={trainingModeList.map(([key, value]) => ({
              title: t(value.label as any),
              value: key,
              tooltip: t(value.tooltip as any)
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
        </Box>

        <Box display={['block', 'flex']} mt={5}>
          <FormLabel flex={'0 0 100px'}>{t('dataset:data_process_params')}</FormLabel>
          <LeftRadio
            list={[
              {
                title: t('common:core.dataset.import.Auto process'),
                desc: t('common:core.dataset.import.Auto process desc'),
                value: ImportProcessWayEnum.auto
              },
              {
                title: t('dataset:custom_data_process_params'),
                desc: t('dataset:custom_data_process_params_desc'),
                value: ImportProcessWayEnum.custom,
                children: way === ImportProcessWayEnum.custom && (
                  <Box mt={5}>
                    {showChunkInput && chunkSizeField && (
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
                              name={chunkSizeField}
                              min={minChunkSize}
                              max={maxChunkSize}
                              size={'sm'}
                              step={100}
                              value={chunkSize}
                              onChange={(e) => {
                                if (e === undefined) return;
                                setValue(chunkSizeField, +e);
                              }}
                            />
                          </MyTooltip>
                        </Box>
                      </Box>
                    )}

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

                    {showPromptInput && (
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
        </Box>

        {feConfigs?.show_pay && (
          <Box mt={5} pl={[0, '100px']} gap={3}>
            <MyTag colorSchema={'gray'} py={1.5} borderRadius={'md'} px={3} whiteSpace={'wrap'}>
              {priceTip}
            </MyTag>
          </Box>
        )}

        <Flex mt={5} gap={3} justifyContent={'flex-end'}>
          <Button
            onClick={() => {
              goToNext();
            }}
          >
            {t('common:common.Next Step')}
          </Button>
        </Flex>
      </Box>
      <Box flex={'1 0 0'} w={['auto', '0']} h={['auto', '100%']} overflow={'auto'} pl={[0, 3]}>
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
