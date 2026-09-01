import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useState,
  useMemo,
  useCallback,
  useRef
} from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useDisclosure } from '@chakra-ui/react';
import { checkTeamWebSyncLimit } from '@/web/support/user/team/api';
import { getDatasetCollections } from '@/web/core/dataset/api/collection';
import { postDatasetSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { type DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type CollectionTagFilterItem } from '@fastgpt/global/core/dataset/type';
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';

const WebSiteConfigModal = dynamic(() => import('./WebsiteConfig'));

type CollectionPageContextType = {
  openDatasetSyncConfirm: () => void;
  onOpenWebsiteModal: () => void;
  collections: DatasetCollectionsListItemType[];
  Pagination: () => JSX.Element;
  total: number;
  getData: (e: number) => void;
  isGetting: boolean;
  pageNum: number;
  pageSize: number;
  scrollContainerRef: RefObject<HTMLDivElement>;
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  tagFilters: CollectionTagFilterItem[];
  setTagFilters: Dispatch<SetStateAction<CollectionTagFilterItem[]>>;
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
  getData: function (_e: number): void {
    throw new Error('Function not implemented.');
  },
  isGetting: false,
  pageNum: 0,
  pageSize: 0,
  scrollContainerRef: { current: null },
  searchText: '',
  setSearchText: function (_value: SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  tagFilters: [],
  setTagFilters: function (_value: SetStateAction<CollectionTagFilterItem[]>): void {
    throw new Error('Function not implemented.');
  }
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const { datasetDetail, datasetId, updateDataset, loadDatasetDetail } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  // collection list
  const [searchText, setSearchText] = useState('');
  const [tagFilters, setTagFilters] = useState<CollectionTagFilterItem[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    data: collections,
    Pagination,
    total,
    getData,
    isLoading: isGetting,
    pageNum,
    pageSize
  } = usePagination(getDatasetCollections, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'dataset-detail-collections',
    storeToQuery: true,
    params: {
      datasetId,
      parentId,
      searchText,
      tagFilters
    },
    refreshDeps: [parentId, searchText, tagFilters],
    scrollContainerRef
  });

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

    getData(pageNum);
  }, [datasetDetail._id, datasetDetail.type, datasetId, getData, loadDatasetDetail, pageNum]);
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

  const contextValue: CollectionPageContextType = useMemo(
    () => ({
      openDatasetSyncConfirm: openDatasetSyncConfirm({ onConfirm: onSyncDataset }),
      onOpenWebsiteModal,

      searchText,
      setSearchText,
      tagFilters,
      setTagFilters,
      collections,
      Pagination,
      total,
      getData,
      isGetting,
      pageNum,
      pageSize,
      scrollContainerRef
    }),
    [
      Pagination,
      collections,
      tagFilters,
      getData,
      isGetting,
      onOpenWebsiteModal,
      onSyncDataset,
      openDatasetSyncConfirm,
      pageNum,
      pageSize,
      searchText,
      total
    ]
  );

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
