import React, { useMemo, useRef, useState } from 'react';
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
import { TrainingTypeMap } from '@fastgpt/global/core/dataset/constants';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
import MyTooltip from '@/components/MyTooltip';
import { useImportStore } from '../Provider';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import Preview from '../components/Preview';
import Tag from '@/components/Tag';

function DataProcess({
  showPreviewChunks = true,
  goToNext
}: {
  showPreviewChunks: boolean;
  goToNext: () => void;
}) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const {
    processParamsForm,
    chunkSizeField,
    minChunkSize,
    showChunkInput,
    showPromptInput,
    maxChunkSize,
    priceTip
  } = useImportStore();
  const { getValues, setValue, register } = processParamsForm;
  const [refresh, setRefresh] = useState(false);

  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  const trainingModeList = useMemo(() => {
    const list = Object.entries(TrainingTypeMap);

    return list.filter(([key, value]) => {
      if (feConfigs?.isPlus) return true;
      return value.openSource;
    });
  }, [feConfigs?.isPlus]);

  return (
    <Box h={'100%'} display={['block', 'flex']} gap={5}>
      <Box flex={'1 0 0'} minW={['auto', '540px']} maxW={'600px'}>
        <Flex alignItems={'center'}>
          <MyIcon name={'common/settingLight'} w={'20px'} />
          <Box fontSize={'lg'}>{t('core.dataset.import.Data process params')}</Box>
        </Flex>

        <Flex mt={4} alignItems={'center'}>
          <Box color={'myGray.600'} flex={'0 0 100px'}>
            {t('core.dataset.import.Training mode')}
          </Box>
          <LeftRadio
            list={trainingModeList.map(([key, value]) => ({
              title: t(value.label),
              value: key,
              tooltip: t(value.tooltip)
            }))}
            px={3}
            py={2}
            value={getValues('mode')}
            onChange={(e) => {
              setValue('mode', e);
              setRefresh(!refresh);
            }}
            gridTemplateColumns={'repeat(3,1fr)'}
            defaultBg="white"
            activeBg="white"
          />
        </Flex>
        <Flex mt={5}>
          <Box color={'myGray.600'} flex={'0 0 100px'}>
            {t('core.dataset.import.Process way')}
          </Box>
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
                children: getValues('way') === ImportProcessWayEnum.custom && (
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
            value={getValues('way')}
            w={'100%'}
            onChange={(e) => {
              setValue('way', e);
              setRefresh(!refresh);
            }}
          ></LeftRadio>
        </Flex>
        <Flex mt={5} alignItems={'center'} pl={'100px'} gap={3}>
          {feConfigs?.show_pay && (
            <MyTooltip label={priceTip}>
              <Tag colorSchema={'gray'} py={'6px'} borderRadius={'md'} px={3}>
                {priceTip}
              </Tag>
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
            setRefresh(!refresh);
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
