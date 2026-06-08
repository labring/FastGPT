import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
  useMemo,
  useCallback
} from 'react';
import type {
  CollectionTagValueType,
  DatasetCollectionsListItemType
} from '@fastgpt/global/core/dataset/type';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import type { CollectionStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useDisclosure } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkTeamWebSyncLimit } from '@/web/support/user/team/api';
import { getDatasetCollections, postDatasetSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';
import { isEmpty } from 'lodash';
import { TabEnum } from '../../../../pages/dataset/detail/index';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { omit } from 'lodash';

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
  searchText: string;
  setSearchText: Dispatch<SetStateAction<string>>;
  filterTags: string[];
  setFilterTags: Dispatch<SetStateAction<string[]>>;
  filterTagValues: Record<string, string[]>;
  setFilterTagValues: Dispatch<SetStateAction<Record<string, string[]>>>;
  displayedCollections: DatasetCollectionsListItemType[];
  statusFilter: CollectionStatusEnum | undefined;
  setStatusFilter: Dispatch<SetStateAction<CollectionStatusEnum | undefined>>;
  sortBy: 'name' | 'updateTime' | 'createTime' | 'dataAmount' | null;
  setSortBy: Dispatch<SetStateAction<'name' | 'updateTime' | 'createTime' | 'dataAmount' | null>>;
  sortOrder: 'asc' | 'desc';
  setSortOrder: Dispatch<SetStateAction<'asc' | 'desc'>>;
  hasDatabaseConfig: boolean;
  handleOpenConfigPage: (
    mode?: 'edit' | 'create',
    databaseName?: string,
    activeStep?: number
  ) => void;
  hasTrainingData: boolean;
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
  getData: function (e: number): void {
    throw new Error('Function not implemented.');
  },
  isGetting: false,
  pageNum: 0,
  pageSize: 0,
  searchText: '',
  setSearchText: function (value: SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  filterTags: [],
  setFilterTags: function (value: SetStateAction<string[]>): void {
    throw new Error('Function not implemented.');
  },
  filterTagValues: {},
  setFilterTagValues: function (value: SetStateAction<Record<string, string[]>>): void {
    throw new Error('Function not implemented.');
  },
  displayedCollections: [],
  statusFilter: undefined,
  setStatusFilter: function (value: SetStateAction<CollectionStatusEnum | undefined>): void {
    throw new Error('Function not implemented.');
  },
  sortBy: null,
  setSortBy: function (): void {
    throw new Error('Function not implemented.');
  },
  sortOrder: 'asc',
  setSortOrder: function (): void {
    throw new Error('Function not implemented.');
  },
  hasDatabaseConfig: false,
  handleOpenConfigPage: () => {},
  hasTrainingData: false
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const { datasetDetail, datasetId, updateDataset, loadDatasetDetail, refetchDatasetTraining } =
    useContextSelector(DatasetPageContext, (v) => v);

  // collection list
  const [searchText, setSearchText] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterTagValues, setFilterTagValues] = useState<Record<string, string[]>>({});
  const [statusFilter, setStatusFilter] = useState<CollectionStatusEnum | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'name' | 'updateTime' | 'createTime' | 'dataAmount' | null>(
    null
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const {
    data: collections,
    Pagination,
    total,
    getData: _getDataRaw,
    isLoading: isGetting,
    pageNum,
    pageSize
  } = usePagination(getDatasetCollections, {
    defaultPageSize: 20,
    params: {
      datasetId,
      parentId,
      searchText,
      filterTags,
      status: statusFilter,
      ...(sortBy ? { sortBy, sortOrder } : {})
    },
    // defaultRequest: false,
    refreshDeps: [parentId, searchText, filterTags, statusFilter, sortBy, sortOrder]
  });

  const getData = useCallback(
    async (num: number) => {
      await _getDataRaw(num);
      refetchDatasetTraining();
    },
    [_getDataRaw, refetchDatasetTraining]
  );

  const displayedCollections = useMemo(() => {
    const hasValueFilter = Object.values(filterTagValues).some((v) => v.length > 0);
    if (!hasValueFilter) return collections;
    return collections.filter((col) => {
      const colTags = (col.tags || []).filter(
        (t): t is CollectionTagValueType => typeof t === 'object' && t !== null
      );
      return Object.entries(filterTagValues).some(
        ([tagId, values]) =>
          values.length > 0 &&
          colTags.some((t) => t.tagId === tagId && values.includes(String(t.value)))
      );
    });
  }, [collections, filterTagValues]);

  const hasTrainingData = useMemo(
    () => collections.some((c) => c.trainingAmount > 0),
    [collections]
  );

  const syncDataset = useCallback(async () => {
    if (datasetDetail.type === DatasetTypeEnum.websiteDataset) {
      await checkTeamWebSyncLimit();
    }

    await postDatasetSync({ datasetId: datasetId });
    loadDatasetDetail(datasetId);

    getData(pageNum);

    // Show success message
    toast({
      status: 'success',
      title: t('dataset:collection.sync.submit')
    });
  }, [datasetDetail.type, datasetId, getData, loadDatasetDetail, pageNum, t, toast]);

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

  const { runAsync: onUpdateDatasetWebsiteConfig } = useRequest(
    async (websiteConfig: WebsiteConfigFormType) => {
      await updateDataset({
        id: datasetId,
        websiteConfig: websiteConfig.websiteConfig,
        chunkSettings: websiteConfig.chunkSettings
      });
      await syncDataset();
    },
    {
      onSuccess() {
        onCloseWebsiteModal();
      }
    }
  );

  // database
  const hasDatabaseConfig = useMemo(() => !isEmpty(datasetDetail.databaseConfig), [datasetDetail]);
  const handleOpenConfigPage = useCallback(
    (mode: 'edit' | 'create' = 'create', databaseName?: string, activeStep = 0) => {
      router.replace({
        query: {
          ...omit(router.query, ['databaseName']),
          currentTab: TabEnum.import,
          source: ImportDataSourceEnum.database,
          mode,
          activeStep,
          ...(databaseName
            ? {
                databaseName
              }
            : {})
        }
      });
    },
    [router]
  );

  const contextValue: CollectionPageContextType = useMemo(
    () => ({
      openDatasetSyncConfirm: openDatasetSyncConfirm({ onConfirm: syncDataset }),
      onOpenWebsiteModal,

      searchText,
      setSearchText,
      filterTags,
      setFilterTags,
      filterTagValues,
      setFilterTagValues,
      displayedCollections,
      statusFilter,
      setStatusFilter,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      collections,
      Pagination,
      total,
      getData,
      isGetting,
      pageNum,
      pageSize,
      hasDatabaseConfig,
      handleOpenConfigPage,
      hasTrainingData
    }),
    [
      Pagination,
      collections,
      displayedCollections,
      filterTags,
      filterTagValues,
      getData,
      hasDatabaseConfig,
      handleOpenConfigPage,
      hasTrainingData,
      isGetting,
      onOpenWebsiteModal,
      openDatasetSyncConfirm,
      pageNum,
      pageSize,
      searchText,
      setFilterTags,
      setFilterTagValues,
      setSearchText,
      statusFilter,
      setStatusFilter,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      syncDataset,
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
