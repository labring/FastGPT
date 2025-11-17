import { getDatasets, getDatasetPaths } from '@/web/core/dataset/api';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useQuery } from '@tanstack/react-query';
import React, { type Dispatch, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import FolderPath from '@/components/common/folder/Path';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type PathItemType = {
  parentId: string;
  parentName: string;
};

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
  setParentId: Dispatch<string>;
  paths: PathItemType[];
  onClose: () => void;
  tips?: string | null;
  isLoading?: boolean;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      iconSrc="/imgs/workflow/db.png"
      title={
        <Box fontWeight={'normal'}>
          <FolderPath
            paths={paths.map((path, i) => ({
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
    >
      <MyBox isLoading={isLoading} h={'100%'}>
        {children}
      </MyBox>
    </MyModal>
  );
};

export function useDatasetSelect() {
  const [parentId, setParentId] = useState('');
  const [searchKey, setSearchKey] = useState('');

  const {
    data = {
      datasets: [],
      paths: []
    },
    loading: isFetching,
    runAsync: loadDatasets
  } = useRequest2(
    async () => {
      const result = await Promise.all([
        getDatasets({ parentId, searchKey }),
        // Only get paths when not searching
        searchKey.trim()
          ? Promise.resolve([])
          : getDatasetPaths({ sourceId: parentId, type: 'current' })
      ]);
      return {
        datasets: result[0],
        paths: result[1]
      };
    },
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
    datasets: data.datasets,
    paths: data.paths,
    isFetching,
    loadDatasets
  };
}

export default DatasetSelectContainer;
