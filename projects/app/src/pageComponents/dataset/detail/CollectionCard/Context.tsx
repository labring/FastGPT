import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import type { CollectionStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useDisclosure } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkTeamWebSyncLimit } from '@/web/support/user/team/api';
import { getDatasetCollections, postDatasetSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { type DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';
import { isEmpty } from 'lodash';
import { useMemo } from 'react';
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
  handleOpenConfigPage: () => {}
});

const CollectionPageContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const { datasetDetail, datasetId, updateDataset, loadDatasetDetail } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  // dataset sync confirm
  const { openConfirm: openDatasetSyncConfirm, ConfirmModal: ConfirmDatasetSyncModal } = useConfirm(
    {
      content: t('dataset:start_sync_dataset_tip')
    }
  );

  const syncDataset = async () => {
    if (datasetDetail.type === DatasetTypeEnum.websiteDataset) {
      await checkTeamWebSyncLimit();
    }

    await postDatasetSync({ datasetId: datasetId });
    loadDatasetDetail(datasetId);

    // Show success message
    toast({
      status: 'success',
      title: t('dataset:collection.sync.submit')
    });
  };

  const {
    isOpen: isOpenWebsiteModal,
    onOpen: onOpenWebsiteModal,
    onClose: onCloseWebsiteModal
  } = useDisclosure();

  const { runAsync: onUpdateDatasetWebsiteConfig } = useRequest2(
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

  // collection list
  const [searchText, setSearchText] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<CollectionStatusEnum | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'name' | 'updateTime' | 'createTime' | 'dataAmount' | null>(
    null
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
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

  // database
  const hasDatabaseConfig = useMemo(() => !isEmpty(datasetDetail.databaseConfig), [datasetDetail]);
  const handleOpenConfigPage = (
    mode: 'edit' | 'create' = 'create',
    databaseName?: string,
    activeStep = 0
  ) => {
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
  };

  const contextValue: CollectionPageContextType = {
    openDatasetSyncConfirm: openDatasetSyncConfirm(syncDataset),
    onOpenWebsiteModal,

    searchText,
    setSearchText,
    filterTags,
    setFilterTags,
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
    handleOpenConfigPage
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
