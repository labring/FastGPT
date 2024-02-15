import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Textarea,
  Button,
  Flex,
  useTheme,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer
} from '@chakra-ui/react';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useSearchTestStore, SearchTestStoreItemType } from '@/web/core/dataset/store/searchTest';
import { postSearchText } from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@/web/common/hooks/useRequest';
import { formatTimeToChatTime } from '@/utils/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { customAlphabet } from 'nanoid';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { SearchTestResponse } from '@/global/core/dataset/api';
import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap
} from '@fastgpt/global/core/dataset/constants';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import MySelect from '@/components/Select';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { fileDownload } from '@/web/common/file/utils';
import { readCsvContent } from '@fastgpt/web/common/file/read/csv';
import { delay } from '@fastgpt/global/common/system/utils';
import QuoteItem from '@/components/core/dataset/QuoteItem';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const DatasetParamsModal = dynamic(() => import('@/components/core/module/DatasetParamsModal'));

type FormType = {
  inputText: string;
  searchParams: {
    searchMode: `${DatasetSearchModeEnum}`;
    similarity?: number;
    limit?: number;
    usingReRank?: boolean;
    searchEmptyText?: string;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModel?: string;
    datasetSearchExtensionBg?: string;
  };
};

const Test = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { llmModelList } = useSystemStore();
  const { datasetDetail } = useDatasetStore();
  const { pushDatasetTestItem } = useSearchTestStore();
  const [inputType, setInputType] = useState<'text' | 'file'>('text');
  const [datasetTestItem, setDatasetTestItem] = useState<SearchTestStoreItemType>();
  const [refresh, setRefresh] = useState(false);
  const [isFocus, setIsFocus] = useState(false);
  const { File, onOpen } = useSelectFile({
    fileType: '.csv',
    multiple: false
  });
  const [selectFile, setSelectFile] = useState<File>();

  const { getValues, setValue, register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      inputText: '',
      searchParams: {
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: false,
        limit: 5000,
        similarity: 0,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: llmModelList[0].model,
        datasetSearchExtensionBg: ''
      }
    }
  });

  const searchModeData = DatasetSearchModeMap[getValues(`searchParams.searchMode`)];

  const {
    isOpen: isOpenSelectMode,
    onOpen: onOpenSelectMode,
    onClose: onCloseSelectMode
  } = useDisclosure();

  const { mutate: onTextTest, isLoading: textTestIsLoading } = useRequest({
    mutationFn: ({ inputText, searchParams }: FormType) =>
      postSearchText({ datasetId, text: inputText.trim(), ...searchParams }),
    onSuccess(res: SearchTestResponse) {
      if (!res || res.list.length === 0) {
        return toast({
          status: 'warning',
          title: t('dataset.test.noResult')
        });
      }

      const testItem: SearchTestStoreItemType = {
        id: nanoid(),
        datasetId,
        text: getValues('inputText').trim(),
        time: new Date(),
        results: res.list,
        duration: res.duration,
        searchMode: res.searchMode,
        usingReRank: res.usingReRank,
        limit: res.limit,
        similarity: res.similarity,
        usingQueryExtension: res.usingQueryExtension
      };
      pushDatasetTestItem(testItem);
      setDatasetTestItem(testItem);
    },
    onError(err) {
      toast({
        title: getErrText(err),
        status: 'error'
      });
    }
  });
  // const { mutate: onFileTest, isLoading: fileTestIsLoading } = useRequest({
  //   mutationFn: async ({ searchParams }: FormType) => {
  //     if (!selectFile) return Promise.reject('File is not selected');
  //     const { data } = await readCsvContent({ file: selectFile });
  //     const testList = data.slice(0, 100);
  //     const results: SearchTestResponse[] = [];

  //     for await (const item of testList) {
  //       try {
  //         const result = await postSearchText({ datasetId, text: item[0].trim(), ...searchParams });
  //         results.push(result);
  //       } catch (error) {
  //         await delay(500);
  //       }
  //     }

  //     return results;
  //   },
  //   onSuccess(res: SearchTestResponse[]) {
  //     console.log(res);
  //   },
  //   onError(err) {
  //     toast({
  //       title: getErrText(err),
  //       status: 'error'
  //     });
  //   }
  // });

  const onSelectFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setSelectFile(file);
  };

  useEffect(() => {
    setDatasetTestItem(undefined);
  }, [datasetId]);

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
        borderRight={['none', theme.borders.base]}
      >
        <Box
          border={'2px solid'}
          p={3}
          mx={4}
          borderRadius={'md'}
          {...(isFocus
            ? {
                borderColor: 'primary.500',
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
              }
            : {
                borderColor: 'primary.300'
              })}
        >
          {/* header */}
          <Flex alignItems={'center'} justifyContent={'space-between'}>
            <MySelect
              size={'sm'}
              w={'150px'}
              list={[
                {
                  label: (
                    <Flex alignItems={'center'}>
                      <MyIcon mr={2} name={'text'} w={'14px'} color={'primary.600'} />
                      <Box fontSize={'sm'} fontWeight={'bold'} flex={1}>
                        {t('core.dataset.test.Test Text')}
                      </Box>
                    </Flex>
                  ),
                  value: 'text'
                }
                // {
                //   label: (
                //     <Flex alignItems={'center'}>
                //       <MyIcon mr={2} name={'file/csv'} w={'14px'} color={'primary.600'} />
                //       <Box fontSize={'sm'} fontWeight={'bold'} flex={1}>
                //         {t('core.dataset.test.Batch test')}
                //       </Box>
                //     </Flex>
                //   ),
                //   value: 'file'
                // }
              ]}
              value={inputType}
              onchange={(e) => setInputType(e)}
            />

            <Button
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={searchModeData.icon as any} w={'14px'} />}
              size={'sm'}
              onClick={onOpenSelectMode}
            >
              {t(searchModeData.title)}
            </Button>
          </Flex>

          <Box h={'180px'}>
            {inputType === 'text' && (
              <Textarea
                h={'100%'}
                resize={'none'}
                variant={'unstyled'}
                maxLength={datasetDetail.vectorModel?.maxToken}
                placeholder={t('core.dataset.test.Test Text Placeholder')}
                onFocus={() => setIsFocus(true)}
                {...register('inputText', {
                  required: true,
                  onBlur: () => {
                    setIsFocus(false);
                  }
                })}
              />
            )}
            {inputType === 'file' && (
              <Box pt={5}>
                <Flex
                  p={3}
                  borderRadius={'md'}
                  borderWidth={'1px'}
                  borderColor={'borderColor.base'}
                  borderStyle={'dashed'}
                  bg={'white'}
                  cursor={'pointer'}
                  justifyContent={'center'}
                  _hover={{
                    bg: 'primary.100',
                    borderColor: 'primary.500',
                    borderStyle: 'solid'
                  }}
                  onClick={onOpen}
                >
                  <MyIcon mr={2} name={'file/csv'} w={'24px'} />
                  <Box>
                    {selectFile ? selectFile.name : t('core.dataset.test.Batch test Placeholder')}
                  </Box>
                </Flex>
                <Box mt={3} fontSize={'sm'}>
                  读取 CSV 文件第一列进行批量测试，单次最多支持 100 组数据。
                  <Box
                    as={'span'}
                    color={'primary.600'}
                    cursor={'pointer'}
                    onClick={() => {
                      fileDownload({
                        text: `"问题"\n"问题1"\n"问题2"\n"问题3"`,
                        type: 'text/csv',
                        filename: 'Test Template'
                      });
                    }}
                  >
                    点击下载批量测试模板
                  </Box>
                </Box>
              </Box>
            )}
          </Box>

          <Flex justifyContent={'flex-end'}>
            <Button
              size={'sm'}
              isLoading={textTestIsLoading}
              isDisabled={inputType === 'file' && !selectFile}
              onClick={() => {
                if (inputType === 'text') {
                  handleSubmit((data) => onTextTest(data))();
                } else {
                  // handleSubmit((data) => onFileTest(data))();
                }
              }}
            >
              {t('core.dataset.test.Test')}
            </Button>
          </Flex>
        </Box>
        <Box mt={5} flex={'1 0 0'} px={4} overflow={'overlay'} display={['none', 'block']}>
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
          {...getValues('searchParams')}
          maxTokens={20000}
          onClose={onCloseSelectMode}
          onSuccess={(e) => {
            setValue('searchParams', {
              ...getValues('searchParams'),
              ...e
            });
            setRefresh((state) => !state);
          }}
        />
      )}
      <File onSelect={onSelectFile} />
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
  const theme = useTheme();
  const { datasetTestList, delDatasetTestItemById } = useSearchTestStore();

  const testHistories = useMemo(
    () => datasetTestList.filter((item) => item.datasetId === datasetId),
    [datasetId, datasetTestList]
  );
  return (
    <>
      <Flex alignItems={'center'} color={'myGray.900'}>
        <MyIcon mr={2} name={'history'} w={'18px'} h={'18px'} color={'myGray.900'} />
        <Box fontSize={'xl'}>{t('core.dataset.test.test history')}</Box>
      </Flex>
      <Box mt={2}>
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
              }
            }}
            cursor={'pointer'}
            fontSize={'sm'}
            {...(item.id === datasetTestItem?.id && {
              bg: 'primary.50'
            })}
            onClick={() => setDatasetTestItem(item)}
          >
            <Box flex={'0 0 auto'} mr={2}>
              {DatasetSearchModeMap[item.searchMode] ? (
                <Flex alignItems={'center'} fontWeight={'500'} color={'myGray.500'}>
                  <MyIcon
                    name={DatasetSearchModeMap[item.searchMode].icon as any}
                    w={'12px'}
                    mr={'1px'}
                  />
                  {t(DatasetSearchModeMap[item.searchMode].title)}
                </Flex>
              ) : (
                '-'
              )}
            </Box>
            <Box flex={1} mr={2} wordBreak={'break-all'} fontWeight={'400'}>
              {item.text}
            </Box>
            <Box flex={'0 0 70px'}>
              {formatTimeToChatTime(item.time).includes('.')
                ? t(formatTimeToChatTime(item.time))
                : formatTimeToChatTime(item.time)}
            </Box>
            <MyTooltip label={t('core.dataset.test.delete test history')}>
              <Box w={'14px'} h={'14px'}>
                <MyIcon
                  className="delete"
                  name={'delete'}
                  w={'14px'}
                  display={'none'}
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
    </>
  );
});

const TestResults = React.memo(function TestResults({
  datasetTestItem
}: {
  datasetTestItem?: SearchTestStoreItemType;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <>
      {!datasetTestItem?.results || datasetTestItem.results.length === 0 ? (
        <Flex
          mt={[10, 0]}
          h={'100%'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <MyIcon name={'empty'} color={'transparent'} w={'54px'} />
          <Box mt={3} color={'myGray.600'}>
            {t('core.dataset.test.test result placeholder')}
          </Box>
        </Flex>
      ) : (
        <>
          <Flex fontSize={'xl'} color={'myGray.900'} alignItems={'center'}>
            <MyIcon name={'common/paramsLight'} w={'18px'} mr={2} />
            {t('core.dataset.test.Test params')}
          </Flex>
          <Box mt={3}>
            <SearchParamsTip
              searchMode={datasetTestItem.searchMode}
              similarity={datasetTestItem.similarity}
              limit={datasetTestItem.limit}
              usingReRank={datasetTestItem.usingReRank}
              usingQueryExtension={datasetTestItem.usingQueryExtension}
            />
          </Box>

          <Flex mt={5} mb={3} alignItems={'center'}>
            <Flex fontSize={'xl'} color={'myGray.900'} alignItems={'center'}>
              <MyIcon name={'common/resultLight'} w={'18px'} mr={2} />
              {t('core.dataset.test.Test Result')}
            </Flex>
            <MyTooltip label={t('core.dataset.test.test result tip')} forceShow>
              <QuestionOutlineIcon mx={2} color={'myGray.600'} cursor={'pointer'} fontSize={'lg'} />
            </MyTooltip>
            <Box>({datasetTestItem.duration})</Box>
          </Flex>
          <Box mt={1} gap={4}>
            {datasetTestItem?.results.map((item, index) => (
              <Box key={item.id} p={3} borderRadius={'lg'} bg={'myGray.100'} _notLast={{ mb: 2 }}>
                <QuoteItem quoteItem={item} canViewSource />
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
});
