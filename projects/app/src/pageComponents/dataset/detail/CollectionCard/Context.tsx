import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect
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
import type { CollectionListHeaderSelection } from './CollectionListHeaderMenu';

const WebSiteConfigModal = dynamic(() => import('./WebsiteConfig'));

export const defaultCollectionListSort = { sortBy: 'updateTime', sortOrder: 'desc' } as const;

type CollectionPageContextType = {
  openDatasetSyncConfirm: () => void;
  onOpenWebsiteModal: () => void;
  collections: DatasetCollectionsListItemType[];
  Pagination: () => JSX.Element;
  total: number;
  getData: (e: number) => Promise<void>;
  pollCollections: () => Promise<void>;
  isInitialLoading: boolean;
  pageNum: number;
  pageSize: number;
  scrollContainerRef: RefObject<HTMLDivElement>;
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  tagFilters: CollectionTagFilterItem[];
  setTagFilters: Dispatch<SetStateAction<CollectionTagFilterItem[]>>;
  headerSelection?: CollectionListHeaderSelection;
  setHeaderSelection: (selection: CollectionListHeaderSelection | undefined) => void;
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
  getData: async function (_e: number): Promise<void> {
    throw new Error('Function not implemented.');
  },
  pollCollections: async function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  isInitialLoading: false,
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
  },
  setHeaderSelection: function (_selection: CollectionListHeaderSelection | undefined): void {
    throw new Error('Function not implemented.');
  }
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const {
    datasetDetail,
    datasetId,
    updateDataset,
    loadDatasetDetail,
    registerCollectionListRefresh
  } = useContextSelector(DatasetPageContext, (v) => v);

  // collection list
  const [searchText, setSearchText] = useState('');
  const [tagFilters, setTagFilters] = useState<CollectionTagFilterItem[]>([]);
  const [headerSort, setHeaderSort] = useState<{
    selection?: CollectionListHeaderSelection;
    loadedSelection?: CollectionListHeaderSelection;
    version: number;
    pending: boolean;
  }>({ version: 0, pending: false });
  const headerSelection = headerSort.selection;
  const selectHeader = useCallback((selection: CollectionListHeaderSelection | undefined) => {
    setHeaderSort((current) => {
      if (selection === current.selection) return current;
      return { ...current, selection, version: current.version + 1, pending: true };
    });
  }, []);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingListRequests = useRef(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const loadCollections = useCallback(
    async (params: Parameters<typeof getDatasetCollections>[0]) => {
      pendingListRequests.current += 1;
      try {
        return await getDatasetCollections(params);
      } finally {
        pendingListRequests.current -= 1;
        // 首次请求结束后，后台刷新（包括空列表）都保留当前内容，不再展示加载占位。
        setIsInitialLoading(false);
      }
    },
    []
  );
  const {
    data: collections,
    Pagination,
    total,
    getData,
    pageNum,
    pageSize
  } = usePagination(loadCollections, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'dataset-detail-collections',
    storeToQuery: true,
    forceFirstPage: headerSort.pending,
    params: {
      datasetId,
      parentId,
      searchText,
      tagFilters,
      ...defaultCollectionListSort,
      ...headerSelection?.params
    },
    refreshDeps: [parentId, searchText, tagFilters, datasetDetail.collectionPermissionEnabled],
    onChange: (page) => {
      if (!headerSort.pending || page !== 1) return;
      // 已显示的结果可以用于回退，但只有当前排序的响应能结束首页刷新。
      setHeaderSort((current) => ({
        ...current,
        loadedSelection: headerSelection,
        pending: current.pending && current.version !== headerSort.version
      }));
    },
    onError: () => {
      // 保留上次成功的表头与页码，并避免回退覆盖尚未发出请求的新选项。
      setHeaderSort((current) => {
        if (!current.pending || current.version !== headerSort.version) return current;
        return { ...current, selection: current.loadedSelection, pending: false };
      });
    },
    scrollContainerRef
  });

  useEffect(() => {
    // 排序立即发起请求，避免节流队列中的首页刷新覆盖失败回退。
    if (headerSort.pending) void getData(1);
  }, [getData, headerSort.pending, headerSort.version]);

  const pollCollections = useCallback(async () => {
    // 列表请求未完成时跳过轮询，避免轮询反复抢占慢请求。
    if (pendingListRequests.current === 0) await getData(pageNum);
  }, [getData, pageNum]);

  useEffect(
    () => registerCollectionListRefresh(() => getData(pageNum)),
    [getData, pageNum, registerCollectionListRefresh]
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
      headerSelection,
      setHeaderSelection: selectHeader,
      collections,
      Pagination,
      total,
      getData,
      pollCollections,
      isInitialLoading,
      pageNum,
      pageSize,
      scrollContainerRef
    }),
    [
      Pagination,
      collections,
      tagFilters,
      getData,
      headerSelection,
      isInitialLoading,
      onOpenWebsiteModal,
      onSyncDataset,
      openDatasetSyncConfirm,
      pageNum,
      pageSize,
      pollCollections,
      searchText,
      selectHeader,
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
