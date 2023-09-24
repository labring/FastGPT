import React, { useEffect, useMemo, useState } from 'react';
import { Box, Textarea, Button, Flex, useTheme, Grid, Progress } from '@chakra-ui/react';
import { useDatasetStore } from '@/store/dataset';
import type { SearchTestItemType } from '@/types/core/dataset';
import { getDatasetDataItemById } from '@/api/core/dataset/data';
import MyIcon from '@/components/Icon';
import { useRequest } from '@/hooks/useRequest';
import { formatTimeToChatTime } from '@/utils/tools';
import InputDataModal, { type FormData } from './InputDataModal';
import { useGlobalStore } from '@/store/global';
import { getErrText } from '@/utils/tools';
import { useToast } from '@/hooks/useToast';
import { customAlphabet } from 'nanoid';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { postSearchText } from '@/api/core/dataset';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const Test = ({ kbId }: { kbId: string }) => {
  const theme = useTheme();
  const { toast } = useToast();
  const { setLoading } = useGlobalStore();
  const { kbDetail, kbTestList, pushKbTestItem, delKbTestItemById, updateKbItemById } =
    useDatasetStore();
  const [inputText, setInputText] = useState('');
  const [kbTestItem, setKbTestItem] = useState<SearchTestItemType>();
  const [editData, setEditData] = useState<FormData>();

  const kbTestHistory = useMemo(
    () => kbTestList.filter((item) => item.kbId === kbId),
    [kbId, kbTestList]
  );

  const { mutate, isLoading } = useRequest({
    mutationFn: () => postSearchText({ kbId, text: inputText.trim() }),
    onSuccess(res) {
      const testItem = {
        id: nanoid(),
        kbId,
        text: inputText.trim(),
        time: new Date(),
        results: res
      };
      pushKbTestItem(testItem);
      setKbTestItem(testItem);
    },
    onError(err) {
      toast({
        title: getErrText(err),
        status: 'error'
      });
    }
  });

  useEffect(() => {
    setKbTestItem(undefined);
  }, [kbId]);

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
          <Box fontSize={'sm'} fontWeight={'bold'}>
            <MyIcon mr={2} name={'text'} w={'18px'} h={'18px'} color={'myBlue.700'} />
            测试文本
          </Box>
          <Textarea
            rows={6}
            resize={'none'}
            variant={'unstyled'}
            maxLength={kbDetail.vectorModel.maxToken}
            placeholder="输入需要测试的文本"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Flex alignItems={'center'} justifyContent={'flex-end'}>
            <Box mr={3} color={'myGray.500'}>
              {inputText.length}
            </Box>
            <Button isDisabled={inputText === ''} isLoading={isLoading} onClick={mutate}>
              测试
            </Button>
          </Flex>
        </Box>
        <Box mt={5} flex={'1 0 0'} px={4} overflow={'overlay'} display={['none', 'block']}>
          <Flex alignItems={'center'} color={'myGray.600'}>
            <MyIcon mr={2} name={'history'} w={'16px'} h={'16px'} />
            <Box fontSize={'2xl'}>测试历史</Box>
          </Flex>
          <Box mt={2}>
            <Flex py={2} fontWeight={'bold'} borderBottom={theme.borders.sm}>
              <Box flex={1}>测试文本</Box>
              <Box w={'80px'}>时间</Box>
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
                onClick={() => setKbTestItem(item)}
              >
                <Box flex={1} mr={2}>
                  {item.text}
                </Box>
                <Box w={'80px'}>{formatTimeToChatTime(item.time)}</Box>
                <MyTooltip label={'删除该测试记录'}>
                  <Box w={'14px'} h={'14px'}>
                    <MyIcon
                      className="delete"
                      name={'delete'}
                      w={'14px'}
                      display={'none'}
                      _hover={{ color: 'red.600' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        delKbTestItemById(item.id);
                        kbTestItem?.id === item.id && setKbTestItem(undefined);
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
        {!kbTestItem?.results || kbTestItem.results.length === 0 ? (
          <Flex
            mt={[10, 0]}
            h={'100%'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name={'empty'} color={'transparent'} w={'54px'} />
            <Box mt={3} color={'myGray.600'}>
              测试结果将在这里展示
            </Box>
          </Flex>
        ) : (
          <>
            <Flex alignItems={'flex-end'}>
              <Box fontSize={'3xl'} color={'myGray.600'}>
                测试结果
              </Box>
              <MyTooltip
                label={
                  '根据知识库内容与测试文本的相似度进行排序，你可以根据测试结果调整对应的文本。\n注意：测试记录中的数据可能已经被修改过，点击某条测试数据后将展示最新的数据。'
                }
                forceShow
              >
                <QuestionOutlineIcon
                  ml={2}
                  color={'myGray.600'}
                  cursor={'pointer'}
                  fontSize={'lg'}
                />
              </MyTooltip>
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
              {kbTestItem?.results.map((item) => (
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
                        throw new Error('该数据已被删除');
                      }

                      setEditData({
                        dataId: data.id,
                        ...data
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
                  <Box
                    px={2}
                    fontSize={'xs'}
                    color={'myGray.600'}
                    maxH={'200px'}
                    overflow={'overlay'}
                  >
                    <Box>{item.q}</Box>
                    <Box>{item.a}</Box>
                  </Box>
                </Box>
              ))}
            </Grid>
          </>
        )}
      </Box>

      {editData && (
        <InputDataModal
          kbId={kbId}
          defaultValues={editData}
          onClose={() => setEditData(undefined)}
          onSuccess={(data) => {
            if (kbTestItem && editData.dataId) {
              const newTestItem = {
                ...kbTestItem,
                results: kbTestItem.results.map((item) =>
                  item.id === editData.dataId
                    ? {
                        ...item,
                        q: data.q,
                        a: data.a
                      }
                    : item
                )
              };
              updateKbItemById(newTestItem);
              setKbTestItem(newTestItem);
            }

            setEditData(undefined);
          }}
          onDelete={() => {
            if (kbTestItem && editData.dataId) {
              const newTestItem = {
                ...kbTestItem,
                results: kbTestItem.results.filter((item) => item.id !== editData.dataId)
              };
              updateKbItemById(newTestItem);
              setKbTestItem(newTestItem);
            }
            setEditData(undefined);
          }}
        />
      )}
    </Box>
  );
};

export default Test;
