'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import {
  Badge,
  Box,
  Flex,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  IconButton
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { postAdminGetModerationRecords } from '@/web/core/plugin/admin/moderation/api';
import {
  formatModerationLabel,
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { ModerationRecordType } from '@fastgpt/global/core/plugin/moderation/type';
import type { GetModerationRecordsBodyType } from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

type StageFilterValue = 'all' | `${ModerationStageEnum}`;
type VerdictFilterValue = 'all' | NonNullable<GetModerationRecordsBodyType['verdict']>;

const ModerationRecords = () => {
  const { t } = useTranslation();
  const [stageFilter, setStageFilter] = useState<StageFilterValue>('all');

  const [verdictFilter, setVerdictFilter] = useState<VerdictFilterValue>('all');

  const {
    data: records,
    isLoading,
    Pagination,
    total,
    getData
  } = usePagination<Record<string, never>, ModerationRecordType>(
    async ({ pageNum = 1, pageSize }) => {
      const res = await postAdminGetModerationRecords({
        stage: stageFilter === 'all' ? undefined : (stageFilter as ModerationStageEnum),
        verdict: verdictFilter === 'all' ? undefined : verdictFilter,
        offset: (pageNum - 1) * pageSize,
        limit: pageSize
      });

      return {
        total: res.total,
        list: res.list
      };
    },
    {
      defaultPageSize: 20,
      refreshDeps: [stageFilter, verdictFilter]
    }
  );

  const renderStageTag = (stage: string) => {
    switch (stage) {
      case ModerationStageEnum.entry:
        return (
          <Badge colorScheme="blue" variant="subtle" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            用户输入
          </Badge>
        );
      case ModerationStageEnum.modelInput:
        return (
          <Badge colorScheme="purple" variant="subtle" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            模型输入
          </Badge>
        );
      case ModerationStageEnum.output:
        return (
          <Badge colorScheme="orange" variant="subtle" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            最终输出
          </Badge>
        );
      default:
        return <Badge fontSize={'xs'}>{stage}</Badge>;
    }
  };

  const renderVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'pass':
        return (
          <Badge colorScheme="green" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            通过 (Pass)
          </Badge>
        );
      case 'suspected':
        return (
          <Badge colorScheme="yellow" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            疑似 (Suspected)
          </Badge>
        );
      case 'block':
        return (
          <Badge colorScheme="red" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            拦截 (Block)
          </Badge>
        );
      case 'error':
        return (
          <Badge colorScheme="gray" px={2} py={0.5} borderRadius={'md'} fontSize={'xs'}>
            异常 (Error)
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderActionBadge = (action: string) => {
    switch (action) {
      case ModerationActionEnum.pass:
        return (
          <Text fontSize={'xs'} color={'green.600'} fontWeight={'medium'}>
            放行
          </Text>
        );
      case ModerationActionEnum.block:
        return (
          <Text fontSize={'xs'} color={'red.600'} fontWeight={'medium'}>
            拦截
          </Text>
        );
      case ModerationActionEnum.replace:
        return (
          <Text fontSize={'xs'} color={'orange.600'} fontWeight={'medium'}>
            替换
          </Text>
        );
      default:
        return <Text fontSize={'xs'}>{action}</Text>;
    }
  };

  return (
    <AdminContainer>
      <Flex flexDirection={'column'} h={'100%'} bg={'myGray.50'}>
        {/* 顶部标题与筛选工具栏 */}
        <Flex
          h={'64px'}
          flexShrink={0}
          px={6}
          alignItems={'center'}
          justifyContent={'space-between'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          bg={'white'}
        >
          <Flex alignItems={'center'} gap={3}>
            <Text fontSize={'lg'} fontWeight={'bold'} color={'myGray.900'}>
              审核记录
            </Text>
            <Text fontSize={'xs'} color={'myGray.500'}>
              共 {total} 条审查记录
            </Text>
          </Flex>

          <HStack spacing={3}>
            {/* 审核环节筛选 */}
            <MySelect
              w={'140px'}
              h={'32px'}
              value={stageFilter}
              list={[
                { label: '全部环节', value: 'all' },
                { label: '用户输入', value: ModerationStageEnum.entry },
                { label: '模型输入', value: ModerationStageEnum.modelInput },
                { label: '最终输出', value: ModerationStageEnum.output }
              ]}
              onChange={(val) => setStageFilter(val as StageFilterValue)}
            />

            {/* 裁决结果筛选 */}
            <MySelect
              w={'140px'}
              h={'32px'}
              value={verdictFilter}
              list={[
                { label: '全部裁决', value: 'all' },
                { label: '通过 (Pass)', value: 'pass' },
                { label: '疑似 (Suspected)', value: 'suspected' },
                { label: '拦截 (Block)', value: 'block' },
                { label: '异常 (Error)', value: 'error' }
              ]}
              onChange={(val) => setVerdictFilter(val as VerdictFilterValue)}
            />

            {/* 刷新按钮 */}
            <IconButton
              aria-label="refresh"
              icon={<MyIcon name="common/refreshLight" w={'16px'} />}
              size={'sm'}
              variant={'whiteBase'}
              onClick={() => void getData(1)}
              isLoading={isLoading}
            />
          </HStack>
        </Flex>

        {/* 记录表格内容区 */}
        <Box flex={1} overflow={'auto'} p={6}>
          {records.length === 0 && !isLoading ? (
            <Flex h={'300px'} alignItems={'center'} justifyContent={'center'} bg={'white'} borderRadius={'md'} border={'1px solid'} borderColor={'myGray.200'}>
              <EmptyTip text="暂无内容审核记录" />
            </Flex>
          ) : (
            <Box
              bg={'white'}
              borderRadius={'md'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              overflow={'hidden'}
            >
              <Table size={'sm'}>
                <Thead bg={'myGray.50'}>
                  <Tr h={'40px'}>
                    <Th fontSize={'xs'} color={'myGray.600'} w={'100px'}>
                      环节
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} w={'110px'}>
                      裁决
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} w={'80px'}>
                      动作
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} minW={'220px'}>
                      送审文本
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} minW={'140px'}>
                      敏感词 / 标签
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} w={'140px'}>
                      服务提供商
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} w={'90px'}>
                      耗时
                    </Th>
                    <Th fontSize={'xs'} color={'myGray.600'} w={'160px'}>
                      触发时间
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {records.map((item) => (
                    <Tr key={item._id} _hover={{ bg: 'myGray.50' }} transition={'background 0.15s'}>
                      <Td>{renderStageTag(item.stage)}</Td>
                      <Td>{renderVerdictBadge(item.verdict)}</Td>
                      <Td>{renderActionBadge(item.actionTaken)}</Td>
                      <Td maxW={'300px'}>
                        <MyTooltip label={item.content} placement="top">
                          <Text fontSize={'xs'} color={'myGray.800'} isTruncated cursor={'default'}>
                            {item.content}
                          </Text>
                        </MyTooltip>
                      </Td>
                      <Td maxW={'200px'}>
                        <Flex wrap={'wrap'} gap={1}>
                          {item.keywords && item.keywords.length > 0
                            ? item.keywords.map((kw, i) => (
                                <Badge key={i} colorScheme="red" variant="subtle" fontSize={'2xs'} px={1.5}>
                                  {kw}
                                </Badge>
                              ))
                            : item.hits && item.hits.length > 0
                            ? item.hits.map((h, i) => (
                                <Badge key={i} colorScheme="orange" variant="subtle" fontSize={'2xs'} px={1.5}>
                                  {formatModerationLabel(h.label, t)}
                                </Badge>
                              ))
                            : '-'}
                        </Flex>
                      </Td>
                      <Td fontSize={'xs'} color={'myGray.600'}>
                        {item.provider || item.pluginId || '-'}
                      </Td>
                      <Td fontSize={'xs'} color={'myGray.500'}>
                        {item.duration !== undefined ? `${item.duration}ms` : '-'}
                      </Td>
                      <Td fontSize={'xs'} color={'myGray.500'}>
                        {formatTime2YMDHMS(item.createTime)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}

          {/* 分页组件 */}
          <Box mt={4}>
            <Pagination />
          </Box>
        </Box>
      </Flex>
    </AdminContainer>
  );
};

export default ModerationRecords;
