import React, { useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Box,
  Flex,
  Button,
  HStack,
  Input,
  InputGroup,
  InputLeftElement
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import format from 'date-fns/format';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppSelectWithAll from '@/pageComponents/dashboard/evaluation/task/AppSelectWithAll';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRouter } from 'next/router';
import CreateModal from '@/pageComponents/dashboard/evaluation/task/CreateModal';
import {
  deleteEvaluation,
  putUpdateEvaluation,
  getEvaluationList,
  postRetryFailedEvaluationItems
} from '@/web/core/evaluation/task';
import type { EvaluationDisplayType } from '@fastgpt/global/core/evaluation/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import {
  EvaluationStatusEnum,
  EvaluationStatusMap
} from '@fastgpt/global/core/evaluation/constants';

const EvaluationTasks = ({ Tab }: { Tab: React.ReactNode }) => {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { t } = useTranslation();

  const getEvaluationListAdapter = async (
    data: PaginationProps<{ searchKey: string; appFilter: string }>
  ): Promise<PaginationResponse<EvaluationDisplayType>> => {
    return getEvaluationList({
      pageNum: Number(data.pageNum),
      pageSize: Number(data.pageSize),
      searchKey: data.searchKey
    });
  };

  // 使用分页Hook
  const {
    data: tasks,
    Pagination,
    getData: fetchData,
    isLoading
  } = usePagination<{ searchKey: string; appFilter: string }, EvaluationDisplayType>(
    getEvaluationListAdapter,
    {
      defaultPageSize: 10,
      params: {
        searchKey: searchValue,
        appFilter
      },
      EmptyTip: <EmptyTip />,
      refreshDeps: [searchValue, appFilter]
    }
  );

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:Rename')
  });

  const { runAsync: onUpdateTaskName } = useRequest2(
    (evalId: string, newName: string) => {
      return putUpdateEvaluation({
        evalId,
        name: newName
      });
    },
    {
      onSuccess: () => {
        fetchData();
      },
      errorToast: t('common:update_failed'),
      successToast: t('common:update_success')
    }
  );

  const { runAsync: onDeleteEvaluation } = useRequest2(deleteEvaluation, {
    onSuccess: () => {
      fetchData();
    },
    errorToast: t('dashboard_evaluation:delete_failed'),
    successToast: t('dashboard_evaluation:delete_success')
  });

  // 渲染评测结果
  const renderEvaluationResult = (task: EvaluationDisplayType) => {
    if (task.status === EvaluationStatusEnum.queuing) {
      return <Box color={'myGray.600'}>{t('dashboard_evaluation:waiting')}</Box>;
    }

    if (task.status === EvaluationStatusEnum.evaluating) {
      return <Box color={'myGray.600'}>{t('dashboard_evaluation:evaluating_status')}</Box>;
    }

    if (task.status === EvaluationStatusEnum.completed && task.avgScore !== undefined) {
      return (
        <Box color={'myGray.900'} fontWeight={'500'}>
          {task.avgScore.toFixed(1)}
        </Box>
      );
    }

    if (task.status === EvaluationStatusEnum.error) {
      return <Box color={'red.600'}>{t('dashboard_evaluation:error')}</Box>;
    }

    return <Box color={'myGray.600'}>-</Box>;
  };

  // 状态颜色映射
  const statusColorMap = {
    [EvaluationStatusEnum.queuing]: undefined,
    [EvaluationStatusEnum.evaluating]: 'blue',
    [EvaluationStatusEnum.completed]: 'green.600',
    [EvaluationStatusEnum.error]: 'red.600'
  };

  const handleDeleteTask = (evalId: string) => {
    onDeleteEvaluation(evalId);
  };

  const handleRenameTask = (task: EvaluationDisplayType) => {
    onOpenEditTitleModal({
      defaultVal: task.name,
      onSuccess: async (newName) => {
        await onUpdateTaskName(task._id, newName);
      }
    });
  };

  const handleRetryErrorData = (evalId: string) => {
    postRetryFailedEvaluationItems({ evalId })
      .then(() => {
        fetchData();
      })
      .catch((error) => {
        console.error('Error retrying failed data:', error);
      });
  };

  const handleCreateNewTask = () => {
    setIsCreateModalOpen(true);
  };

  // 处理创建任务确认
  const handleCreateTaskConfirm = () => {
    fetchData();
  };

  return (
    <>
      <Flex alignItems={'center'}>
        {Tab}
        <Box flex={1} />
        <HStack spacing={4} flexShrink={0}>
          <Box w={'250px'}>
            <AppSelectWithAll value={appFilter} onSelect={setAppFilter} showAllOption={true} />
          </Box>
          <InputGroup w={'205px'}>
            <InputLeftElement>
              <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} />
            </InputLeftElement>
            <Input
              placeholder={t('dashboard_evaluation:search_evaluation_task')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              bg={'white'}
            />
          </InputGroup>
          <Button
            h={9}
            px={4}
            flexShrink={0}
            leftIcon={<MyIcon name={'common/addLight'} w={4} />}
            onClick={handleCreateNewTask}
          >
            {t('dashboard_evaluation:create_new')}
          </Button>
        </HStack>
      </Flex>

      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('dashboard_evaluation:task_name_column')}</Th>
                <Th>{t('dashboard_evaluation:progress_column')}</Th>
                <Th>{t('dashboard_evaluation:evaluation_app_column')}</Th>
                <Th>{t('dashboard_evaluation:app_version_column')}</Th>
                <Th>{t('dashboard_evaluation:evaluation_result_column')}</Th>
                <Th>{t('dashboard_evaluation:start_finish_time_column')}</Th>
                <Th>{t('dashboard_evaluation:executor_column')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {tasks.map((task) => (
                <Tr
                  key={task._id}
                  _hover={{ bg: 'myGray.100' }}
                  cursor={'pointer'}
                  onClick={() => {
                    router.push({
                      pathname: '/dashboard/evaluation/task/detail',
                      query: {
                        taskId: task._id
                      }
                    });
                  }}
                >
                  <Td>{task.name}</Td>
                  <Td>
                    {task.status === EvaluationStatusEnum.evaluating ? (
                      <HStack spacing={1}>
                        <Box>
                          <Box as="span" color={'myGray.900'}>
                            {task.statistics?.completedItems}
                          </Box>
                          <Box as="span" color={'myGray.600'}>
                            /{task.statistics?.totalItems}
                          </Box>
                        </Box>
                        {task.statistics?.errorItems && task.statistics.errorItems > 0 && (
                          <MyTooltip
                            label={t('dashboard_evaluation:error_data_tooltip', {
                              count: task.statistics.errorItems
                            })}
                          >
                            <MyIcon name={'common/error'} w={'14px'} color={'red.600'} />
                          </MyTooltip>
                        )}
                      </HStack>
                    ) : (
                      <Box color={statusColorMap[task.status] as any}>
                        {t(EvaluationStatusMap[task.status]?.name)}
                      </Box>
                    )}
                  </Td>
                  <Td>
                    <HStack>
                      <Avatar src={''} borderRadius={'sm'} w={'1.5rem'} />
                      <Box flex={'1 0 0'}>{task.target.config.appName}</Box>
                    </HStack>
                  </Td>
                  <Td>-</Td>
                  <Td>{renderEvaluationResult(task)}</Td>
                  <Td>
                    <Box>{format(new Date(task.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                    <Box>
                      {task.finishTime
                        ? format(new Date(task.finishTime), 'yyyy-MM-dd HH:mm:ss')
                        : '-'}
                    </Box>
                  </Td>
                  <Td>
                    <Flex alignItems={'center'} gap={1.5}>
                      <Avatar
                        src={task.sourceMember.avatar}
                        w={5}
                        borderRadius={'full'}
                        border={'1px solid'}
                        borderColor={'myGray.200'}
                      />
                      <Box>{task.sourceMember.name}</Box>
                    </Flex>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <MyMenu
                      menuList={[
                        {
                          label: '',
                          children: [
                            ...(task.statistics?.errorItems && task.statistics.errorItems > 0
                              ? [
                                  {
                                    icon: 'common/retryLight',
                                    label: t('dashboard_evaluation:retry_error_data'),
                                    onClick: () => handleRetryErrorData(task._id)
                                  }
                                ]
                              : []),
                            {
                              icon: 'edit',
                              label: t('dashboard_evaluation:rename'),
                              onClick: () => handleRenameTask(task)
                            }
                          ]
                        },
                        {
                          children: [
                            {
                              type: 'danger',
                              icon: 'delete',
                              label: t('dashboard_evaluation:delete'),
                              onClick: () =>
                                openConfirm(
                                  async () => {
                                    await handleDeleteTask(task._id);
                                  },
                                  undefined,
                                  t('dashboard_evaluation:confirm_delete_task')
                                )()
                            }
                          ]
                        }
                      ]}
                      Button={<MyIconButton icon={'more'} />}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </MyBox>

      <Flex mt={4} justifyContent="center">
        <Pagination />
      </Flex>

      <ConfirmModal />
      <EditTitleModal />
      {isCreateModalOpen && (
        <CreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreateTaskConfirm}
        />
      )}
    </>
  );
};

export default EvaluationTasks;
