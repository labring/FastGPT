import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Textarea,
  Button,
  Flex,
  useTheme,
  useDisclosure,
  HStack,
  Text
} from '@chakra-ui/react';
import {
  useSearchTestStore,
  type SearchTestStoreItemType
} from '@/web/core/dataset/store/searchTest';
import { postSearchText, postDatasetCollectionSearchTest } from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { type SearchDatasetTestResponse } from '@fastgpt/global/openapi/core/dataset/api';
import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  RerankMethodEnum,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import ChunkInfoCard from '@/components/core/chat/components/ChunkInfoCard';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { isEmpty } from 'lodash';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';

const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));

type FormType = {
  inputText: string;
  searchParams: {
    searchMode: DatasetSearchModeEnum;
    embeddingWeight?: number;
    embeddingModelId?: string;

    usingReRank?: boolean;
    rerankModelId?: string;
    rerankMethod: `${RerankMethodEnum}`;
    rerankWeight?: number;

    similarity?: number;
    limit?: number;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModelId?: string;
    datasetSearchExtensionBg?: string;
  };
};

const sectionTitleStyle = {
  fontSize: '14px',
  fontWeight: 'bold',
  lineHeight: '24px',
  color: '#333333'
} as const;

const Test = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { defaultModels, llmModelList } = useSystemStore();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const { pushDatasetTestItem } = useSearchTestStore();
  const [datasetTestItem, setDatasetTestItem] = useState<SearchTestStoreItemType>();
  const [isFocus, setIsFocus] = useState(false);

  const { getValues, setValue, register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      inputText: '',
      searchParams: {
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        embeddingModelId: '',
        usingReRank: true,
        rerankModelId: defaultModels?.rerank?.id,
        rerankMethod: RerankMethodEnum.content,
        rerankWeight: 0.5,
        limit: 5000,
        similarity: 0,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModelId: defaultModels.llm?.id,
        datasetSearchExtensionBg: ''
      }
    }
  });

  const searchParams = getValues('searchParams');

  const {
    isOpen: isOpenSelectMode,
    onOpen: onOpenSelectMode,
    onClose: onCloseSelectMode
  } = useDisclosure();

  const { runAsync: onTextTest, loading: textTestIsLoading } = useRequest(
    ({ inputText, searchParams }: FormType) =>
      postSearchText({ datasetId, text: inputText.trim(), ...searchParams } as any),
    {
      onSuccess(res: SearchDatasetTestResponse, params) {
        if (!res || res.list.length === 0) {
          return toast({
            status: 'warning',
            title: t('common:dataset.test.noResult')
          });
        }

        const testItem: SearchTestStoreItemType = {
          id: getNanoid(),
          datasetId,
          text: params[0].inputText.trim(),
          time: new Date(),
          results: res.list,
          duration: res.duration,
          searchMode: res.searchMode,
          usingReRank: res.usingReRank,
          limit: res.limit,
          similarity: res.similarity,
          queryExtensionModel: res.queryExtensionModelId
        };
        pushDatasetTestItem(testItem);
        setDatasetTestItem(testItem);
      }
    }
  );

  const { runAsync: onDatabaseTest, loading: databaseTestIsLoading } = useRequest(
    ({ inputText }: { inputText: string }) =>
      postDatasetCollectionSearchTest({
        datasetId,
        query: inputText.trim(),
        modelId: searchModel
      }),
    {
      onSuccess(res: any, params) {
        if (isEmpty(res) || !res.answer) {
          return toast({
            status: 'warning',
            title: t('common:dataset.test.noResult')
          });
        }

        const testItem: SearchTestStoreItemType = {
          id: getNanoid(),
          datasetId,
          text: params[0].inputText.trim(),
          time: new Date(),
          results: res,
          duration: res.duration || '0ms',
          searchMode: DatasetSearchModeEnum.database,
          usingReRank: false,
          limit: res.limit,
          similarity: 0,
          queryExtensionModel: searchModel
        };
        pushDatasetTestItem(testItem);
        setDatasetTestItem(testItem);
      }
    }
  );

  useEffect(() => {
    setDatasetTestItem(undefined);
  }, [datasetId]);

  const [searchModel, setSearchModel] = useState(defaultModels.llm?.id || llmModelList?.[0]?.id);

  return (
    <Box h={'100%'} display={'flex'}>
      {/* left panel */}
      <Box
        h={'100%'}
        display={'flex'}
        flexDirection={'column'}
        w={'520px'}
        minW={'520px'}
        p={4}
        borderRight={'1px solid #EBEDF0'}
        overflow={'hidden'}
      >
        {/* header: 测试数据 + 检索配置 */}
        <Flex alignItems={'center'} justifyContent={'space-between'} h={'24px'} mb={2}>
          <Text {...sectionTitleStyle}>{t('common:core.dataset.test.Test Data')}</Text>
          {isDatabaseDataset(datasetDetail.type) ? (
            <HStack>
              <AIModelSelector
                _hover={{
                  border: '1px solid',
                  borderColor: 'primary.400'
                }}
                size={'sm'}
                h={'24px'}
                w={'200px'}
                value={searchModel}
                onChange={(e) => setSearchModel(e)}
                list={llmModelList.map((item) => ({
                  label: item.name,
                  value: item.id
                }))}
              />
              <QuestionTip
                label={
                  <>
                    <Text>{t('dataset:search_model_desc')}</Text>
                    <Text>{t('dataset:search_model_tip')}</Text>
                  </>
                }
              />
            </HStack>
          ) : (
            <Button
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'common/setting'} w={'14px'} />}
              size={'sm'}
              h={'24px'}
              px={2}
              onClick={onOpenSelectMode}
            >
              {t('common:core.dataset.test.Search Config')}
            </Button>
          )}
        </Flex>

        {/* textarea with submit button inside */}
        <Box
          flexShrink={0}
          border={'1px solid'}
          borderRadius={'md'}
          p={3}
          mb={3}
          {...(isFocus
            ? {
                borderColor: 'primary.500',
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
              }
            : {
                borderColor: 'borderColor.base'
              })}
        >
          <Box h={'160px'}>
            <Textarea
              h={'100%'}
              resize={'none'}
              variant={'unstyled'}
              fontSize={'xs'}
              maxLength={datasetDetail.vectorModel?.maxToken}
              placeholder={t('common:core.dataset.test.Test Text Placeholder')}
              onFocus={() => setIsFocus(true)}
              {...register('inputText', {
                required: true,
                onBlur: () => {
                  setIsFocus(false);
                }
              })}
            />
          </Box>
          <Flex justifyContent={'flex-end'}>
            <Button
              size={'sm'}
              isLoading={
                isDatabaseDataset(datasetDetail.type) ? databaseTestIsLoading : textTestIsLoading
              }
              onClick={() => {
                if (isDatabaseDataset(datasetDetail.type)) {
                  handleSubmit((data) => onDatabaseTest({ inputText: data.inputText }))();
                } else {
                  handleSubmit((data) => onTextTest(data))();
                }
              }}
            >
              {t('common:core.dataset.test.Test')}
            </Button>
          </Flex>
        </Box>

        {/* test history */}
        <Box flex={1} overflow={'overlay'}>
          <TestHistories
            datasetId={datasetId}
            datasetTestItem={datasetTestItem}
            setDatasetTestItem={setDatasetTestItem}
          />
        </Box>
      </Box>

      {/* right panel */}
      <Box flex={1} h={'100%'} overflow={'overlay'} p={4} bg={'white'}>
        <Flex alignItems={'center'} mb={2}>
          <Text {...sectionTitleStyle}>{t('common:core.dataset.test.Test Result')}</Text>
          {datasetTestItem?.duration && (
            <Text ml={2} fontSize={'sm'} color={'myGray.500'}>
              ({datasetTestItem.duration})
            </Text>
          )}
        </Flex>
        {datasetTestItem && !isDatabaseDataset(datasetDetail.type) && (
          <Box mb={3}>
            <SearchParamsTip
              searchMode={datasetTestItem.searchMode}
              similarity={datasetTestItem.similarity}
              limit={datasetTestItem.limit}
              usingReRank={datasetTestItem.usingReRank}
              usingExtensionQuery={!!datasetTestItem.queryExtensionModel}
              queryExtensionModel={datasetTestItem.queryExtensionModel}
            />
          </Box>
        )}
        {isDatabaseDataset(datasetDetail.type) ? (
          <TestResultDatabase datasetTestItem={datasetTestItem} />
        ) : (
          <TestResults datasetTestItem={datasetTestItem} />
        )}
      </Box>

      {isOpenSelectMode && (
        <DatasetParamsModal
          {...(searchParams as any)}
          maxTokens={20000}
          datasetVectorModelId={datasetDetail.vectorModel?.id}
          onClose={onCloseSelectMode}
          onSuccess={(e) => {
            setValue('searchParams', {
              ...searchParams,
              ...e
            });
          }}
        />
      )}
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
  const { datasetTestList, delDatasetTestItemById } = useSearchTestStore();

  const testHistories = useMemo(
    () => datasetTestList.filter((item) => item.datasetId === datasetId),
    [datasetId, datasetTestList]
  );

  return (
    <>
      <Flex alignItems={'center'} h={'24px'} mb={2}>
        <Text {...sectionTitleStyle}>{t('common:core.dataset.test.test history')}</Text>
      </Flex>
      {testHistories.length === 0 ? (
        <EmptyTip text={t('common:no_data')} />
      ) : (
        <Box>
          {testHistories.map((item) => (
            <Flex
              key={item.id}
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
            >
              <Box flex={1} mr={2} wordBreak={'break-all'} fontWeight={'400'} fontSize={'xs'}>
                {item.text}
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
      )}
    </>
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
        <EmptyTip text={t('common:no_data')} mt={[10, '20vh']} />
      ) : (
        <Flex flexDirection={'column'} gap={3}>
          {datasetTestItem.results.map((item, index) => {
            const descriptionList: string[] = [];
            if (item.score && Array.isArray(item.score)) {
              const fullTextScore = item.score.find((s) => s.type === SearchScoreTypeEnum.fullText);
              const embeddingScore = item.score.find(
                (s) => s.type === SearchScoreTypeEnum.embedding
              );
              const reRankScore = item.score.find((s) => s.type === SearchScoreTypeEnum.reRank);
              const rrfScore = item.score.find((s) => s.type === SearchScoreTypeEnum.rrf);
              const colon = t('common:colon');
              if (rrfScore) {
                descriptionList.push(
                  `${t('common:core.dataset.search.score.rrf')}${colon}${rrfScore.value.toFixed(4)}`
                );
              }
              if (reRankScore) {
                descriptionList.push(
                  `${t('common:core.dataset.search.score.reRank')}${colon}${reRankScore.value.toFixed(4)}`
                );
              }
              if (fullTextScore) {
                descriptionList.push(
                  `${t('common:core.dataset.search.score.fullText')}${colon}${fullTextScore.value.toFixed(4)}`
                );
              }
              if (embeddingScore) {
                descriptionList.push(
                  `${t('common:core.dataset.search.mode.embedding')}${colon}${embeddingScore.value.toFixed(4)}`
                );
              }
            }
            const linkText = `${item.sourceName || ''} / #${item.chunkIndex}`;
            const linkUrl = `/dataset/detail?datasetId=${item.datasetId}&collectionId=${item.collectionId}&currentTab=dataCard&activeId=${item.id}`;
            return (
              <ChunkInfoCard
                key={item.id}
                title={`TOP${index + 1}`}
                descriptionList={descriptionList}
                linkText={linkText}
                linkUrl={linkUrl}
                q={item.q}
                a={item.a}
              />
            );
          })}
        </Flex>
      )}
    </>
  );
});

const TestResultDatabase = React.memo(function TestResultDatabase({
  datasetTestItem
}: {
  datasetTestItem?: SearchTestStoreItemType;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const result = datasetTestItem?.results as unknown as { sql_result: string; answer: string };
  return (
    <>
      {isEmpty(datasetTestItem) ? (
        <EmptyTip text={t('common:no_data')} mt={[10, '20vh']} />
      ) : (
        <>
          <Box mt={1} gap={4}>
            <Box mb={4}>
              <Box p={4} borderRadius={'12px'} border={theme.borders.sm}>
                <Text fontSize={'14px'} fontWeight={'medium'} color={'myGray.900'} mb={2}>
                  {t('dataset:database_sql_query')}
                </Text>
                <Text fontSize={'sm'} color={'myGray.700'} whiteSpace={'pre-wrap'}>
                  {result?.sql_result || '-'}
                </Text>
              </Box>
            </Box>

            <Box p={4} borderRadius={'12px'} border={theme.borders.sm}>
              <Text fontSize={'14px'} fontWeight={'medium'} color={'myGray.900'} mb={2}>
                {t('dataset:search_result')}
              </Text>
              <Text fontSize={'sm'} color={'myGray.700'} lineHeight={'1.6'}>
                {result?.answer || t('dataset:no_search_result')}
              </Text>
            </Box>
          </Box>
        </>
      )}
    </>
  );
});
