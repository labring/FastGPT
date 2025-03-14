import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  ModalBody,
  ModalFooter,
  Switch,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useUserStore } from '@/web/support/user/useUserStore';
import SelectAiModel from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { defaultDatasetMaxTokens } from '@fastgpt/global/core/app/constants';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import MyIcon from '@fastgpt/web/components/common/Icon';

enum SearchSettingTabEnum {
  searchMode = 'searchMode',
  limit = 'limit',
  queryExtension = 'queryExtension'
}

const DatasetParamsModal = ({
  searchMode = DatasetSearchModeEnum.embedding,
  limit,
  similarity,
  embeddingWeight,
  usingReRank,
  rerankModel,
  rerankWeight,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  maxTokens = defaultDatasetMaxTokens,
  onClose,
  onSuccess
}: AppDatasetSearchParamsType & {
  maxTokens?: number; // limit max tokens
  onClose: () => void;
  onSuccess: (e: AppDatasetSearchParamsType) => void;
}) => {
  const { t } = useTranslation();
  const { teamPlanStatus } = useUserStore();
  const { reRankModelList, llmModelList, defaultModels } = useSystemStore();
  const [refresh, setRefresh] = useState(false);
  const [currentTabType, setCurrentTabType] = useState(SearchSettingTabEnum.searchMode);

  const chatModelSelectList = (() =>
    llmModelList.map((item) => ({
      value: item.model,
      label: item.name
    })))();
  const reRankModelSelectList = (() =>
    reRankModelList.map((item) => ({
      value: item.model,
      label: item.name
    })))();

  const { register, setValue, getValues, handleSubmit, watch } =
    useForm<AppDatasetSearchParamsType>({
      defaultValues: {
        searchMode,
        embeddingWeight: embeddingWeight || 0.5,
        usingReRank: !!usingReRank && teamPlanStatus?.standardConstants?.permissionReRank !== false,
        rerankModel: rerankModel || defaultModels?.rerank?.model,
        rerankWeight: rerankWeight || 0.5,
        limit,
        similarity,
        datasetSearchUsingExtensionQuery,
        datasetSearchExtensionModel: datasetSearchExtensionModel || defaultModels.llm?.model,
        datasetSearchExtensionBg
      }
    });

  const searchModeWatch = watch('searchMode');
  const embeddingWeightWatch = watch('embeddingWeight');
  const fullTextWeightWatch = useMemo(() => {
    const val = 1 - (embeddingWeightWatch || 0.5);
    return Number(val.toFixed(2));
  }, [embeddingWeightWatch]);

  const datasetSearchUsingCfrForm = watch('datasetSearchUsingExtensionQuery');
  const queryExtensionModel = watch('datasetSearchExtensionModel');

  const usingReRankWatch = watch('usingReRank');
  const reRankModelWatch = watch('rerankModel');
  const rerankWeightWatch = watch('rerankWeight');

  const showSimilarity = useMemo(() => {
    if (similarity === undefined) return false;
    if (usingReRankWatch) return true;
    if (searchModeWatch === DatasetSearchModeEnum.embedding) return true;
    return false;
  }, [searchModeWatch, similarity, usingReRankWatch]);

  const showReRank = useMemo(() => {
    return usingReRank !== undefined && reRankModelList.length > 0;
  }, [reRankModelList.length, usingReRank]);

  useEffect(() => {
    if (datasetSearchUsingCfrForm) {
      !queryExtensionModel && setValue('datasetSearchExtensionModel', defaultModels.llm?.model);
    } else {
      setValue('datasetSearchExtensionModel', '');
    }
  }, [
    chatModelSelectList,
    datasetSearchUsingCfrForm,
    defaultModels.llm?.model,
    queryExtensionModel,
    setValue
  ]);

  // 保证只有 80 左右个刻度。
  const maxTokenStep = useMemo(() => {
    if (maxTokens < 8000) return 80;
    return Math.ceil(maxTokens / 80 / 100) * 100;
  }, [maxTokens]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('common:core.dataset.search.Dataset Search Params')}
      w={['90vw', '550px']}
    >
      <ModalBody flex={'auto'} overflow={'auto'} px={[4, 10]}>
        <LightRowTabs<SearchSettingTabEnum>
          width={'100%'}
          mb={3}
          list={[
            {
              icon: 'common/setting',
              label: t('common:core.dataset.search.search mode'),
              value: SearchSettingTabEnum.searchMode
            },
            {
              icon: 'core/dataset/searchfilter',
              label: t('common:core.dataset.search.Filter'),
              value: SearchSettingTabEnum.limit
            },
            {
              label: t('common:core.module.template.Query extension'),
              value: SearchSettingTabEnum.queryExtension,
              icon: 'core/dataset/questionExtension'
            }
          ]}
          inlineStyles={{
            borderBottomColor: 'myGray.200',
            borderBottom: '1px solid'
          }}
          value={currentTabType}
          onChange={setCurrentTabType}
        />
        {currentTabType === SearchSettingTabEnum.searchMode && (
          <Box mt={3}>
            <LeftRadio<`${DatasetSearchModeEnum}`>
              py={2.5}
              gridGap={4}
              list={[
                {
                  title: t('common:core.dataset.search.mode.embedding'),
                  desc: t('common:core.dataset.search.mode.embedding desc'),
                  value: DatasetSearchModeEnum.embedding
                },
                {
                  title: t('common:core.dataset.search.mode.fullTextRecall'),
                  desc: t('common:core.dataset.search.mode.fullTextRecall desc'),
                  value: DatasetSearchModeEnum.fullTextRecall
                },
                {
                  title: t('common:core.dataset.search.mode.mixedRecall'),
                  desc: t('common:core.dataset.search.mode.mixedRecall desc'),
                  value: DatasetSearchModeEnum.mixedRecall,
                  children: searchModeWatch === DatasetSearchModeEnum.mixedRecall && (
                    <Box mt={3}>
                      <HStack justifyContent={'space-between'}>
                        <Flex alignItems={'center'}>
                          <Box fontSize={'sm'} color={'myGray.900'}>
                            {t('common:core.dataset.search.mode.embedding')}
                          </Box>
                          <Box fontSize={'xs'} color={'myGray.500'}>
                            {embeddingWeightWatch}
                          </Box>
                        </Flex>
                        <Flex alignItems={'center'}>
                          <Box fontSize={'sm'} color={'myGray.900'}>
                            {t('common:core.dataset.search.score.fullText')}
                          </Box>
                          <Box fontSize={'xs'} color={'myGray.500'}>
                            {fullTextWeightWatch}
                          </Box>
                        </Flex>
                      </HStack>
                      <Slider
                        defaultValue={embeddingWeightWatch}
                        min={0.1}
                        max={0.9}
                        step={0.01}
                        onChange={(e) => {
                          setValue('embeddingWeight', Number(e.toFixed(2)));
                        }}
                      >
                        <SliderTrack bg={'#F9518E'}>
                          <SliderFilledTrack bg={'#3370FF'} />
                        </SliderTrack>
                        <SliderThumb boxShadow={'none'} bg={'none'}>
                          <MyIcon transform={'translateY(10px)'} name={'sliderTag'} w={'1rem'} />
                        </SliderThumb>
                      </Slider>
                    </Box>
                  )
                }
              ]}
              value={searchModeWatch}
              onChange={(e) => {
                setValue('searchMode', e);
              }}
            />
            {/* Rerank */}
            <>
              <HStack mt={6} justifyContent={'space-between'}>
                <FormLabel>
                  {t('common:core.dataset.search.ReRank')}
                  <QuestionTip ml={0.5} label={t('common:core.dataset.search.ReRank desc')} />
                </FormLabel>
                {!showReRank ? (
                  <Box color={'myGray.500'} fontSize={'sm'}>
                    {t('common:core.ai.Not deploy rerank model')}
                  </Box>
                ) : teamPlanStatus?.standardConstants &&
                  !teamPlanStatus?.standardConstants?.permissionReRank ? (
                  <Box color={'myGray.500'} fontSize={'sm'}>
                    {t('common:support.team.limit.No permission rerank')}
                  </Box>
                ) : (
                  <Switch {...register('usingReRank')} />
                )}
              </HStack>
              {usingReRankWatch && (
                <>
                  <HStack mt={3} justifyContent={'space-between'}>
                    <Box fontSize={'sm'} flex={'0 0 100px'} color={'myGray.700'}>
                      {t('common:rerank_weight')}
                    </Box>
                    <Box flex={'1 0 0'}>
                      <InputSlider
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={rerankWeightWatch}
                        onChange={(val) => {
                          setValue(
                            NodeInputKeyEnum.datasetSearchRerankWeight,
                            Number(val.toFixed(2))
                          );
                        }}
                      />
                    </Box>
                  </HStack>
                  <HStack mt={3}>
                    <Box fontSize={'sm'} flex={'0 0 100px'} color={'myGray.700'}>
                      {t('common:model.type.reRank')}
                    </Box>
                    <Box flex={'1 0 0'}>
                      <SelectAiModel
                        bg={'myGray.50'}
                        h={'36px'}
                        value={reRankModelWatch}
                        list={reRankModelSelectList}
                        onChange={(val) => {
                          setValue(NodeInputKeyEnum.datasetSearchRerankModel, val);
                        }}
                      />
                    </Box>
                  </HStack>
                </>
              )}
            </>
          </Box>
        )}
        {currentTabType === SearchSettingTabEnum.limit && (
          <Box pt={5}>
            {limit !== undefined && (
              <Box display={['block', 'flex']}>
                <Flex flex={'0 0 120px'} alignItems={'center'} mb={[5, 0]}>
                  <FormLabel>{t('common:max_quote_tokens')}</FormLabel>
                  <QuestionTip label={t('common:max_quote_tokens_tips')} />
                </Flex>
                <Box flex={'1 0 0'}>
                  <InputSlider
                    min={100}
                    max={maxTokens}
                    step={maxTokenStep}
                    value={getValues(NodeInputKeyEnum.datasetMaxTokens) ?? 1000}
                    onChange={(val) => {
                      setValue(NodeInputKeyEnum.datasetMaxTokens, val);
                      setRefresh(!refresh);
                    }}
                  />
                </Box>
              </Box>
            )}
            <Box display={['block', 'flex']} mt={[6, 10]} mb={4}>
              <Flex flex={'0 0 120px'} alignItems={'center'} mb={[5, 0]}>
                <FormLabel>{t('common:min_similarity')}</FormLabel>
                <QuestionTip label={t('common:min_similarity_tip')} />
              </Flex>
              <Box flex={'1 0 0'}>
                {showSimilarity ? (
                  <InputSlider
                    min={0}
                    max={1}
                    step={0.01}
                    value={getValues(NodeInputKeyEnum.datasetSimilarity) ?? 0.5}
                    onChange={(val) => {
                      setValue(NodeInputKeyEnum.datasetSimilarity, val);
                      setRefresh(!refresh);
                    }}
                  />
                ) : (
                  <Box color={'myGray.500'} fontSize={'sm'}>
                    {t('common:core.dataset.search.No support similarity')}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )}
        {currentTabType === SearchSettingTabEnum.queryExtension && (
          <Box>
            <Box transform={'translateY(-5px)'} fontSize={'xs'} color={'myGray.500'}>
              {t('common:core.dataset.Query extension intro')}
            </Box>
            <Flex mt={3} alignItems={'center'}>
              <FormLabel flex={'1 0 0'}>
                {t('common:core.dataset.search.Using query extension')}
              </FormLabel>
              <Switch {...register('datasetSearchUsingExtensionQuery')} />
            </Flex>
            {datasetSearchUsingCfrForm === true && (
              <>
                <Flex mt={4} alignItems={'center'}>
                  <FormLabel flex={['0 0 80px', '1 0 0']}>{t('common:core.ai.Model')}</FormLabel>
                  <Box flex={['1 0 0', '0 0 300px']}>
                    <SelectAiModel
                      width={'100%'}
                      value={queryExtensionModel}
                      list={chatModelSelectList}
                      onChange={(val: any) => {
                        setValue('datasetSearchExtensionModel', val);
                      }}
                    />
                  </Box>
                </Flex>
                <Box mt={3}>
                  <Flex alignItems={'center'}>
                    <FormLabel>
                      {t('common:core.app.edit.Query extension background prompt')}
                    </FormLabel>
                    <QuestionTip
                      ml={1}
                      label={t('common:core.app.edit.Query extension background tip')}
                    ></QuestionTip>
                  </Flex>
                  <Box mt={1}>
                    <MyTextarea
                      autoHeight
                      minH={150}
                      maxH={300}
                      placeholder={t('common:core.module.QueryExtension.placeholder')}
                      {...register('datasetSearchExtensionBg')}
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
          {t('common:common.Close')}
        </Button>
        <Button
          onClick={() => {
            onClose();
            handleSubmit(onSuccess)();
          }}
        >
          {t('common:common.Done')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default DatasetParamsModal;
