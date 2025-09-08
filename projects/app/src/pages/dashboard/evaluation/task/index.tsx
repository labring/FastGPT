import React, { useState, useMemo } from 'react';
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
import UserBox from '@fastgpt/web/components/common/UserBox';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppSelectWithAll from '@/pageComponents/dashboard/evaluation/task/AppSelectWithAll';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRouter } from 'next/router';
import CitationTemplate from '@/pageComponents/dashboard/evaluation/dimension/CitationTemplate';
import ConfigParamsModal from '@/pageComponents/dashboard/evaluation/task/detail/ConfigParams';
import CreateModal from '@/pageComponents/dashboard/evaluation/task/CreateModal';

// 评测结果维度类型
interface EvaluationDimension {
  name: string;
  score: number;
}

// 评测结果类型
interface EvaluationResult {
  type: 'comprehensive' | 'dimensions'; // 综合评分 或 维度评分
  comprehensiveScore?: number; // 综合分数
  dimensions?: EvaluationDimension[]; // 维度分数列表
}

// 模拟数据类型
interface EvaluationTask {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'completed';
  app: {
    name: string;
    avatar: string;
  };
  version: string;
  result: string;
  createTime: Date | string;
  finishTime?: Date | string;
  executor: {
    name: string;
    avatar: string;
  };
  // 进度相关字段
  completedCount?: number;
  totalCount?: number;
  // 异常数据数量
  errorCount?: number;
  // 评测结果详情
  evaluationResult?: EvaluationResult;
}

// 模拟数据
const mockTasks: EvaluationTask[] = [
  {
    id: 1,
    name: '任务1',
    status: 'pending',
    app: {
      name: '客服助手',
      avatar: 'core/app/type/simpleFill'
    },
    version: '2025-08-01',
    result: '等待中',
    createTime: '2025-08-01T00:58:08.946Z',
    executor: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    }
  },
  {
    id: 2,
    name: '任务2',
    status: 'running',
    app: {
      name: '客服助手',
      avatar: 'core/app/type/simpleFill'
    },
    version: '2025-08-01',
    result: '评测中',
    createTime: '2025-08-01T00:58:08.946Z',
    executor: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    },
    completedCount: 41,
    totalCount: 50,
    errorCount: 2
  },
  {
    id: 3,
    name: '任务3',
    status: 'running',
    app: {
      name: '客服助手',
      avatar: 'core/app/type/simpleFill'
    },
    version: '2025-08-01',
    result: '评测中',
    createTime: '2025-08-01T00:58:08.946Z',
    executor: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    },
    completedCount: 41,
    totalCount: 50
  },
  {
    id: 4,
    name: '任务4',
    status: 'completed',
    app: {
      name: '客服助手',
      avatar: 'core/app/type/simpleFill'
    },
    version: '2025-08-01',
    result: '已完成',
    createTime: '2025-08-01T00:58:08.946Z',
    finishTime: '2025-08-01T01:58:08.946Z',
    executor: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    },
    evaluationResult: {
      type: 'comprehensive',
      comprehensiveScore: 72
    }
  },
  {
    id: 5,
    name: '任务5',
    status: 'completed',
    app: {
      name: '客服助手',
      avatar: 'core/app/type/simpleFill'
    },
    version: '2025-08-01',
    result: '已完成',
    createTime: '2025-08-01T00:58:08.946Z',
    finishTime: '2025-08-01T01:58:08.946Z',
    executor: {
      name: 'violetjam',
      avatar: '/imgs/avatar/BlueAvatar.svg'
    },
    evaluationResult: {
      type: 'dimensions',
      dimensions: [
        { name: '回答准确性', score: 62 },
        { name: '回答忠诚度', score: 78 }
      ]
    }
  }
];

// 模拟API函数 - 实际项目中应该替换为真实的API调用
const getMockEvaluationTasks = async (data: any) => {
  // 模拟API延迟
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { pageNum, pageSize, searchKey = '', appFilter = '' } = data;

  // 过滤数据
  let filteredTasks = mockTasks.filter((task) => {
    const matchesSearch = task.name.toLowerCase().includes(searchKey.toLowerCase());
    const matchesApp = !appFilter || task.app.name === appFilter;
    return matchesSearch && matchesApp;
  });

  // 分页
  const total = filteredTasks.length;
  const startIndex = (pageNum - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const list = filteredTasks.slice(startIndex, endIndex);

  return {
    list,
    total
  };
};

const EvaluationTasks = ({ Tab }: { Tab: React.ReactNode }) => {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isConfigParamsModalOpen, setIsConfigParamsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { t } = useTranslation();

  // 使用分页Hook
  const {
    data: tasks,
    Pagination,
    getData: fetchData
  } = usePagination(getMockEvaluationTasks, {
    defaultPageSize: 10,
    params: {
      searchKey: searchValue,
      appFilter
    },
    EmptyTip: <EmptyTip />,
    refreshDeps: [searchValue, appFilter]
  });

  const statusMap = {
    pending: { label: t('dashboard_evaluation:queuing_status'), colorSchema: undefined },
    running: { label: t('dashboard_evaluation:running_status'), colorSchema: 'blue' },
    completed: { label: t('dashboard_evaluation:completed_status'), colorSchema: 'green.600' }
  };

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:Rename')
  });

  // TODO: 模拟更新任务名称的请求
  const { runAsync: onUpdateTaskName, loading: isUpdating } = useRequest2(
    (taskId: number, newName: string) => {
      // 这里应该是实际的API调用，现在使用模拟
      console.log('更新任务名称:', taskId, newName);
      return Promise.resolve();
    },
    {
      successToast: t('common:update_success')
    }
  );

  // 渲染评测结果
  const renderEvaluationResult = (task: EvaluationTask) => {
    if (task.status === 'running') {
      return <Box color={'myGray.600'}>{t('dashboard_evaluation:evaluating_status')}</Box>;
    }

    if (task.status === 'pending') {
      return <Box color={'myGray.600'}>{t('dashboard_evaluation:waiting')}</Box>;
    }

    if (task.status === 'completed' && task.evaluationResult) {
      const { evaluationResult } = task;

      if (
        evaluationResult.type === 'comprehensive' &&
        evaluationResult.comprehensiveScore !== undefined
      ) {
        // 综合评分显示
        return (
          <Box color={'myGray.900'} fontWeight={'500'}>
            {evaluationResult.comprehensiveScore}
          </Box>
        );
      }

      if (evaluationResult.type === 'dimensions' && evaluationResult.dimensions) {
        // 维度评分显示
        return (
          <Box>
            {evaluationResult.dimensions.map((dimension, index) => (
              <Box
                key={index}
                color={'myGray.900'}
                mb={index < evaluationResult.dimensions!.length - 1 ? 1 : 0}
              >
                <Box as="span" fontWeight={'500'}>
                  {dimension.score}
                </Box>
                <Box as="span" color={'myGray.600'} ml={1}>
                  ({dimension.name})
                </Box>
              </Box>
            ))}
          </Box>
        );
      }
    }

    return <Box color={'myGray.600'}>-</Box>;
  };

  const handleDeleteTask = (taskId: number) => {
    console.log('删除任务:', taskId);
  };

  const handleRenameTask = (task: EvaluationTask) => {
    onOpenEditTitleModal({
      defaultVal: task.name,
      onSuccess: async (newName) => {
        await onUpdateTaskName(task.id, newName);
        fetchData(); // 重新获取数据
      }
    });
  };

  const handleRetryErrorData = (taskId: number) => {
    console.log('重试异常数据:', taskId);
    // TODO: 实现重试异常数据的API调用
  };

  const handleCreateNewTask = () => {
    setIsCreateModalOpen(true);
  };

  const handleTemplateConfirm = (template: string) => {
    console.log('选择的模板:', template);
    // TODO: 根据选择的模板创建新任务
  };

  // 处理配置参数确认
  const handleConfigParamsConfirm = (config: any) => {
    console.log('配置参数:', config);
    // TODO: 根据配置参数创建新任务
    setIsConfigParamsModalOpen(false);
  };

  // 处理创建任务确认
  const handleCreateTaskConfirm = (data: any) => {
    console.log('创建任务:', data);
    // TODO: 根据表单数据创建新任务
    fetchData(); // 重新获取数据
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

      <MyBox flex={'1 0 0'} h={0}>
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
                  key={task.id}
                  _hover={{ bg: 'myGray.100' }}
                  cursor={'pointer'}
                  onClick={() => {
                    router.push({
                      pathname: '/dashboard/evaluation/task/detail',
                      query: {
                        taskId: task.id
                      }
                    });
                  }}
                >
                  <Td>{task.name}</Td>
                  <Td>
                    {task.status === 'running' &&
                    task.completedCount !== undefined &&
                    task.totalCount !== undefined ? (
                      <HStack spacing={1}>
                        <Box>
                          <Box as="span" color={'myGray.900'}>
                            {task.completedCount}
                          </Box>
                          <Box as="span" color={'myGray.600'}>
                            /{task.totalCount}
                          </Box>
                        </Box>
                        {task.errorCount && task.errorCount > 0 && (
                          <MyTooltip
                            label={t('dashboard_evaluation:error_data_tooltip', {
                              count: task.errorCount
                            })}
                          >
                            <MyIcon name={'common/error'} w={'14px'} color={'red.600'} />
                          </MyTooltip>
                        )}
                      </HStack>
                    ) : (
                      <Box color={statusMap[task.status]?.colorSchema as any}>
                        {statusMap[task.status]?.label}
                      </Box>
                    )}
                  </Td>
                  <Td>
                    <HStack>
                      <Avatar src={task.app.avatar} borderRadius={'sm'} w={'1.5rem'} />
                      <Box flex={'1 0 0'}>{task.app.name}</Box>
                    </HStack>
                  </Td>
                  <Td>{task.version}</Td>
                  <Td>{renderEvaluationResult(task)}</Td>
                  <Td color={'myGray.900'}>
                    <Box>{format(new Date(task.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                    <Box>
                      {task.finishTime
                        ? format(new Date(task.finishTime), 'yyyy-MM-dd HH:mm:ss')
                        : '-'}
                    </Box>
                  </Td>
                  <Td>
                    <UserBox
                      sourceMember={{
                        avatar: task.executor.avatar,
                        name: task.executor.name,
                        status: 'active'
                      }}
                      fontSize="sm"
                      spacing={1}
                    />
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <MyMenu
                      menuList={[
                        {
                          label: '',
                          children: [
                            ...(task.errorCount && task.errorCount > 0
                              ? [
                                  {
                                    icon: 'common/retryLight',
                                    label: t('dashboard_evaluation:retry_error_data'),
                                    onClick: () => handleRetryErrorData(task.id)
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
                                    await handleDeleteTask(task.id);
                                    fetchData(); // 删除后重新获取数据
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
      <CitationTemplate
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onConfirm={handleTemplateConfirm}
      />
      <ConfigParamsModal
        isOpen={isConfigParamsModalOpen}
        onClose={() => setIsConfigParamsModalOpen(false)}
        onConfirm={handleConfigParamsConfirm}
      />
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
