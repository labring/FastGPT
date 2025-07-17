'use client';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardContainer from '../../../pageComponents/dashboard/Container';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { deleteEvaluation, getEvaluationList } from '@/web/core/app/api/evaluation';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import type { deleteEvaluationQuery } from '@/pages/api/core/app/evaluation/delete';
import { useState } from 'react';
import EvaluationDetailModal from '../../../pageComponents/app/evaluation/DetailModal';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { evaluationType } from '@/pages/api/core/app/evaluation/list';

const Evaluation = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const { isPc } = useSystem();

  const [searchKey, setSearchKey] = useState('');
  const [evalDetailIndex, setEvalDetailIndex] = useState<number | null>(null);

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const {
    data: evaluationList,
    ScrollData,
    fetchData
  } = useScrollPagination(getEvaluationList, {
    pageSize: 20,
    pollingInterval: 5000,
    params: {
      searchKey
    },
    EmptyTip: <EmptyTip />,
    refreshDeps: [searchKey]
  });

  const { runAsync: deleteEval, loading: isLoadingDelete } = useRequest2(
    async (data: deleteEvaluationQuery) => {
      await deleteEvaluation(data);
    },
    {
      onSuccess: () => {
        fetchData(false, undefined, true);
      }
    }
  );

  const renderHeader = (MenuIcon?: React.ReactNode) => {
    return isPc ? (
      <Flex justifyContent={'space-between'} alignItems={'center'} mb={4}>
        <Box fontSize={'20px'} fontWeight={'medium'} ml={2} color="black">
          {t('dashboard_evaluation:evaluation')}
        </Box>
        <Flex gap={2}>
          <SearchInput
            h={9}
            maxW={230}
            placeholder={t('dashboard_evaluation:search_task')}
            bg={'white'}
            onChange={(e) => {
              setSearchKey(e.target.value);
            }}
          />
          <Button
            onClick={() => {
              router.push('/dashboard/evaluation/create');
            }}
            h={9}
            px={4}
            flexShrink={0}
            leftIcon={<MyIcon name={'common/addLight'} w={4} />}
          >
            {t('dashboard_evaluation:create_task')}
          </Button>
        </Flex>
      </Flex>
    ) : (
      <Flex justifyContent={'space-between'} alignItems={'center'} flexDirection={'column'} mb={4}>
        <Flex alignItems={'center'} w={'full'} mb={2}>
          <Box>{MenuIcon}</Box>
          <Box fontSize={'20px'} fontWeight={'medium'} ml={2} color="black">
            {t('dashboard_evaluation:evaluation')}
          </Box>
        </Flex>
        <Flex gap={2}>
          <SearchInput
            h={9}
            maxW={230}
            bg={'white'}
            placeholder={t('dashboard_evaluation:search_task')}
            onChange={(e) => {
              setSearchKey(e.target.value);
            }}
          />
          <Button
            onClick={() => {
              router.push('/dashboard/evaluation/create');
            }}
            h={9}
            px={4}
            leftIcon={<MyIcon name={'common/addLight'} w={4} />}
          >
            {t('dashboard_evaluation:create_task')}
          </Button>
        </Flex>
      </Flex>
    );
  };

  const renderProgress = (item: evaluationType, index: number) => {
    const { completedCount, totalCount, errorCount } = item;

    if (completedCount === totalCount) {
      return (
        <Box color={'green.600'} fontWeight={'medium'}>
          {t('dashboard_evaluation:completed')}
        </Box>
      );
    }

    return (
      <Flex fontWeight={'medium'} alignItems={'center'}>
        <Box color={'myGray.900'}>{completedCount}</Box>
        <Box color={'myGray.600'}>{`/${totalCount}`}</Box>
        {errorCount > 0 && (
          <MyIcon
            name={'common/error'}
            color={'red.600'}
            w={4}
            ml={2}
            cursor={'pointer'}
            onClick={() => setEvalDetailIndex(index)}
          />
        )}
      </Flex>
    );
  };

  return (
    <>
      <DashboardContainer>
        {({ MenuIcon }) => (
          <Flex h={'full'} bg={'white'} p={6} flexDirection="column">
            {renderHeader(MenuIcon)}

            <MyBox flex={'1 0 0'} overflow="hidden" isLoading={isLoadingDelete}>
              <ScrollData h={'100%'}>
                <TableContainer mt={3} fontSize={'sm'}>
                  <Table variant={'simple'}>
                    <Thead>
                      <Tr color={'myGray.600'}>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Task_name')}</Th>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Progress')}</Th>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Executor')}</Th>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Evaluation_app')}</Th>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Start_end_time')}</Th>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Overall_score')}</Th>
                        <Th fontWeight={'400'}>{t('dashboard_evaluation:Action')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      <Tr h={'5px'} />
                      {evaluationList.map((item, index) => {
                        return (
                          <Tr key={item._id}>
                            <Td fontWeight={'medium'} color={'myGray.900'}>
                              {item.name}
                            </Td>
                            <Td>{renderProgress(item, index)}</Td>
                            <Td>
                              <Flex alignItems={'center'} gap={1.5}>
                                <Avatar
                                  src={item.executorAvatar}
                                  w={5}
                                  borderRadius={'full'}
                                  border={'1px solid'}
                                  borderColor={'myGray.200'}
                                />
                                <Box color={'myGray.900'}>{item.executorName}</Box>
                              </Flex>
                            </Td>
                            <Td>
                              <Flex alignItems={'center'} gap={1.5}>
                                <Avatar src={item.appAvatar} w={5} borderRadius={'4px'} />
                                <Box color={'myGray.900'}>{item.appName}</Box>
                              </Flex>
                            </Td>
                            <Td color={'myGray.900'}>
                              <Box>{formatTime2YMDHM(item.createTime)}</Box>
                              <Box>{formatTime2YMDHM(item.finishTime)}</Box>
                            </Td>
                            <Td color={item.score === null ? 'myGray.600' : 'myGray.900'}>
                              {item.score || '-'}
                            </Td>
                            <Td>
                              <Button
                                variant={'whiteBase'}
                                leftIcon={<MyIcon name={'common/detail'} w={4} />}
                                fontSize={'12px'}
                                fontWeight={'medium'}
                                mr={2}
                                onClick={() => setEvalDetailIndex(index)}
                              >
                                {t('dashboard_evaluation:detail')}
                              </Button>
                              <IconButton
                                aria-label="delete"
                                size={'mdSquare'}
                                variant={'whiteDanger'}
                                icon={<MyIcon name={'delete'} w={4} />}
                                onClick={() =>
                                  openConfirm(
                                    () => deleteEval({ evalId: item._id }),
                                    undefined,
                                    t('dashboard_evaluation:comfirm_delete_task')
                                  )()
                                }
                              />
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableContainer>
              </ScrollData>
            </MyBox>
          </Flex>
        )}
      </DashboardContainer>
      {evalDetailIndex !== null && evaluationList[evalDetailIndex] && (
        <EvaluationDetailModal
          evalDetail={evaluationList[evalDetailIndex]}
          onClose={() => setEvalDetailIndex(null)}
          fetchEvalList={() => fetchData(false, undefined, true)}
        />
      )}
      <ConfirmModal />
    </>
  );
};

export default Evaluation;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dashboard_evaluation']))
    }
  };
}
