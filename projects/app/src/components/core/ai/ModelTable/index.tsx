import { Button, Box, Flex, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clientInitData } from '@/web/common/system/staticData';
import dynamic from 'next/dynamic';
import type { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import BaseModelTrainModal from './BaseModelTrainModal';
import TrainDetailDrawer from './TrainDetailDrawer';
import type { FilterState, ModelRow, ModelTabType, ProviderOption, TeamPermission } from './types';
import { modelTableTabValues } from './types';
import ModelFilterBar from './ModelFilterBar';
import ModelListTable from './ModelListTable';
import BatchPermissionActionBar from './BatchPermissionActionBar';
import DefaultModelModal from './DefaultModelModal';
import { useModelTableState } from './hooks/useModelTableState';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));

type TableSharedProps = {
  t: ReturnType<typeof useTranslation>['t'];
  tabType: ModelTabType;
  permissionConfig: boolean;
  hasManagePer: boolean;
  userPermission: TeamPermission;
  selectedItems: ModelRow[];
  toggleSelect: (item: ModelRow) => void;
  isSelected: (item: ModelRow) => boolean;
  isSelecteAll: boolean;
  selectAllTrigger: () => void;
  trainTaskCountSortOrder?: 'asc' | 'desc';
  toggleTrainTaskCountSort: () => void;
  trainTimeSortOrder?: 'asc' | 'desc';
  toggleTrainTimeSort?: () => void;
  handleOpenTrainDrawer: (
    type:
      | import('@fastgpt/global/core/ai/model').ModelTypeEnum.embedding
      | import('@fastgpt/global/core/ai/model').ModelTypeEnum.rerank,
    modelId: string
  ) => void;
  setTrainDetailDrawer: React.Dispatch<
    React.SetStateAction<import('./types').TrainDetailModel | null>
  >;
};

type FilterPanelProps = {
  t: ReturnType<typeof useTranslation>['t'];
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
  providerList: ProviderOption[];
  modelTypeList: {
    label: string;
    value: import('@fastgpt/global/core/ai/model').ModelTypeEnum | '';
  }[];
  tabSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
};

type TablePanelProps = TableSharedProps & {
  modelList: ModelRow[];
};

const ModelTable = ({ permissionConfig = false }: { permissionConfig?: boolean }) => {
  const { t, i18n } = useTranslation();
  const {
    getModelProviders,
    getModelProvider,
    llmModelList,
    ttsModelList,
    embeddingModelList,
    sttModelList,
    reRankModelList
  } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';
  const hasManagePer = !!userInfo?.team.permission.hasManagePer;
  const userPermission = userInfo?.team.permission!;

  const {
    activeTab,
    setActiveTab,
    tabList,
    baseFilterState,
    setBaseFilterState,
    customFilterState,
    setCustomFilterState,
    filterProviderList,
    selectModelTypeList,
    sortedBaseModelList,
    sortedCustomModelList,
    baseTableSharedProps,
    customTableSharedProps,
    BaseFloatingActionBar,
    CustomFloatingActionBar,
    isOpenDefaultModel,
    onOpenDefaultModel,
    onCloseDefaultModel,
    isOpenTrainModel,
    openTrainModel,
    onCloseTrainModel,
    handleOpenTrainDrawer,
    trainModelData,
    setTrainModelData,
    trainDetailDrawer,
    setTrainDetailDrawer
  } = useModelTableState({
    t,
    language: i18n.language,
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
  });

  const tabSlot = (
    <FillRowTabs<ModelTabType> list={tabList} value={activeTab} onChange={setActiveTab} py={1} />
  );

  const actionSlot = isRoot ? (
    <Button variant={'whiteBase'} h={'36px'} onClick={onOpenDefaultModel}>
      {t('account:model.default_model')}
    </Button>
  ) : undefined;

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      {activeTab === modelTableTabValues.base ? (
        <ModelTabContent
          filterProps={{
            t,
            filterState: baseFilterState,
            setFilterState: setBaseFilterState,
            providerList: filterProviderList,
            modelTypeList: selectModelTypeList,
            tabSlot,
            actionSlot
          }}
          tableProps={{
            ...baseTableSharedProps,
            modelList: sortedBaseModelList
          }}
          FloatingActionBar={BaseFloatingActionBar}
        />
      ) : (
        <ModelTabContent
          filterProps={{
            t,
            filterState: customFilterState,
            setFilterState: setCustomFilterState,
            providerList: filterProviderList,
            modelTypeList: selectModelTypeList,
            tabSlot,
            actionSlot
          }}
          tableProps={{
            ...customTableSharedProps,
            modelList: sortedCustomModelList
          }}
          FloatingActionBar={CustomFloatingActionBar}
        />
      )}

      {isOpenDefaultModel && (
        <DefaultModelModal onClose={onCloseDefaultModel} onSuccess={() => clientInitData()} />
      )}
      {isOpenTrainModel && (
        <BaseModelTrainModal
          onClose={() => {
            onCloseTrainModel();
            setTrainModelData(undefined);
          }}
          onSuccess={() => clientInitData(undefined, { forceRefresh: true })}
          defaultBaseModel={trainModelData}
        />
      )}
      {trainDetailDrawer && (
        <TrainDetailDrawer
          onClose={() => setTrainDetailDrawer(null)}
          onSuccess={() => clientInitData(undefined, { forceRefresh: true })}
          modelName={trainDetailDrawer.name}
          modelId={trainDetailDrawer.id}
          baseModelType={trainDetailDrawer.baseModelType}
          tabType={activeTab}
        />
      )}
    </Flex>
  );
};

export default ModelTable;

const ModelTabContent = ({
  filterProps,
  tableProps,
  FloatingActionBar
}: {
  filterProps: FilterPanelProps;
  tableProps: TablePanelProps;
  FloatingActionBar: ReturnType<typeof useTableMultipleSelect<ModelRow>>['FloatingActionBar'];
}) => {
  return (
    <>
      <ModelFilterBar {...filterProps} />
      <ModelListTable {...tableProps} />
      <BatchPermissionActionBar
        FloatingActionBar={FloatingActionBar}
        selectedItems={tableProps.selectedItems}
        permission={tableProps.userPermission}
        t={tableProps.t}
      />
    </>
  );
};

export const ModelPriceModal = ({
  children
}: {
  children: ({ onOpen }: { onOpen: () => void }) => React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      {children({ onOpen })}
      {isOpen && (
        <MyModal
          isCentered
          iconSrc="/imgs/modal/bill.svg"
          title={t('common:support.wallet.subscription.Ai points')}
          isOpen
          onClose={onClose}
          w={'100%'}
          h={'100%'}
          maxW={'90vw'}
          maxH={'90vh'}
        >
          <ModalBody flex={'1 0 0'}>
            <ModelTable />
          </ModalBody>
          <ModalFooter />
        </MyModal>
      )}
    </>
  );
};
