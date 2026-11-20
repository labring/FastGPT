import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { type ReactNode, useCallback, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useDisclosure } from '@chakra-ui/react';
import { checkTeamWebSyncLimit } from '@/web/support/user/team/api';
import { postDatasetSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';
import { useCollectionList } from './useCollectionList';

const WebSiteConfigModal = dynamic(() => import('./WebsiteConfig'));

type CollectionPageContextType = ReturnType<typeof useCollectionList> & {
  openDatasetSyncConfirm: () => void;
  onOpenWebsiteModal: () => void;
};

export const CollectionPageContext = createContext<CollectionPageContextType>({
  openDatasetSyncConfirm: function (): () => void {
    throw new Error('Function not implemented.');
  },
  onOpenWebsiteModal: function (): void {
    throw new Error('Function not implemented.');
  },
  collections: [],
  Pagination: function (): JSX.Element {
    throw new Error('Function not implemented.');
  },
  total: 0,
  refreshCollections: async () => {},
  pollCollections: async () => {},
  isInitialLoading: false,
  pageNum: 0,
  pageSize: 0,
  scrollContainerRef: { current: null },
  searchText: '',
  setSearchText() {},
  tagFilters: [],
  setTagFilters() {},
  headerSelection: undefined,
  setHeaderSelection() {}
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();

  const {
    datasetDetail,
    datasetId,
    updateDataset,
    loadDatasetDetail,
    registerCollectionListRefresh
  } = useContextSelector(DatasetPageContext, (v) => v);

  const list = useCollectionList(datasetId, datasetDetail.collectionPermissionEnabled);
  const { refreshCollections } = list;
  useEffect(
    () => registerCollectionListRefresh(refreshCollections),
    [refreshCollections, registerCollectionListRefresh]
  );

  const syncDataset = useCallback(async () => {
    // 页面详情尚未加载或 query 缺失时，不发起一个必然失败的同步请求。
    if (!datasetId || !datasetDetail._id || datasetId !== datasetDetail._id) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }

    if (datasetDetail.type === DatasetTypeEnum.websiteDataset) {
      await checkTeamWebSyncLimit();
    }

    await postDatasetSync({ datasetId: datasetId });
    loadDatasetDetail(datasetId);

    void refreshCollections();
  }, [datasetDetail._id, datasetDetail.type, datasetId, loadDatasetDetail, refreshCollections]);
  const { runAsync: onSyncDataset } = useRequest(syncDataset, {
    successToast: t('dataset:collection.sync.submit')
  });

  // dataset sync confirm
  const { openConfirm: openDatasetSyncConfirm, ConfirmModal: ConfirmDatasetSyncModal } = useConfirm(
    {
      content: t('dataset:start_sync_dataset_tip')
    }
  );

  const {
    isOpen: isOpenWebsiteModal,
    onOpen: onOpenWebsiteModal,
    onClose: onCloseWebsiteModal
  } = useDisclosure();

  const onUpdateDatasetWebsiteConfig = useCallback(
    async (websiteConfig: WebsiteConfigFormType) => {
      await updateDataset({
        id: datasetId,
        websiteConfig: websiteConfig.websiteConfig,
        chunkSettings: websiteConfig.chunkSettings
      });
      await syncDataset();
      onCloseWebsiteModal();
    },
    [datasetId, onCloseWebsiteModal, syncDataset, updateDataset]
  );

  const contextValue: CollectionPageContextType = {
    ...list,
    openDatasetSyncConfirm: () => openDatasetSyncConfirm({ onConfirm: onSyncDataset })(),
    onOpenWebsiteModal
  };

  return (
    <CollectionPageContext.Provider value={contextValue}>
      {children}
      {datasetDetail.type === DatasetTypeEnum.websiteDataset && isOpenWebsiteModal && (
        <WebSiteConfigModal
          onClose={onCloseWebsiteModal}
          onSuccess={onUpdateDatasetWebsiteConfig}
        />
      )}
      <ConfirmDatasetSyncModal />
    </CollectionPageContext.Provider>
  );
};
export default CollectionPageContextProvider;
