import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  ModalBody,
  ModalFooter,
  Textarea,
  useTheme
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';
import { useTranslation } from 'next-i18next';
import { reRankModelList } from '@/web/common/system/staticData';

import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constant';
import MyRadio from '@/components/common/MyRadio';
import MyIcon from '@fastgpt/web/components/common/Icon';

type DatasetParamsProps = {
  searchMode: `${DatasetSearchModeEnum}`;
  searchEmptyText?: string;
  limit?: number;
  similarity?: number;
  usingReRank?: boolean;
  maxTokens?: number;
};

const DatasetParamsModal = ({
  searchMode = DatasetSearchModeEnum.embedding,
  searchEmptyText,
  limit,
  similarity,
  usingReRank,
  maxTokens = 3000,
  onClose,
  onSuccess
}: DatasetParamsProps & { onClose: () => void; onSuccess: (e: DatasetParamsProps) => void }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [refresh, setRefresh] = useState(false);
  const { register, setValue, getValues, handleSubmit } = useForm<DatasetParamsProps>({
    defaultValues: {
      searchEmptyText,
      limit,
      similarity,
      searchMode,
      usingReRank
    }
  });

  const searchModeList = useMemo(() => {
    const list = Object.values(DatasetSearchModeMap);
    return list;
  }, []);

  const showSimilarity = useMemo(() => {
    if (similarity === undefined) return false;
    if (
      getValues('searchMode') === DatasetSearchModeEnum.fullTextRecall &&
      !getValues('usingReRank')
    )
      return false;
    if (getValues('searchMode') === DatasetSearchModeEnum.mixedRecall && !getValues('usingReRank'))
      return false;

    return true;
  }, [getValues, similarity, refresh]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('core.dataset.search.Dataset Search Params')}
      w={['90vw', '550px']}
      h={['90vh', 'auto']}
      isCentered={searchEmptyText !== undefined}
    >
      <ModalBody flex={['1 0 0', 'auto']} overflow={'auto'}>
        <MyRadio
          gridGap={2}
          gridTemplateColumns={'repeat(1,1fr)'}
          list={searchModeList}
          value={getValues('searchMode')}
          onChange={(e) => {
            setValue('searchMode', e as `${DatasetSearchModeEnum}`);
            setRefresh(!refresh);
          }}
        />
        {usingReRank !== undefined && reRankModelList.length > 0 && (
          <>
            <Divider my={4} />
            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              userSelect={'none'}
              py={3}
              pl={'14px'}
              pr={'16px'}
              border={theme.borders.sm}
              borderWidth={'1.5px'}
              borderRadius={'md'}
              position={'relative'}
              {...(getValues('usingReRank')
                ? {
                    borderColor: 'primary.400'
                  }
                : {})}
              onClick={(e) => {
                setValue('usingReRank', !getValues('usingReRank'));
                setRefresh((state) => !state);
              }}
            >
              <MyIcon name="core/dataset/rerank" w={'18px'} mr={'14px'} />
              <Box pr={2} color={'myGray.800'} flex={'1 0 0'}>
                <Box>{t('core.dataset.search.ReRank')}</Box>
                <Box fontSize={['xs', 'sm']} color={'myGray.500'}>
                  {t('core.dataset.search.ReRank desc')}
                </Box>
              </Box>
              <Box position={'relative'} w={'18px'} h={'18px'}>
                <Checkbox colorScheme="primary" isChecked={getValues('usingReRank')} size="lg" />
                <Box position={'absolute'} top={0} right={0} bottom={0} left={0} zIndex={1}></Box>
              </Box>
            </Flex>
          </>
        )}

        {limit !== undefined && (
          <Box display={['block', 'flex']} py={8} mt={3}>
            <Box flex={'0 0 100px'} mb={[8, 0]}>
              {t('core.dataset.search.Max Tokens')}
              <MyTooltip label={t('core.dataset.search.Max Tokens Tips')} forceShow>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Box>
            <Box flex={1} mx={4}>
              <MySlider
                markList={[
                  { label: '100', value: 100 },
                  { label: maxTokens, value: maxTokens }
                ]}
                min={100}
                max={maxTokens}
                step={50}
                value={getValues(ModuleInputKeyEnum.datasetLimit) ?? 1000}
                onChange={(val) => {
                  setValue(ModuleInputKeyEnum.datasetLimit, val);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Box>
        )}
        {showSimilarity && (
          <Box display={['block', 'flex']} py={8}>
            <Box flex={'0 0 100px'} mb={[8, 0]}>
              {t('core.dataset.search.Min Similarity')}
              <MyTooltip label={t('core.dataset.search.Min Similarity Tips')} forceShow>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Box>
            <Box flex={1} mx={4}>
              <MySlider
                markList={[
                  { label: '0', value: 0 },
                  { label: '1', value: 1 }
                ]}
                min={0}
                max={1}
                step={0.01}
                value={getValues(ModuleInputKeyEnum.datasetSimilarity) ?? 0.5}
                onChange={(val) => {
                  setValue(ModuleInputKeyEnum.datasetSimilarity, val);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Box>
        )}

        {searchEmptyText !== undefined && (
          <Box display={['block', 'flex']} pt={3}>
            <Box flex={'0 0 100px'} mb={[2, 0]}>
              {t('core.dataset.search.Empty result response')}
            </Box>
            <Box flex={1}>
              <Textarea
                rows={5}
                maxLength={500}
                placeholder={t('core.dataset.search.Empty result response Tips')}
                {...register('searchEmptyText')}
              ></Textarea>
            </Box>
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          onClick={() => {
            onClose();
            handleSubmit(onSuccess)();
          }}
        >
          {t('common.Done')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default DatasetParamsModal;
