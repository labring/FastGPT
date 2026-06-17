import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
  useMemo,
  useCallback,
  useEffect,
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
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';

const WebSiteConfigModal = dynamic(() => import('./WebsiteConfig'));

type CollectionListState = {
  pageNum: number;
  pageSize: number;
  parentId: string;
  searchText: string;
  filterTags: string[];
};

const getCollectionListStorageKey = (datasetId: string) =>
  `fastgpt_dataset_collection_list_${datasetId}`;

/** 从 sessionStorage 读取知识库 collection 列表状态，SSR 安全 */
const readCollectionListState = (datasetId: string): CollectionListState | null => {
  if (typeof window === 'undefined' || !datasetId) return null;
  try {
    const raw = sessionStorage.getItem(getCollectionListStorageKey(datasetId));
    if (!raw) return null;
    return JSON.parse(raw) as CollectionListState;
  } catch {
    return null;
  }
};

/** 将知识库 collection 列表状态写入 sessionStorage */
const writeCollectionListState = (datasetId: string, state: CollectionListState) => {
  if (typeof window === 'undefined' || !datasetId) return;
  try {
    sessionStorage.setItem(getCollectionListStorageKey(datasetId), JSON.stringify(state));
  } catch {
    // sessionStorage 写入失败时静默忽略
  }
};

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
  parentId: string;
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  filterTags: string[];
  setFilterTags: Dispatch<SetStateAction<string[]>>;
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
  getData: function (_pageNum: number): void {
    throw new Error('Function not implemented.');
  },
  isGetting: false,
  pageNum: 0,
  pageSize: 0,
  parentId: '',
  searchText: '',
  setSearchText: function (_value: SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  filterTags: [],
  setFilterTags: function (_value: SetStateAction<string[]>): void {
    throw new Error('Function not implemented.');
  }
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId: queryParentId = '' } = router.query as { parentId: string };

  const { datasetDetail, datasetId, updateDataset, loadDatasetDetail } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  const savedState = useMemo(() => readCollectionListState(datasetId), [datasetId]);
  // parentId 以 URL 为准；目录恢复由下方 router.replace 写入 query，避免回根目录时被 sessionStorage 覆盖
  const parentId = queryParentId;

  const hasRestoredQueryRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || !datasetId || hasRestoredQueryRef.current) return;
    hasRestoredQueryRef.current = true;

    const saved = readCollectionListState(datasetId);
    if (!saved) return;

    const queryUpdates: Record<string, string | number> = {};
    if (!queryParentId && saved.parentId) {
      queryUpdates.parentId = saved.parentId;
    }
    const queryPage = router.query.page;
    if ((queryPage === undefined || queryPage === '') && saved.pageNum > 1) {
      queryUpdates.page = saved.pageNum;
    }
    if (Object.keys(queryUpdates).length === 0) return;

    router.replace({
      pathname: router.pathname,
      query: { ...router.query, ...queryUpdates }
    });
  }, [router.isReady, datasetId, queryParentId, router]);

  // collection list
  const [searchText, setSearchText] = useState(savedState?.searchText ?? '');
  const [filterTags, setFilterTags] = useState<string[]>(savedState?.filterTags ?? []);
  const {
    data: collections,
    Pagination,
    total,
    getData,
    isLoading: isGetting,
    pageNum,
    pageSize
  } = usePagination(getDatasetCollections, {
    defaultPageSize: savedState?.pageSize ?? 20,
    defaultPageNum: savedState?.pageNum,
    storeToQuery: true,
    params: {
      datasetId,
      parentId,
      searchText,
      filterTags
    },
    refreshDeps: [parentId, searchText, filterTags]
  });

  useEffect(() => {
    if (!datasetId) return;
    writeCollectionListState(datasetId, {
      pageNum,
      pageSize,
      parentId,
      searchText,
      filterTags
    });
  }, [datasetId, pageNum, pageSize, parentId, searchText, filterTags]);

  const syncDataset = useCallback(async () => {
    if (datasetDetail.type === DatasetTypeEnum.websiteDataset) {
      await checkTeamWebSyncLimit();
    }

    await postDatasetSync({ datasetId: datasetId });
    loadDatasetDetail(datasetId);

    getData(pageNum);
  }, [datasetDetail.type, datasetId, getData, loadDatasetDetail, pageNum]);
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
      filterTags,
      setFilterTags,
      collections,
      Pagination,
      total,
      getData,
      isGetting,
      pageNum,
      pageSize,
      parentId
    }),
    [
      Pagination,
      collections,
      filterTags,
      getData,
      isGetting,
      onOpenWebsiteModal,
      onSyncDataset,
      openDatasetSyncConfirm,
      pageNum,
      pageSize,
      parentId,
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
