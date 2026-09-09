import { getDatasetPaths, getDatasetsV2 } from '@/web/core/dataset/api';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import React, { type Dispatch, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import FolderPath from '@/components/common/folder/Path';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';

const DatasetSelectContainer = ({
  isOpen,
  setParentId,
  paths,
  onClose,
  tips,
  isLoading,
  children
}: {
  isOpen: boolean;
  setParentId: Dispatch<ParentIdType>;
  paths: ParentTreePathItemType[];
  onClose: () => void;
  tips?: string | null;
  isLoading?: boolean;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      title={
        <Box fontWeight={'normal'}>
          <FolderPath
            paths={paths.map((path) => ({
              parentId: path.parentId,
              parentName: path.parentName
            }))}
            FirstPathDom={t('common:core.chat.Select dataset')}
            onClick={(e) => {
              setParentId(e);
            }}
          />
          {!!tips && (
            <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'normal'}>
              {tips}
            </Box>
          )}
        </Box>
      }
      isOpen={isOpen}
      onClose={onClose}
      h={'80vh'}
      w={'100%'}
      maxW={['90vw', '900px']}
      isCentered
      isLoading={isLoading}
    >
      {children}
    </MyModal>
  );
};

export function useDatasetSelect() {
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');

  const {
    data: datasets,
    isLoading: isLoadingDatasets,
    total,
    ScrollData,
    fetchData,
    refreshList
  } = useScrollPagination(getDatasetsV2, {
    params: {
      parentId,
      searchKey
    },
    pageSize: 50,
    refreshDeps: [parentId, searchKey],
    throttleWait: 300
  });

  const { data: paths = [], loading: isLoadingPaths } = useRequest(
    () =>
      searchKey.trim()
        ? Promise.resolve([])
        : getDatasetPaths({ sourceId: parentId, type: 'current' }),
    {
      manual: false,
      refreshDeps: [parentId, searchKey]
    }
  );

  return {
    parentId,
    setParentId,
    searchKey,
    setSearchKey,
    datasets,
    total,
    paths,
    isFetching: isLoadingDatasets || isLoadingPaths,
    isLoadingDatasets,
    ScrollData,
    fetchData,
    loadDatasets: refreshList
  };
}

export default DatasetSelectContainer;
