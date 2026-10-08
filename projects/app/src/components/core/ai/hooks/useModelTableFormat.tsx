import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import type { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ColorSchemaType } from '@fastgpt/web/components/common/Tag/index';
import type { PriceType } from '@fastgpt/global/core/ai/model/schema';
import PriceTiersLabel from '@/components/core/ai/PriceTiersLabel';

type ModelConfigCapabilityFields = {
  maxContext?: number;
  maxToken?: number;
  vision?: boolean;
  audio?: boolean;
  video?: boolean;
  reasoning?: boolean;
  toolChoice?: boolean;
};

export type BaseFormatModelItem = Partial<PriceType> & {
  modelId?: string;
  name: string;
  model?: string;
  type: ModelTypeEnum;
  provider: string;
  charsPointsPrice?: number;
  config?: ModelConfigCapabilityFields | Record<string, unknown>;
  isActive?: boolean;
  testMode?: boolean;
  scope?: ModelScopeEnum;
};

export type FormattedModelTableItem<T extends BaseFormatModelItem> = T & {
  modelId?: string;
  scope?: ModelScopeEnum;
  typeLabel: string;
  priceLabel: React.ReactNode;
  tagColor: ColorSchemaType;
  avatar?: string;
  providerId?: string;
  providerName?: string;
  order?: number;
  contextToken?: number;
  vision?: boolean;
  audio?: boolean;
  video?: boolean;
  reasoning?: boolean;
  toolChoice?: boolean;
};

type FormatModelTableListProps<T extends BaseFormatModelItem> = {
  models: T[];
  modelType?: ModelTypeEnum | '';
  provider?: string;
  search?: string;
  showActive?: boolean;
  sortByOrder?: boolean;
  getModelProvider: (
    provider?: string,
    language?: string
  ) => { id?: string; name?: string; avatar?: string; order?: number };
  language: string;
  t: (key: string) => string;
};

/**
 * 纯计算模型列表格式化与过滤函数（脱离 React 渲染生命周期，易于测试和复用）
 */
const formatModelTableList = <T extends BaseFormatModelItem>({
  models,
  modelType,
  provider,
  search = '',
  showActive = false,
  sortByOrder = false,
  getModelProvider,
  language,
  t
}: FormatModelTableListProps<T>): FormattedModelTableItem<T>[] => {
  const formatLLMModelList = models
    .filter((item) => item.type === ModelTypeEnum.llm)
    .map((item) => ({
      ...item,
      typeLabel: t('common:model.type.chat'),
      priceLabel: (
        <PriceTiersLabel
          config={item}
          unitLabel={`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
        />
      ),
      tagColor: 'blue' as ColorSchemaType
    }));

  const formatVectorModelList = models
    .filter((item) => item.type === ModelTypeEnum.embedding)
    .map((item) => ({
      ...item,
      typeLabel: t('common:model.type.embedding'),
      priceLabel: item.charsPointsPrice ? (
        <Flex color={'myGray.700'}>
          {`${t('common:Input')}: `}
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 1K Tokens`}
        </Flex>
      ) : (
        '-'
      ),
      tagColor: 'yellow' as ColorSchemaType
    }));

  const formatAudioSpeechModelList = models
    .filter((item) => item.type === ModelTypeEnum.tts)
    .map((item) => ({
      ...item,
      typeLabel: t('common:model.type.tts'),
      priceLabel: item.charsPointsPrice ? (
        <Flex color={'myGray.700'}>
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 1K ${t('common:unit.character')}`}
        </Flex>
      ) : (
        '-'
      ),
      tagColor: 'green' as ColorSchemaType
    }));

  const formatWhisperModel = models
    .filter((item) => item.type === ModelTypeEnum.stt)
    .map((item) => ({
      ...item,
      typeLabel: t('common:model.type.stt'),
      priceLabel: item.charsPointsPrice ? (
        <Flex color={'myGray.700'}>
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 60${t('common:unit.seconds')}`}
        </Flex>
      ) : (
        '-'
      ),
      tagColor: 'purple' as ColorSchemaType
    }));

  const formatRerankModelList = models
    .filter((item) => item.type === ModelTypeEnum.rerank)
    .map((item) => ({
      ...item,
      typeLabel: t('common:model.type.reRank'),
      priceLabel: item.charsPointsPrice ? (
        <Flex color={'myGray.700'}>
          {`${t('common:Input')}: `}
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice}
          </Box>
          {` ${t('common:support.wallet.subscription.point')} / 1K Tokens`}
        </Flex>
      ) : (
        '-'
      ),
      tagColor: 'red' as ColorSchemaType
    }));

  const formattedModelMap = new Map(
    [
      ...formatLLMModelList,
      ...formatVectorModelList,
      ...formatAudioSpeechModelList,
      ...formatWhisperModel,
      ...formatRerankModelList
    ].map((item) => [item.modelId ?? item.name, item] as const)
  );

  const list = models.flatMap((item) => {
    if (modelType && item.type !== modelType) return [];
    const key = item.modelId ?? item.name;
    const formattedModel = formattedModelMap.get(key);
    return formattedModel ? [formattedModel] : [];
  });

  const enrichedList = list.map((item) => {
    const providerMeta = getModelProvider(item.provider, language);
    const cfg = item.config as ModelConfigCapabilityFields | undefined;
    return {
      ...item,
      modelId: 'modelId' in item && typeof item.modelId === 'string' ? item.modelId : undefined,
      scope:
        'scope' in item && typeof item.scope === 'string'
          ? (item.scope as ModelScopeEnum)
          : undefined,
      avatar: providerMeta?.avatar,
      providerId: providerMeta?.id,
      providerName: providerMeta?.name,
      order: providerMeta?.order ?? 0,
      contextToken:
        item.type === ModelTypeEnum.llm
          ? cfg?.maxContext
          : item.type === ModelTypeEnum.embedding || item.type === ModelTypeEnum.rerank
            ? cfg?.maxToken
            : undefined,
      vision:
        item.type === ModelTypeEnum.llm || item.type === ModelTypeEnum.embedding
          ? cfg?.vision
          : undefined,
      audio: item.type === ModelTypeEnum.llm ? cfg?.audio : undefined,
      video: item.type === ModelTypeEnum.llm ? cfg?.video : undefined,
      reasoning: item.type === ModelTypeEnum.llm ? cfg?.reasoning : undefined,
      toolChoice: item.type === ModelTypeEnum.llm ? cfg?.toolChoice : undefined
    } as FormattedModelTableItem<T>;
  });

  if (sortByOrder) {
    enrichedList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return enrichedList.filter((item) => {
    const providerFilter = provider ? item.providerId === provider : true;

    const normalizedSearch = search.trim().toLowerCase();
    const nameFilter = normalizedSearch
      ? item.name.toLowerCase().includes(normalizedSearch) ||
        (item.model ? item.model.toLowerCase().includes(normalizedSearch) : false)
      : true;

    const activeFilter = showActive ? item.isActive : true;

    return providerFilter && nameFilter && activeFilter;
  });
};

type UseModelTableFormatProps<T extends BaseFormatModelItem> = Omit<
  FormatModelTableListProps<T>,
  't'
>;

/**
 * React 状态记忆封装
 */
export const useModelTableFormat = <T extends BaseFormatModelItem>({
  models,
  modelType,
  provider,
  search = '',
  showActive = false,
  sortByOrder = false,
  getModelProvider,
  language
}: UseModelTableFormatProps<T>) => {
  const { t } = useClientTranslation();

  const formattedList = useMemo(
    () =>
      formatModelTableList({
        models,
        modelType,
        provider,
        search,
        showActive,
        sortByOrder,
        getModelProvider,
        language,
        t
      }),
    [models, modelType, provider, search, showActive, sortByOrder, getModelProvider, language, t]
  );

  const activeCount = useMemo(() => {
    return formattedList.filter((item) => item.isActive).length;
  }, [formattedList]);

  return {
    formattedList,
    activeCount
  };
};
