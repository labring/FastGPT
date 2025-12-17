/**
 * @file 优化记录组件
 * @description 智能客服应用的优化记录展示页面，包含时间过滤、列表展示、编辑和删除功能
 */
import React, { useState, useCallback, useMemo } from 'react';
import styles from './styles.module.scss';
import {
  Flex,
  Box,
  Text,
  Card,
  useDisclosure,
  VStack,
  Divider,
  useToast,
  IconButton,
  Tag
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { format } from 'date-fns';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import type { ChatCorrectionSchemaType, SubmitChatCorrectionParams } from './type';
import { AppContext } from '../context';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { optimizeRecordsService } from './mock';
import type { GetOptimizeRecordsParams } from './mock';
import CorrectionModal from './CorrectionModal';

interface OptimizeRecordsProps {
  dateRange: DateRangeType;
}

const OptimizeRecords: React.FC<OptimizeRecordsProps> = ({ dateRange }) => {
  // 从 AppContext 获取 appId
  const appId = useContextSelector(AppContext, (v) => v.appId);
  // 从 useChatStore 获取 chatId
  const { chatId } = useChatStore();
  const { t } = useTranslation();
  const toast = useToast();

  // 状态管理
  const [optimzeRecords, setOptimizeRecords] = useState<ChatCorrectionSchemaType[]>([]);
  const [loading, setLoading] = useState(false);

  // 模态框状态
  const [selectedRecord, setSelectedRecord] = useState<ChatCorrectionSchemaType | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // 获取优化记录数据
  const fetchOptimizeRecords = useCallback(async () => {
    if (!appId) return;

    setLoading(true);
    try {
      const params: GetOptimizeRecordsParams = {
        appId,
        chatId: chatId || undefined, // 如果 chatId 为空字符串，则传递 undefined
        startTime: dateRange.from,
        endTime: dateRange.to,
        page: 1,
        pageSize: 100
      };

      console.log('获取优化记录参数:', params); // 调试日志
      const response = await optimizeRecordsService.getOptimizeRecords(params);
      console.log('获取优化记录结果:', response); // 调试日志
      setOptimizeRecords(response.data);
    } catch (error) {
      console.error('获取优化记录失败:', error);
      toast({
        title: t('获取数据失败'),
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    } finally {
      setLoading(false);
    }
  }, [appId, chatId, dateRange, toast, t]);

  // 组件挂载时获取数据，以及dateRange变化时重新获取数据
  React.useEffect(() => {
    fetchOptimizeRecords();
  }, [fetchOptimizeRecords, dateRange]);

  // 处理编辑
  const handleEdit = useCallback((record: ChatCorrectionSchemaType) => {
    setSelectedRecord(record);
    setIsEditOpen(true);
  }, []);

  // 处理编辑模态框关闭
  const handleEditClose = useCallback(() => {
    setIsEditOpen(false);
    setSelectedRecord(null);
  }, []);

  // 处理编辑提交
  const handleEditSubmit = useCallback(
    async (params: SubmitChatCorrectionParams) => {
      try {
        // 这里调用更新优化记录的API
        await optimizeRecordsService.updateOptimizeRecord(selectedRecord?._id || '', {
          correctionData: params.correctionData,
          updateTime: new Date()
        });

        // 更新本地状态
        setOptimizeRecords((prev) =>
          prev.map((record) =>
            record._id === selectedRecord?._id
              ? { ...record, correctionData: params.correctionData, updateTime: new Date() }
              : record
          )
        );

        toast({
          title: t('更新成功'),
          status: 'success',
          duration: 3000,
          isClosable: true
        });
        handleEditClose();
      } catch (error) {
        console.error('更新优化记录失败:', error);
        toast({
          title: t('更新失败'),
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    },
    [selectedRecord, toast, t, handleEditClose]
  );

  // 确认删除
  const confirmDelete = useCallback(
    async (record: ChatCorrectionSchemaType) => {
      if (!appId) return;

      try {
        await optimizeRecordsService.deleteOptimizeRecord({
          recordId: record._id,
          appId
        });

        // 从本地状态中移除记录
        setOptimizeRecords((prev) => prev.filter((r) => r._id !== record._id));

        toast({
          title: t('删除成功'),
          status: 'success',
          duration: 3000,
          isClosable: true
        });
      } catch (error) {
        console.error('删除优化记录失败:', error);
        toast({
          title: t('删除失败'),
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    },
    [appId, toast, t]
  );

  // 格式化时间显示
  const formatTime = useCallback((date: Date) => {
    return format(date, 'MM-dd HH:mm:ss');
  }, []);

  // 渲染edit类型的记录
  const renderEditRecord = useCallback((correctionData: any) => {
    return (
      <>
        <Divider my={3} borderColor="myGray.200" />
        <Text fontSize="mini" color="myGray.500" lineHeight="20px" className={styles.textEllipsis3}>
          {correctionData.correctedAnswer}
        </Text>
      </>
    );
  }, []);

  // 渲染annotate类型的记录
  const renderAnnotateRecord = useCallback(
    (correctionData: any) => {
      const quoteCount = correctionData.correctedQuoteList?.length || 0;
      return (
        <>
          <Divider my={3} borderColor="myGray.200" />
          <Text fontSize="xs" color="#667085" mb={3}>
            {t('答案引用知识（{{count}}）', { count: quoteCount })}
          </Text>
          <Flex className={styles.quoteTagContainer} overflowX="hidden" gap={3} flexWrap="nowrap">
            {correctionData.correctedQuoteList?.map((quote: any, index: number) => (
              <Box
                key={index}
                position="relative"
                w="400px"
                minW="200px"
                flexShrink={0}
                h="120px"
                borderRadius="4px"
                background="linear-gradient(0deg, rgba(240, 241, 248, 0) 0%, #E8EBF0 100%)"
                py="12px"
                px="16px"
                display="flex"
                flexDirection="column"
              >
                <Text
                  fontSize="mini"
                  color="#485264"
                  lineHeight="20px"
                  className={styles.textEllipsis3}
                  flex={1}
                  mb="8px"
                >
                  {quote.a}
                </Text>
                <Tag
                  borderRadius="6px"
                  bg="#FFFFFF"
                  border="1px solid #E8EBF0"
                  boxShadow="0px 0px 1px 0px rgba(19, 51, 107, 0.08),0px 1px 2px 0px rgba(19, 51, 107, 0.05)"
                  px={2}
                  py={1}
                  alignSelf="flex-start"
                  maxW="100%"
                >
                  <Text
                    fontSize="12px"
                    color="#667085"
                    fontWeight="500"
                    lineHeight="14px"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    {quote.sourceName}
                  </Text>
                </Tag>
              </Box>
            ))}
          </Flex>
        </>
      );
    },
    [t]
  );

  return (
    <Flex flexDirection="column" h="full">
      {/* 列表内容 */}
      <Box flex={1} overflow="auto" px={6}>
        {optimzeRecords.length === 0 ? (
          <EmptyTip text={t('还没有记录噢~')} />
        ) : (
          <VStack align="stretch" spacing={3}>
            {optimzeRecords.map((record, index) => (
              <Card
                key={record._id}
                px={3}
                py={4}
                userSelect={'none'}
                boxShadow={'none'}
                bg={index % 2 === 1 ? 'myGray.50' : 'blue.50'}
                border={'sm'}
                position={'relative'}
                overflow={'hidden'}
                _hover={{
                  borderColor: 'blue.600',
                  boxShadow: 'lg',
                  '& .header': { visibility: 'visible' },
                  '& .footer': { visibility: 'visible' },
                  bg: index % 2 === 1 ? 'myGray.200' : 'blue.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {/* 头部信息区域 */}
                <Flex alignItems={'center'} gap={2}>
                  <Text
                    fontSize="sm"
                    color="myGray.800"
                    fontWeight="bold"
                    lineHeight="20px"
                    flex={1}
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    mr={2}
                  >
                    {record.correctionData.question}
                  </Text>
                  <Flex alignItems={'center'} gap={2} flexShrink={0}>
                    <MyTag colorSchema="gray" type="borderFill">
                      {record.userName}
                    </MyTag>
                    <MyTag colorSchema="gray" type="borderFill">
                      {formatTime(record.updateTime)}
                    </MyTag>
                  </Flex>
                </Flex>

                {/* 记录内容 */}
                <Box wordBreak={'break-all'}>
                  {record.correctionData.correctionMode === 'edit'
                    ? renderEditRecord(record.correctionData)
                    : renderAnnotateRecord(record.correctionData)}
                </Box>

                {/* 底部操作按钮 */}
                <Flex
                  className="footer"
                  position={'absolute'}
                  bottom={2}
                  right={2}
                  overflow={'hidden'}
                  alignItems={'flex-end'}
                  visibility={'hidden'}
                  fontSize={'mini'}
                  gap={2}
                >
                  <IconButton
                    display={'flex'}
                    p={1}
                    boxShadow={'1'}
                    icon={<MyIcon name={'edit'} w={'14px'} />}
                    variant={'whiteBase'}
                    size={'xsSquare'}
                    aria-label={'edit'}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleEdit(record);
                    }}
                  />
                  <PopoverConfirm
                    Trigger={
                      <IconButton
                        display={'flex'}
                        p={1}
                        boxShadow={'1'}
                        icon={<MyIcon name={'common/trash'} w={'14px'} />}
                        variant={'whiteDanger'}
                        size={'xsSquare'}
                        aria-label={'delete'}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                      />
                    }
                    content={t('common:dataset.Confirm to delete the data')}
                    type="delete"
                    onConfirm={() => confirmDelete(record)}
                  />
                </Flex>
              </Card>
            ))}
          </VStack>
        )}
      </Box>

      {/* 编辑模态框 */}
      {selectedRecord && (
        <CorrectionModal
          isOpen={isEditOpen}
          onClose={handleEditClose}
          appId={appId}
          chatId={selectedRecord.chatId}
          dataId={selectedRecord.dataId}
          modelName={''} // 根据实际需要设置模型名称
          defaultQuestion={selectedRecord.correctionData.question}
          defaultAnswer={selectedRecord.correctionData.rawAnswer}
          onSubmit={handleEditSubmit}
        />
      )}
    </Flex>
  );
};

export default React.memo(OptimizeRecords);
