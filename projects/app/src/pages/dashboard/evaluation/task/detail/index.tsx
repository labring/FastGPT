'use client';
import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  HStack,
  Button,
  IconButton,
  Textarea,
  Switch,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  useDisclosure,
  Link
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import {
  TaskPageContext,
  TaskPageContextProvider
} from '@/web/core/evaluation/context/taskPageContext';
import { useContextSelector } from 'use-context-selector';
import NextHead from '@/components/common/NextHead';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import NavBar, {
  TabEnum,
  getTabFilterParams
} from '@/pageComponents/dashboard/evaluation/task/detail/NavBar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useForm } from 'react-hook-form';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import ScoreBar from '@/pageComponents/dashboard/evaluation/task/detail/ScoreBar';
import ScoreDashboard from '@/pageComponents/dashboard/evaluation/task/detail/ScoreDashboard';
import GradientBorderBox from '@/pageComponents/dashboard/evaluation/task/detail/GradientBorderBox';
import EvaluationSummaryCard from '@/pageComponents/dashboard/evaluation/task/detail/EvaluationSummaryCard';
import BasicInfo from '@/pageComponents/dashboard/evaluation/task/detail/BasicInfo';
import ConfigParams from '@/pageComponents/dashboard/evaluation/task/detail/ConfigParams';
import DetailedResponseModal from '@/pageComponents/dashboard/evaluation/task/detail/DetailedResponseModal';
import MyBox from '@fastgpt/web/components/common/MyBox';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getEvaluationItemList } from '@/web/core/evaluation/task';
import {
  BUILTIN_DIMENSION_MAP,
  getBuiltinDimensionInfo,
  formatScoreToPercentage
} from '@/web/core/evaluation/utils';
import {
  EvaluationStatusEnum,
  EvaluationStatusMap
} from '@fastgpt/global/core/evaluation/constants';
import { MetricResultStatusEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';

type Props = { taskId: string; currentTab: TabEnum };

const Detail = ({ taskId, currentTab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  // 从 Context 获取数据和方法
  const taskDetail = useContextSelector(TaskPageContext, (v) => v.taskDetail);
  const loadTaskDetail = useContextSelector(TaskPageContext, (v) => v.loadTaskDetail);
  const statsData = useContextSelector(TaskPageContext, (v) => v.statsData);
  const summaryData = useContextSelector(TaskPageContext, (v) => v.summaryData);
  const evaluationDetail = useContextSelector(TaskPageContext, (v) => v.evaluationDetail);
  const loading = useContextSelector(TaskPageContext, (v) => v.loading);
  const searchValue = useContextSelector(TaskPageContext, (v) => v.searchValue);
  const setSearchValue = useContextSelector(TaskPageContext, (v) => v.setSearchValue);
  const loadAllData = useContextSelector(TaskPageContext, (v) => v.loadAllData);
  const deleteItem = useContextSelector(TaskPageContext, (v) => v.deleteItem);
  const retryItem = useContextSelector(TaskPageContext, (v) => v.retryItem);
  const updateItem = useContextSelector(TaskPageContext, (v) => v.updateItem);
  const retryFailedItems = useContextSelector(TaskPageContext, (v) => v.retryFailedItems);
  const exportItems = useContextSelector(TaskPageContext, (v) => v.exportItems);
  const generateSummary = useContextSelector(TaskPageContext, (v) => v.generateSummary);

  // 本地状态（UI 相关）
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [modifyDataset, setModifyDataset] = useState(true);
  const [selectedDimension, setSelectedDimension] = useState(0);
  const {
    isOpen: isSavePopoverOpen,
    onOpen: onSavePopoverOpen,
    onClose: onSavePopoverClose
  } = useDisclosure();
  const {
    isOpen: isConfigParamsOpen,
    onOpen: onConfigParamsOpen,
    onClose: onConfigParamsClose
  } = useDisclosure();
  const {
    isOpen: isDetailedResponseOpen,
    onOpen: onDetailedResponseOpen,
    onClose: onDetailedResponseClose
  } = useDisclosure();

  // 判断是否处于排队中或评测中状态
  const isQueuingOrEvaluating = useMemo(() => {
    if (!evaluationDetail?.status) return false;

    return (
      evaluationDetail.status === EvaluationStatusEnum.queuing ||
      evaluationDetail.status === EvaluationStatusEnum.evaluating
    );
  }, [evaluationDetail]);

  // 判断是否全部数据执行异常
  const isAllDataFailed = useMemo(() => {
    if (!evaluationDetail?.status || !statsData) return false;

    return (
      evaluationDetail.status === EvaluationStatusEnum.error && statsData.error === statsData.total
    );
  }, [evaluationDetail, statsData]);

  // 判断是否为正常完成状态
  const isNormalCompleted = useMemo(() => {
    if (!evaluationDetail?.status) return false;

    return (
      evaluationDetail.status === EvaluationStatusEnum.completed ||
      (evaluationDetail.status === EvaluationStatusEnum.error && !isAllDataFailed)
    );
  }, [evaluationDetail, isAllDataFailed]);

  // 初始化数据加载
  useRequest2(
    async () => {
      const taskDetailData = await loadTaskDetail(taskId);
      await loadAllData(taskDetailData);
    },
    {
      onError(err: any) {
        router.replace(`/dashboard/evaluation/task/list`);
        toast({
          title: t(getErrText(err, t('common:load_failed')) as any),
          status: 'error'
        });
      },
      manual: false
    }
  );

  // 滚动分页参数
  const scrollParams = useMemo(
    () => ({
      evalId: taskId,
      ...(searchValue && { [EvalDatasetDataKeyEnum.UserInput]: searchValue }),
      ...getTabFilterParams(currentTab)
    }),
    [taskId, searchValue, currentTab]
  );

  // 空状态提示组件
  const EmptyTipDom = useMemo(() => <EmptyTip text={t('暂无数据')} />, [t]);

  // 使用滚动分页获取评估项列表
  const {
    data: evaluationItems,
    ScrollData,
    total: totalItems,
    refreshList: refreshEvaluationItems,
    setData: setEvaluationItems
  } = useScrollPagination(getEvaluationItemList, {
    pageSize: 20,
    params: scrollParams,
    refreshDeps: [searchValue, taskId, currentTab],
    EmptyTip: EmptyTipDom
  });

  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      // 重置选中项索引
      setSelectedIndex(0);
      // 重置编辑状态
      setEditing(false);
    },
    [setSearchValue]
  );

  // 计算序号格式
  const getItemNumber = useCallback(
    (index: number) => {
      const itemNumber = index + 1;
      if (totalItems < 100) {
        return itemNumber < 10 ? `0${itemNumber}` : `${itemNumber}`;
      } else {
        return itemNumber < 10
          ? `00${itemNumber}`
          : itemNumber < 100
            ? `0${itemNumber}`
            : `${itemNumber}`;
      }
    },
    [totalItems]
  );

  // 动态计算表头
  const tableHeaders = useMemo(() => {
    if (evaluationItems.length === 0) return [];

    const firstItem = evaluationItems[0];
    const evaluators = firstItem.evaluators || [];

    const headers = [{ key: 'question', label: t('问题'), flex: 3 }];

    if (evaluators.length < 3) {
      // 小于3个维度，显示每个维度名称
      evaluators.forEach((evaluator, index) => {
        // 查找是否有匹配的内置维度信息
        const matchedDimension =
          BUILTIN_DIMENSION_MAP[evaluator.metric.name as keyof typeof BUILTIN_DIMENSION_MAP];
        const displayName = matchedDimension ? t(matchedDimension.name) : evaluator.metric.name;

        headers.push({
          key: `metric_${index}`,
          label: displayName,
          flex: 1
        });
      });
    } else {
      // 大于等于3个维度，只显示综合评分
      headers.push({
        key: 'totalScore',
        label: t('综合评分'),
        flex: 1
      });
    }

    return headers;
  }, [evaluationItems, t]);

  // 获取当前选中项的详细信息
  const selectedItem = useMemo(() => {
    return evaluationItems[selectedIndex] || null;
  }, [evaluationItems, selectedIndex]);

  // 根据选中项的 evaluatorOutputs 动态生成评测维度数据
  const evaluationDimensions = useMemo(() => {
    if (
      !selectedItem ||
      selectedItem.status !== EvaluationStatusEnum.completed ||
      !selectedItem.evaluatorOutputs
    ) {
      return [];
    }

    return selectedItem.evaluatorOutputs.map((output, index) => {
      // 查找是否有匹配的内置维度信息
      const builtinInfo = getBuiltinDimensionInfo(output.metricName);
      const displayName = builtinInfo ? t(builtinInfo.name) : output.metricName;

      // 从对应序号的 evaluators 中获取阈值
      const evaluator = selectedItem.evaluators?.[index];
      const threshold = evaluator?.thresholdValue || 0.8; // 默认阈值为 0.8

      return {
        name: displayName,
        score: formatScoreToPercentage(output.data?.score || 0),
        threshold: formatScoreToPercentage(threshold),
        description: output.data?.reason || '-'
      };
    });
  }, [selectedItem, t]);

  // 获取错误信息列表
  const errorMessages = useMemo(() => {
    if (!selectedItem || selectedItem.status !== EvaluationStatusEnum.error) {
      return [];
    }

    const messages: string[] = [];

    // 优先取 evaluatorOutputs 下的 data.reason，但需要 status 为 Failed
    if (selectedItem.evaluatorOutputs && selectedItem.evaluatorOutputs.length > 0) {
      selectedItem.evaluatorOutputs.forEach((output) => {
        if (output.status === MetricResultStatusEnum.Failed && output.data?.reason) {
          messages.push(output.data.reason);
        }
      });
    }

    // 如果没有找到任何 reason，则取外层的 errorMessage 作为兜底
    if (messages.length === 0 && selectedItem.errorMessage) {
      messages.push(selectedItem.errorMessage);
    }

    return messages;
  }, [selectedItem]);

  const { register, handleSubmit, reset, setValue } = useForm();

  // 添加一个重置表单的函数
  const resetForm = useCallback(() => {
    reset();
  }, [reset]);

  const handleEdit = useCallback(() => {
    // 重置表单并设置当前选中项的值
    if (selectedItem) {
      reset({
        question: selectedItem.dataItem.userInput,
        expectedResponse: selectedItem.dataItem.expectedOutput
      });
    }
    setEditing(true);
  }, [selectedItem, reset]);

  const handleSave = useCallback(
    async (data: any) => {
      if (!selectedItem) {
        toast({
          title: t('请先选择要编辑的数据项'),
          status: 'warning'
        });
        return;
      }

      try {
        const updateData = {
          evalItemId: selectedItem._id,
          [EvalDatasetDataKeyEnum.UserInput]: data.question,
          [EvalDatasetDataKeyEnum.ExpectedOutput]: data.expectedResponse,
          modifyDataset: modifyDataset
        };

        await updateItem(selectedItem._id, updateData);
        // 刷新列表数据
        await refreshEvaluationItems();
        setEditing(false);
        onSavePopoverClose();
      } catch (error: any) {
        // 错误处理已在 Context 中完成
        console.error('保存失败:', error);
      }
    },
    [selectedItem, modifyDataset, toast, t, onSavePopoverClose, updateItem, refreshEvaluationItems]
  );

  const handleRefresh = useCallback(async () => {
    if (!selectedItem) {
      toast({
        title: t('请先选择要重试的数据项'),
        status: 'warning'
      });
      return;
    }

    try {
      await retryItem(selectedItem._id);
      // 刷新列表数据
      await refreshEvaluationItems();
    } catch (error: any) {
      // 错误处理已在 Context 中完成
      console.error('重试失败:', error);
    }
  }, [selectedItem, toast, t, retryItem, refreshEvaluationItems]);

  const handleDelete = useCallback(async () => {
    if (!selectedItem) {
      toast({
        title: t('请先选择要删除的数据项'),
        status: 'warning'
      });
      return;
    }

    try {
      await deleteItem(selectedItem._id);

      // 刷新列表数据
      await refreshEvaluationItems();

      // 调整选中索引：选择下一个项目，如果是最后一项则选择新列表的最后一项
      const currentItemIndex = selectedIndex;
      const newSelectedIndex =
        currentItemIndex < evaluationItems.length - 1
          ? currentItemIndex // 选择下一个项目（当前索引保持不变，因为删除后后面的项目会前移）
          : Math.max(0, evaluationItems.length - 2); // 如果是最后一项，选择删除后列表的最后一项

      setSelectedIndex(newSelectedIndex);

      // 重置编辑状态
      setEditing(false);
      resetForm();
    } catch (error: any) {
      // 错误处理已在 Context 中完成
      console.error('删除失败:', error);
    }
  }, [
    selectedItem,
    evaluationItems,
    selectedIndex,
    toast,
    t,
    resetForm,
    deleteItem,
    refreshEvaluationItems
  ]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    // 取消时重置表单
    resetForm();
  }, [resetForm]);

  // 导出数据处理函数
  const handleExport = useCallback(async () => {
    try {
      await exportItems('csv');
    } catch (error: any) {
      // 错误处理已在 Context 中完成
      console.error('导出失败:', error);
    }
  }, [exportItems]);

  // 重试失败项处理函数
  const handleRetryFailed = useCallback(async () => {
    try {
      await retryFailedItems();
    } catch (error: any) {
      // 错误处理已在 Context 中完成
      console.error('重试失败:', error);
    }
  }, [retryFailedItems]);

  // 刷新评分处理函数
  const handleRefreshScore = useCallback(async () => {
    try {
      await generateSummary();
    } catch (error: any) {
      // 错误处理已在 Context 中完成
      console.error('刷新评分失败:', error);
    }
  }, [generateSummary]);

  // 设置评分处理函数
  const handleScoreSettings = useCallback(() => {
    onConfigParamsOpen();
  }, [onConfigParamsOpen]);

  // 查看完整响应处理函数
  const handleViewFullResponse = useCallback(() => {
    if (!selectedItem) {
      toast({
        title: t('请先选择要查看的数据项'),
        status: 'warning'
      });
      return;
    }

    // 检查是否有必要的数据
    if (!selectedItem.targetOutput?.aiChatItemDataId) {
      toast({
        title: t('该数据项暂无完整响应数据'),
        status: 'warning'
      });
      return;
    }

    onDetailedResponseOpen();
  }, [selectedItem, toast, t, onDetailedResponseOpen]);

  // 处理配置参数确认
  const handleConfigParamsConfirm = useCallback(() => {
    // 配置保存成功后刷新相关数据
    loadAllData(taskDetail);
  }, [loadAllData, taskDetail]);

  return (
    <>
      <NextHead title={taskDetail?.name} />

      <Flex h={'100%'} py={3} pl={1} pr={3} gap={2}>
        {/* 左侧主内容区域 */}
        <Flex flex={1} w={0} bg={'white'} flexDir={'column'} boxShadow={'2'} borderRadius={'md'}>
          {/* 顶部 NavBar */}
          <NavBar
            currentTab={currentTab}
            statsData={statsData}
            onExport={handleExport}
            onRetryFailed={handleRetryFailed}
          />

          {/* 数据和详情的水平布局 */}
          <Flex flex={1} h={0}>
            {/* 数据区域 - 占 4/10 */}
            <Flex w={'40%'} flexDir={'column'} borderRight={'1px solid'} borderColor={'myGray.200'}>
              {/* 数据区域头部 */}
              <Flex
                alignItems={'center'}
                justifyContent={'space-between'}
                px={6}
                h={16}
                borderBottom={'1px solid'}
                borderColor={'myGray.200'}
              >
                <Flex gap={2}>
                  <MyIcon name={'common/list'} w={5} color={'primary.600'} />
                  <Box fontSize={14} color={'myGray.900'} fontWeight={'medium'}>
                    {t('数据（{{data}}）', {
                      data: statsData
                        ? statsData.completed !== statsData.total
                          ? `${statsData.completed}/${statsData.total}`
                          : statsData.total
                        : 0
                    })}
                  </Box>
                </Flex>

                <InputGroup w={'150px'}>
                  <InputLeftElement>
                    <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} />
                  </InputLeftElement>
                  <Input
                    placeholder={t('搜索')}
                    value={searchValue}
                    onChange={(e) => handleSearch(e.target.value)}
                    bg={'white'}
                  />
                </InputGroup>
              </Flex>

              {/* 数据列表内容区域 */}
              <Box w="full" flex={1} overflow={'hidden'} display="flex" flexDirection="column">
                {/* 表头 - 只在有数据且不在加载中时显示 */}
                {tableHeaders.length > 0 && !loading.items && (
                  <Flex
                    h={10}
                    alignItems={'center'}
                    borderBottom="1px solid"
                    borderColor="myGray.200"
                    fontSize={14}
                    color={'myGray.600'}
                    mx={6}
                    mt={5}
                  >
                    {tableHeaders.map((header, index) => (
                      <Box
                        key={header.key}
                        flex={header.flex}
                        px={4}
                        borderRight={index < tableHeaders.length - 1 ? '1px solid' : 'none'}
                        borderColor={'myGray.200'}
                      >
                        {header.label}
                      </Box>
                    ))}
                  </Flex>
                )}

                {/* 数据列表 - 使用滚动分页组件 */}
                <ScrollData flex={1} px={6}>
                  {evaluationItems.map((item, index) => {
                    const evaluatorOutputs = item.evaluatorOutputs || [];

                    return (
                      <Flex
                        key={item._id}
                        h={'56px'}
                        fontSize={'14px'}
                        border={'1px solid'}
                        borderColor={index === selectedIndex ? 'primary.600' : 'transparent'}
                        borderBottomColor={index !== selectedIndex ? 'myGray.100' : ''}
                        _hover={{ bg: 'primary.50' }}
                        borderRadius={'sm'}
                        cursor={'pointer'}
                        alignItems={'center'}
                        onClick={() => {
                          setSelectedIndex(index);
                          setEditing(false);
                          // 切换选中项时重置表单
                          resetForm();
                        }}
                      >
                        {/* 问题列 */}
                        <Box flex={3} px={4}>
                          <Flex gap={2} alignItems={'center'}>
                            <Box color="myGray.500">{getItemNumber(index)}</Box>
                            <Box noOfLines={2} textOverflow="ellipsis" overflow="hidden">
                              {item.dataItem.userInput}
                            </Box>
                          </Flex>
                        </Box>

                        {/* 动态列 */}
                        {evaluatorOutputs.length === 0 ? (
                          // 当 evaluatorOutputs 为空时，显示外层状态
                          <Box
                            flex={1}
                            px={4}
                            display={'flex'}
                            alignItems={'center'}
                            color={(() => {
                              if (item.status === EvaluationStatusEnum.evaluating) {
                                return 'blue.500';
                              } else if (item.status === EvaluationStatusEnum.error) {
                                return 'red.500';
                              }
                              return 'myGray.600';
                            })()}
                          >
                            {(() => {
                              const statusInfo = EvaluationStatusMap[item.status];
                              return statusInfo ? t(statusInfo.name) : '-';
                            })()}
                          </Box>
                        ) : evaluatorOutputs.length < 3 ? (
                          // 显示每个维度的分数或状态
                          evaluatorOutputs.map((output, outputIndex) => {
                            // 获取显示内容和颜色
                            const getDisplayInfo = () => {
                              if (
                                output.status === MetricResultStatusEnum.Success &&
                                output.data?.score !== undefined
                              ) {
                                // 获取对应序号的评估器阈值
                                const evaluator = item.evaluators?.[outputIndex];
                                const threshold = evaluator?.thresholdValue || 0.8;
                                const score = output.data.score;

                                // 比较得分与阈值，决定颜色
                                const color = score >= threshold ? 'myGray.600' : 'yellow.600';

                                return {
                                  content: formatScoreToPercentage(score),
                                  color: color
                                };
                              }

                              if (output.status === MetricResultStatusEnum.Failed) {
                                return {
                                  content: t('异常'),
                                  color: 'red.500'
                                };
                              }

                              // 使用外层状态
                              const statusInfo = EvaluationStatusMap[item.status];
                              const statusName = statusInfo ? t(statusInfo.name) : '-';

                              let color = 'myGray.600'; // 默认颜色（排队中）
                              if (item.status === EvaluationStatusEnum.evaluating) {
                                color = 'blue.500'; // 评测中为蓝色
                              } else if (item.status === EvaluationStatusEnum.error) {
                                color = 'red.500'; // 异常为红色
                              }

                              return {
                                content: statusName,
                                color: color
                              };
                            };

                            const displayInfo = getDisplayInfo();

                            return (
                              <Box
                                key={outputIndex}
                                flex={1}
                                px={4}
                                display={'flex'}
                                alignItems={'center'}
                                color={displayInfo.color}
                              >
                                {displayInfo.content}
                              </Box>
                            );
                          })
                        ) : (
                          // 显示综合评分或状态（计算加权综合得分）
                          <Box
                            flex={1}
                            px={4}
                            display={'flex'}
                            alignItems={'center'}
                            color={(() => {
                              const hasFailedOutputs = evaluatorOutputs.some(
                                (output) => output.status === MetricResultStatusEnum.Failed
                              );
                              const successOutputs = evaluatorOutputs.filter(
                                (output) =>
                                  output.status === MetricResultStatusEnum.Success &&
                                  output.data?.score !== undefined
                              );

                              if (hasFailedOutputs) {
                                return 'red.500';
                              }

                              if (successOutputs.length > 0) {
                                // 计算综合得分和综合阈值
                                let totalWeightedScore = 0;
                                let totalWeightedThreshold = 0;
                                let totalWeight = 0;

                                evaluatorOutputs.forEach((output, outputIndex) => {
                                  if (
                                    output.status === MetricResultStatusEnum.Success &&
                                    output.data?.score !== undefined
                                  ) {
                                    const evaluator = item.evaluators?.[outputIndex];
                                    const weight = evaluator?.weight || 0;
                                    const score = output.data.score;
                                    const threshold = evaluator?.thresholdValue || 0.8;

                                    totalWeightedScore += (score * weight) / 100;
                                    totalWeightedThreshold += (threshold * weight) / 100;
                                    totalWeight += weight;
                                  }
                                });

                                // 比较综合得分与综合阈值
                                if (totalWeight > 0) {
                                  return totalWeightedScore >= totalWeightedThreshold
                                    ? 'myGray.600'
                                    : 'yellow.600';
                                }

                                return 'myGray.600';
                              }

                              // 使用外层状态确定颜色
                              if (item.status === EvaluationStatusEnum.evaluating) {
                                return 'blue.500';
                              } else if (item.status === EvaluationStatusEnum.error) {
                                return 'red.500';
                              }

                              return 'myGray.600';
                            })()}
                          >
                            {(() => {
                              const successOutputs = evaluatorOutputs.filter(
                                (output) =>
                                  output.status === MetricResultStatusEnum.Success &&
                                  output.data?.score !== undefined
                              );
                              const failedOutputs = evaluatorOutputs.filter(
                                (output) => output.status === MetricResultStatusEnum.Failed
                              );

                              if (failedOutputs.length > 0) {
                                return t('异常');
                              }

                              if (successOutputs.length > 0) {
                                // 计算加权综合得分
                                let totalWeightedScore = 0;
                                let totalWeight = 0;

                                evaluatorOutputs.forEach((output, outputIndex) => {
                                  if (
                                    output.status === MetricResultStatusEnum.Success &&
                                    output.data?.score !== undefined
                                  ) {
                                    const evaluator = item.evaluators?.[outputIndex];
                                    const weight = evaluator?.weight || 0;
                                    const score = output.data.score;

                                    totalWeightedScore += (score * weight) / 100;
                                    totalWeight += weight;
                                  }
                                });

                                if (totalWeight > 0) {
                                  return formatScoreToPercentage(totalWeightedScore);
                                }

                                // 如果没有权重信息，使用平均分作为兜底
                                const totalScore = successOutputs.reduce(
                                  (sum, output) => sum + (output.data?.score || 0),
                                  0
                                );
                                const avgScore = totalScore / successOutputs.length;
                                return formatScoreToPercentage(avgScore);
                              }

                              // 使用外层状态
                              const statusInfo = EvaluationStatusMap[item.status];
                              return statusInfo ? t(statusInfo.name) : '-';
                            })()}
                          </Box>
                        )}
                      </Flex>
                    );
                  })}
                </ScrollData>
              </Box>
            </Flex>

            {/* 详情区域 - 占 6/10 */}
            <Flex w={'60%'} flexDir={'column'}>
              {/* 详情区域头部 */}
              <Flex
                alignItems={'center'}
                justifyContent={'space-between'}
                px={6}
                h={16}
                borderBottom={'1px solid'}
                borderColor={'myGray.200'}
              >
                <Flex gap={2}>
                  <MyIcon name={'common/detail'} w={5} color={'primary.600'} />
                  <Box fontSize={14} color={'myGray.900'} fontWeight={'medium'}>
                    {t('详情')}
                  </Box>
                </Flex>

                <Flex gap={2}>
                  {editing ? (
                    <>
                      <Button fontSize={'sm'} variant={'whiteBase'} onClick={handleCancel}>
                        {t('common:Cancel')}
                      </Button>
                      <Popover
                        isOpen={isSavePopoverOpen}
                        onOpen={onSavePopoverOpen}
                        onClose={onSavePopoverClose}
                        placement="left"
                        closeOnBlur={true}
                        trigger={'click'}
                      >
                        <PopoverTrigger>
                          <Button fontSize={'sm'}>{t('common:Save')}</Button>
                        </PopoverTrigger>
                        <PopoverContent p={4} w="280px">
                          <PopoverArrow />
                          <Flex alignItems="center" gap={4} mb={4}>
                            <Box fontSize="14px" color="myGray.900">
                              {t('同时修改评测数据集')}
                            </Box>
                            <Switch
                              isChecked={modifyDataset}
                              onChange={(e) => setModifyDataset(e.target.checked)}
                              colorScheme="primary"
                            />
                          </Flex>
                          <HStack justifyContent="flex-end" spacing={2}>
                            <Button variant="whiteBase" size="sm" onClick={onSavePopoverClose}>
                              {t('common:Cancel')}
                            </Button>
                            <Button size="sm" onClick={handleSubmit(handleSave)}>
                              {t('common:Confirm')}
                            </Button>
                          </HStack>
                        </PopoverContent>
                      </Popover>
                    </>
                  ) : (
                    <>
                      {/* 根据选中项状态动态显示按钮 */}
                      {selectedItem?.status === EvaluationStatusEnum.error && (
                        <>
                          <IconButton
                            aria-label="refresh"
                            size={'mdSquare'}
                            variant={'whitePrimary'}
                            icon={<MyIcon name={'common/retryLight'} w={4} />}
                            onClick={handleRefresh}
                          />
                          <IconButton
                            aria-label="edit"
                            size={'mdSquare'}
                            variant={'whitePrimary'}
                            icon={<MyIcon name={'edit'} w={4} />}
                            onClick={handleEdit}
                          />
                          <PopoverConfirm
                            content={t('确认在当前任务中删除该数据？')}
                            type="delete"
                            confirmText={t('删除')}
                            onConfirm={handleDelete}
                            Trigger={
                              <IconButton
                                aria-label="delete"
                                size={'mdSquare'}
                                variant={'whiteDanger'}
                                icon={<MyIcon name={'delete'} w={4} />}
                              />
                            }
                          />
                        </>
                      )}

                      {selectedItem?.status === EvaluationStatusEnum.completed && (
                        <>
                          <Button
                            fontSize={'sm'}
                            variant={'whitePrimary'}
                            onClick={handleViewFullResponse}
                          >
                            {t('查看完整响应')}
                          </Button>
                          <PopoverConfirm
                            content={t('确认在当前任务中删除该数据？')}
                            type="delete"
                            confirmText={t('删除')}
                            onConfirm={handleDelete}
                            Trigger={
                              <IconButton
                                aria-label="delete"
                                size={'mdSquare'}
                                variant={'whiteDanger'}
                                icon={<MyIcon name={'delete'} w={4} />}
                              />
                            }
                          />
                        </>
                      )}

                      {/* 排队中或评测中状态不显示任何按钮 */}
                    </>
                  )}
                </Flex>
              </Flex>

              {/* 详情内容区域 */}
              <Box fontSize={'14px'} px={6} py={6} flex={1} overflow={'auto'}>
                {/* 评测维度组件 - 仅在选中项状态为 completed 且有 evaluatorOutputs 时显示 */}
                {selectedItem &&
                  selectedItem.status === EvaluationStatusEnum.completed &&
                  evaluationDimensions.length > 0 && (
                    <Box
                      mb={6}
                      p={4}
                      bg={'rgba(249, 250, 254, 0.4)'}
                      borderRadius={'lg'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                    >
                      <Flex flexWrap={'wrap'} gap={2} mb={4}>
                        {evaluationDimensions.map((dimension, index) => {
                          const isActive = selectedDimension === index;
                          const isAboveThreshold = dimension.score >= dimension.threshold;
                          const bgColor = isAboveThreshold ? 'blue.50' : 'yellow.50';
                          const borderColor = isAboveThreshold ? 'blue.200' : 'yellow.200';
                          const textColor = isAboveThreshold ? 'blue.600' : 'yellow.600';

                          return (
                            <Flex
                              key={index}
                              alignItems={'center'}
                              px={2}
                              h={'24px'}
                              borderRadius={'full'}
                              bg={bgColor}
                              border={'1px solid'}
                              borderColor={isActive ? borderColor : bgColor}
                              color={textColor}
                              fontSize={'sm'}
                              fontWeight={'medium'}
                              cursor={'pointer'}
                              _hover={{
                                bg: isAboveThreshold ? 'blue.100' : 'yellow.100'
                              }}
                              onClick={() => setSelectedDimension(index)}
                            >
                              <Box mr={1}>{dimension.name}</Box>
                              <Box fontWeight={'bold'}>{dimension.score}</Box>
                            </Flex>
                          );
                        })}
                      </Flex>

                      {evaluationDimensions[selectedDimension] && (
                        <Box
                          color={
                            evaluationDimensions[selectedDimension].score >=
                            evaluationDimensions[selectedDimension].threshold
                              ? 'blue.600'
                              : 'yellow.600'
                          }
                          fontSize={'sm'}
                          lineHeight={'1.6'}
                          mt={2}
                        >
                          {evaluationDimensions[selectedDimension].description}
                        </Box>
                      )}
                    </Box>
                  )}

                {/* 根据选中的索引显示对应的详情内容 */}
                {selectedItem && (
                  <>
                    {/* 错误信息显示 */}
                    {errorMessages.length > 0 && (
                      <Box mb={5} p={4} bg={'red.50'} borderRadius={'md'}>
                        <Flex alignItems={'center'} gap={3}>
                          <MyIcon name={'common/errorFill'} w={5} h={5} color={'red.500'} />
                          <Box flex={1}>
                            {errorMessages.map((message, index) => (
                              <Box
                                key={index}
                                color={'red.600'}
                                fontSize={'14px'}
                                lineHeight={'1.5'}
                              >
                                {index + 1}、{message}
                              </Box>
                            ))}
                          </Box>
                        </Flex>
                      </Box>
                    )}

                    <Box borderBottom={'1px solid'} borderColor={'myGray.200'} pb={5}>
                      <Box>{t('问题')}</Box>
                      {editing ? (
                        <Textarea {...register('question')} bg={'myGray.25'} mt={3} />
                      ) : (
                        <Box color={'myGray.900'} mt={3}>
                          {selectedItem.dataItem.userInput}
                        </Box>
                      )}
                    </Box>

                    <Box borderBottom={'1px solid'} borderColor={'myGray.200'} py={5}>
                      <Box>{t('参考答案')}</Box>
                      {editing ? (
                        <Textarea {...register('expectedResponse')} bg={'myGray.25'} mt={3} />
                      ) : (
                        <Box color={'myGray.900'} mt={3}>
                          {selectedItem.dataItem.expectedOutput}
                        </Box>
                      )}
                    </Box>

                    {!editing && (
                      <Box py={5}>
                        <Box>{t('实际回答')}</Box>
                        <Box color={'myGray.900'} mt={3}>
                          {selectedItem.targetOutput?.actualOutput || t('暂无回答')}
                        </Box>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </Flex>
          </Flex>
        </Flex>

        {/* 右侧信息面板 */}
        <MyBox
          bg={'white'}
          borderRadius={'md'}
          overflowY={'auto'}
          boxShadow={2}
          flex={'0 0 17rem'}
          p={4}
          isLoading={loading.summary || loading.detail}
        >
          <Box w={'100%'}>
            {/* 动态标题 */}
            <Flex alignItems={'center'} justifyContent={'space-between'} mb={5}>
              <Flex alignItems={'center'} gap={0.5}>
                <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.900'}>
                  {summaryData?.data && summaryData.data.length >= 3
                    ? t('综合评分')
                    : t('维度评分')}
                </Box>
                {summaryData?.data && summaryData.data.length >= 3 && (
                  <QuestionTip
                    label={t(
                      '按照指定权重计算测试数据全部维度的综合评分，可根据应用使用场景所关注的维度进行设置。'
                    )}
                  />
                )}
                {/* 异常数据提示 */}
                {statsData && statsData.error > 0 && statsData.error < statsData.total && (
                  <MyTooltip
                    label={t('{{count}} 条数据执行异常，仅使用执行成功的数据来计算分数。', {
                      count: statsData.error
                    })}
                  >
                    <MyIcon name={'common/info'} w={4} color={'red.600'} />
                  </MyTooltip>
                )}
              </Flex>

              <Flex>
                {!isQueuingOrEvaluating && (
                  <IconButton
                    aria-label="refresh score"
                    size={'sm'}
                    variant={'grayGhost'}
                    icon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                    onClick={handleRefreshScore}
                  />
                )}
                <IconButton
                  aria-label="score settings"
                  size={'sm'}
                  variant={'grayGhost'}
                  icon={<MyIcon name={'common/settingLight'} w={4} />}
                  onClick={handleScoreSettings}
                />
              </Flex>
            </Flex>

            {/* 根据状态动态渲染内容 */}
            <Box mb={6}>
              {isQueuingOrEvaluating && (
                <GradientBorderBox>
                  <Flex flexDirection={'column'} alignItems={'center'} textAlign={'center'}>
                    {/* 加载动画 */}
                    <MyBox w={'16px'} h={'16px'} mb={3} isLoading={true} size={'sm'} />

                    {/* 状态文本 */}
                    <Box color={'blue.600'} lineHeight={'1.5'} mb={0.5}>
                      {(() => {
                        if (evaluationDetail?.status) {
                          return `${t(EvaluationStatusMap[evaluationDetail.status].name)}...`;
                        }
                        return t('处理中...');
                      })()}
                    </Box>

                    <Box color={'blue.600'} lineHeight={'1.5'}>
                      {t('完成后可查看评测结果')}
                    </Box>
                  </Flex>
                </GradientBorderBox>
              )}

              {isAllDataFailed && (
                <GradientBorderBox display={'flex'} alignItems={'center'} justifyContent={'center'}>
                  <Flex flexDirection={'column'} alignItems={'center'} textAlign={'center'}>
                    <MyIcon name={'core/workflow/runError'} w={5} h={5} mb={4} color={'red.500'} />
                    <Box
                      fontSize={'12px'}
                      color={'red.600'}
                      lineHeight={'1.5'}
                      textAlign={'center'}
                    >
                      <Box>{t('全部数据执行异常，')}</Box>
                      <Box>{t('请查看异常数据中的详细原因，')}</Box>
                      <Link
                        color={'red.600'}
                        textDecoration={'underline'}
                        _hover={{
                          color: 'red.700',
                          cursor: 'pointer'
                        }}
                        onClick={handleRetryFailed}
                        cursor={'pointer'}
                      >
                        {t('点击重试')}
                      </Link>
                    </Box>
                  </Flex>
                </GradientBorderBox>
              )}

              {isNormalCompleted && (
                <>
                  {/* 仪表盘组件 - 只在有综合评分时显示 */}
                  {summaryData?.data &&
                    summaryData.data.length >= 3 &&
                    summaryData?.aggregateScore !== undefined && (
                      <Box mb={5}>
                        <Flex justifyContent={'center'}>
                          {/* TODO: threshold */}
                          <ScoreDashboard
                            threshold={formatScoreToPercentage(0.8)}
                            actualScore={formatScoreToPercentage(summaryData.aggregateScore)}
                          />
                        </Flex>
                      </Box>
                    )}

                  {/* 使用 ScoreBar 组件展示每个维度 */}
                  {summaryData?.data?.map((item, index) => {
                    // 查找是否有匹配的内置维度信息
                    const matchedDimension =
                      BUILTIN_DIMENSION_MAP[item.metricName as keyof typeof BUILTIN_DIMENSION_MAP];
                    const displayName = matchedDimension
                      ? t(matchedDimension.name)
                      : item.metricName;

                    return (
                      <ScoreBar
                        key={index}
                        dimensionName={displayName}
                        threshold={formatScoreToPercentage(item.threshold)}
                        actualScore={formatScoreToPercentage(item.metricScore)}
                      />
                    );
                  })}

                  {/* 使用 EvaluationSummaryCard 组件展示维度总结 */}
                  {summaryData?.data && (
                    <Box mt={4}>
                      <EvaluationSummaryCard data={summaryData.data} />
                    </Box>
                  )}
                </>
              )}
            </Box>

            {/* 分隔线 */}
            <Box h={'1px'} bg={'myGray.200'} mt={4} mb={5} />

            {/* 基本信息 */}
            <BasicInfo evaluationDetail={evaluationDetail} />
          </Box>
        </MyBox>
      </Flex>

      {/* 配置参数弹窗 */}
      {isConfigParamsOpen && (
        <ConfigParams
          isOpen={isConfigParamsOpen}
          onClose={onConfigParamsClose}
          onConfirm={handleConfigParamsConfirm}
          evalTaskId={taskId}
        />
      )}

      {/* 完整响应弹窗 */}
      {isDetailedResponseOpen && selectedItem && (
        <DetailedResponseModal
          isOpen={isDetailedResponseOpen}
          onClose={onDetailedResponseClose}
          chatId={selectedItem.targetOutput?.chatId}
          dataId={selectedItem.targetOutput?.aiChatItemDataId || ''}
          appId={evaluationDetail?.target?.config?.appId || ''}
          chatTime={selectedItem.finishTime ? new Date(selectedItem.finishTime) : new Date()}
        />
      )}
    </>
  );
};

const Render = (data: Props) => (
  <TaskPageContextProvider taskId={data.taskId}>
    <Detail {...data} />
  </TaskPageContextProvider>
);

export default Render;

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.allData;
  const taskId = context?.query?.taskId;

  return {
    props: {
      currentTab,
      taskId,
      ...(await serviceSideProps(context, ['dashboard_evaluation', 'evaluation', 'chat', 'common']))
    }
  };
}
