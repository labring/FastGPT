import React, { useState, useMemo } from 'react';
import {
  Box,
  Flex,
  HStack,
  Button,
  Text,
  IconButton,
  VStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { EvaluationStatus, evaluationStatusMap } from './const';
import EvaluationStatusSelect from './StatusSelect';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import DataListModals from './DataListModals';
import { DataListProvider, useDataListContext, type EvaluationDataItem } from './DataListContext';

// 模拟API函数 - 实际使用时需要替换为真实的API调用
const getEvaluationDataList = async (params: {
  searchText: string;
  statusFilter: string;
  pageNum: number;
  pageSize: number;
}): Promise<{
  list: EvaluationDataItem[];
  total: number;
}> => {
  // 模拟数据
  const mockData: EvaluationDataItem[] = [
    {
      _id: '1',
      index: 1,
      question: '如何修复保障的机组条件检测问题?',
      answer: '见《DLT596自备电站生技规程管理办法》相关条文执行。',
      status: EvaluationStatus.HighQuality
    },
    {
      _id: '2',
      index: 2,
      question: '什么时候需要注册员工工作（微信）卡?',
      answer:
        '集团公司员工请假、离职、转岗、解除劳动合同，请与员工工作（微信）卡进行申请或（销件卡），这样的为员人员在位在岗人，人力资源部门统筹，文档资产管理中心内地条件，需要员工工作（微信）卡进行申请或（销件卡）。',
      status: EvaluationStatus.HighQuality
    },
    {
      _id: '3',
      index: 3,
      question: '办公电脑能否公司可以认证?',
      answer:
        '办公电脑使用时为工作，提到的是更新管理公司设计信息网络配置，我需要此过程的管理是否满足。',
      status: EvaluationStatus.NeedsImprovement
    },
    {
      _id: '4',
      index: 4,
      question: '高出一般业务需求的电脑配置，要记录电脑配置标准是多少钱?',
      answer:
        '按设计、管理化、高清条件的设计规格等级出一般业务需求的计算配置，经验集团公司计算条件标准，新工厂等管理更新问题高质配置，在公司条件配置标准条不超过8000元/台，要记录其他配置标准条不超过8000元/台。',
      status: EvaluationStatus.Evaluating
    },
    {
      _id: '5',
      index: 5,
      question: '自主招生软件自主自由择权是谁?租赁房房源长为?',
      answer:
        '主要是收费类，管理公司享有保障的DT台所开的资金需产生住宅套数60%自主决定招生权为，申请自主招生收费类，集团公司享有保障的DT台所开内容套产生住宅套数40%以出租给合作办公司房屋条件中社会人员的权为，自主招生房源租赁期限为20年，申请自主招生房源条件为3年。',
      status: EvaluationStatus.Evaluating
    },
    {
      _id: '6',
      index: 6,
      question: '如何修复保障的机组条件检测问题?',
      answer: '见《DLT596自备电站生技规程管理办法》相关条文执行。',
      status: EvaluationStatus.NeedsImprovement
    },
    {
      _id: '7',
      index: 7,
      question: '办公电脑能否公司可以认证?',
      answer: '',
      status: EvaluationStatus.NotEvaluated
    },
    {
      _id: '8',
      index: 7,
      question: '1+2 = 4?',
      answer: '哇天才',
      status: EvaluationStatus.Queuing
    }
  ];

  // 模拟异步请求
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 过滤数据
  let filteredData = mockData.filter((item) => {
    const matchSearch =
      !params.searchText ||
      item.question.toLowerCase().includes(params.searchText.toLowerCase()) ||
      item.answer.toLowerCase().includes(params.searchText.toLowerCase());

    const matchStatus =
      params.statusFilter === EvaluationStatus.All || item.status === params.statusFilter;

    return matchSearch && matchStatus;
  });

  // 分页
  const startIndex = (params.pageNum - 1) * params.pageSize;
  const endIndex = startIndex + params.pageSize;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  return {
    list: paginatedData,
    total: filteredData.length
  };
};

// 内部组件，使用 Context
const DataListContent = () => {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(EvaluationStatus.All);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const {
    selectedItem,
    setSelectedItem,
    deleteConfirmItem,
    setDeleteConfirmItem,
    onEditModalOpen,
    onQualityEvaluationModalOpen,
    onIntelligentGenerationModalOpen,
    onSettingsModalOpen,
    handleDeleteConfirm,
    setEvaluationDataList
  } = useDataListContext();

  const scrollParams = useMemo(
    () => ({
      searchText,
      statusFilter
    }),
    [searchText, statusFilter]
  );

  const EmptyTipDom = useMemo(() => <EmptyTip text={t('dashboard_evaluation:no_data')} />, [t]);

  const {
    data: evaluationDataList,
    ScrollData,
    total,
    refreshList
  } = useScrollPagination(getEvaluationDataList, {
    pageSize: 15,
    params: { ...scrollParams, pageNum: 1 },
    refreshDeps: [searchText, statusFilter],
    EmptyTip: EmptyTipDom
  });

  // 同步数据到 Context，供弹窗组件使用
  React.useEffect(() => {
    setEvaluationDataList(evaluationDataList);
  }, [evaluationDataList, setEvaluationDataList]);

  // 获取状态标签颜色
  const getStatusColor = (status: EvaluationStatus) => {
    switch (status) {
      case EvaluationStatus.HighQuality:
        return 'green';
      case EvaluationStatus.NeedsImprovement:
        return 'orange';
      case EvaluationStatus.Abnormal:
        return 'red';
      case EvaluationStatus.Evaluating:
        return 'blue';
      case EvaluationStatus.Queuing:
        return 'purple';
      case EvaluationStatus.NotEvaluated:
        return 'gray';
      default:
        return 'gray';
    }
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

  const [selectedStatus, setSelectedStatus] = useState<EvaluationStatus>(EvaluationStatus.All);

  // 处理数据项点击
  const handleItemClick = (item: EvaluationDataItem) => {
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
        // 这里可以添加文件导入的逻辑
        break;
      case 'manual':
        // 这里可以添加手动新增的逻辑
        break;
    }
  };

  // 处理删除点击
  const handleDeleteClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    setDeleteConfirmItem(itemId);
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
              value={selectedStatus}
              w="228px"
              onSelect={(status) => setSelectedStatus(status)}
            />
            {/* Search Input */}
            <MyInput
              maxW={'250px'}
              flex={1}
              size={'sm'}
              h={'36px'}
              placeholder={t('common:Search') || ''}
              value={searchText}
              leftIcon={
                <MyIcon
                  name="common/searchLight"
                  position={'absolute'}
                  w={'16px'}
                  color={'myGray.500'}
                />
              }
              onChange={(e) => {
                setSearchText(e.target.value);
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
              <Menu>
                <MenuButton
                  as={Button}
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
                </MenuButton>
                <MenuList>
                  <MenuItem
                    icon={<MyIcon name="common/aiOutline" w="16px" h="16px" />}
                    onClick={() => handleAddDataMenuClick('ai')}
                  >
                    {t('dashboard_evaluation:ai_generate')}
                  </MenuItem>
                  <MenuItem
                    icon={<MyIcon name="common/csvOutline" w="16px" h="16px" />}
                    onClick={() => handleAddDataMenuClick('file')}
                  >
                    {t('dashboard_evaluation:file_import')}
                  </MenuItem>
                  <MenuItem
                    icon={<MyIcon name={'common/addLight'} w={'16px'} />}
                    onClick={() => handleAddDataMenuClick('manual')}
                  >
                    {t('dashboard_evaluation:manual_add')}
                  </MenuItem>
                </MenuList>
              </Menu>
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
                    {String(item.index).padStart(2, '0')}
                  </Text>
                  <Flex flexDirection="column" align="flex-start" flex={1}>
                    <Text fontSize="14px" fontWeight="medium" color="myGray.900" mb={1} flex={1}>
                      {item.question}
                    </Text>
                    <Box>
                      <Text fontSize="14px" color="gray.600">
                        {item.answer || t('dashboard_evaluation:no_answer')}
                      </Text>
                    </Box>
                  </Flex>
                  <Box>
                    <MyTag
                      colorSchema={getStatusColor(item.status)}
                      type={'fill'}
                      mx={6}
                      fontWeight={500}
                      showDot={item.status === EvaluationStatus.Evaluating}
                    >
                      {t(evaluationStatusMap[item.status])}
                    </MyTag>
                  </Box>
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
                              bg="red.600"
                              onClick={(e) => {
                                e.stopPropagation();
                                // handleDeleteConfirm(item._id);
                              }}
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
      <DataListModals total={total} />
    </MyBox>
  );
};

// 主组件，只提供 Context
const DataList = () => {
  return (
    <DataListProvider>
      <DataListContent />
    </DataListProvider>
  );
};

export default React.memo(DataList);
