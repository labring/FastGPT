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
  const [parentId, setParentId] = useState<string>('');

  const { data, loading: isFetching } = useRequest2(
    () =>
      Promise.all([
        getDatasets({ parentId }),
        getDatasetPaths({ sourceId: parentId, type: 'current' })
      ]),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const paths = useMemo(() => [...(data?.[1] || [])], [data]);

  return {
    parentId,
    setParentId,
    datasets: data?.[0] || [],
    paths,
    isFetching
  };
}

export default DatasetSelectContainer;
