import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  Textarea,
  Button,
  Flex,
  Portal,
  useDisclosure
} from '@chakra-ui/react';
import {
  useSearchTestStore,
  type SearchTestStoreItemType
} from '@/web/core/dataset/store/searchTest';
import { postSearchText } from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { type SearchDatasetTestResponse } from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import QuoteItem from '@/components/core/dataset/QuoteItem';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import {
  postGetSearchTestImagePreviewUrls,
  postUploadSearchTestImage
} from '@/web/core/dataset/api/file';
import { formatFileSize } from '@fastgpt/global/common/file/tools';

const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));

type FormType = {
  inputText: string;
  searchParams: {
    searchMode: DatasetSearchModeEnum;
    embeddingWeight?: number;

    usingReRank?: boolean;
    rerankModel?: string;
    rerankWeight?: number;

    similarity?: number;
    limit?: number;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModel?: string;
    datasetSearchExtensionBg?: string;
  };
};

const Test = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { defaultModels, feConfigs } = useSystemStore();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const { pushDatasetTestItem } = useSearchTestStore();
  const [datasetTestItem, setDatasetTestItem] = useState<SearchTestStoreItemType>();
  const { File: ImageFileSelector, onOpen } = useSelectFile({
    fileType: imageFileType,
    multiple: true
  });
  const [queryImageRefs, setQueryImageRefs] = useState<{ key: string; previewUrl: string }[]>([]);
  const [uploadingImageCount, setUploadingImageCount] = useState(0);

  const { getValues, setValue, register, handleSubmit, watch } = useForm<FormType>({
    defaultValues: {
      inputText: '',
      searchParams: {
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: true,
        rerankModel: defaultModels?.rerank?.model,
        rerankWeight: 0.5,
        limit: 5000,
        similarity: 0,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: defaultModels.llm?.model,
        datasetSearchExtensionBg: ''
      }
    }
  });

  const searchParams = getValues('searchParams');
  const inputText = watch('inputText');

  const {
    isOpen: isOpenSelectMode,
    onOpen: onOpenSelectMode,
    onClose: onCloseSelectMode
  } = useDisclosure();

  const { runAsync: onTextTest, loading: textTestIsLoading } = useRequest(
    ({ inputText, searchParams }: FormType) =>
      postSearchText({
        datasetId,
        text: inputText.trim(),
        queryImageUrls: queryImageRefs.map((item) => item.key),
        ...searchParams
      }),
    {
      onSuccess(res: SearchDatasetTestResponse) {
        if (!res || res.list.length === 0) {
          return toast({
            status: 'warning',
            title: t('common:dataset.test.noResult')
          });
        }

        const testItem: SearchTestStoreItemType = {
          id: getNanoid(),
          datasetId,
          text: getValues('inputText').trim(),
          time: new Date(),
          results: res.list,
          queryImageRefs,
          duration: res.duration,
          searchMode: res.searchMode,
          usingReRank: res.usingReRank,
          limit: res.limit,
          similarity: res.similarity,
          queryExtensionModel: res.queryExtensionModel
        };
        pushDatasetTestItem(testItem);
        setDatasetTestItem(testItem);
      }
    }
  );

  const onSelectFile = async (files: File[]) => {
    const imageExtensionSet = new Set(
      imageFileType
        .split(',')
        .map((item) => item.trim().replace('.', '').toLowerCase())
        .filter(Boolean)
    );
    const imageFiles = files.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return !!extension && imageExtensionSet.has(extension);
    });
    if (imageFiles.length < files.length) {
      toast({
        status: 'warning',
        title: t('chat:unsupported_file_type')
      });
    }
    const maxImageSize = (feConfigs?.uploadFileMaxSize || 500) * 1024 * 1024;
    const validImageFiles = imageFiles.filter((file) => file.size <= maxImageSize);
    if (validImageFiles.length < imageFiles.length) {
      toast({
        status: 'warning',
        title: t('file:some_file_size_exceeds_limit', {
          maxSize: formatFileSize(maxImageSize)
        })
      });
    }
    if (queryImageRefs.length + validImageFiles.length > 10) {
      toast({
        status: 'warning',
        title: t('common:core.dataset.test.max_images_tip')
      });
    }

    const uploadFiles = validImageFiles.slice(0, Math.max(10 - queryImageRefs.length, 0));
    if (uploadFiles.length === 0) return;

    setUploadingImageCount(uploadFiles.length);
    try {
      const uploadedImages = await Promise.all(
        uploadFiles.map((file) => {
          const formData = new FormData();
          formData.append('file', file, encodeURIComponent(file.name));
          formData.append('data', JSON.stringify({ datasetId }));
          return postUploadSearchTestImage(formData);
        })
      );
      setQueryImageRefs((state) => [...state, ...uploadedImages]);
    } catch (error) {
      toast({
        status: 'warning',
        title: t('common:upload_file_error')
      });
    } finally {
      setUploadingImageCount(0);
    }
  };

  const canSearchImage = !!datasetDetail.vectorModel?.vision || !!datasetDetail.vlmModel;
  const canSubmit = !!inputText?.trim() || queryImageRefs.length > 0;

  useEffect(() => {
    setDatasetTestItem(undefined);
    setQueryImageRefs([]);
    setUploadingImageCount(0);
  }, [datasetId]);

  useEffect(() => {
    if (!canSearchImage && queryImageRefs.length > 0) {
      setQueryImageRefs([]);
    }
  }, [canSearchImage, queryImageRefs.length]);

  return (
    <Box h={'100%'} display={['block', 'flex']}>
      {/* left  */}
      <Box
        h={['auto', '100%']}
        display={['block', 'flex']}
        flexDirection={'column'}
        flex={1}
        maxW={'500px'}
        py={4}
      >
        <Flex px={4} mb={3} alignItems={'center'}>
          <Box flex={1} fontWeight={'medium'} color={'myGray.900'}>
            {t('common:core.dataset.test.input_title')}
          </Box>
          <Button
            variant={'whitePrimary'}
            leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
            size={'sm'}
            onClick={onOpenSelectMode}
          >
            {t('common:core.dataset.test.search_config')}
          </Button>
        </Flex>

        <Box mx={4}>
          <Box
            border={'1px solid #E8EBF0'}
            p={3}
            borderRadius={'6px'}
            minH={'220px'}
            display={'flex'}
            flexDirection={'column'}
            bg={'white'}
          >
            {(queryImageRefs.length > 0 || uploadingImageCount > 0) && (
              <Flex mb={3} gap={2} flexWrap={'wrap'}>
                {queryImageRefs.map((image) => (
                  <Box
                    key={image.key}
                    position={'relative'}
                    w={'80px'}
                    h={'80px'}
                    bg={'white'}
                    border={'1.07143px solid #E8EBF0'}
                    borderRadius={'8px'}
                    boxShadow={
                      '0px 4.28571px 10.7143px rgba(19, 51, 107, 0.08), 0px 0px 1.07143px rgba(19, 51, 107, 0.08)'
                    }
                    overflow={'visible'}
                  >
                    <Box
                      as={'img'}
                      src={image.previewUrl}
                      alt=""
                      w={'80px'}
                      h={'80px'}
                      objectFit={'cover'}
                      borderRadius={'6.66667px'}
                    />
                    <Box
                      position={'absolute'}
                      right={'-7.5px'}
                      top={'-7.5px'}
                      w={'16.67px'}
                      h={'16.67px'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      bg={'#8A95A7'}
                      borderRadius={'50%'}
                      boxShadow={
                        '0px 6.66667px 6.66667px rgba(19, 51, 107, 0.1), 0px 0px 1.66667px rgba(19, 51, 107, 0.08)'
                      }
                      cursor={'pointer'}
                      onClick={() =>
                        setQueryImageRefs((state) => state.filter((item) => item.key !== image.key))
                      }
                    >
                      <MyIcon
                        name={'common/closeLight'}
                        w={'11.9px'}
                        h={'11.9px'}
                        color={'white'}
                      />
                    </Box>
                  </Box>
                ))}
                {Array.from({ length: uploadingImageCount }).map((_, index) => (
                  <Flex
                    key={index}
                    w={'80px'}
                    h={'80px'}
                    alignItems={'center'}
                    justifyContent={'center'}
                    bg={'white'}
                    border={'1.07143px solid #E8EBF0'}
                    borderRadius={'8px'}
                    boxShadow={
                      '0px 4.28571px 10.7143px rgba(19, 51, 107, 0.08), 0px 0px 1.07143px rgba(19, 51, 107, 0.08)'
                    }
                  >
                    <CircularProgress
                      value={28}
                      size={'46.67px'}
                      thickness={'8px'}
                      color={'#3370FF'}
                      trackColor={'#D9D9D9'}
                      capIsRound
                    />
                  </Flex>
                ))}
              </Flex>
            )}

            <Textarea
              flex={1}
              minH={'140px'}
              resize={'none'}
              variant={'unstyled'}
              fontSize={'12px'}
              lineHeight={'16px'}
              fontWeight={'400'}
              letterSpacing={'0.004em'}
              color={'myGray.500'}
              _placeholder={{
                color: 'myGray.500'
              }}
              maxLength={datasetDetail.vectorModel?.maxToken}
              placeholder={t('common:core.dataset.test.Test Text Placeholder')}
              {...register('inputText')}
            />

            <MyTooltip
              label={canSearchImage ? '' : t('common:core.dataset.test.image_search_disabled_tip')}
            >
              <Box mt={3} alignSelf={'flex-start'}>
                <Button
                  minW={'24px'}
                  w={'24px'}
                  h={'24px'}
                  p={0}
                  bg={'transparent'}
                  border={'none'}
                  boxShadow={'none'}
                  _hover={{
                    bg: 'transparent'
                  }}
                  _active={{
                    bg: 'transparent'
                  }}
                  _disabled={{
                    bg: 'transparent',
                    opacity: 0.5,
                    cursor: 'not-allowed'
                  }}
                  isDisabled={!canSearchImage}
                  onClick={onOpen}
                  aria-label={t('common:core.dataset.test.upload_image')}
                >
                  <MyIcon name={'image'} w={'24px'} h={'24px'} color={'#667085'} />
                </Button>
              </Box>
            </MyTooltip>
          </Box>

          <Button
            mt={3}
            w={'100%'}
            bg={'#F0F1F6'}
            color={'#2B5FD9'}
            _hover={{
              bg: '#E8EBF0'
            }}
            _disabled={{
              bg: '#F0F1F6',
              color: '#2B5FD9',
              opacity: 1,
              cursor: 'not-allowed'
            }}
            isLoading={textTestIsLoading}
            isDisabled={!canSubmit || uploadingImageCount > 0}
            onClick={() => {
              handleSubmit((data) => onTextTest(data))();
            }}
          >
            {t('common:core.dataset.test.Test')}
          </Button>
        </Box>
        <Box mt={5} px={4} overflow={'overlay'} display={['none', 'block']}>
          <TestHistories
            datasetId={datasetId}
            datasetTestItem={datasetTestItem}
            setDatasetTestItem={setDatasetTestItem}
          />
        </Box>
      </Box>
      {/* result show */}
      <Box p={4} h={['auto', '100%']} overflow={'overlay'} flex={'1 0 0'} bg={'white'}>
        <TestResults datasetTestItem={datasetTestItem} />
      </Box>

      {isOpenSelectMode && (
        <DatasetParamsModal
          {...searchParams}
          maxTokens={20000}
          onClose={onCloseSelectMode}
          onSuccess={(e) => {
            setValue('searchParams', {
              ...searchParams,
              ...e
            });
          }}
        />
      )}
      <ImageFileSelector onSelect={onSelectFile} />
    </Box>
  );
};

export default React.memo(Test);

const TestHistories = React.memo(function TestHistories({
  datasetId,
  datasetTestItem,
  setDatasetTestItem
}: {
  datasetId: string;
  datasetTestItem?: SearchTestStoreItemType;
  setDatasetTestItem: React.Dispatch<React.SetStateAction<SearchTestStoreItemType | undefined>>;
}) {
  const { t } = useTranslation();
  const { datasetTestList, delDatasetTestItemById, updateDatasetItemById } = useSearchTestStore();
  const [hoveredHistory, setHoveredHistory] = useState<{
    id: string;
    images: {
      key: string;
      previewUrl?: string;
    }[];
    top: number;
    left: number;
  }>();

  const testHistories = useMemo(
    () => datasetTestList.filter((item) => item.datasetId === datasetId),
    [datasetId, datasetTestList]
  );

  useEffect(() => {
    const missingPreviewHistories = testHistories.filter((item) =>
      item.queryImageRefs?.some((image) => image.key && !image.previewUrl)
    );
    if (missingPreviewHistories.length === 0) return;

    let canceled = false;

    Promise.all(
      missingPreviewHistories.map(async (item) => {
        const keys =
          item.queryImageRefs
            ?.filter((image) => image.key && !image.previewUrl)
            .map((image) => image.key)
            .slice(0, 10) || [];
        if (keys.length === 0) return;

        const previews = await postGetSearchTestImagePreviewUrls({
          datasetId,
          keys
        });
        if (canceled || previews.length === 0) return;

        const previewMap = new Map(previews.map((image) => [image.key, image.previewUrl]));
        updateDatasetItemById({
          ...item,
          queryImageRefs: item.queryImageRefs?.map((image) => ({
            ...image,
            previewUrl: image.previewUrl || previewMap.get(image.key)
          }))
        });
      })
    ).catch(() => {});

    return () => {
      canceled = true;
    };
  }, [datasetId, testHistories, updateDatasetItemById]);

  return (
    <>
      <Flex alignItems={'center'} color={'myGray.900'}>
        <Box fontSize={'md'}>{t('common:core.dataset.test.test history')}</Box>
      </Flex>
      <Box mt={2}>
        {testHistories.map((item) => (
          <Flex
            key={item.id}
            position={'relative'}
            py={2}
            px={3}
            alignItems={'center'}
            borderColor={'borderColor.low'}
            borderWidth={'1px'}
            borderRadius={'md'}
            _notLast={{
              mb: 2
            }}
            _hover={{
              borderColor: 'primary.300',
              boxShadow: '1',
              '& .delete': {
                display: 'block'
              },
              '& .time': {
                display: 'none'
              }
            }}
            cursor={'pointer'}
            fontSize={'sm'}
            {...(item.id === datasetTestItem?.id && {
              bg: 'primary.50'
            })}
            onClick={() => setDatasetTestItem(item)}
            onMouseEnter={(e) => {
              const images = item.queryImageRefs || [];
              if (images.length === 0) return;

              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredHistory({
                id: item.id,
                images,
                top: rect.bottom + 8,
                left: rect.left + 12
              });
            }}
            onMouseLeave={() => {
              setHoveredHistory((state) => (state?.id === item.id ? undefined : state));
            }}
          >
            <Box flex={1} mr={2} wordBreak={'break-all'} fontWeight={'400'}>
              {[
                item.text,
                ...(item.queryImageRefs || []).map(() => t('common:core.dataset.test.image_token'))
              ]
                .filter(Boolean)
                .join(' ')}
            </Box>
            <Box className="time" flex={'0 0 auto'} fontSize={'xs'} color={'myGray.500'}>
              {t(formatTimeToChatTime(item.time) as any).replace('#', ':')}
            </Box>
            <MyTooltip label={t('common:core.dataset.test.delete test history')}>
              <Box className="delete" display={'none'} w={'0.8rem'} h={'0.8rem'} ml={1}>
                <MyIcon
                  name={'delete'}
                  w={'0.8rem'}
                  _hover={{ color: 'red.600' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    delDatasetTestItemById(item.id);
                    datasetTestItem?.id === item.id && setDatasetTestItem(undefined);
                  }}
                />
              </Box>
            </MyTooltip>
          </Flex>
        ))}
      </Box>
      {!!hoveredHistory && (
        <Portal>
          <Flex
            position={'fixed'}
            zIndex={'tooltip'}
            top={`${hoveredHistory.top}px`}
            left={`${hoveredHistory.left}px`}
            p={3}
            bg={'white'}
            borderWidth={'1px'}
            borderColor={'borderColor.base'}
            borderRadius={'md'}
            boxShadow={'2'}
            gap={3}
            pointerEvents={'none'}
          >
            {hoveredHistory.images.map((image) => (
              <HistoryImagePreview key={image.key} previewUrl={image.previewUrl} />
            ))}
          </Flex>
        </Portal>
      )}
    </>
  );
});

const HistoryImagePreview = React.memo(function HistoryImagePreview({
  previewUrl
}: {
  previewUrl?: string;
}) {
  const { t } = useTranslation();
  const [loadFailed, setLoadFailed] = useState(false);

  if (previewUrl && !loadFailed) {
    return (
      <Box
        as={'img'}
        src={previewUrl}
        alt=""
        w={'80px'}
        h={'80px'}
        objectFit={'cover'}
        borderRadius={'sm'}
        onError={() => setLoadFailed(true)}
      />
    );
  }

  return (
    <Flex
      w={'80px'}
      h={'80px'}
      flexDir={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      gap={1}
      bg={'myGray.50'}
      border={'1px dashed'}
      borderColor={'myGray.300'}
      borderRadius={'sm'}
      color={'myGray.500'}
      fontSize={'xs'}
      lineHeight={'16px'}
    >
      <MyIcon name={'image'} w={'20px'} h={'20px'} color={'myGray.400'} />
      <Box>{t('common:core.dataset.test.image_expired')}</Box>
    </Flex>
  );
});

const TestResults = React.memo(function TestResults({
  datasetTestItem
}: {
  datasetTestItem?: SearchTestStoreItemType;
}) {
  const { t } = useTranslation();

  return (
    <>
      {!datasetTestItem?.results || datasetTestItem.results.length === 0 ? (
        <EmptyTip text={t('common:core.dataset.test.test result placeholder')} mt={[10, '20vh']} />
      ) : (
        <>
          <Flex fontSize={'md'} color={'myGray.900'} alignItems={'center'}>
            <MyIcon name={'common/paramsLight'} w={'18px'} mr={2} />
            {t('common:core.dataset.test.Test params')}
          </Flex>
          <Box mt={3}>
            <SearchParamsTip
              searchMode={datasetTestItem.searchMode}
              similarity={datasetTestItem.similarity}
              limit={datasetTestItem.limit}
              usingReRank={datasetTestItem.usingReRank}
              usingExtensionQuery={!!datasetTestItem.queryExtensionModel}
              queryExtensionModel={datasetTestItem.queryExtensionModel}
            />
          </Box>

          <Flex mt={5} mb={3} alignItems={'center'}>
            <Flex fontSize={'md'} color={'myGray.900'} alignItems={'center'}>
              <MyIcon name={'common/resultLight'} w={'18px'} mr={2} />
              {t('common:core.dataset.test.Test Result')}
            </Flex>
            <QuestionTip ml={1} label={t('common:core.dataset.test.test result tip')} />
            <Box ml={2}>({datasetTestItem.duration})</Box>
          </Flex>
          <Box mt={1} gap={4}>
            {datasetTestItem?.results.map((item, index) => (
              <Box key={item.id} p={3} borderRadius={'lg'} bg={'myGray.100'} _notLast={{ mb: 2 }}>
                <QuoteItem quoteItem={item} canDownloadSource canEditData />
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
});
