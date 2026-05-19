import { useCallback, useMemo, useRef, useState } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import type { BaseModelTrainDefaultBaseModel } from '../BaseModelTrainModal';
import type {
  FilterState,
  I18nT,
  ModelRow,
  ModelTabType,
  ProviderOption,
  TeamPermission,
  TrainDetailModel
} from '../types';
import { modelTableTabValues } from '../types';
import {
  getFilteredModelList,
  getFilteredProviderList,
  getModelTypeOptions,
  getProviderOptions,
  getSortedModelList
} from '../helpers/modelList';

type ModelProvider = { avatar: string; name: string; id: string; order: number };
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

type UseModelTableStateProps = {
  t: I18nT;
  language: string;
  permissionConfig: boolean;
  hasManagePer: boolean;
  userPermission: TeamPermission;
  getModelProviders: (lang?: string) => Array<{ avatar: string; name: string; id: string }>;
  getModelProvider: (provider: string, language?: string) => ModelProvider;
  llmModelList: BaseModelItem[];
  embeddingModelList: BaseModelItem[];
  ttsModelList: BaseModelItem[];
  sttModelList: BaseModelItem[];
  reRankModelList: BaseModelItem[];
};

export const useModelTableState = ({
  t,
  language,
  permissionConfig,
  hasManagePer,
  userPermission,
  getModelProviders,
  getModelProvider,
  llmModelList,
  embeddingModelList,
  ttsModelList,
  sttModelList,
  reRankModelList
}: UseModelTableStateProps) => {
  const [activeTab, setActiveTab] = useState<ModelTabType>(modelTableTabValues.base);
  const [baseFilterState, setBaseFilterState] = useState<FilterState>({
    provider: '',
    modelType: '',
    search: ''
  });
  const [customFilterState, setCustomFilterState] = useState<FilterState>({
    provider: '',
    modelType: '',
    search: ''
  });
  const [trainModelData, setTrainModelData] = useState<BaseModelTrainDefaultBaseModel | undefined>(
    undefined
  );
  const [trainDetailDrawer, setTrainDetailDrawer] = useState<TrainDetailModel | null>(null);
  const [baseTrainTaskCountSortOrder, setBaseTrainTaskCountSortOrder] = useState<
    'asc' | 'desc' | undefined
  >(undefined);
  const [customTrainTaskCountSortOrder, setCustomTrainTaskCountSortOrder] = useState<
    'asc' | 'desc' | undefined
  >(undefined);
  const [customTrainTimeSortOrder, setCustomTrainTimeSortOrder] = useState<
    'asc' | 'desc' | undefined
  >(undefined);

  const providerList = useRef<ProviderOption[]>(
    getProviderOptions({ getModelProviders, language, t })
  );
  const selectModelTypeList = useRef(getModelTypeOptions(t));

  const {
    onOpen: onOpenDefaultModel,
    onClose: onCloseDefaultModel,
    isOpen: isOpenDefaultModel
  } = useDisclosure();
  const {
    onOpen: onOpenTrainModel,
    onClose: onCloseTrainModel,
    isOpen: isOpenTrainModel
  } = useDisclosure();

  const openTrainModel = useCallback(() => {
    setTrainModelData(undefined);
    onOpenTrainModel();
  }, [onOpenTrainModel]);

  const filterProviderList = useMemo(
    () =>
      getFilteredProviderList({
        providerOptions: providerList.current,
        llmModelList,
        embeddingModelList,
        ttsModelList,
        sttModelList,
        reRankModelList
      }),
    [embeddingModelList, llmModelList, reRankModelList, sttModelList, ttsModelList]
  );

  const baseModelList = useMemo(
    () =>
      getFilteredModelList({
        llmModelList,
        embeddingModelList,
        ttsModelList,
        sttModelList,
        reRankModelList,
        getModelProvider,
        language,
        t,
        filterState: baseFilterState
      }).filter((item) => item.isTuned !== true),
    [
      baseFilterState,
      embeddingModelList,
      getModelProvider,
      language,
      llmModelList,
      reRankModelList,
      sttModelList,
      t,
      ttsModelList
    ]
  );

  const customModelList = useMemo(
    () =>
      getFilteredModelList({
        llmModelList,
        embeddingModelList,
        ttsModelList,
        sttModelList,
        reRankModelList,
        getModelProvider,
        language,
        t,
        filterState: customFilterState
      }).filter((item) => item.isTuned === true),
    [
      customFilterState,
      embeddingModelList,
      getModelProvider,
      language,
      llmModelList,
      reRankModelList,
      sttModelList,
      t,
      ttsModelList
    ]
  );

  const baseSelectState = useTableMultipleSelect({
    list: baseModelList,
    getItemId: (item) => item.model
  });
  const customSelectState = useTableMultipleSelect({
    list: customModelList,
    getItemId: (item) => item.model
  });

  const toggleBaseTrainTaskCountSort = useCallback(() => {
    setBaseTrainTaskCountSortOrder((prev) => {
      if (!prev) return 'desc';
      return prev === 'desc' ? 'asc' : 'desc';
    });
  }, []);
  const toggleCustomTrainTaskCountSort = useCallback(() => {
    setCustomTrainTaskCountSortOrder((prev) => {
      if (!prev) return 'desc';
      return prev === 'desc' ? 'asc' : 'desc';
    });
  }, []);
  const toggleCustomTrainTimeSort = useCallback(() => {
    setCustomTrainTimeSortOrder((prev) => {
      if (!prev) return 'desc';
      return prev === 'desc' ? 'asc' : 'desc';
    });
  }, []);

  const sortedBaseModelList = useMemo(
    () => getSortedModelList(baseModelList, baseTrainTaskCountSortOrder),
    [baseModelList, baseTrainTaskCountSortOrder]
  );
  const sortedCustomModelList = useMemo(
    () =>
      getSortedModelList(customModelList, customTrainTaskCountSortOrder, customTrainTimeSortOrder),
    [customModelList, customTrainTaskCountSortOrder, customTrainTimeSortOrder]
  );

  const handleOpenTrainDrawer = useCallback(
    (type: ModelTypeEnum.embedding | ModelTypeEnum.rerank, model: string) => {
      setTrainModelData({ type, model });
      onOpenTrainModel();
    },
    [onOpenTrainModel]
  );

  const tabList = useMemo(
    () => [
      { label: t('account_model:base_model_tab'), value: modelTableTabValues.base },
      { label: t('account_model:custom_model_tab'), value: modelTableTabValues.custom }
    ],
    [t]
  );

  const baseTableSharedProps = {
    t,
    tabType: modelTableTabValues.base,
    permissionConfig,
    hasManagePer,
    userPermission,
    selectedItems: baseSelectState.selectedItems,
    toggleSelect: baseSelectState.toggleSelect,
    isSelected: baseSelectState.isSelected,
    isSelecteAll: baseSelectState.isSelecteAll,
    selectAllTrigger: baseSelectState.selectAllTrigger,
    trainTaskCountSortOrder: baseTrainTaskCountSortOrder,
    toggleTrainTaskCountSort: toggleBaseTrainTaskCountSort,
    handleOpenTrainDrawer,
    setTrainDetailDrawer
  };

  const customTableSharedProps = {
    t,
    tabType: modelTableTabValues.custom,
    permissionConfig,
    hasManagePer,
    userPermission,
    selectedItems: customSelectState.selectedItems,
    toggleSelect: customSelectState.toggleSelect,
    isSelected: customSelectState.isSelected,
    isSelecteAll: customSelectState.isSelecteAll,
    selectAllTrigger: customSelectState.selectAllTrigger,
    trainTaskCountSortOrder: customTrainTaskCountSortOrder,
    toggleTrainTaskCountSort: toggleCustomTrainTaskCountSort,
    trainTimeSortOrder: customTrainTimeSortOrder,
    toggleTrainTimeSort: toggleCustomTrainTimeSort,
    handleOpenTrainDrawer,
    setTrainDetailDrawer
  };

  return {
    activeTab,
    setActiveTab,
    tabList,
    baseFilterState,
    setBaseFilterState,
    customFilterState,
    setCustomFilterState,
    filterProviderList,
    selectModelTypeList: selectModelTypeList.current,
    sortedBaseModelList,
    sortedCustomModelList,
    baseTableSharedProps,
    customTableSharedProps,
    BaseFloatingActionBar: baseSelectState.FloatingActionBar,
    CustomFloatingActionBar: customSelectState.FloatingActionBar,
    isOpenDefaultModel,
    onOpenDefaultModel,
    onCloseDefaultModel,
    isOpenTrainModel,
    openTrainModel,
    onCloseTrainModel,
    trainModelData,
    setTrainModelData,
    trainDetailDrawer,
    setTrainDetailDrawer,
    handleOpenTrainDrawer
  };
};
