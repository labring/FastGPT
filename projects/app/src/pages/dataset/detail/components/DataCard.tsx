import React, { useState, useRef, useMemo } from 'react';
import { Box, Card, IconButton, Flex, Button, useTheme } from '@chakra-ui/react';
import {
  getDatasetDataList,
  delOneDatasetDataById,
  getDatasetCollectionById,
  putDatasetDataById
} from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import InputDataModal from '../components/InputDataModal';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import TagsPopOver from './CollectionCard/TagsPopOver';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import Markdown from '@/components/Markdown';

const DataCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const lastSearch = useRef('');
  const router = useRouter();
  const { isPc } = useSystem();
  const { collectionId = '', datasetId } = router.query as {
    collectionId: string;
    datasetId: string;
  };
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const { feConfigs } = useSystemStore();

  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const { toast } = useToast();
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the data'),
    type: 'delete'
  });

  const {
    data: datasetDataList,
    Pagination,
    total,
    getData,
    pageNum,
    pageSize,
    isLoading: isRequesting
  } = usePagination({
    api: getDatasetDataList,
    pageSize: 24,
    defaultRequest: false,
    params: {
      collectionId,
      searchText
    },
    onChange() {
      if (BoxRef.current) {
        BoxRef.current.scrollTop = 0;
      }
    }
  });

  const [editDataId, setEditDataId] = useState<string>();

  // get first page data
  useRequest2(
    async () => {
      getData(1);
      lastSearch.current = searchText;
    },
    {
      manual: false,
      debounceWait: 300,
      refreshDeps: [searchText]
    }
  );

  // get file info
  const { data: collection } = useQuery(
    ['getDatasetCollectionById', collectionId],
    () => getDatasetCollectionById(collectionId),
    {
      onError: () => {
        router.replace({
          query: {
            datasetId
          }
        });
      }
    }
  );

  const canWrite = useMemo(() => datasetDetail.permission.hasWritePer, [datasetDetail]);

  const { loading } = useRequest2(putDatasetDataById, {
    onSuccess() {
      getData(pageNum);
    }
  });

  const isLoading = isRequesting || loading;

  return (
    <MyBox isLoading={isLoading} position={'relative'} py={[1, 0]} h={'100%'}>
      <Flex ref={BoxRef} flexDirection={'column'} h={'100%'}>
        {/* Header */}
        <Flex alignItems={'center'} px={6}>
          <Flex className="textEllipsis" flex={'1 0 0'} mr={[3, 5]} alignItems={'center'}>
            <Box>
              <Box alignItems={'center'} gap={2} display={isPc ? 'flex' : ''}>
                {collection?._id && (
                  <RawSourceBox
                    collectionId={collection._id}
                    {...getCollectionSourceData(collection)}
                    fontSize={['sm', 'md']}
                    color={'black'}
                    textDecoration={'none'}
                  />
                )}
              </Box>
              {feConfigs?.isPlus && !!collection?.tags?.length && (
                <TagsPopOver currentCollection={collection} />
              )}
            </Box>
          </Flex>
          {canWrite && (
            <Box>
              <Button
                ml={2}
                variant={'whitePrimary'}
                size={['sm', 'md']}
                onClick={() => {
                  if (!collection) return;
                  setEditDataId('');
                }}
              >
                {t('common:dataset.Insert Data')}
              </Button>
            </Box>
          )}
        </Flex>
        <Box justifyContent={'center'} px={6} pos={'relative'} w={'100%'}>
          <MyDivider my={'17px'} w={'100%'} />
        </Box>
        <Flex alignItems={'center'} px={6} pb={4}>
          <Flex align={'center'} color={'myGray.500'}>
            <MyIcon name="common/list" mr={2} w={'18px'} />
            <Box as={'span'} fontSize={['sm', '14px']} fontWeight={'500'}>
              {t('common:core.dataset.data.Total Amount', { total })}
            </Box>
          </Flex>
          <Box flex={1} mr={1} />
          <MyInput
            leftIcon={
              <MyIcon
                name="common/searchLight"
                position={'absolute'}
                w={'14px'}
                color={'myGray.600'}
              />
            }
            bg={'myGray.25'}
            borderColor={'myGray.200'}
            color={'myGray.500'}
            w={['200px', '300px']}
            placeholder={t('common:core.dataset.data.Search data placeholder')}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
            }}
          />
        </Flex>
        {/* data */}
        <Box flex={'1 0 0'} overflow={'auto'} px={5} pb={5}>
          <Flex flexDir={'column'} gap={2}>
            {datasetDataList.map((item, index) => (
              <Card
                key={item._id}
                cursor={'pointer'}
                p={3}
                userSelect={'none'}
                boxShadow={'none'}
                bg={index % 2 === 1 ? 'myGray.50' : 'blue.50'}
                border={theme.borders.sm}
                position={'relative'}
                overflow={'hidden'}
                _hover={{
                  borderColor: 'blue.600',
                  boxShadow: 'lg',
                  '& .header': { visibility: 'visible' },
                  '& .footer': { visibility: 'visible' },
                  '& .forbid-switch': { display: 'flex' },
                  bg: index % 2 === 1 ? 'myGray.200' : 'blue.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!collection) return;
                  setEditDataId(item._id);
                }}
              >
                {/* Data tag */}
                <Flex
                  position={'absolute'}
                  zIndex={1}
                  alignItems={'center'}
                  visibility={'hidden'}
                  className="header"
                >
                  <MyTag
                    px={2}
                    type="borderFill"
                    borderRadius={'sm'}
                    border={'1px'}
                    color={'myGray.200'}
                    bg={'white'}
                    fontWeight={'500'}
                  >
                    <Box color={'blue.600'}>#{item.chunkIndex ?? '-'} </Box>
                    <Box
                      ml={1.5}
                      className={'textEllipsis'}
                      fontSize={'mini'}
                      textAlign={'right'}
                      color={'myGray.500'}
                    >
                      ID:{item._id}
                    </Box>
                  </MyTag>
                </Flex>

                {/* Data content */}
                <Box wordBreak={'break-all'} fontSize={'sm'}>
                  <Markdown source={item.q} isDisabled />
                  {!!item.a && (
                    <>
                      <MyDivider />
                      <Markdown source={item.a} isDisabled />
                    </>
                  )}
                </Box>

                {/* Mask */}
                <Flex
                  className="footer"
                  position={'absolute'}
                  bottom={2}
                  right={2}
                  overflow={'hidden'}
                  alignItems={'flex-end'}
                  visibility={'hidden'}
                  fontSize={'mini'}
                >
                  <Flex
                    alignItems={'center'}
                    bg={'white'}
                    color={'myGray.600'}
                    borderRadius={'sm'}
                    border={'1px'}
                    borderColor={'myGray.200'}
                    h={'24px'}
                    px={2}
                    fontSize={'mini'}
                    boxShadow={'1'}
                    py={1}
                    mr={2}
                  >
                    <MyIcon
                      bg={'white'}
                      color={'myGray.600'}
                      borderRadius={'sm'}
                      border={'1px'}
                      borderColor={'myGray.200'}
                      name="common/text/t"
                      w={'14px'}
                      mr={1}
                    />
                    {item.q.length + (item.a?.length || 0)}
                  </Flex>
                  {canWrite && (
                    <IconButton
                      display={'flex'}
                      p={1}
                      boxShadow={'1'}
                      icon={<MyIcon name={'common/trash'} w={'14px'} color={'myGray.600'} />}
                      variant={'whiteDanger'}
                      size={'xsSquare'}
                      aria-label={'delete'}
                      onClick={(e) => {
                        e.stopPropagation();
                        openConfirm(async () => {
                          try {
                            await delOneDatasetDataById(item._id);
                            getData(pageNum);
                          } catch (error) {
                            toast({
                              title: getErrText(error),
                              status: 'error'
                            });
                          }
                        })();
                      }}
                    />
                  )}
                </Flex>
              </Card>
            ))}
          </Flex>
          {total > pageSize && (
            <Flex mt={2} justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
          {total === 0 && <EmptyTip text={t('common:core.dataset.data.Empty Tip')}></EmptyTip>}
        </Box>
      </Flex>

      {editDataId !== undefined && collection && (
        <InputDataModal
          collectionId={collection._id}
          dataId={editDataId}
          onClose={() => setEditDataId(undefined)}
          onSuccess={() => getData(pageNum)}
        />
      )}
      <ConfirmModal />
    </MyBox>
  );
};

export default React.memo(DataCard);
