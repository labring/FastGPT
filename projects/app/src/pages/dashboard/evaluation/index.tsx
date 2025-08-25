'use client';
import { useState, useEffect } from 'react';
import { Box, Button, Flex, Tab, TabList, TabPanel, TabPanels, Tabs } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/i18n/utils';
import DashboardContainer from '../../../pageComponents/dashboard/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';

// Import modular components
import DatasetList from '@/components/evaluation/dataset/DatasetList';
import DatasetModal from '@/components/evaluation/dataset/DatasetModal';
import MetricList from '@/components/evaluation/metric/MetricList';
import MetricModal from '@/components/evaluation/metric/MetricModal';
import TaskCreateModal from '@/components/evaluation/task/TaskCreateModal';
import EvaluationDetailModal from '@/pageComponents/evaluation/DetailModal';

// Import store and API
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getEvaluationList,
  deleteEvaluation,
  stopEvaluation,
  retryFailedItems
} from '@/web/core/evaluation/task';
import { getDatasetList } from '@/web/core/evaluation/dataset';
import { getMetricList } from '@/web/core/evaluation/metric';

// Import existing task components
import { useToast } from '@fastgpt/web/hooks/useToast';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { IconButton, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import type { EvaluationDisplayType } from '@fastgpt/global/core/evaluation/type';

const Evaluation = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc } = useSystem();

  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  const [searchKey, setSearchKey] = useState('');
  const [evalDetailId, setEvalDetailId] = useState<string>();

  // Store
  const { tasks, setTasks, openTaskModal, showDatasetModal, showMetricModal, showTaskModal } =
    useEvaluationStore();

  // Load initial data
  const { runAsync: loadDatasets } = useRequest2(
    () => getDatasetList({ pageNum: 1, pageSize: 100 }),
    { manual: true }
  );

  const { runAsync: loadMetrics } = useRequest2(
    () => getMetricList({ pageNum: 1, pageSize: 100 }),
    { manual: true }
  );

  // Task list with polling
  const [pollingInterval, setPollingInterval] = useState(10000);

  const {
    data: taskList,
    Pagination,
    getData: fetchTaskData,
    total,
    pageSize
  } = usePagination(
    (params) =>
      getEvaluationList({
        ...params,
        searchKey
      }),
    {
      defaultPageSize: 20,
      pollingInterval,
      pollingWhenHidden: true,
      params: {},
      EmptyTip: <EmptyTip />,
      refreshDeps: [searchKey]
    }
  );

  useEffect(() => {
    if (taskList) {
      setTasks(taskList);
    }
  }, [taskList, setTasks]);

  useEffect(() => {
    const hasRunningOrErrorTasks = tasks.some((item: EvaluationDisplayType) => {
      const { totalCount = 0, completedCount = 0, errorCount = 0 } = item;
      const isCompleted = totalCount === completedCount;
      return !isCompleted || errorCount > 0;
    });

    setPollingInterval(hasRunningOrErrorTasks ? 10000 : 0);
  }, [tasks]);

  // Load initial data when component mounts
  useEffect(() => {
    loadDatasets();
    loadMetrics();
  }, [loadDatasets, loadMetrics]);

  const { runAsync: onDeleteTask } = useRequest2(deleteEvaluation, {
    onSuccess: () => {
      fetchTaskData();
      toast({
        title: t('common:delete_success'),
        status: 'success'
      });
    }
  });

  const { runAsync: onStopTask } = useRequest2(
    (evaluationId: string) => stopEvaluation(evaluationId),
    {
      onSuccess: () => {
        fetchTaskData();
        toast({
          title: t('dashboard_evaluation:task_stopped'),
          status: 'success'
        });
      },
      onError: (error) => {
        toast({
          title: t('dashboard_evaluation:stop_task_failed'),
          description: error.message,
          status: 'error'
        });
      }
    }
  );

  const { runAsync: onRestartTask } = useRequest2(
    (evaluationId: string) => retryFailedItems(evaluationId),
    {
      onSuccess: () => {
        fetchTaskData();
        toast({
          title: t('dashboard_evaluation:task_restarted'),
          status: 'success'
        });
      },
      onError: (error) => {
        toast({
          title: t('dashboard_evaluation:restart_task_failed'),
          description: error.message,
          status: 'error'
        });
      }
    }
  );

  const evalDetail = tasks.find((item: EvaluationDisplayType) => item._id === evalDetailId);

  // 判断任务状态的帮助函数
  const getTaskStatus = (item: EvaluationDisplayType) => {
    const { completedCount = 0, totalCount = 0 } = item;

    if (item.errorMessage) {
      return 'error';
    }

    if (completedCount === totalCount) {
      return 'completed';
    }

    if (completedCount > 0) {
      return 'running';
    }

    return 'queuing';
  };

  const renderHeader = (MenuIcon?: React.ReactNode) => {
    return isPc ? (
      <Flex justifyContent={'space-between'} alignItems={'center'} mb={4}>
        <Box fontSize={'20px'} fontWeight={'medium'} ml={2} color="black">
          {t('dashboard_evaluation:evaluation')}
        </Box>
        <Flex gap={2}>
          {activeTab === 0 && (
            <>
              <SearchInput
                h={9}
                maxW={230}
                placeholder={t('dashboard_evaluation:search_task')}
                bg={'white'}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
              />
              <Button
                onClick={() => openTaskModal()}
                h={9}
                px={4}
                flexShrink={0}
                leftIcon={<MyIcon name={'common/addLight'} w={4} />}
              >
                {t('dashboard_evaluation:create_task')}
              </Button>
            </>
          )}
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
          {activeTab === 0 && (
            <>
              <SearchInput
                h={9}
                maxW={230}
                bg={'white'}
                placeholder={t('dashboard_evaluation:search_task')}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
              />
              <Button
                onClick={() => openTaskModal()}
                h={9}
                px={4}
                leftIcon={<MyIcon name={'common/addLight'} w={4} />}
              >
                {t('dashboard_evaluation:create_task')}
              </Button>
            </>
          )}
        </Flex>
      </Flex>
    );
  };

  const renderProgress = (item: EvaluationDisplayType) => {
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
        {(errorCount > 0 || item.errorMessage) && (
          <MyTooltip
            label={
              item.errorMessage
                ? t('common:code_error.team_error.ai_points_not_enough')
                : t('dashboard_evaluation:error_tooltip')
            }
          >
            <MyIcon
              name={'common/error'}
              color={'red.600'}
              w={4}
              ml={2}
              cursor={'pointer'}
              onClick={() => setEvalDetailId(item._id)}
            />
          </MyTooltip>
        )}
      </Flex>
    );
  };

  const renderTasksTab = () => (
    <Box>
      <TableContainer mt={3} fontSize={'sm'} flex={'1 0 0'} overflowY="auto">
        <Table variant={'simple'}>
          <Thead>
            <Tr color={'myGray.600'}>
              <Th fontWeight={'400'}>{t('dashboard_evaluation:Task_name')}</Th>
              <Th fontWeight={'400'}>{t('dashboard_evaluation:Progress')}</Th>
              <Th fontWeight={'400'}>{t('dashboard_evaluation:Executor')}</Th>
              <Th fontWeight={'400'}>{t('dashboard_evaluation:Start_end_time')}</Th>
              <Th fontWeight={'400'}>{t('dashboard_evaluation:Overall_score')}</Th>
              <Th fontWeight={'400'}>{t('dashboard_evaluation:Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr h={'5px'} />
            {tasks.map((item: EvaluationDisplayType) => {
              return (
                <Tr key={item._id}>
                  <Td fontWeight={'medium'} color={'myGray.900'}>
                    {item.name}
                  </Td>
                  <Td>{renderProgress(item)}</Td>
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
                  <Td color={'myGray.900'}>
                    <Box>{formatTime2YMDHM(item.createTime)}</Box>
                    <Box>{formatTime2YMDHM(item.finishTime)}</Box>
                  </Td>
                  <Td color={item.avgScore ? 'myGray.600' : 'myGray.900'}>
                    {typeof item.avgScore === 'number' ? (item.avgScore * 100).toFixed(2) : '-'}
                  </Td>
                  <Td>
                    <Flex gap={2} alignItems="center">
                      <Button
                        variant={'whiteBase'}
                        leftIcon={<MyIcon name={'common/detail'} w={4} />}
                        fontSize={'12px'}
                        fontWeight={'medium'}
                        onClick={() => setEvalDetailId(item._id)}
                      >
                        {t('dashboard_evaluation:detail')}
                      </Button>

                      {(() => {
                        const status = getTaskStatus(item);

                        if (status === 'running' || status === 'queuing') {
                          return (
                            <PopoverConfirm
                              type="info"
                              Trigger={
                                <IconButton
                                  aria-label="stop"
                                  size={'mdSquare'}
                                  variant={'whiteBase'}
                                  icon={<MyIcon name={'stop'} w={4} />}
                                />
                              }
                              content={t('dashboard_evaluation:confirm_stop_task')}
                              onConfirm={() => onStopTask(item._id)}
                            />
                          );
                        }

                        if (status === 'completed' || status === 'error') {
                          return (
                            <PopoverConfirm
                              type="info"
                              Trigger={
                                <IconButton
                                  aria-label="restart"
                                  size={'mdSquare'}
                                  variant={'whiteBase'}
                                  icon={<MyIcon name={'common/retryLight'} w={4} />}
                                />
                              }
                              content={t('dashboard_evaluation:confirm_restart_task')}
                              onConfirm={() => onRestartTask(item._id)}
                            />
                          );
                        }

                        return null;
                      })()}

                      <PopoverConfirm
                        type="delete"
                        Trigger={
                          <IconButton
                            aria-label="delete"
                            size={'mdSquare'}
                            variant={'whiteDanger'}
                            icon={<MyIcon name={'delete'} w={4} />}
                          />
                        }
                        content={t('dashboard_evaluation:comfirm_delete_task')}
                        onConfirm={() => onDeleteTask({ evalId: item._id })}
                      />
                    </Flex>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </TableContainer>
      {tasks.length === 0 && <EmptyTip text={t('dashboard_evaluation:no_data')} />}
      {total >= pageSize && (
        <Flex mt={4} justifyContent="center">
          <Pagination />
        </Flex>
      )}
    </Box>
  );

  return (
    <>
      <DashboardContainer>
        {({ MenuIcon }) => (
          <Flex h={'full'} bg={'white'} p={6} flexDirection="column">
            {renderHeader(MenuIcon)}

            <Tabs index={activeTab} onChange={setActiveTab}>
              <TabList>
                <Tab>{t('dashboard_evaluation:tasks')}</Tab>
                <Tab>{t('dashboard_evaluation:datasets')}</Tab>
                <Tab>{t('dashboard_evaluation:metrics')}</Tab>
              </TabList>

              <TabPanels>
                <TabPanel px={0}>{renderTasksTab()}</TabPanel>
                <TabPanel px={0}>
                  <DatasetList searchKey={searchKey} onSearchChange={setSearchKey} />
                </TabPanel>
                <TabPanel px={0}>
                  <MetricList searchKey={searchKey} onSearchChange={setSearchKey} />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Flex>
        )}
      </DashboardContainer>

      {/* Modals */}
      {showDatasetModal && <DatasetModal />}
      {showMetricModal && <MetricModal />}
      {showTaskModal && <TaskCreateModal />}

      {!!evalDetail && (
        <EvaluationDetailModal
          evalDetail={evalDetail}
          onClose={() => setEvalDetailId(undefined)}
          fetchEvalList={() => fetchTaskData()}
        />
      )}
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
