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
import { useUserStore } from '@/web/support/user/useUserStore';

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
  const { teamPlanStatus, initTeamPlanStatus } = useUserStore();
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
    const planStatus =
      teamPlanStatus ||
      (await initTeamPlanStatus()
        .then(() => useUserStore.getState().teamPlanStatus)
        .catch(() => undefined));
    const maxImageSize =
      (planStatus?.standard?.maxUploadFileSize ?? feConfigs?.uploadFileMaxSize ?? 500) *
      1024 *
      1024;
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
        flex={['unset', '0 0 468px']}
        w={['100%', '468px']}
        p={4}
        gap={6}
        borderRight={['none', '1px solid #E8EBF0']}
      >
        <Box
          display={'flex'}
          flexDirection={'column'}
          alignItems={'flex-start'}
          gap={3}
          alignSelf={'stretch'}
        >
          <Flex alignItems={'center'} alignSelf={'stretch'}>
            <Box flex={1} fontWeight={500} color={'myGray.900'}>
              {t('common:core.dataset.test.input_title')}
            </Box>
            <Button
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
              size={'sm'}
              fontWeight={500}
              onClick={onOpenSelectMode}
            >
              {t('common:core.dataset.test.search_config')}
            </Button>
          </Flex>

          <Box
            border={'1px solid #E8EBF0'}
            p={3}
            borderRadius={'6px'}
            minH={'220px'}
            display={'flex'}
            flexDirection={'column'}
            bg={'white'}
            alignSelf={'stretch'}
            position={'relative'}
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
              <Box position={'absolute'} left={'12px'} bottom={'8px'}>
                <Box
                  as={'button'}
                  w={'24px'}
                  h={'24px'}
                  p={0}
                  display={'flex'}
                  alignItems={'center'}
                  justifyContent={'center'}
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
                  disabled={!canSearchImage}
                  onClick={onOpen}
                  aria-label={t('common:core.dataset.test.upload_image')}
                >
                  <Box
                    as={'svg'}
                    xmlns="http://www.w3.org/2000/svg"
                    w={'20px'}
                    h={'17.964px'}
                    viewBox="0 0 20 18"
                    fill="none"
                    flexShrink={0}
                  >
                    <path
                      d="M5.93647 7.21144C6.7649 7.21144 7.43647 6.53986 7.43647 5.71144C7.43647 4.88301 6.7649 4.21144 5.93647 4.21144C5.10804 4.21144 4.43647 4.88301 4.43647 5.71144C4.43647 6.53986 5.10804 7.21144 5.93647 7.21144Z"
                      fill="#667085"
                    />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M0 5.76C0 3.74381 0 2.73572 0.392377 1.96563C0.737521 1.28825 1.28825 0.737521 1.96563 0.392377C2.73572 0 3.74381 0 5.76 0H14.24C16.2562 0 17.2643 0 18.0344 0.392377C18.7118 0.737521 19.2625 1.28825 19.6076 1.96563C20 2.73572 20 3.74381 20 5.76V12.2044C20 14.2206 20 15.2287 19.6076 15.9987C19.2625 16.6761 18.7118 17.2269 18.0344 17.572C17.2643 17.9644 16.2562 17.9644 14.24 17.9644H5.76C3.74381 17.9644 2.73572 17.9644 1.96563 17.572C1.28825 17.2269 0.737521 16.6761 0.392377 15.9987C0 15.2287 0 14.2206 0 12.2044V5.76ZM5.76 2H14.24C15.2811 2 15.9416 2.00156 16.4416 2.0424C16.9182 2.08135 17.0703 2.1458 17.1264 2.17439C17.4274 2.32779 17.6722 2.57256 17.8256 2.87362C17.8542 2.92972 17.9187 3.08177 17.9576 3.55839C17.9984 4.05836 18 4.7189 18 5.76V12.2044C18 12.2164 18 12.2284 18 12.2404L13.1493 7.38962C12.7587 6.9991 12.1256 6.9991 11.735 7.38962L3.23863 15.886C3.00661 15.8508 2.91456 15.8109 2.87362 15.79C2.57256 15.6366 2.32779 15.3918 2.17439 15.0908C2.1458 15.0347 2.08135 14.8826 2.0424 14.406C2.00156 13.906 2 13.2455 2 12.2044V5.76C2 4.7189 2.00156 4.05836 2.0424 3.55839C2.08135 3.08177 2.1458 2.92972 2.17439 2.87362C2.32779 2.57256 2.57256 2.32779 2.87362 2.17439C2.92972 2.1458 3.08177 2.08135 3.55839 2.0424C4.05836 2.00156 4.7189 2 5.76 2ZM12.4422 9.51094L5.98871 15.9644H14.24C15.2811 15.9644 15.9416 15.9628 16.4416 15.922C16.9182 15.883 17.0703 15.8186 17.1264 15.79C17.4274 15.6366 17.6722 15.3918 17.8256 15.0908C17.8379 15.0666 17.8569 15.0246 17.8776 14.9464L12.4422 9.51094Z"
                      fill="#667085"
                    />
                  </Box>
                </Box>
              </Box>
            </MyTooltip>
          </Box>

          <Button
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
        <Box overflow={'overlay'} display={['none', 'block']}>
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
        <Box fontSize={'md'} fontWeight={500}>
          {t('common:core.dataset.test.test history')}
        </Box>
      </Flex>
      <Box mt={3} display={'flex'} flexDirection={'column'} gap={2}>
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
          <Flex fontSize={'md'} color={'myGray.900'} alignItems={'center'} fontWeight={500}>
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
            <Flex fontSize={'md'} color={'myGray.900'} alignItems={'center'} fontWeight={500}>
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
