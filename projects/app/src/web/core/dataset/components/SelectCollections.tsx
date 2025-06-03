import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import ParentPaths from '@/components/common/ParentPaths';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionPathById, getDatasetCollections } from '@/web/core/dataset/api';
import { Box, Flex, ModalFooter, Button, useTheme, Grid, Card, ModalBody } from '@chakra-ui/react';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '../context/datasetPageContext';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

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
  const { loadDatasetDetail } = useContextSelector(DatasetPageContext, (v) => v);

  const { Loading } = useLoading();
  const [selectedDatasetCollectionIds, setSelectedDatasetCollectionIds] =
    useState<string[]>(defaultSelectedId);
  const [parentId, setParentId] = useState('');

  useQuery(['loadDatasetDetail', datasetId], () => loadDatasetDetail(datasetId));

  const { data, loading: isLoading } = useRequest2(
    () =>
      getDatasetCollections({
        datasetId,
        parentId,
        selectFolder: type === 'folder',
        simple: true,
        pageNum: 1,
        pageSize: 50
      }),
    {
      manual: false,
      refreshDeps: [datasetId, parentId, type]
    }
  );
  const formatCollections = useMemo(
    () =>
      data?.list.map((collection) => {
        const icon = getCollectionIcon({ type: collection.type, name: collection.name });

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
    errorToast: t('common:request_error')
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
            paths={paths.map((path) => ({
              parentId: path.parentId,
              parentName: path.parentName
            }))}
            FirstPathDom={
              <>
                <Box fontWeight={'bold'} fontSize={['sm', 'md']}>
                  {title
                    ? title
                    : type === 'folder'
                      ? t('common:root_folder')
                      : t('common:dataset.collections.Select Collection')}
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
      <ModalBody flex={'1 0 0'} overflow={'auto'}>
        <Grid
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)']}
          gridGap={3}
          userSelect={'none'}
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
                    bg: 'primary.50',
                    borderColor: 'primary.300'
                  }}
                  {...(selected
                    ? {
                        bg: 'primary.200'
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
                    <MyIcon name={item.icon as any} w={'18px'} />
                    <Box ml={3} fontSize={'sm'} className="textEllipsis">
                      {item.name}
                    </Box>
                  </Flex>
                </Card>
              );
            })()
          )}
        </Grid>
        {collections.length === 0 && (
          <EmptyTip pt={'20vh'} text={t('common:no_child_folder')}></EmptyTip>
        )}
        <Loading loading={isLoading} fixed={false} />
      </ModalBody>
      {CustomFooter ? (
        <>{CustomFooter}</>
      ) : (
        <ModalFooter>
          <Button
            isLoading={isResponding}
            isDisabled={type === 'collection' && selectedDatasetCollectionIds.length === 0}
            onClick={mutate}
          >
            {type === 'folder' ? t('common:confirm_move') : t('common:Confirm')}
          </Button>
        </ModalFooter>
      )}
    </MyModal>
  );
};

export default SelectCollections;
