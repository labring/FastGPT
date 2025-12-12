/**
 * @file 自动学习组件
 * @description 智能客服应用的自动学习功能页面，展示学习记录列表及评估数据
 */
import React, { useMemo, useState } from 'react';
import { Flex, Box, Table, Thead, Tbody, Tr, Th, Td, Button, HStack, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { cardStyles } from '../constants';

/**
 * 学习状态枚举
 */
enum LearnStatus {
  Learning = 'learning',
  Completed = 'completed'
}

/**
 * 学习记录数据类型
 */
interface LearnRecord {
  id: string;
  learnTime: string;
  status: LearnStatus;
  creator: string;
  precisionBefore?: number;
  precisionAfter?: number;
  mrrBefore?: number;
  mrrAfter?: number;
}

/**
 * Mock 数据
 */
const mockData: LearnRecord[] = [
  {
    id: '1',
    learnTime: '2025/11/10 19:51:32',
    status: LearnStatus.Learning,
    creator: '许明远'
  },
  {
    id: '2',
    learnTime: '2025/10/10 19:51:32',
    status: LearnStatus.Completed,
    creator: '王皓',
    precisionBefore: 75,
    precisionAfter: 90,
    mrrBefore: 0.58,
    mrrAfter: 0.82
  },
  {
    id: '3',
    learnTime: '2025/09/10 19:51:32',
    status: LearnStatus.Completed,
    creator: '王皓',
    precisionBefore: 60,
    precisionAfter: 90,
    mrrBefore: 0.33,
    mrrAfter: 0.86
  }
];

const AutoLearn = () => {
  const { t } = useTranslation();
  const [records] = useState<LearnRecord[]>(mockData);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  /**
   * 开始学习处理函数
   * TODO: 实现开始学习逻辑
   */
  const handleStartLearn = () => {
    console.log('开始学习');
  };

  /**
   * 学习时间排序处理函数
   * TODO: 实现接口排序逻辑
   */
  const handleSortLearnTime = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newOrder);
    console.log('学习时间排序:', newOrder);
  };

  /**
   * 下载评测数据处理函数
   * TODO: 实现下载评测数据逻辑
   */
  const handleDownloadData = (recordId: string) => {
    console.log('下载评测数据:', recordId);
  };

  /**
   * 渲染状态标签
   */
  const renderStatusTag = (status: LearnStatus) => {
    const statusConfig = {
      [LearnStatus.Learning]: {
        label: t('app:auto_learn.learning'),
        colorSchema: 'blue' as const
      },
      [LearnStatus.Completed]: {
        label: t('app:auto_learn.completed'),
        colorSchema: 'green' as const
      }
    };

    const config = statusConfig[status];
    return (
      <MyTag colorSchema={config.colorSchema} type="fill">
        {config.label}
      </MyTag>
    );
  };

  return (
    <Flex
      flexDirection={'column'}
      {...cardStyles}
      boxShadow={3.5}
      px={6}
      py={4}
      h={'100%'}
      overflowY={'auto'}
      overflowX={'hidden'}
    >
      {/* 头部区域 */}
      <Flex justifyContent={'space-between'} alignItems={'center'} mb={4}>
        <HStack spacing={2}>
          <MyIcon name={'menu'} w={'20px'} color={'myGray.600'} />
          <Text fontSize={'16px'} color={'myGray.900'}>
            {t('app:auto_learn.learning_records', { total: records.length })}
          </Text>
          <QuestionTip label={t('app:auto_learn.description')} />
        </HStack>
        <Button variant={'primary'} size={'md'} onClick={handleStartLearn}>
          {t('app:auto_learn.start_learning')}
        </Button>
      </Flex>

      {/* 表格区域 */}
      <Box flex={1}>
        <Table variant={'simple'}>
          <Thead bg={'myGray.100'}>
            {/* 一级表头 */}
            <Tr>
              <Th rowSpan={2}>
                <HStack spacing={1}>
                  <Text>{t('app:auto_learn.learning_time')}</Text>
                  <MyIcon
                    name={'core/chat/chevronSelector'}
                    w={'16px'}
                    cursor={'pointer'}
                    _hover={{ color: 'primary.600' }}
                    onClick={handleSortLearnTime}
                  />
                </HStack>
              </Th>
              <Th rowSpan={2}>{t('app:auto_learn.status')}</Th>
              <Th rowSpan={2}>{t('app:auto_learn.creator')}</Th>
              <Th colSpan={2} textAlign={'center'} pb={0}>
                <HStack spacing={1} justifyContent={'center'}>
                  <Text>{t('app:auto_learn.precision')}</Text>
                  <QuestionTip label={t('app:auto_learn.precision_tooltip')} />
                </HStack>
              </Th>
              <Th colSpan={2} textAlign={'center'} pb={0}>
                <HStack spacing={1} justifyContent={'center'}>
                  <Text>{t('app:auto_learn.average_ranking')}</Text>
                  <QuestionTip label={t('app:auto_learn.mrr_tooltip')} />
                </HStack>
              </Th>
              <Th rowSpan={2}></Th>
            </Tr>
            {/* 二级表头 */}
            <Tr>
              <Th textAlign={'center'} pr={3}>
                {t('app:auto_learn.before_learning')}
              </Th>
              <Th textAlign={'center'} pl={3}>
                {t('app:auto_learn.after_learning')}
              </Th>
              <Th textAlign={'center'} pr={3}>
                {t('app:auto_learn.before_learning')}
              </Th>
              <Th textAlign={'center'} pl={3}>
                {t('app:auto_learn.after_learning')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {records.map((record) => (
              <Tr key={record.id} _hover={{ bg: 'myGray.50' }}>
                <Td color={'myGray.600'} fontSize={'sm'}>
                  {record.learnTime}
                </Td>
                <Td>{renderStatusTag(record.status)}</Td>
                <Td color={'myGray.600'} fontSize={'sm'}>
                  {record.creator}
                </Td>
                <Td textAlign={'center'}>
                  <Text color={record.precisionBefore !== undefined ? 'myGray.600' : 'myGray.400'}>
                    {record.precisionBefore !== undefined ? `${record.precisionBefore}%` : '-'}
                  </Text>
                </Td>
                <Td textAlign={'center'}>
                  <Text color={record.precisionAfter !== undefined ? 'myGray.600' : 'myGray.400'}>
                    {record.precisionAfter !== undefined ? `${record.precisionAfter}%` : '-'}
                  </Text>
                </Td>
                <Td textAlign={'center'}>
                  <Text color={record.mrrBefore !== undefined ? 'myGray.600' : 'myGray.400'}>
                    {record.mrrBefore !== undefined ? record.mrrBefore.toFixed(2) : '-'}
                  </Text>
                </Td>
                <Td textAlign={'center'}>
                  <Text color={record.mrrAfter !== undefined ? 'myGray.600' : 'myGray.400'}>
                    {record.mrrAfter !== undefined ? record.mrrAfter.toFixed(2) : '-'}
                  </Text>
                </Td>
                <Td>
                  {record.status === LearnStatus.Completed && (
                    <Button
                      size={'sm'}
                      variant={'whitePrimary'}
                      onClick={() => handleDownloadData(record.id)}
                    >
                      {t('app:auto_learn.download_evaluation_data')}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    </Flex>
  );
};

export default React.memo(AutoLearn);
