import React, { useState, useMemo, useEffect } from 'react';
import { Box, Card, IconButton, Flex, Button, useTheme, Image, Text } from '@chakra-ui/react';
import {
  getDatasetDataList,
  delOneDatasetDataById,
  getDatasetCollectionById,
  getDatasetDataItemById,
  putDatasetDataById
} from '@/web/core/dataset/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import InputDataModal from './InputDataModal';
import ImageDatasetInputModal from './ImageDatasetInputModal';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import TagsPopOver from './CollectionCard/TagsPopOver';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import Markdown from '@/components/Markdown';
import { useMemoizedFn } from 'ahooks';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { TabEnum } from './NavBar';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import TrainingStates from './CollectionCard/TrainingStates';
import { getTextValidLength } from '@fastgpt/global/common/string/utils';
import { ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { GET, POST } from '@/web/common/api/request';

const postGetFileToken = (params: {
  bucketName: string;
  fileId: string;
  teamId: string;
  datasetId: string;
}) => POST<string>('common/file/token', params);

const getImagePreviewUrl = async (
  fileId: string,
  fileName: string,
  teamId: string,
  datasetId: string
) => {
  try {
    console.log('开始为图片生成预览URL:', { fileId, fileName, teamId });

    if (!fileId) {
      console.error('fileId为空，无法生成预览URL');
      return '';
    }

    // 通过API获取token，传递必要参数
    const token = await postGetFileToken({
      bucketName: 'dataset',
      fileId,
      teamId,
      datasetId
    });

    // 添加域名前缀
    const origin = window.location.origin; // 获取当前域名

    // 使用与upload.ts相同的URL格式
    const previewUrl = `${origin}${ReadFileBaseUrl}/${encodeURIComponent(fileName)}?token=${token}`;
    console.log('成功生成预览URL:', previewUrl);

    return previewUrl;
  } catch (error) {
    console.error('创建图片预览URL失败:', error);
    return '';
  }
};

const DataCard = () => {
  const theme = useTheme();
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
  const [errorModalId, setErrorModalId] = useState('');
  const { toast } = useToast();

  const scrollParams = useMemo(
    () => ({
      collectionId,
      searchText
    }),
    [collectionId, searchText]
  );
  const EmptyTipDom = useMemo(
    () => <EmptyTip text={t('common:core.dataset.data.Empty Tip')} />,
    [t]
  );
  const {
    data: datasetDataList,
    ScrollData,
    total,
    refreshList,
    setData: setDatasetDataList
  } = useScrollPagination(getDatasetDataList, {
    pageSize: 15,
    params: scrollParams,
    refreshDeps: [searchText, collectionId],
    EmptyTip: EmptyTipDom
  });

  const [editDataId, setEditDataId] = useState<string>();

  // get file info
  const { data: collection } = useRequest2(() => getDatasetCollectionById(collectionId), {
    refreshDeps: [collectionId],
    manual: false,
    onError: () => {
      router.replace({
        query: {
          datasetId
        }
      });
    }
  });

  const canWrite = useMemo(() => datasetDetail.permission.hasWritePer, [datasetDetail]);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the data'),
    type: 'delete'
  });
  const onDeleteOneData = useMemoizedFn((dataId: string) => {
    openConfirm(async () => {
      try {
        // 删除数据
        await delOneDatasetDataById(dataId);
        setDatasetDataList((prev) => {
          return prev.filter((data) => data._id !== dataId);
        });
        toast({
          title: t('common:common.Delete Success'),
          status: 'success'
        });
      } catch (error) {
        console.error('删除数据失败:', error);
        toast({
          title: getErrText(error),
          status: 'error'
        });
      }
    })();
  });

  // 判断是否为图片集合的函数
  const isImageCollection = useMemo(() => {
    if (!collection) return false;
    // 检查metadata中是否有标记
    if (
      collection.metadata &&
      typeof collection.metadata === 'object' &&
      'isImageCollection' in collection.metadata
    ) {
      return collection.metadata.isImageCollection === true;
    }
    // 集合名称判断（备选方案）
    return collection.name?.includes('图片集合') || false;
  }, [collection]);

  // 添加状态存储预览URLs
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>({});

  // 在数据加载成功后生成预览URLs
  useEffect(() => {
    if (!datasetDataList.length) {
      console.log('数据列表为空，不生成预览URL');
      return;
    }

    if (!isImageCollection) {
      console.log('非图片集合，不生成预览URL');
      return;
    }

    console.log('数据列表长度:', datasetDataList.length);
    console.log(
      '列表数据:',
      datasetDataList.map((item) => ({
        id: item._id,
        q: item.q,
        a: item.a,
        imageFileId: item.imageFileId
      }))
    );

    // 直接使用列表数据生成预览URL
    const fetchDetailsAndCreateUrls = async () => {
      const urlMap: Record<string, string> = {};

      // 并行处理所有项目
      const previewPromises = datasetDataList.map(async (item) => {
        try {
          // 直接检查列表数据中是否包含imageFileId
          if (item.imageFileId) {
            console.log(`项目 ${item._id} 包含图片ID:`, {
              imageFileId: item.imageFileId,
              fileName: item.a || 'image.jpg'
            });

            const previewUrl = await getImagePreviewUrl(
              item.imageFileId,
              item.a ?? 'image.jpg',
              item.teamId ?? '',
              item.datasetId
            );

            if (previewUrl) {
              urlMap[item._id] = previewUrl;
              console.log(`生成项目 ${item._id} 的预览URL成功`);
            }
          }
        } catch (error) {
          console.error(`生成项目 ${item._id} 预览URL失败:`, error);
        }
      });

      // 等待所有预览URL生成完成
      await Promise.all(previewPromises);

      console.log(`成功生成 ${Object.keys(urlMap).length} 个预览URL`);
      setImagePreviewUrls(urlMap);
    };

    fetchDetailsAndCreateUrls();
  }, [datasetDataList, isImageCollection]);

  return (
    <MyBox py={[1, 0]} h={'100%'}>
      <Flex flexDirection={'column'} h={'100%'}>
        {/* Header */}
        <Flex alignItems={'center'} px={6}>
          <Box flex={'1 0 0'} mr={[3, 5]} alignItems={'center'}>
            <Box
              className="textEllipsis"
              alignItems={'center'}
              gap={2}
              display={isPc ? 'flex' : ''}
            >
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
          {datasetDetail.type !== 'websiteDataset' && !!collection?.chunkSize && (
            <Button
              ml={2}
              variant={'whitePrimary'}
              size={['sm', 'md']}
              onClick={() => {
                router.push({
                  query: {
                    datasetId,
                    currentTab: TabEnum.import,
                    source: ImportDataSourceEnum.reTraining,
                    collectionId
                  }
                });
              }}
            >
              {t('dataset:retain_collection')}
            </Button>
          )}
          {canWrite && (
            <Button
              ml={2}
              variant={'whitePrimary'}
              size={['sm', 'md']}
              isDisabled={!collection}
              onClick={() => {
                setEditDataId('');
              }}
            >
              {t('common:dataset.Insert Data')}
            </Button>
          )}
        </Flex>
        <Box justifyContent={'center'} px={6} pos={'relative'} w={'100%'}>
          <MyDivider my={'17px'} w={'100%'} />
        </Box>
        <Flex alignItems={'center'} px={6} pb={4}>
          <Flex alignItems={'center'} color={'myGray.500'}>
            <MyIcon name="common/list" mr={2} w={'18px'} />
            <Box as={'span'} fontSize={['sm', '14px']} fontWeight={'500'}>
              {t('dataset:data_amount', {
                dataAmount: total,
                indexAmount: collection?.indexAmount ?? '-'
              })}
            </Box>
            {!!collection?.errorCount && (
              <MyTag
                colorSchema={'red'}
                type={'fill'}
                cursor={'pointer'}
                rounded={'full'}
                ml={2}
                onClick={() => {
                  setErrorModalId(collection._id);
                }}
              >
                <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                  {t('dataset:data_error_amount', {
                    errorAmount: collection?.errorCount
                  })}
                  <MyIcon name={'common/maximize'} w={'11px'} />
                </Flex>
              </MyTag>
            )}
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
        <ScrollData px={5} pb={5}>
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
                  bg: index % 2 === 1 ? 'myGray.200' : 'blue.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
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
                  {/* 显示调试信息 */}
                  {process.env.NODE_ENV === 'development' && item.imageFileId && (
                    <Box fontSize="xs" color="gray.500" mb={1}>
                      imageFileId: {item.imageFileId}
                      {imagePreviewUrls[item._id] ? ' (有预览URL)' : ' (无预览URL)'}
                      {item.a ? ` | 文件名: ${item.a}` : ' (无文件名)'}
                    </Box>
                  )}

                  {/* 如果是图片数据且在图片集合中 */}
                  {isImageCollection ? (
                    <Box
                      display="flex"
                      padding="8px 8px 10px 8px"
                      justifyContent="center"
                      alignItems="center"
                      alignSelf="stretch"
                      borderRadius="md"
                      overflow="hidden"
                      bg="var(--Gray-Modern-100, #F4F4F7)"
                      gap="24px"
                    >
                      {/* 图片区域 - 左侧 */}
                      <Box
                        width="420px"
                        flexShrink={0}
                        borderRadius="md"
                        overflow="hidden"
                        display="flex"
                        justifyContent="center"
                        alignItems="center"
                        position="relative"
                        bg="lightgray"
                      >
                        {imagePreviewUrls[item._id] ? (
                          <Image
                            src={imagePreviewUrls[item._id]}
                            alt={item.q}
                            width="100%"
                            height="100%"
                            objectFit="contain"
                            borderRadius="md"
                            cursor="pointer"
                            _hover={{ transform: 'scale(1.02)' }}
                            onError={(e) => {
                              console.error('图片加载失败:', imagePreviewUrls[item._id]);
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Box
                            width="100%"
                            height="100%"
                            display="flex"
                            justifyContent="center"
                            alignItems="center"
                          >
                            <Text color="gray.400">加载图片中...</Text>
                          </Box>
                        )}
                      </Box>

                      {/* 描述文本 - 右侧 */}
                      <Box
                        flex="1 0 0"
                        color="var(--Gray-Modern-800, #1D2532)"
                        fontFamily="PingFang SC"
                        fontSize="14px"
                        fontStyle="normal"
                        fontWeight="400"
                        lineHeight="20px"
                        letterSpacing="0.25px"
                        overflow="auto"
                        maxHeight="272px"
                      >
                        <Markdown source={item.q} isDisabled />
                      </Box>
                    </Box>
                  ) : (
                    <>
                      {/* 非图片集合的展示保持不变 */}
                      <Markdown source={item.q} isDisabled />
                      {!!item.a && (
                        <>
                          <MyDivider />
                          <Markdown source={item.a} isDisabled />
                        </>
                      )}
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
                    {getTextValidLength(item.q + item.a || '')}
                  </Flex>
                  {canWrite && (
                    <IconButton
                      display={'flex'}
                      p={1}
                      boxShadow={'1'}
                      icon={<MyIcon name={'common/trash'} w={'14px'} color={'myGray.600'} />}
                      variant={'whiteDanger'}
                      size={'xsSquare'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteOneData(item._id);
                      }}
                      aria-label={''}
                    />
                  )}
                </Flex>
              </Card>
            ))}
          </Flex>
        </ScrollData>
      </Flex>

      {/* 图片数据集的插入的输入模态框 */}
      {editDataId !== undefined &&
        collection &&
        (isImageCollection ? (
          <ImageDatasetInputModal
            collectionId={collection._id}
            dataId={editDataId}
            onClose={() => setEditDataId(undefined)}
            onSuccess={(data: any) => {
              if (editDataId === '') {
                refreshList();
                return;
              }
              setDatasetDataList((prev) => {
                return prev.map((item) => {
                  if (item._id === editDataId) {
                    return {
                      ...item,
                      ...data
                    };
                  }
                  return item;
                });
              });
            }}
          />
        ) : (
          <InputDataModal
            collectionId={collection._id}
            dataId={editDataId}
            onClose={() => setEditDataId(undefined)}
            onSuccess={(data: any) => {
              if (editDataId === '') {
                refreshList();
                return;
              }
              setDatasetDataList((prev) => {
                return prev.map((item) => {
                  if (item._id === editDataId) {
                    return {
                      ...item,
                      ...data
                    };
                  }
                  return item;
                });
              });
            }}
          />
        ))}
      {errorModalId && (
        <TrainingStates
          datasetId={datasetId}
          defaultTab={'errors'}
          collectionId={errorModalId}
          onClose={() => setErrorModalId('')}
        />
      )}
      <ConfirmModal />
    </MyBox>
  );
};

export default React.memo(DataCard);
