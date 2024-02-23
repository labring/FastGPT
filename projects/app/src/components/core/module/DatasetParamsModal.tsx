import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea,
  useTheme
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
import MyRadio from '@/components/common/MyRadio';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Tabs from '@/components/Tabs';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import SelectAiModel from '@/components/Select/SelectAiModel';

export type DatasetParamsProps = {
  searchMode: `${DatasetSearchModeEnum}`;
  limit?: number;
  similarity?: number;
  usingReRank?: boolean;
  datasetSearchUsingExtensionQuery?: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg?: string;

  maxTokens?: number; // limit max tokens
  searchEmptyText?: string;
};
enum SearchSettingTabEnum {
  searchMode = 'searchMode',
  limit = 'limit',
  queryExtension = 'queryExtension'
}

const DatasetParamsModal = ({
  searchMode = DatasetSearchModeEnum.embedding,
  searchEmptyText,
  limit,
  similarity,
  usingReRank,
  maxTokens = 3000,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  onClose,
  onSuccess
}: DatasetParamsProps & { onClose: () => void; onSuccess: (e: DatasetParamsProps) => void }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { reRankModelList, llmModelList } = useSystemStore();
  const [refresh, setRefresh] = useState(false);
  const [currentTabType, setCurrentTabType] = useState(SearchSettingTabEnum.searchMode);

  const { register, setValue, getValues, handleSubmit, watch } = useForm<DatasetParamsProps>({
    defaultValues: {
      searchEmptyText,
      limit,
      similarity,
      searchMode,
      usingReRank,
      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModel: datasetSearchExtensionModel ?? llmModelList[0]?.model,
      datasetSearchExtensionBg
    }
  });
  const datasetSearchUsingCfrForm = watch('datasetSearchUsingExtensionQuery');
  const queryExtensionModel = watch('datasetSearchExtensionModel');
  const cfbBgDesc = watch('datasetSearchExtensionBg');

  const chatModelSelectList = (() =>
    llmModelList.map((item) => ({
      value: item.model,
      label: item.name
    })))();

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
  }, [getValues, similarity]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('core.dataset.search.Dataset Search Params')}
      w={['90vw', '550px']}
    >
      <ModalBody flex={'auto'} overflow={'auto'}>
        <Tabs
          mb={3}
          list={[
            {
              icon: 'modal/setting',
              label: t('core.dataset.search.search mode'),
              id: SearchSettingTabEnum.searchMode
            },
            {
              icon: 'support/outlink/apikeyFill',
              label: t('core.dataset.search.Filter'),
              id: SearchSettingTabEnum.limit
            },
            {
              label: t('core.module.template.Query extension'),
              id: SearchSettingTabEnum.queryExtension,
              icon: '/imgs/module/cfr.svg'
            }
          ]}
          activeId={currentTabType}
          onChange={(e) => setCurrentTabType(e as any)}
        />
        {currentTabType === SearchSettingTabEnum.searchMode && (
          <>
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
                    <Checkbox
                      colorScheme="primary"
                      isChecked={getValues('usingReRank')}
                      size="lg"
                    />
                    <Box
                      position={'absolute'}
                      top={0}
                      right={0}
                      bottom={0}
                      left={0}
                      zIndex={1}
                    ></Box>
                  </Box>
                </Flex>
              </>
            )}
          </>
        )}
        {currentTabType === SearchSettingTabEnum.limit && (
          <Box pt={5}>
            {limit !== undefined && (
              <Box display={['block', 'flex']}>
                <Box flex={'0 0 120px'} mb={[8, 0]}>
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
                    value={getValues(ModuleInputKeyEnum.datasetMaxTokens) ?? 1000}
                    onChange={(val) => {
                      setValue(ModuleInputKeyEnum.datasetMaxTokens, val);
                      setRefresh(!refresh);
                    }}
                  />
                </Box>
              </Box>
            )}
            {showSimilarity && (
              <Box display={['block', 'flex']} mt={10}>
                <Box flex={'0 0 120px'} mb={[8, 0]}>
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
                <Box flex={'0 0 120px'} mb={[2, 0]}>
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
          </Box>
        )}
        {currentTabType === SearchSettingTabEnum.queryExtension && (
          <Box>
            <Box fontSize={'xs'} color={'myGray.500'}>
              {t('core.module.template.Query extension intro')}
            </Box>
            <Flex mt={3} alignItems={'center'}>
              <Box flex={'1 0 0'}>{t('core.dataset.search.Using query extension')}</Box>
              <Switch {...register('datasetSearchUsingExtensionQuery')} />
            </Flex>
            {datasetSearchUsingCfrForm === true && (
              <>
                <Flex mt={4} alignItems={'center'}>
                  <Box flex={'0 0 100px'}>{t('core.ai.Model')}</Box>
                  <Box flex={'1 0 0'}>
                    <SelectAiModel
                      width={'100%'}
                      value={queryExtensionModel}
                      list={chatModelSelectList}
                      onchange={(val: any) => {
                        setValue('datasetSearchExtensionModel', val);
                      }}
                    />
                  </Box>
                </Flex>
                <Box mt={3}>
                  <Flex alignItems={'center'}>
                    {t('core.app.edit.Query extension background prompt')}
                    <MyTooltip label={t('core.app.edit.Query extension background tip')} forceShow>
                      <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
                    </MyTooltip>
                  </Flex>
                  <Box mt={1}>
                    <PromptEditor
                      h={200}
                      showOpenModal={false}
                      placeholder={t('core.module.QueryExtension.placeholder')}
                      value={cfbBgDesc}
                      onChange={(e) => {
                        setValue('datasetSearchExtensionBg', e);
                      }}
                    />
                  </Box>
                </Box>
              </>
            )}
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
