import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
  useMemo,
  useCallback
} from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
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
  }
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

  // collection list
  const [searchText, setSearchText] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
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
    storeToQuery: true,
    params: {
      datasetId,
      parentId,
      searchText,
      filterTags
    },
    refreshDeps: [parentId, searchText, filterTags]
  });

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

  const contextValue: CollectionPageContextType = useMemo(
    () => ({
      openDatasetSyncConfirm: openDatasetSyncConfirm({ onConfirm: syncDataset }),
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
      pageSize
    }),
    [
      Pagination,
      collections,
      filterTags,
      getData,
      isGetting,
      onOpenWebsiteModal,
      openDatasetSyncConfirm,
      pageNum,
      pageSize,
      searchText,
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
