import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
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
export const formatModelTableList = <T extends BaseFormatModelItem>({
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
  // 逐项投影保留原始身份和顺序；公开价格目录没有 modelId，同名模型也不能互相覆盖。
  const list = models
    .filter((item) => !modelType || item.type === modelType)
    .map((item) => {
      const presentation = {
        [ModelTypeEnum.llm]: { typeLabel: t('common:model.type.chat'), color: 'blue' },
        [ModelTypeEnum.embedding]: {
          typeLabel: t('common:model.type.embedding'),
          color: 'yellow'
        },
        [ModelTypeEnum.tts]: { typeLabel: t('common:model.type.tts'), color: 'green' },
        [ModelTypeEnum.stt]: { typeLabel: t('common:model.type.stt'), color: 'purple' },
        [ModelTypeEnum.rerank]: { typeLabel: t('common:model.type.reRank'), color: 'red' }
      } as const;
      const { typeLabel, color } = presentation[item.type];
      const unit =
        item.type === ModelTypeEnum.stt
          ? `60${t('common:unit.seconds')}`
          : item.type === ModelTypeEnum.tts
            ? `1K ${t('common:unit.character')}`
            : '1K Tokens';
      const priceLabel =
        item.type === ModelTypeEnum.llm ? (
          <PriceTiersLabel
            config={item}
            unitLabel={`${t('common:support.wallet.subscription.point')} / ${unit}`}
          />
        ) : item.charsPointsPrice ? (
          <Flex color={'myGray.700'}>
            {(item.type === ModelTypeEnum.embedding || item.type === ModelTypeEnum.rerank) &&
              `${t('common:Input')}: `}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / ${unit}`}
          </Flex>
        ) : (
          '-'
        );
      return { ...item, typeLabel, tagColor: color, priceLabel };
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
  const { t } = useSafeTranslation();

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
