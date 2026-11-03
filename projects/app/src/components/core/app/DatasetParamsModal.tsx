import React from 'react';
import { getModelDefault } from '@/web/core/ai/model/modelData';
import {
  Box,
  Button,
  Flex,
  HStack,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Switch
} from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  getNextDatasetTagFilterValue,
  isDatasetTagFilterOpen
} from '@fastgpt/global/core/dataset/search/tagFilter';
import {
  datasetTagFilterValueDesc,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import MyTextarea from '@/components/common/Textarea/MyTextarea';
import DatasetTagFilterRows, {
  filterTagFilterReferenceList,
  type TagFilterReferenceList
} from '@/components/core/dataset/DatasetTagFilterRows';
import { ReferSelector } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference';
import ValueTypeLabel from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/ValueTypeLabel';
import SelectAiModel from '@/components/Select/AIModelSelector';
import { type AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useToast } from '@fastgpt/web/hooks/useToast';

enum SearchSettingTabEnum {
  searchMode = 'searchMode',
  limit = 'limit',
  queryExtension = 'queryExtension'
}

export type DatasetParamsModalFormType = Omit<
  AppDatasetSearchParamsType,
  'collectionFilterMatch'
> & {
  collectionFilterMatch?:
    | AppDatasetSearchParamsType['collectionFilterMatch']
    | ReferenceItemValueType
    | [];
};

const DatasetParamsModal = ({
  searchMode = DatasetSearchModeEnum.embedding,
  limit,
  similarity,
  embeddingWeight,
  usingReRank,
  rerankModelId,
  rerankModel,
  rerankWeight,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModelId,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  collectionFilterMatch,
  showTagFilter = false,
  canSwitchTagFilterMode = false,
  datasetIds,
  tagFilterReferenceList = [],
  maxTokens,
  appId,
  onClose,
  onSuccess
}: DatasetParamsModalFormType & {
  showTagFilter?: boolean;
  canSwitchTagFilterMode?: boolean;
  datasetIds?: string[];
  tagFilterReferenceList?: TagFilterReferenceList;
  maxTokens?: number; // limit max tokens
  appId?: string;
  onClose: () => void;
  onSuccess: (e: AppDatasetSearchParamsType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [refresh, setRefresh] = useState(false);
  const [currentTabType, setCurrentTabType] = useState(SearchSettingTabEnum.searchMode);

  // 固定本次弹窗的初始值；values 接受完整业务类型，避免 DeepPartial 将 unknown 条件值收窄成对象。
  const [initialValues] = useState<DatasetParamsModalFormType>(() => ({
    searchMode,
    embeddingWeight: embeddingWeight ?? 0.5,
    usingReRank: !!usingReRank,
    // 只恢复已保存的引用，不在初始化阶段选择默认模型。
    rerankModelId,
    rerankModel,
    rerankWeight: rerankWeight ?? 0.5,
    limit,
    similarity,
    datasetSearchUsingExtensionQuery,
    datasetSearchExtensionModelId,
    datasetSearchExtensionModel,
    datasetSearchExtensionBg,
    ...(showTagFilter ? { collectionFilterMatch } : {})
  }));
  const { register, setValue, getValues, handleSubmit, watch } =
    useForm<DatasetParamsModalFormType>({ values: initialValues });

  const searchModeWatch = watch('searchMode');
  const embeddingWeightWatch = watch('embeddingWeight');
  const fullTextWeightWatch = useMemo(() => {
    const val = 1 - (embeddingWeightWatch ?? 0.5);
    return Number(val.toFixed(2));
  }, [embeddingWeightWatch]);

  const datasetSearchUsingCfrForm = watch('datasetSearchUsingExtensionQuery');
  const queryExtensionModelId = watch('datasetSearchExtensionModelId');

  const usingReRankWatch = watch('usingReRank');
  const reRankModelIdWatch = watch('rerankModelId');
  const rerankWeightWatch = watch('rerankWeight');
  const collectionFilterMatchWatch = watch('collectionFilterMatch');
  const isTagFilterOpen = isDatasetTagFilterOpen(collectionFilterMatchWatch);
  const isTagFilterReference = canSwitchTagFilterMode && Array.isArray(collectionFilterMatchWatch);
  const stringTagFilterReferenceList = useMemo(
    () => filterTagFilterReferenceList(tagFilterReferenceList, [WorkflowIOValueTypeEnum.string]),
    [tagFilterReferenceList]
  );

  const showSimilarity = useMemo(() => {
    if (similarity === undefined) return false;
    if (usingReRankWatch) return true;
    if (searchModeWatch === DatasetSearchModeEnum.embedding) return true;
    return false;
  }, [searchModeWatch, similarity, usingReRankWatch]);

  const showReRank = usingReRank !== undefined;

  // 保证只有 80 左右个刻度。
  const maxTokenStep = useMemo(() => {
    if (!maxTokens || maxTokens < 8000) return 80;
    return Math.ceil(maxTokens / 80 / 100) * 100;
  }, [maxTokens]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      isCentered
      title={t('common:core.dataset.search.Dataset Search Params')}
      size={'md'}
      bodyStyles={{
        overflow: 'hidden',
        px: 0
      }}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            onClick={() => {
              handleSubmit((values) => {
                if (
                  values.datasetSearchUsingExtensionQuery &&
                  isEmptyModelValue(values.datasetSearchExtensionModelId)
                ) {
                  toast({
                    status: 'warning',
                    title: t('common:core.workflow.check.model_required_short', {
                      inputName: t('common:core.module.template.Query extension')
                    })
                  });
                  setCurrentTabType(SearchSettingTabEnum.queryExtension);
                  return;
                }
                // 兼容读取旧字符串字段，但新的表单提交只保留稳定 modelId。
                const {
                  rerankModel: _rerankModel,
                  datasetSearchExtensionModel: _extensionModel,
                  ...canonicalValues
                } = values;
                onSuccess(canonicalValues as AppDatasetSearchParamsType);
                onClose();
              })();
            }}
          >
            {t('common:Done')}
          </Button>
        </>
      }
    >
      <Box px={8} flexShrink={0}>
        <LightRowTabs<SearchSettingTabEnum>
          width={'100%'}
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
      </Box>
      <Box flex={'1 1 auto'} minH={0} overflowY={'auto'} px={8} pt={3} pb={1}>
        {currentTabType === SearchSettingTabEnum.searchMode && (
          <Box pt={1}>
            <LeftRadio<DatasetSearchModeEnum>
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
                ) : (
                  <Switch
                    {...register('usingReRank')}
                    onChange={async (event) => {
                      const enabled = event.target.checked;
                      const wasEnabled = getValues('usingReRank');
                      setValue('usingReRank', enabled, { shouldDirty: true });
                      // 只在关闭→开启的用户操作中初始化，打开弹窗和目录更新均不改模型值。
                      if (!enabled || wasEnabled) return;
                      const currentModelId = getValues('rerankModelId');
                      if (!isEmptyModelValue(currentModelId ?? rerankModel)) return;
                      const model = await getModelDefault({ modelType: ModelTypeEnum.rerank });
                      if (
                        model &&
                        getValues('usingReRank') &&
                        getValues('rerankModelId') === currentModelId
                      ) {
                        setValue('rerankModelId', model.modelId, { shouldDirty: true });
                      }
                    }}
                  />
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
                        modelType={ModelTypeEnum.rerank}
                        appId={appId}
                        bg={'myGray.50'}
                        h={'36px'}
                        value={reRankModelIdWatch || rerankModel}
                        onChange={(modelId) =>
                          setValue(NodeInputKeyEnum.datasetSearchRerankModelId, modelId)
                        }
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
                  {maxTokens ? (
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
                  ) : (
                    <MyNumberInput
                      size={'sm'}
                      min={100}
                      max={1000000}
                      step={100}
                      register={register}
                      name={NodeInputKeyEnum.datasetMaxTokens}
                    />
                  )}
                </Box>
              </Box>
            )}
            <Box display={['block', 'flex']} mt={[6, 10]} mb={showTagFilter ? 0 : 4}>
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
            {showTagFilter && (
              <Box mt={[6, 10]} mb={4}>
                <Box display={['block', 'flex']} alignItems={'center'} minH={'28px'}>
                  <Flex flex={'0 0 120px'} alignItems={'center'} mb={[5, 0]}>
                    <FormLabel>{t('workflow:tag_filter')}</FormLabel>
                    <QuestionTip label={t('workflow:tag_filter_description')} />
                  </Flex>
                  <Flex flex={'1 0 0'} alignItems={'center'} gap={4}>
                    <Switch
                      name={'collectionFilterOpen'}
                      isChecked={isTagFilterOpen}
                      onChange={(event) => {
                        setValue(
                          'collectionFilterMatch',
                          getNextDatasetTagFilterValue({
                            value: getValues('collectionFilterMatch'),
                            isReference: isTagFilterReference,
                            open: event.target.checked
                          }),
                          { shouldDirty: true }
                        );
                      }}
                    />
                    {isTagFilterOpen && canSwitchTagFilterMode && (
                      <>
                        {isTagFilterReference && (
                          <ValueTypeLabel
                            valueType={WorkflowIOValueTypeEnum.string}
                            valueDesc={datasetTagFilterValueDesc}
                            ml={0}
                          />
                        )}
                        <NodeInputSelect
                          renderTypeList={[
                            FlowNodeInputTypeEnum.datasetTagFilter,
                            FlowNodeInputTypeEnum.reference
                          ]}
                          selectedType={
                            isTagFilterReference
                              ? FlowNodeInputTypeEnum.reference
                              : FlowNodeInputTypeEnum.datasetTagFilter
                          }
                          onChange={(nextType) => {
                            setValue(
                              'collectionFilterMatch',
                              getNextDatasetTagFilterValue({
                                value: getValues('collectionFilterMatch'),
                                isReference: nextType === FlowNodeInputTypeEnum.reference,
                                open: true
                              }),
                              { shouldDirty: true }
                            );
                          }}
                        />
                      </>
                    )}
                  </Flex>
                </Box>
                {isTagFilterOpen &&
                  (isTagFilterReference ? (
                    <Box mt={2}>
                      <ReferSelector
                        placeholder={t('common:select_reference_variable')}
                        list={stringTagFilterReferenceList}
                        value={
                          Array.isArray(collectionFilterMatchWatch)
                            ? (collectionFilterMatchWatch as ReferenceItemValueType)
                            : undefined
                        }
                        onSelect={(val) => {
                          setValue('collectionFilterMatch', val ?? [], { shouldDirty: true });
                        }}
                        isArray={false}
                        ButtonProps={{
                          h: '40px',
                          w: '100%',
                          borderRadius: 'md'
                        }}
                      />
                    </Box>
                  ) : (
                    <Box mt={4}>
                      <DatasetTagFilterRows
                        usePortal
                        value={collectionFilterMatchWatch}
                        onChange={(value) => {
                          setValue('collectionFilterMatch', value, { shouldDirty: true });
                        }}
                        datasetIds={datasetIds}
                        referenceList={tagFilterReferenceList}
                      />
                    </Box>
                  ))}
              </Box>
            )}
          </Box>
        )}
        {currentTabType === SearchSettingTabEnum.queryExtension && (
          <Box>
            <Box fontSize={'xs'} color={'myGray.500'}>
              {t('common:core.dataset.Query extension intro')}
            </Box>
            <Flex mt={3} alignItems={'center'}>
              <FormLabel flex={'1 0 0'}>
                {t('common:core.dataset.search.Using query extension')}
              </FormLabel>
              <Switch
                {...register('datasetSearchUsingExtensionQuery')}
                onChange={async (event) => {
                  const enabled = event.target.checked;
                  const wasEnabled = getValues('datasetSearchUsingExtensionQuery');
                  setValue('datasetSearchUsingExtensionQuery', enabled, { shouldDirty: true });
                  // 与重排、猜你想问一致：只在关→开时按默认模型、首项的顺序补齐。
                  if (!enabled || wasEnabled) return;
                  const currentModelId = getValues('datasetSearchExtensionModelId');
                  if (!isEmptyModelValue(currentModelId ?? datasetSearchExtensionModel)) return;
                  const model = await getModelDefault({ modelType: ModelTypeEnum.llm });
                  if (
                    model &&
                    getValues('datasetSearchUsingExtensionQuery') &&
                    getValues('datasetSearchExtensionModelId') === currentModelId
                  ) {
                    setValue('datasetSearchExtensionModelId', model.modelId, {
                      shouldDirty: true
                    });
                  }
                }}
              />
            </Flex>
            {datasetSearchUsingCfrForm === true && (
              <>
                <Flex mt={4} alignItems={'center'}>
                  <FormLabel flex={['0 0 80px', '1 0 0']}>{t('common:core.ai.Model')}</FormLabel>
                  <Box flex={['1 0 0', '0 0 300px']}>
                    <SelectAiModel
                      modelType={ModelTypeEnum.llm}
                      appId={appId}
                      width={'100%'}
                      value={
                        queryExtensionModelId !== undefined
                          ? queryExtensionModelId
                          : datasetSearchExtensionModel
                      }
                      onChange={(modelId) => setValue('datasetSearchExtensionModelId', modelId)}
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
      </Box>
    </MyModal>
  );
};

export default DatasetParamsModal;
