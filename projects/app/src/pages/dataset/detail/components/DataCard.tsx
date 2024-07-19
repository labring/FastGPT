import React, { useCallback, useState, useRef, useMemo } from 'react';
import {
  Box,
  Card,
  IconButton,
  Flex,
  Grid,
  Button,
  useTheme,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  useDisclosure,
  HStack,
  Switch
} from '@chakra-ui/react';
import {
  getDatasetDataList,
  delOneDatasetDataById,
  getDatasetCollectionById,
  putDatasetDataById
} from '@/web/core/dataset/api';
import { DeleteIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { debounce } from 'lodash';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import InputDataModal from '../components/InputDataModal';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import type { DatasetDataListItemType } from '@/global/core/dataset/type.d';
import { TabEnum } from '..';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { DatasetCollectionTypeMap, TrainingTypeMap } from '@fastgpt/global/core/dataset/constants';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { useI18n } from '@/web/context/I18n';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

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

  const { t } = useTranslation();
  const { datasetT } = useI18n();
  const [searchText, setSearchText] = useState('');
  const { toast } = useToast();
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the data'),
    type: 'delete'
  });
  const { isOpen, onOpen, onClose } = useDisclosure();
  const readSource = getCollectionSourceAndOpen(collectionId);

  const {
    data: datasetDataList,
    Pagination,
    total,
    getData,
    pageNum,
    pageSize,
    isLoading: isRequesting
  } = usePagination<DatasetDataListItemType>({
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

  const metadataList = useMemo(() => {
    if (!collection) return [];

    const webSelector =
      collection?.datasetId?.websiteConfig?.selector || collection?.metadata?.webPageSelector;

    return [
      {
        label: t('common:core.dataset.collection.metadata.source'),
        value: t(DatasetCollectionTypeMap[collection.type]?.name as any)
      },
      {
        label: t('common:core.dataset.collection.metadata.source name'),
        value: collection.file?.filename || collection?.rawLink || collection?.name
      },
      {
        label: t('common:core.dataset.collection.metadata.source size'),
        value: collection.file ? formatFileSize(collection.file.length) : '-'
      },
      {
        label: t('common:core.dataset.collection.metadata.Createtime'),
        value: formatTime2YMDHM(collection.createTime)
      },
      {
        label: t('common:core.dataset.collection.metadata.Updatetime'),
        value: formatTime2YMDHM(collection.updateTime)
      },
      {
        label: t('common:core.dataset.collection.metadata.Raw text length'),
        value: collection.rawTextLength ?? '-'
      },
      {
        label: t('common:core.dataset.collection.metadata.Training Type'),
        value: t(TrainingTypeMap[collection.trainingType]?.label as any)
      },
      {
        label: t('common:core.dataset.collection.metadata.Chunk Size'),
        value: collection.chunkSize || '-'
      },
      ...(webSelector
        ? [
            {
              label: t('common:core.dataset.collection.metadata.Web page selector'),
              value: webSelector
            }
          ]
        : []),
      {
        ...(collection.tags
          ? [
              {
                label: datasetT('collection_tags'),
                value: collection.tags?.join(', ') || '-'
              }
            ]
          : [])
      }
    ];
  }, [collection, datasetT, t]);

  const { run: onUpdate, loading } = useRequest2(putDatasetDataById, {
    onSuccess() {
      getData(pageNum);
    }
  });

  const isLoading = isRequesting || loading;

  return (
    <MyBox isLoading={isLoading} position={'relative'} py={[1, 5]} h={'100%'}>
      <Flex ref={BoxRef} flexDirection={'column'} h={'100%'}>
        {/* Header */}
        <Flex alignItems={'center'} px={5}>
          <IconButton
            mr={3}
            icon={<MyIcon name={'common/backFill'} w={['14px', '18px']} color={'primary.500'} />}
            variant={'whitePrimary'}
            size={'smSquare'}
            borderRadius={'50%'}
            aria-label={''}
            onClick={() =>
              router.replace({
                query: {
                  datasetId: router.query.datasetId,
                  parentId: router.query.parentId,
                  currentTab: TabEnum.collectionCard
                }
              })
            }
          />
          <Flex className="textEllipsis" flex={'1 0 0'} mr={[3, 5]} alignItems={'center'}>
            <Box lineHeight={1.2}>
              {collection?._id && (
                <RawSourceBox
                  collectionId={collection._id}
                  {...getCollectionSourceData(collection)}
                  fontSize={['sm', 'md']}
                  color={'black'}
                  textDecoration={'none'}
                />
              )}
              <Box fontSize={'sm'} color={'myGray.500'}>
                {t('common:core.dataset.collection.id')}:{' '}
                <Box as={'span'} userSelect={'all'}>
                  {collection?._id}
                </Box>
              </Box>
            </Box>
          </Flex>
          {canWrite && (
            <Box>
              <Button
                mx={2}
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
          {isPc && (
            <MyTooltip label={t('common:core.dataset.collection.metadata.Read Metadata')}>
              <IconButton
                variant={'whiteBase'}
                size={['sm', 'md']}
                icon={<MyIcon name={'menu'} w={'18px'} />}
                aria-label={''}
                onClick={onOpen}
              />
            </MyTooltip>
          )}
        </Flex>
        <Flex my={3} alignItems={'center'} px={5}>
          <Box>
            <Box as={'span'} fontSize={['sm', 'md']}>
              {t('core.dataset.data.Total Amount', { total })}
            </Box>
          </Box>
          <Box flex={1} mr={1} />
          <MyInput
            leftIcon={
              <MyIcon
                name="common/searchLight"
                position={'absolute'}
                w={'14px'}
                color={'myGray.500'}
              />
            }
            w={['200px', '300px']}
            placeholder={t('common:core.dataset.data.Search data placeholder')}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
            }}
          />
        </Flex>
        {/* data */}
        <Box flex={'1 0 0'} overflow={'auto'} px={5}>
          <Grid
            gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
            gridGap={4}
          >
            {datasetDataList.map((item) => (
              <Card
                key={item._id}
                cursor={'pointer'}
                p={3}
                userSelect={'none'}
                boxShadow={'none'}
                bg={'myWhite.500'}
                border={theme.borders.sm}
                position={'relative'}
                overflow={'hidden'}
                _hover={{
                  borderColor: 'myGray.200',
                  boxShadow: 'lg',
                  bg: 'white',
                  '& .footer': { h: 'auto', p: 3 },
                  '& .forbid-switch': { display: 'flex' }
                }}
                onClick={() => {
                  if (!collection) return;
                  setEditDataId(item._id);
                }}
              >
                <Flex zIndex={1} alignItems={'center'}>
                  <MyTag type="borderFill"># {item.chunkIndex ?? '-'}</MyTag>

                  <Box
                    className={'textEllipsis'}
                    flex={'1 0 0'}
                    w="0"
                    fontSize={'mini'}
                    textAlign={'right'}
                  >
                    ID:{item._id}
                  </Box>
                  {/* {item.forbid ? (
                    <MyTag colorSchema="gray" bg={'transparent'} px={1} showDot>
                      {datasetT('Disabled')}
                    </MyTag>
                  ) : (
                    <MyTag colorSchema="green" bg={'transparent'} px={1} showDot>
                      {datasetT('Enabled')}
                    </MyTag>
                  )}
                  <HStack
                    borderLeftWidth={'1.5px'}
                    className="forbid-switch"
                    display={['flex', 'none']}
                    borderLeftColor={'myGray.200'}
                    pl={1}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    h={'12px'}
                  >
                    <Switch
                      size={'sm'}
                      isChecked={!item.forbid}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdate({
                          dataId: item._id,
                          forbid: !e.target.checked
                        });
                      }}
                    />
                  </HStack> */}
                </Flex>
                <Box
                  maxH={'135px'}
                  minH={'90px'}
                  overflow={'hidden'}
                  wordBreak={'break-all'}
                  pt={1}
                  pb={3}
                  fontSize={'sm'}
                >
                  <Box color={'black'} mb={1}>
                    {item.q}
                  </Box>
                  <Box color={'myGray.700'}>{item.a}</Box>

                  {/* Mask */}
                  <Flex
                    className="footer"
                    position={'absolute'}
                    top={0}
                    bottom={0}
                    left={0}
                    right={0}
                    h={'0'}
                    overflow={'hidden'}
                    bg={'linear-gradient(to top, white,white 20%, rgba(255,255,255,0) 60%)'}
                    alignItems={'flex-end'}
                    fontSize={'mini'}
                  >
                    <HStack p={0} flex={1}>
                      <Flex alignItems={'center'}>
                        <MyIcon name="common/text/t" w={'0.8rem'} mr={1} color={'myGray.500'} />
                        <Box>{item.q.length + (item.a?.length || 0)}</Box>
                      </Flex>
                      <Box flex={1}></Box>
                      {/* <Box className={'textEllipsis'} flex={'1 0 0'} w="0">
                        ID:{item._id}
                      </Box> */}
                      {canWrite && (
                        <IconButton
                          display={'flex'}
                          icon={<DeleteIcon />}
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
                    </HStack>
                  </Flex>
                </Box>
              </Card>
            ))}
          </Grid>
          {total > pageSize && (
            <Flex mt={2} justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
          {total === 0 && <EmptyTip text={t('common:core.dataset.data.Empty Tip')}></EmptyTip>}
        </Box>
      </Flex>

      {/* metadata drawer */}
      <Drawer isOpen={isOpen} placement="right" size={'md'} onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader fontSize={'lg'}>
            {t('common:core.dataset.collection.metadata.metadata')}
          </DrawerHeader>

          <DrawerBody>
            {metadataList.map((item, i) => (
              <Flex key={i} alignItems={'center'} mb={5} wordBreak={'break-all'} fontSize={'sm'}>
                <Box color={'myGray.500'} flex={'0 0 100px'}>
                  {item.label}
                </Box>
                <Box>{item.value}</Box>
              </Flex>
            ))}
            {collection?.sourceId && (
              <Button variant={'whitePrimary'} onClick={readSource}>
                {t('common:core.dataset.collection.metadata.read source')}
              </Button>
            )}
          </DrawerBody>

          <DrawerFooter>
            <Button variant={'whitePrimary'} onClick={onClose}>
              {t('common:common.Close')}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {editDataId !== undefined && collection && (
        <InputDataModal
          collectionId={collection._id}
          dataId={editDataId}
          onClose={() => setEditDataId(undefined)}
          onSuccess={() => getData(pageNum)}
          onDelete={() => getData(pageNum)}
        />
      )}
      <ConfirmModal />
    </MyBox>
  );
};

export default React.memo(DataCard);
