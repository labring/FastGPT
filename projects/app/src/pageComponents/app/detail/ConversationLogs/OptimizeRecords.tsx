/**
 * @file 优化记录组件
 * @description 智能客服应用的优化记录展示页面，包含时间过滤、列表展示、编辑和删除功能
 */
import React, { useState, useCallback, useMemo } from 'react';
import styles from './styles.module.scss';
import { Flex, Box, Text, Card, VStack, Divider, IconButton, Tag } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { format } from 'date-fns';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import type {
  CorrectionDataType,
  CorrectedQuoteItem
} from '@fastgpt/global/core/chat/correction/type';
import type {
  ChatCorrectionListItem,
  ListChatCorrectionParams
} from '@fastgpt/global/core/chat/correction/api';
import { CorrectionModeEnum } from '@fastgpt/global/core/chat/correction/constants';
import { AppContext } from '../context';
import { getChatCorrectionList, deleteChatCorrection } from '@/web/core/app/api/log';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import CorrectionModal from './CorrectionModal';

interface OptimizeRecordsProps {
  dateRange: DateRangeType;
}

const OptimizeRecords: React.FC<OptimizeRecordsProps> = ({ dateRange }) => {
  // 从 AppContext 获取 appId
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const { t } = useTranslation();

  // 模态框状态
  const [selectedRecord, setSelectedRecord] = useState<ChatCorrectionListItem | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // 空状态组件
  const EmptyTipDom = useMemo(() => <EmptyTip mt={0} text={t('app:logs_empty')} />, [t]);

  // 构建请求参数
  const requestParams = useMemo(() => {
    if (!appId) return {};

    const params: Partial<ListChatCorrectionParams> = {
      appId,
      startTime: dateRange.from,
      endTime: dateRange.to
    };
    return params;
  }, [appId, dateRange]);

  // 使用滚动分页获取优化记录数据
  const {
    data: optimizeRecords,
    total,
    isLoading,
    ScrollData,
    refreshList
  } = useScrollPagination(getChatCorrectionList, {
    pageSize: 20,
    params: requestParams as Omit<ListChatCorrectionParams, 'offset' | 'pageSize'>,
    EmptyTip: EmptyTipDom,
    refreshDeps: [appId, dateRange]
  });

  // 处理编辑
  const handleEdit = useCallback((record: ChatCorrectionListItem) => {
    setSelectedRecord(record);
    setIsEditOpen(true);
  }, []);

  // 处理编辑模态框关闭
  const handleEditClose = useCallback(() => {
    setIsEditOpen(false);
    setSelectedRecord(null);
  }, []);

  // 处理编辑提交
  const handleEditSubmit = useCallback(async () => {
    // 关闭弹窗
    handleEditClose();
    // 重新获取数据
    refreshList();
  }, [handleEditClose, refreshList]);

  // 确认删除
  const { runAsync: onDeleteRecord } = useRequest(
    async (record: ChatCorrectionListItem) => {
      if (!appId) return;

      // 调用删除接口
      await deleteChatCorrection({
        appId,
        chatId: record.chatId,
        correctionId: record._id
      });
    },
    {
      errorToast: t('app:delete_failed'),
      successToast: t('app:delete_success'),
      onSuccess: () => {
        // 重新获取数据
        refreshList();
      }
    }
  );

  const confirmDelete = useCallback(
    (record: ChatCorrectionListItem) => {
      onDeleteRecord(record);
    },
    [onDeleteRecord]
  );

  // 格式化时间显示
  const formatTime = useCallback((date: Date) => {
    return format(new Date(date), 'MM-dd HH:mm:ss');
  }, []);

  // 渲染edit类型的记录
  const renderEditRecord = useCallback((correctionData: CorrectionDataType) => {
    return (
      <>
        <Divider my={3} borderColor="myGray.200" />
        <Text fontSize="mini" color="myGray.500" lineHeight="20px" className={'textEllipsis3'}>
          {correctionData.correctedAnswer}
        </Text>
      </>
    );
  }, []);

  // 渲染annotate类型的记录
  const renderAnnotateRecord = useCallback(
    (correctionData: CorrectionDataType) => {
      const quoteCount = correctionData.correctedQuoteList?.length || 0;
      return (
        <>
          <Divider my={3} borderColor="myGray.200" />
          <Text fontSize="xs" color="#667085" mb={3}>
            {t('app:answer_quote_knowledge_count', { count: quoteCount })}
          </Text>
          <Flex className={styles.quoteTagContainer} overflowX="hidden" gap={3} flexWrap="nowrap">
            {correctionData.correctedQuoteList?.map((quote: CorrectedQuoteItem, index: number) => (
              <Box
                key={quote.datasetDataId}
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
                {quote.a ? (
                  <>
                    <Text
                      fontSize="mini"
                      color="#485264"
                      lineHeight="20px"
                      className={'textEllipsis'}
                    >
                      {quote.q}
                    </Text>
                    <Box h="1px" bg="myGray.200" my="4px" />
                    <Text
                      fontSize="mini"
                      color="#485264"
                      lineHeight="20px"
                      className={'textEllipsis2'}
                      flex={1}
                      mb="8px"
                    >
                      {quote.a}
                    </Text>
                  </>
                ) : (
                  <Text
                    fontSize="mini"
                    color="#485264"
                    lineHeight="20px"
                    className={'textEllipsis3'}
                    flex={1}
                    mb="8px"
                  >
                    {quote.q}
                  </Text>
                )}
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
      <Box flex={1} px={6}>
        <ScrollData>
          <VStack align="stretch" spacing={3}>
            {optimizeRecords.map((record, index) => (
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
                      {record.userName || '-'}
                    </MyTag>
                    <MyTag colorSchema="gray" type="borderFill">
                      {formatTime(record.updateTime)}
                    </MyTag>
                  </Flex>
                </Flex>

                {/* 记录内容 */}
                <Box wordBreak={'break-all'}>
                  {record.correctionData.correctionMode === CorrectionModeEnum.edit
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
        </ScrollData>
      </Box>

      {/* 编辑模态框 */}
      {selectedRecord && (
        <CorrectionModal
          isOpen={isEditOpen}
          onClose={handleEditClose}
          appId={appId}
          chatId={selectedRecord.chatId}
          dataId={selectedRecord.dataId}
          defaultCorrectionData={selectedRecord.correctionData}
          onSubmit={handleEditSubmit}
          mode="edit"
        />
      )}
    </Flex>
  );
};

export default React.memo(OptimizeRecords);
