import { Box, Flex, HStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { FilterState, I18nT, ModelRow, ProviderOption } from '../types';

type ModelProvider = {
  avatar: string;
  id: string;
  name: string;
  order: number;
};

type BaseModelItem = {
  model: string;
  name: string;
  provider: string;
  isTuned?: boolean;
  charsPointsPrice?: number;
  inputPrice?: number;
  outputPrice?: number;
  trainTaskList?: ModelRow['trainTaskList'];
};

type TrainableModelItem = BaseModelItem & {
  trainTaskList?: ModelRow['trainTaskList'];
  supportTrain?: boolean;
};

type ModelLists = {
  llmModelList: BaseModelItem[];
  embeddingModelList: TrainableModelItem[];
  ttsModelList: BaseModelItem[];
  sttModelList: BaseModelItem[];
  reRankModelList: TrainableModelItem[];
};

export const getProviderOptions = ({
  getModelProviders,
  language,
  t
}: {
  getModelProviders: (lang?: string) => Array<{ avatar: string; name: string; id: string }>;
  language: string;
  t: I18nT;
}): ProviderOption[] => [
  { label: t('common:model.all_provider'), value: '' },
  ...getModelProviders(language).map((item) => ({
    label: (
      <HStack>
        <Avatar src={item.avatar} w={'1rem'} />
        <Box>{item.name}</Box>
      </HStack>
    ),
    value: item.id
  }))
];

export const getModelTypeOptions = (t: I18nT): { label: string; value: ModelTypeEnum | '' }[] => [
  { label: t('common:model.all_type'), value: '' },
  ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
];

export const getFilteredProviderList = ({
  providerOptions,
  llmModelList,
  embeddingModelList,
  ttsModelList,
  sttModelList,
  reRankModelList
}: {
  providerOptions: ProviderOption[];
} & ModelLists) => {
  const allProviderIds: string[] = [
    ...llmModelList,
    ...embeddingModelList,
    ...ttsModelList,
    ...sttModelList,
    ...reRankModelList
  ].map((model) => model.provider);

  return providerOptions.filter((item) => allProviderIds.includes(item.value) || item.value === '');
};

type FormattedModelItem = BaseModelItem & {
  typeLabel: string;
  priceLabel: React.ReactNode;
  tagColor: string;
  trainableModelType?: ModelTypeEnum.embedding | ModelTypeEnum.rerank;
};

export const getFilteredModelList = ({
  llmModelList,
  embeddingModelList,
  ttsModelList,
  sttModelList,
  reRankModelList,
  getModelProvider,
  language,
  t,
  filterState
}: ModelLists & {
  getModelProvider: (provider: string, language?: string) => ModelProvider;
  language: string;
  t: I18nT;
  filterState: FilterState;
}): ModelRow[] => {
  const formatLLMModelList: FormattedModelItem[] = llmModelList.map((item) => ({
    ...item,
    typeLabel: t('common:model.type.chat'),
    priceLabel:
      typeof item.inputPrice === 'number' ? (
        <Box>
          <Flex>
            {`${t('common:Input')}: `}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
              {item.inputPrice || 0}
            </Box>
            {`${t('common:support.wallet.subscription.point')}/1K tokens`}
          </Flex>
          <Flex>
            {`${t('common:Output')}: `}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
              {item.outputPrice || 0}
            </Box>
            {`${t('common:support.wallet.subscription.point')}/1K tokens`}
          </Flex>
        </Box>
      ) : (
        <Flex color={'myGray.700'}>
          <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
            {item.charsPointsPrice || 0}
          </Box>
          {`${t('common:support.wallet.subscription.point')}/1K tokens`}
        </Flex>
      ),
    tagColor: 'blue'
  }));

  const formatEmbeddingModelList: FormattedModelItem[] = embeddingModelList.map((item) => ({
    ...item,
    typeLabel: t('common:model.type.embedding'),
    priceLabel: (
      <Flex color={'myGray.700'}>
        {`${t('common:Input')}: `}
        <Box fontWeight={'bold'} color={'myGray.900'} mx={0.5}>
          {item.charsPointsPrice || 0}
        </Box>
        {` ${t('common:support.wallet.subscription.point')}/1K tokens`}
      </Flex>
    ),
    tagColor: 'yellow',
    trainableModelType: item.supportTrain ? ModelTypeEnum.embedding : undefined
  }));

  const formatTTSModelList: FormattedModelItem[] = ttsModelList.map((item) => ({
    ...item,
    typeLabel: t('common:model.type.tts'),
    priceLabel: (
      <Flex color={'myGray.700'}>
        <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
          {item.charsPointsPrice || 0}
        </Box>
        {` ${t('common:support.wallet.subscription.point')}/1K ${t('common:unit.character')}`}
      </Flex>
    ),
    tagColor: 'green'
  }));

  const formatSTTModelList: FormattedModelItem[] = sttModelList.map((item) => ({
    ...item,
    typeLabel: t('common:model.type.stt'),
    priceLabel: (
      <Flex color={'myGray.700'}>
        <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
          {item.charsPointsPrice}
        </Box>
        {` ${t('common:support.wallet.subscription.point')}/60${t('common:unit.seconds')}`}
      </Flex>
    ),
    tagColor: 'purple'
  }));

  const formatRerankModelList: FormattedModelItem[] = reRankModelList.map((item) => ({
    ...item,
    typeLabel: t('common:model.type.reRank'),
    priceLabel: item.charsPointsPrice ? (
      <Flex color={'myGray.700'}>
        {`${t('common:Input')}: `}
        <Box fontWeight={'bold'} color={'myGray.900'} mx={0.5}>
          {item.charsPointsPrice}
        </Box>
        {` ${t('common:support.wallet.subscription.point')}/1K tokens`}
      </Flex>
    ) : (
      '-'
    ),
    tagColor: 'adora',
    trainableModelType: item.supportTrain ? ModelTypeEnum.rerank : undefined
  }));

  const list: FormattedModelItem[] = (() => {
    if (filterState.modelType === ModelTypeEnum.llm) return formatLLMModelList;
    if (filterState.modelType === ModelTypeEnum.embedding) return formatEmbeddingModelList;
    if (filterState.modelType === ModelTypeEnum.tts) return formatTTSModelList;
    if (filterState.modelType === ModelTypeEnum.stt) return formatSTTModelList;
    if (filterState.modelType === ModelTypeEnum.rerank) return formatRerankModelList;

    return [
      ...formatLLMModelList,
      ...formatEmbeddingModelList,
      ...formatTTSModelList,
      ...formatSTTModelList,
      ...formatRerankModelList
    ];
  })();

  const normalizedSearch = filterState.search.trim().toLocaleLowerCase();

  const formattedList = list
    .map((item) => {
      const provider = getModelProvider(item.provider, language);
      return {
        model: item.model,
        name: item.name,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: provider.name,
        typeLabel: item.typeLabel,
        priceLabel: item.priceLabel,
        order: provider.order,
        tagColor: item.tagColor,
        trainableModelType: item.trainableModelType,
        isTuned: item.isTuned,
        trainTaskList: item.trainTaskList || []
      };
    })
    .sort((a, b) => a.order - b.order);

  return formattedList.filter((item) => {
    const providerFilter = filterState.provider ? item.providerId === filterState.provider : true;
    const nameFilter = normalizedSearch
      ? item.name.toLocaleLowerCase().includes(normalizedSearch)
      : true;

    return providerFilter && nameFilter;
  });
};

export const getSortedModelList = (
  modelList: ModelRow[],
  trainTaskCountSortOrder?: 'asc' | 'desc'
) => {
  if (!trainTaskCountSortOrder) {
    return modelList;
  }

  return [...modelList].sort((a, b) => {
    const countA = a.trainTaskList?.length || 0;
    const countB = b.trainTaskList?.length || 0;
    return trainTaskCountSortOrder === 'asc' ? countA - countB : countB - countA;
  });
};
