import React, { useState, useMemo } from 'react';
import {
  Box,
  Flex,
  HStack,
  Button,
  Text,
  IconButton,
  VStack,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { EvaluationStatus, evaluationStatusMap } from './const';
import {
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import EvaluationStatusSelect from './StatusSelect';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import DataListModals from './DataListModals';
import { DataListProvider, useDataListContext } from './DataListContext';
import {
  getEvaluationDatasetDataList,
  deleteEvaluationDatasetData
} from '@/web/core/evaluation/dataset';

// 内部组件，使用 Context
const DataListContent = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [searchKey, setSearchKey] = useState('');
  const [status, setStatus] = useState<EvaluationStatus>(EvaluationStatus.All);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const {
    selectedItem,
    setSelectedItem,
    deleteConfirmItem,
    setDeleteConfirmItem,
    onEditModalOpen,
    onQualityEvaluationModalOpen,
    onIntelligentGenerationModalOpen,
    onManualAddModalOpen,
    onSettingsModalOpen,
    setEvaluationDataList,
    collectionId
  } = useDataListContext();

  const collectionName = router.query.collectionName as string;

  // 删除数据的请求
  const { runAsync: onDeleteData, loading: isDeleting } = useRequest2(deleteEvaluationDatasetData, {
    successToast: t('common:delete_success')
  });

  const scrollParams = useMemo(
    () => ({
      searchKey: searchKey || '',
      status: status === EvaluationStatus.All ? '' : status,
      collectionId
    }),
    [searchKey, status, collectionId]
  );

  const EmptyTipDom = useMemo(() => <EmptyTip text={t('dashboard_evaluation:no_data')} />, [t]);

  const {
    data: evaluationDataList,
    ScrollData,
    total,
    refreshList
  } = useScrollPagination(getEvaluationDatasetDataList, {
    pageSize: 15,
    params: scrollParams,
    refreshDeps: [searchKey, status, collectionId], // 添加collectionId作为依赖
    EmptyTip: EmptyTipDom
  });

  // 同步数据到 Context，供弹窗组件使用
  React.useEffect(() => {
    setEvaluationDataList(evaluationDataList);
  }, [evaluationDataList, setEvaluationDataList]);

  // 获取状态标签颜色
  const getStatusColor = (qualityStatus: string, qualityResult?: string) => {
    // 如果有质量结果，优先显示质量结果的颜色
    if (qualityResult) {
      switch (qualityResult) {
        case EvalDatasetDataQualityResultEnum.highQuality:
          return 'green';
        case EvalDatasetDataQualityResultEnum.needsOptimization:
          return 'yellow';
        default:
          return 'gray';
      }
    }

    // 否则根据质量状态显示颜色
    switch (qualityStatus) {
      case EvalDatasetDataQualityStatusEnum.completed:
        return 'green';
      case EvalDatasetDataQualityStatusEnum.evaluating:
        return 'blue';
      case EvalDatasetDataQualityStatusEnum.queuing:
        return 'gray';
      case EvalDatasetDataQualityStatusEnum.error:
        return 'red';
      case EvalDatasetDataQualityStatusEnum.unevaluated:
        return 'gray';
      default:
        return 'gray';
    }
  };

  const renderStatusTag = (item: any) => {
    const qualityStatus = item.qualityMetadata?.status;
    const qualityResult = item.qualityResult;

    if (!qualityStatus) return '';

    // 确定要显示的状态和文本
    let displayStatus: string;
    let statusText: string;

    if (qualityResult && qualityStatus === EvalDatasetDataQualityStatusEnum.completed) {
      // 如果有质量结果且评估已完成，显示质量结果
      displayStatus = qualityResult;
      if (qualityResult === EvalDatasetDataQualityResultEnum.highQuality) {
        statusText = t(evaluationStatusMap[EvaluationStatus.HighQuality]);
      } else if (qualityResult === EvalDatasetDataQualityResultEnum.needsOptimization) {
        statusText = t(evaluationStatusMap[EvaluationStatus.NeedsImprovement]);
      } else {
        statusText = qualityResult;
      }
    } else {
      // 否则显示质量状态
      displayStatus = qualityStatus;
      switch (qualityStatus) {
        case EvalDatasetDataQualityStatusEnum.unevaluated:
          statusText = t(evaluationStatusMap[EvaluationStatus.NotEvaluated]);
          break;
        case EvalDatasetDataQualityStatusEnum.queuing:
          statusText = t(evaluationStatusMap[EvaluationStatus.Queuing]);
          break;
        case EvalDatasetDataQualityStatusEnum.evaluating:
          statusText = t(evaluationStatusMap[EvaluationStatus.Evaluating]);
          break;
        case EvalDatasetDataQualityStatusEnum.error:
          statusText = t(evaluationStatusMap[EvaluationStatus.Abnormal]);
          break;
        case EvalDatasetDataQualityStatusEnum.completed:
          statusText = t('dashboard_evaluation:completed');
          break;
        default:
          statusText = qualityStatus;
      }
    }

    return (
      <Box>
        <MyTag
          colorSchema={getStatusColor(qualityStatus, qualityResult)}
          type={'fill'}
          mx={6}
          fontWeight={500}
        >
          {statusText}
        </MyTag>
      </Box>
    );
  };

  // 获取卡片样式
  const getCardStyles = (itemId: string) => {
    const isHovered = hoveredItem === itemId;
    return {
      border: '1px solid',
      borderColor: isHovered ? 'primary.600' : 'transparent',
      borderBottomColor: isHovered ? 'primary.600' : 'gray.200',
      shadow: isHovered ? 'sm' : 'none',
      borderRadius: isHovered ? '8px' : '0',
      p: 4,
      bg: 'white',
      cursor: 'pointer',
      transition: 'all 0.2s'
    };
  };

  // 处理数据项点击
  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    onEditModalOpen();
  };

  // 处理追加数据菜单项点击
  const handleAddDataMenuClick = (type: 'ai' | 'file' | 'manual') => {
    switch (type) {
      case 'ai':
        onIntelligentGenerationModalOpen();
        break;
      case 'file':
        router.push(
          `/dashboard/evaluation/dataset/fileImport?collectionId=${collectionId}&collectionName=${collectionName}&scene=evaluationDatasetDetail`
        );
        break;
      case 'manual':
        onManualAddModalOpen();
        break;
    }
  };

  // 处理删除点击
  const handleDeleteClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    setDeleteConfirmItem(itemId);
  };

  // 处理删除确认
  const handleDeleteConfirmClick = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    await onDeleteData({ dataId: itemId });
    setDeleteConfirmItem(null);
    refreshList();
  };

  return (
    <MyBox h={'100%'} py={[2, 4]} overflow={'hidden'}>
      <Flex flexDirection={'column'} py={[1, 0]} h={'100%'} px={[2, 6]}>
        {/* Header */}
        <MyBox display={['block', 'flex']} alignItems={'center'} gap={2}>
          <HStack flex={1} spacing={4}>
            <Box flex={1} fontWeight={'500'} color={'myGray.900'} whiteSpace={'nowrap'}>
              <Flex align={'center'}>
                <MyIcon name="common/list" mr={2} w={'20px'} color={'black'} />
                {t('dashboard_evaluation:data_list')} ({total})
              </Flex>
            </Box>
            <EvaluationStatusSelect
              value={status}
              w="228px"
              onSelect={(e) => {
                setStatus(e);
              }}
            />
            {/* Search Input */}
            <MyInput
              maxW={'250px'}
              flex={1}
              size={'sm'}
              h={'36px'}
              placeholder={t('common:Search') || ''}
              value={searchKey}
              leftIcon={
                <MyIcon
                  name="common/searchLight"
                  position={'absolute'}
                  w={'16px'}
                  color={'myGray.500'}
                />
              }
              onChange={(e) => {
                setSearchKey(e.target.value);
              }}
            />

            {/* Action Buttons */}
            <HStack>
              <Button size={'sm'} variant={'whitePrimary'} onClick={onSettingsModalOpen}>
                {t('dashboard_evaluation:settings')}
              </Button>
              <Button size={'sm'} variant={'whitePrimary'} onClick={onQualityEvaluationModalOpen}>
                {t('dashboard_evaluation:quality_evaluation')}
              </Button>
              <MyMenu
                Button={
                  <Button
                    size={'sm'}
                    colorScheme={'primary.600'}
                    leftIcon={
                      <MyIcon
                        name={'common/addLight'}
                        w={'18px'}
                        color={'white'}
                        bg={'primary.600'}
                      />
                    }
                  >
                    {t('dashboard_evaluation:add_data')}
                  </Button>
                }
                menuList={[
                  {
                    children: [
                      {
                        label: t('dashboard_evaluation:ai_generate'),
                        icon: 'core/app/aiLight',
                        onClick: () => handleAddDataMenuClick('ai')
                      },
                      {
                        label: t('dashboard_evaluation:file_import'),
                        icon: 'core/dataset/tableCollection',
                        onClick: () => handleAddDataMenuClick('file')
                      },
                      {
                        label: t('dashboard_evaluation:manual_add'),
                        icon: 'common/addLight',
                        onClick: () => handleAddDataMenuClick('manual')
                      }
                    ]
                  }
                ]}
              />
            </HStack>
          </HStack>
        </MyBox>

        {/* Data Cards */}
        <ScrollData mt={3} flex={'1 0 0'} h={0}>
          <VStack spacing={3} align={'stretch'}>
            {evaluationDataList.map((item) => (
              <Box
                key={item._id}
                {...getCardStyles(item._id)}
                onMouseEnter={() => setHoveredItem(item._id)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => handleItemClick(item)}
              >
                <HStack justify="space-between" align="center" spacing={4}>
                  <Text fontSize="14px" color="gray.500" fontWeight="medium" minW="20px">
                    {String(evaluationDataList.indexOf(item) + 1).padStart(2, '0')}
                  </Text>
                  <Flex flexDirection="column" align="flex-start" flex={1}>
                    <Text fontSize="14px" fontWeight="medium" color="myGray.900" mb={1} flex={1}>
                      {item.userInput}
                    </Text>
                    <Box>
                      <Text fontSize="14px" color="gray.600">
                        {item.expectedOutput || t('dashboard_evaluation:no_answer')}
                      </Text>
                    </Box>
                  </Flex>

                  {renderStatusTag(item)}
                  <Popover
                    isOpen={deleteConfirmItem === item._id}
                    onClose={() => setDeleteConfirmItem(null)}
                    placement="left"
                    closeOnBlur={true}
                  >
                    <PopoverTrigger>
                      <IconButton
                        aria-label={t('dashboard_evaluation:delete')}
                        icon={<MyIcon name={'delete'} w={'14px'} />}
                        size="sm"
                        variant="outline"
                        color={hoveredItem === item._id ? 'myGray.900' : 'transparent'}
                        opacity={hoveredItem === item._id ? 1 : 0}
                        visibility={hoveredItem === item._id ? 'visible' : 'hidden'}
                        transition="all 0.2s"
                        _hover={{ color: 'red.500' }}
                        minW="32px"
                        ml={22.5}
                        w="32px"
                        onClick={(e) => handleDeleteClick(e, item._id)}
                      />
                    </PopoverTrigger>
                    <PopoverContent w="318px" onClick={(e) => e.stopPropagation()}>
                      <PopoverArrow />
                      <PopoverBody p={3}>
                        <VStack spacing={3} align="stretch">
                          <HStack spacing={2}>
                            <MyIcon name="common/warn" w={'24px'} h={'24px'}></MyIcon>
                            <Text fontSize="14px" fontWeight="medium">
                              {t('dashboard_evaluation:confirm_delete_data')}
                            </Text>
                          </HStack>
                          <HStack spacing={2} justify="flex-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmItem(null);
                              }}
                            >
                              {t('dashboard_evaluation:cancel')}
                            </Button>
                            <Button
                              size="sm"
                              colorScheme="red"
                              variant="solid"
                              isLoading={isDeleting}
                              onClick={(e) => handleDeleteConfirmClick(e, item._id)}
                            >
                              {t('dashboard_evaluation:delete')}
                            </Button>
                          </HStack>
                        </VStack>
                      </PopoverBody>
                    </PopoverContent>
                  </Popover>
                </HStack>
              </Box>
            ))}
          </VStack>
        </ScrollData>
      </Flex>

      {/* 所有弹窗组件 */}
      <DataListModals total={total} refreshList={refreshList} />
    </MyBox>
  );
};

// 主组件，只提供 Context
const DataList = ({ collectionId }: { collectionId: string }) => {
  return (
    <DataListProvider collectionId={collectionId}>
      <DataListContent />
    </DataListProvider>
  );
};

export default React.memo(DataList);
