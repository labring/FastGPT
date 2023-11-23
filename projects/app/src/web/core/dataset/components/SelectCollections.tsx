import MyIcon from '@/components/Icon';
import MyModal from '@/components/MyModal';
import ParentPaths from '@/components/common/ParentPaths';
import { useLoading } from '@/web/common/hooks/useLoading';
import { useRequest } from '@/web/common/hooks/useRequest';
import { getDatasetCollectionPathById, getDatasetCollections } from '@/web/core/dataset/api';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { Box, Flex, ModalFooter, Button, useTheme, Grid, Card, Image } from '@chakra-ui/react';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';

const SelectCollections = ({
  datasetId,
  type,
  defaultSelectedId = [],
  onClose,
  onChange,
  onSuccess,
  title,
  tip,
  max = 1,
  CustomFooter
}: {
  datasetId: string;
  type: 'folder' | 'collection';
  onClose: () => void;
  onChange?: (e: { parentId: string; collectionIds: string[] }) => void | Promise<void>;
  onSuccess?: (e: { parentId: string; collectionIds: string[] }) => void | Promise<void>;
  defaultSelectedId?: string[];
  title?: string;
  tip?: string;
  max?: number;
  CustomFooter?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { datasetDetail, loadDatasetDetail } = useDatasetStore();
  const { Loading } = useLoading();
  const [selectedDatasetCollectionIds, setSelectedDatasetCollectionIds] =
    useState<string[]>(defaultSelectedId);
  const [parentId, setParentId] = useState('');

  useQuery(['loadDatasetDetail', datasetId], () => loadDatasetDetail(datasetId));

  const { data, isLoading } = useQuery(['getDatasetCollections', parentId], () =>
    getDatasetCollections({
      datasetId,
      parentId,
      selectFolder: type === 'folder',
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
  const collections = useMemo(
    () =>
      type === 'folder'
        ? formatCollections.filter((item) => item._id !== defaultSelectedId[0])
        : formatCollections,
    [defaultSelectedId, formatCollections, type]
  );

  const { data: paths = [] } = useQuery(['getDatasetCollectionPathById', parentId], () =>
    getDatasetCollectionPathById(parentId)
  );

  const { mutate, isLoading: isResponding } = useRequest({
    mutationFn: async () => {
      if (type === 'folder') {
        await onSuccess?.({ parentId: paths[paths.length - 1]?.parentId || '', collectionIds: [] });
      } else {
        await onSuccess?.({
          parentId: paths[paths.length - 1]?.parentId || '',
          collectionIds: selectedDatasetCollectionIds
        });
      }

      return null;
    },
    errorToast: t('common.Request Error')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      maxW={['90vw', '900px']}
      w={'100%'}
      h={['90vh', '80vh']}
      isCentered
      iconSrc="/imgs/modal/move.svg"
      title={
        <Box>
          <ParentPaths
            paths={paths.map((path, i) => ({
              parentId: path.parentId,
              parentName: path.parentName
            }))}
            FirstPathDom={
              <>
                <Box fontWeight={'bold'} fontSize={['sm', 'lg']}>
                  {title || type === 'folder'
                    ? t('common.Select One Folder')
                    : t('dataset.collections.Select Collection')}
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
      }
    >
      <Flex flexDirection={'column'} flex={'1 0 0'}>
        <Box flex={'1 0 0'} px={4} py={2} position={'relative'}>
          <Grid
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
            gridGap={3}
            userSelect={'none'}
            overflowY={'auto'}
            mt={2}
          >
            {collections.map((item) =>
              (() => {
                const selected = selectedDatasetCollectionIds.includes(item._id);
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
                        let result: string[] = [];
                        if (max === 1) {
                          result = [item._id];
                        } else if (selected) {
                          result = selectedDatasetCollectionIds.filter((id) => id !== item._id);
                        } else if (selectedDatasetCollectionIds.length < max) {
                          result = [...selectedDatasetCollectionIds, item._id];
                        }
                        setSelectedDatasetCollectionIds(result);
                        onChange && onChange({ parentId, collectionIds: result });
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
          {collections.length === 0 && (
            <Flex mt={'20vh'} flexDirection={'column'} alignItems={'center'}>
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
              <Box mt={2} color={'myGray.500'}>
                {t('common.folder.No Folder')}
              </Box>
            </Flex>
          )}
          <Loading loading={isLoading} fixed={false} />
        </Box>
        {CustomFooter ? (
          <>{CustomFooter}</>
        ) : (
          <ModalFooter>
            <Button
              isLoading={isResponding}
              isDisabled={type === 'collection' && selectedDatasetCollectionIds.length === 0}
              onClick={mutate}
            >
              {type === 'folder' ? t('common.Confirm Move') : t('Confirm')}
            </Button>
          </ModalFooter>
        )}
      </Flex>
    </MyModal>
  );
};

export default SelectCollections;
