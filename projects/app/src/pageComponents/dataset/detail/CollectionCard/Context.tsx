import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useDisclosure } from '@chakra-ui/react';
import { checkTeamWebSyncLimit, checkTeamDatasetSyncLimit } from '@/web/support/user/team/api';
import { getDatasetCollections, postWebsiteSync, postApiDatasetSync } from '@/web/core/dataset/api';
import dynamic from 'next/dynamic';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { type DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import { useRouter } from 'next/router';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { type WebsiteConfigFormType } from './WebsiteConfig';

const WebSiteConfigModal = dynamic(() => import('./WebsiteConfig'));

type CollectionPageContextType = {
  openWebSyncConfirm: () => void;
  openApiDatasetSyncConfirm: () => void;
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
  openWebSyncConfirm: function (): () => void {
    throw new Error('Function not implemented.');
  },
  openApiDatasetSyncConfirm: function (): () => void {
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
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const { datasetDetail, datasetId, updateDataset, loadDatasetDetail } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  // website config
  const { openConfirm: openWebSyncConfirm, ConfirmModal: ConfirmWebSyncModal } = useConfirm({
    content: t('dataset:start_sync_website_tip')
  });
  const syncWebsite = async () => {
    await checkTeamWebSyncLimit();
    postWebsiteSync({ datasetId: datasetId }).then(() => {
      loadDatasetDetail(datasetId);
    });
  };

  // API dataset sync config
  const { openConfirm: openApiDatasetSyncConfirm, ConfirmModal: ConfirmApiDatasetSyncModal } =
    useConfirm({
      content: t('dataset:start_sync_api_dataset_tip')
    });
  const syncApiDataset = async () => {
    await checkTeamDatasetSyncLimit();
    postApiDatasetSync({ datasetId: datasetId }).then(() => {
      loadDatasetDetail(datasetId);
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
      await syncWebsite();
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
  const {
    data: collections,
    Pagination,
    total,
    getData,
    isLoading: isGetting,
    pageNum,
    pageSize
  } = usePagination(getDatasetCollections, {
    pageSize: 20,
    params: {
      datasetId,
      parentId,
      searchText,
      filterTags
    },
    // defaultRequest: false,
    refreshDeps: [parentId, searchText, filterTags]
  });

  const contextValue: CollectionPageContextType = {
    openWebSyncConfirm: openWebSyncConfirm(syncWebsite),
    openApiDatasetSyncConfirm: openApiDatasetSyncConfirm(syncApiDataset),
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
  };

  return (
    <CollectionPageContext.Provider value={contextValue}>
      {children}
      {datasetDetail.type === DatasetTypeEnum.websiteDataset && (
        <>
          {isOpenWebsiteModal && (
            <WebSiteConfigModal
              onClose={onCloseWebsiteModal}
              onSuccess={onUpdateDatasetWebsiteConfig}
            />
          )}
          <ConfirmWebSyncModal />
        </>
      )}
      {(datasetDetail.type === DatasetTypeEnum.apiDataset ||
        datasetDetail.type === DatasetTypeEnum.feishu ||
        datasetDetail.type === DatasetTypeEnum.yuque) && <ConfirmApiDatasetSyncModal />}
    </CollectionPageContext.Provider>
  );
};
export default CollectionPageContextProvider;
