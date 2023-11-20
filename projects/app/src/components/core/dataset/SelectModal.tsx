import { getDatasets, getDatasetPaths } from '@/web/core/dataset/api';
import MyModal from '@/components/MyModal';
import { useQuery } from '@tanstack/react-query';
import React, { Dispatch, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, ModalHeader } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import ParentPaths from '@/components/common/ParentPaths';

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
  children
}: {
  isOpen: boolean;
  setParentId: Dispatch<string>;
  paths: PathItemType[];
  onClose: () => void;
  tips?: string | null;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();

  return (
    <MyModal isOpen={isOpen} onClose={onClose} w={'100%'} maxW={['90vw', '900px']} isCentered>
      <Flex flexDirection={'column'} h={'90vh'}>
        <ModalHeader fontWeight={'normal'}>
          <ParentPaths
            paths={paths.map((path, i) => ({
              parentId: path.parentId,
              parentName: path.parentName
            }))}
            FirstPathDom={t('chat.Select Mark Kb')}
            onClick={(e) => {
              setParentId(e);
            }}
          />
          {!!tips && (
            <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'normal'}>
              {tips}
            </Box>
          )}
        </ModalHeader>
        <Box flex={'1 0 0'}>{children}</Box>
      </Flex>
    </MyModal>
  );
};

export function useDatasetSelect() {
  const { t } = useTranslation();
  const [parentId, setParentId] = useState<string>();

  const { data, isLoading } = useQuery(['loadDatasetData', parentId], () =>
    Promise.all([getDatasets({ parentId }), getDatasetPaths(parentId)])
  );

  const paths = useMemo(() => [...(data?.[1] || [])], [data]);

  return {
    parentId,
    setParentId,
    datasets: data?.[0] || [],
    paths,
    isLoading
  };
}

export default DatasetSelectContainer;
