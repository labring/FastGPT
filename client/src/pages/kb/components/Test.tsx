import React, { useEffect, useMemo, useState } from 'react';
import { Box, Textarea, Button, Flex, useTheme, Grid, Progress } from '@chakra-ui/react';
import { useKbStore } from '@/store/kb';
import type { KbTestItemType } from '@/types/plugin';
import { searchText } from '@/api/plugins/kb';
import MyIcon from '@/components/Icon';
import { useRequest } from '@/hooks/useRequest';
import { useRouter } from 'next/router';
import { formatTimeToChatTime } from '@/utils/tools';
import InputDataModal, { type FormData } from './InputDataModal';

const Test = () => {
  const { kbId } = useRouter().query as { kbId: string };
  const theme = useTheme();
  const { kbTestList, pushKbTestItem } = useKbStore();
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<KbTestItemType['results']>([]);
  const [editData, setEditData] = useState<FormData>();

  const kbTestHistory = useMemo(
    () => kbTestList.filter((item) => item.kbId === kbId),
    [kbId, kbTestList]
  );

  const { mutate, isLoading } = useRequest({
    mutationFn: () => searchText({ kbId, text: inputText.trim() }),
    onSuccess(res) {
      pushKbTestItem({
        kbId,
        text: inputText.trim(),
        time: new Date(),
        results: res
      });
      setInputText('');
      setResults(res);
    }
  });

  useEffect(() => {
    setResults([]);
  }, [kbId]);

  return (
    <Box h={'100%'} display={['block', 'flex']}>
      <Box
        h={['auto', '100%']}
        overflow={'overlay'}
        flex={1}
        maxW={'500px'}
        px={4}
        borderRight={['none', theme.borders.base]}
      >
        <Box border={'2px solid'} borderColor={'myBlue.600'} p={3} borderRadius={'md'}>
          <Box fontSize={'sm'} fontWeight={'bold'}>
            <MyIcon mr={2} name={'text'} w={'18px'} h={'18px'} color={'myBlue.700'} />
            测试文本
          </Box>
          <Textarea
            rows={6}
            resize={'none'}
            variant={'unstyled'}
            maxLength={1000}
            placeholder="输入需要测试的文本"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Flex justifyContent={'flex-end'}>
            <Button isDisabled={inputText === ''} isLoading={isLoading} onClick={mutate}>
              测试
            </Button>
          </Flex>
        </Box>
        <Box mt={5} display={['none', 'block']}>
          <Flex alignItems={'center'} color={'myGray.600'}>
            <MyIcon mr={2} name={'history'} w={'16px'} h={'16px'} />
            <Box fontSize={'2xl'}>测试历史</Box>
          </Flex>
          <Box mt={2}>
            <Flex py={1} fontWeight={'bold'} borderBottom={theme.borders.base}>
              <Box flex={1}>测试文本</Box>
              <Box w={'80px'}>时间</Box>
            </Flex>
            {kbTestHistory.map((item, i) => (
              <Flex
                key={i}
                p={1}
                borderBottom={theme.borders.base}
                _hover={{ bg: '#f4f4f4' }}
                cursor={'pointer'}
                onClick={() => setResults(item.results)}
              >
                <Box flex={1} mr={2}>
                  {item.text}
                </Box>
                <Box w={'80px'}>{formatTimeToChatTime(item.time)}</Box>
              </Flex>
            ))}
          </Box>
        </Box>
      </Box>
      <Box px={4} pb={4} mt={[8, 0]} h={['auto', '100%']} overflow={'overlay'} flex={1}>
        {results.length === 0 ? (
          <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} justifyContent={'center'}>
            <MyIcon name={'empty'} color={'transparent'} w={'54px'} />
            <Box mt={3} color={'myGray.600'}>
              测试结果将在这里展示
            </Box>
          </Flex>
        ) : (
          <>
            <Box fontSize={'3xl'} color={'myGray.600'}>
              测试结果
            </Box>
            <Grid
              mt={1}
              gridTemplateColumns={[
                'repeat(1,1fr)',
                'repeat(1,1fr)',
                'repeat(1,1fr)',
                'repeat(2,1fr)',
                'repeat(3,1fr)'
              ]}
              gridGap={4}
            >
              {results.map((item) => (
                <Box
                  key={item.id}
                  pb={2}
                  borderRadius={'sm'}
                  border={theme.borders.base}
                  _notLast={{ mb: 2 }}
                  cursor={'pointer'}
                  title={'编辑'}
                  onClick={() =>
                    setEditData({
                      dataId: item.id,
                      q: item.q,
                      a: item.a
                    })
                  }
                >
                  <Flex p={3} alignItems={'center'} color={'myGray.500'}>
                    <MyIcon name={'kbTest'} w={'14px'} />
                    <Progress
                      mx={2}
                      flex={1}
                      value={50}
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
          onSuccess={() => setEditData(undefined)}
        />
      )}
    </Box>
  );
};

export default Test;
