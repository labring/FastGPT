import React, { useEffect, useMemo, useState } from 'react';
import { Box, Textarea, Button, Flex, useTheme, Grid, Progress, Switch } from '@chakra-ui/react';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useSearchTestStore, SearchTestStoreItemType } from '@/web/core/dataset/store/searchTest';
import { getDatasetDataItemById, postSearchText } from '@/web/core/dataset/api';
import MyIcon from '@/components/Icon';
import { useRequest } from '@/web/common/hooks/useRequest';
import { formatTimeToChatTime } from '@/utils/tools';
import InputDataModal, { type InputDataType } from './InputDataModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@/web/common/hooks/useToast';
import { customAlphabet } from 'nanoid';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { useTranslation } from 'next-i18next';
import { feConfigs } from '@/web/common/system/staticData';
import { SearchTestResponse } from '../../../../global/core/dataset/api';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const Test = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();
  const { datasetDetail } = useDatasetStore();
  const { datasetTestList, pushDatasetTestItem, delDatasetTestItemById, updateDatasetItemById } =
    useSearchTestStore();
  const [inputText, setInputText] = useState('');
  const [datasetTestItem, setDatasetTestItem] = useState<SearchTestStoreItemType>();
  const [editInputData, setEditInputData] = useState<InputDataType & { collectionId: string }>();
  const [rerank, setRerank] = useState(false);

  const kbTestHistory = useMemo(
    () => datasetTestList.filter((item) => item.datasetId === datasetId),
    [datasetId, datasetTestList]
  );

  const { mutate, isLoading } = useRequest({
    mutationFn: () => postSearchText({ datasetId, text: inputText.trim(), rerank, limit: 30 }),
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
        text: inputText.trim(),
        time: new Date(),
        results: res.list,
        duration: res.duration
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

  useEffect(() => {
    setDatasetTestItem(undefined);
  }, [datasetId]);

  return (
    <Box h={'100%'} display={['block', 'flex']}>
      <Box
        h={['auto', '100%']}
        display={['block', 'flex']}
        flexDirection={'column'}
        flex={1}
        maxW={'500px'}
        py={4}
        borderRight={['none', theme.borders.base]}
      >
        <Box border={'2px solid'} borderColor={'myBlue.600'} p={3} mx={4} borderRadius={'md'}>
          <Flex alignItems={'center'}>
            <Box fontSize={'sm'} fontWeight={'bold'} flex={1}>
              <MyIcon mr={2} name={'text'} w={'18px'} h={'18px'} color={'myBlue.700'} />
              {t('core.dataset.test.Test Text')}
            </Box>
            {feConfigs?.isPlus && (
              <Flex alignItems={'center'}>
                {t('dataset.recall.rerank')}
                <Switch ml={1} isChecked={rerank} onChange={(e) => setRerank(e.target.checked)} />
              </Flex>
            )}
          </Flex>
          <Textarea
            rows={6}
            resize={'none'}
            variant={'unstyled'}
            maxLength={datasetDetail.vectorModel.maxToken}
            placeholder={t('core.dataset.test.Test Text Placeholder')}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Flex alignItems={'center'} justifyContent={'flex-end'}>
            <Box mx={3} color={'myGray.500'}>
              {inputText.length}
            </Box>
            <Button isDisabled={inputText === ''} isLoading={isLoading} onClick={mutate}>
              {t('core.dataset.test.Test')}
            </Button>
          </Flex>
        </Box>
        <Box mt={5} flex={'1 0 0'} px={4} overflow={'overlay'} display={['none', 'block']}>
          <Flex alignItems={'center'} color={'myGray.600'}>
            <MyIcon mr={2} name={'history'} w={'16px'} h={'16px'} />
            <Box fontSize={'2xl'}>{t('core.dataset.test.test history')}</Box>
          </Flex>
          <Box mt={2}>
            <Flex py={2} fontWeight={'bold'} borderBottom={theme.borders.sm}>
              <Box flex={1}>{t('core.dataset.test.Test Text')}</Box>
              <Box w={'80px'}>{t('common.Time')}</Box>
              <Box w={'14px'}></Box>
            </Flex>
            {kbTestHistory.map((item) => (
              <Flex
                key={item.id}
                p={1}
                alignItems={'center'}
                borderBottom={theme.borders.base}
                _hover={{
                  bg: '#f4f4f4',
                  '& .delete': {
                    display: 'block'
                  }
                }}
                cursor={'pointer'}
                onClick={() => setDatasetTestItem(item)}
              >
                <Box flex={1} mr={2}>
                  {item.text}
                </Box>
                <Box w={'80px'}>{formatTimeToChatTime(item.time)}</Box>
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
        </Box>
      </Box>
      <Box p={4} h={['auto', '100%']} overflow={'overlay'} flex={1}>
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
            <Flex alignItems={'center'}>
              <Box fontSize={'3xl'} color={'myGray.600'}>
                {t('core.dataset.test.Test Result')}
              </Box>
              <MyTooltip label={t('core.dataset.test.test result tip')} forceShow>
                <QuestionOutlineIcon
                  mx={2}
                  color={'myGray.600'}
                  cursor={'pointer'}
                  fontSize={'lg'}
                />
              </MyTooltip>
              <Box>({datasetTestItem.duration})</Box>
            </Flex>
            <Grid
              mt={1}
              gridTemplateColumns={[
                'repeat(1,1fr)',
                'repeat(1,1fr)',
                'repeat(1,1fr)',
                'repeat(1,1fr)',
                'repeat(2,1fr)'
              ]}
              gridGap={4}
            >
              {datasetTestItem?.results.map((item, index) => (
                <Box
                  key={item.id}
                  pb={2}
                  borderRadius={'sm'}
                  border={theme.borders.base}
                  _notLast={{ mb: 2 }}
                  cursor={'pointer'}
                  title={'编辑'}
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const data = await getDatasetDataItemById(item.id);

                      if (!data) {
                        throw new Error(t('core.dataset.data.data is deleted'));
                      }

                      setEditInputData({
                        id: data.id,
                        collectionId: data.collectionId,
                        q: data.q,
                        a: data.a,
                        indexes: data.indexes
                      });
                    } catch (err) {
                      toast({
                        status: 'warning',
                        title: getErrText(err)
                      });
                    }
                    setLoading(false);
                  }}
                >
                  <Flex p={3} alignItems={'center'} color={'myGray.500'}>
                    <Box
                      border={theme.borders.base}
                      px={2}
                      fontSize={'sm'}
                      mr={1}
                      borderRadius={'md'}
                    >
                      # {index + 1}
                    </Box>
                    <MyIcon name={'kbTest'} w={'14px'} />
                    <Progress
                      mx={2}
                      flex={1}
                      value={item.score * 100}
                      size="sm"
                      borderRadius={'20px'}
                      colorScheme="gray"
                    />
                    <Box>{item.score.toFixed(4)}</Box>
                  </Flex>
                  <Box px={2} fontSize={'xs'} color={'myGray.600'}>
                    <Box>{item.q}</Box>
                    <Box>{item.a}</Box>
                  </Box>
                </Box>
              ))}
            </Grid>
          </>
        )}
      </Box>

      {!!editInputData && (
        <InputDataModal
          collectionId={editInputData.collectionId}
          defaultValue={editInputData}
          onClose={() => setEditInputData(undefined)}
          onSuccess={(data) => {
            if (datasetTestItem && editInputData.id) {
              const newTestItem: SearchTestStoreItemType = {
                ...datasetTestItem,
                results: datasetTestItem.results.map((item) =>
                  item.id === editInputData.id
                    ? {
                        ...item,
                        q: data.q || '',
                        a: data.a || ''
                      }
                    : item
                )
              };
              updateDatasetItemById(newTestItem);
              setDatasetTestItem(newTestItem);
            }

            setEditInputData(undefined);
          }}
          onDelete={() => {
            if (datasetTestItem && editInputData.id) {
              const newTestItem = {
                ...datasetTestItem,
                results: datasetTestItem.results.filter((item) => item.id !== editInputData.id)
              };
              updateDatasetItemById(newTestItem);
              setDatasetTestItem(newTestItem);
            }
            setEditInputData(undefined);
          }}
        />
      )}
    </Box>
  );
};

export default Test;
