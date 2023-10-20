import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ParentPath from '@/components/common/ParentPaths';
import { useQuery } from '@tanstack/react-query';
import { getDatasetCollectionPathById, getDatasetCollections } from '../api';
import { useDatasetStore } from '../store/dataset';
import { Box, Card, Flex, Grid, Image, useTheme } from '@chakra-ui/react';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { useLoading } from '@/web/common/hooks/useLoading';

const SelectCollections = ({
  title,
  tip,
  datasetId,
  selectedCollectionIds,
  setSelectedCollectionIds,
  max = 1
}: {
  datasetId: string;
  selectedCollectionIds: string[];
  setSelectedCollectionIds: React.Dispatch<React.SetStateAction<string[]>>;
  title?: string;
  tip?: string;
  max?: number;
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail } = useDatasetStore();
  const { Loading } = useLoading();

  const [parentId, setParentId] = useState('');

  const { data: paths = [] } = useQuery(['getDatasetCollectionPathById', parentId], () =>
    getDatasetCollectionPathById(parentId)
  );

  useQuery(['loadDatasetDetail', datasetId], () => loadDatasetDetail(datasetId));

  const { data, isLoading } = useQuery(['getDatasetCollections', parentId], () =>
    getDatasetCollections({
      datasetId,
      parentId,
      simple: true,
      pageNum: 1,
      pageSize: 50
    })
  );

  const formatCollections = useMemo(
    () =>
      data?.data.map((collection) => {
        const icon = getCollectionIcon(collection.type, collection.name);

        return {
          ...collection,
          icon
        };
      }) || [],
    [data]
  );

  return (
    <Flex flexDirection={'column'} h={'100%'} position={'relative'}>
      <Box>
        <ParentPath
          paths={paths.map((path, i) => ({
            parentId: path.parentId,
            parentName: path.parentName
          }))}
          rootName={datasetDetail.name}
          FirstPathDom={
            <>
              <Box fontWeight={'bold'} fontSize={['sm', 'lg']}>
                {title || t('dataset.collections.Select Collection')}
              </Box>
              {!!tip && (
                <Box fontSize={'sm'} color={'myGray.500'}>
                  {tip}
                </Box>
              )}
            </>
          }
          onClick={(e) => {
            setParentId(e);
          }}
        />
      </Box>
      <Box flex={'1 0 0'} overflowY={'auto'} mt={2}>
        <Grid
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
          gridGap={3}
          userSelect={'none'}
        >
          {formatCollections.map((item) =>
            (() => {
              const selected = selectedCollectionIds.includes(item._id);
              return (
                <Card
                  key={item._id}
                  p={3}
                  border={theme.borders.base}
                  boxShadow={'sm'}
                  cursor={'pointer'}
                  _hover={{
                    boxShadow: 'md'
                  }}
                  {...(selected
                    ? {
                        bg: 'myBlue.300'
                      }
                    : {})}
                  onClick={() => {
                    if (item.type === DatasetCollectionTypeEnum.folder) {
                      setParentId(item._id);
                    } else {
                      if (max === 1) {
                        setSelectedCollectionIds([item._id]);
                        return;
                      }
                      if (selected) {
                        setSelectedCollectionIds(
                          selectedCollectionIds.filter((id) => id !== item._id)
                        );
                      } else if (selectedCollectionIds.length < max) {
                        setSelectedCollectionIds([...selectedCollectionIds, item._id]);
                      }
                    }
                  }}
                >
                  <Flex alignItems={'center'} h={'38px'}>
                    <Image src={item.icon} w={'18px'} alt={''} />
                    <Box ml={3} fontSize={'sm'}>
                      {item.name}
                    </Box>
                  </Flex>
                </Card>
              );
            })()
          )}
        </Grid>
      </Box>
      <Loading loading={isLoading} fixed={false} />
    </Flex>
  );
};

export default SelectCollections;
