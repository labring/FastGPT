import { getChannelList, getChannelLog, getLogDetail } from '@/web/core/ai/channel';
import { useUserStore } from '@/web/support/user/useUserStore';
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
  ModalBody,
  Grid,
  GridItem,
  type BoxProps
} from '@chakra-ui/react';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { addDays } from 'date-fns';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useMemo, useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import type { ChannelLogListItemType } from '@/global/aiproxy/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useAdminModelConfig } from '@/web/core/ai/model/useAdminModelConfig';
import ModelTabHeader from '../ModelTabHeader';

type LogDetailType = Omit<ChannelLogListItemType, 'model' | 'request_at'> & {
  channelName: string | number;
  model: React.JSX.Element;
  duration: number;
  request_at: string;

  retry_times?: number;
  content?: string;
  request_body?: string;
  response_body?: string;
};
const ChannelLog = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { userInfo } = useUserStore();
  const { getModelProvider, systemModelList } = useAdminModelConfig();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isRoot = userInfo?.username === 'root';
  const [filterProps, setFilterProps] = useState<{
    request_id?: string;
    channelId?: string;
    model?: string;
    code_type: 'all' | 'success' | 'error';
    dateRange: DateRangeType;
  }>({
    request_id: '',
    code_type: 'all',
    dateRange: {
      from: (() => {
        const today = addDays(new Date(), -1);
        today.setHours(0, 0, 0, 0);
        return today;
      })(),
      to: (() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return today;
      })()
    }
  });

  const { data: channelList = [] } = useRequest(
    async () => {
      const res = (await getChannelList()).map((item) => ({
        label: item.name,
        value: `${item.id}`
      }));
      return [{ label: t('common:All'), value: '' }, ...res];
    },
    {
      manual: false
    }
  );

  const modelList = useMemo(() => {
    const res = systemModelList
      .map((item) => {
        const provider = getModelProvider(item.provider, i18n.language);
        return {
          order: provider.order,
          avatar: provider.avatar,
          label: item.model,
          value: item.model
        };
      })
      .sort((a, b) => a.order - b.order);
    return [{ label: t('common:All'), value: '' }, ...res];
  }, [getModelProvider, i18n.language, systemModelList, t]);

  const { data, isLoading, total, pageSize, Pagination } = usePagination(getChannelLog, {
    defaultPageSize: 20,
    pageSizeOptions: [20, 50, 100, 200],
    pageSizeCacheKey: 'config-model-channel-log',
    refreshDeps: [filterProps],
    params: {
      request_id: filterProps.request_id,
      channel: filterProps.channelId,
      model_name: filterProps.model,
      code_type: filterProps.code_type,
      start_timestamp: filterProps.dateRange.from?.getTime() || 0,
      end_timestamp: filterProps.dateRange.to?.getTime() || 0
    },
    scrollContainerRef
  });

  const formatData = useMemo<LogDetailType[]>(() => {
    return data.map((item) => {
      const duration = item.created_at - item.request_at;
      const durationSecond = duration / 1000;

      const channelName = channelList.find((channel) => channel.value === `${item.channel}`)?.label;

      const model = systemModelList.find((model) => model.model === item.model);
      const provider = getModelProvider(model?.provider, i18n.language);

      return {
        ...item,
        channelName: channelName || item.channel,
        model: (
          <HStack>
            <MyIcon name={provider?.avatar as any} w={'1rem'} />
            <Box>{model?.model}</Box>
          </HStack>
        ),
        duration: durationSecond,
        request_at: formatTime2YMDHMS(item.request_at),
        ttfb_milliseconds: item.ttfb_milliseconds ? item.ttfb_milliseconds / 1000 : 0
      };
    });
  }, [channelList, data, getModelProvider, i18n.language, systemModelList]);

  const [logDetail, setLogDetail] = useState<LogDetailType>();

  return (
    <>
      <MyBox display={'flex'} flex={'1 0 0'} h={0} minH={0} flexDirection={'column'} gap={4}>
        {isRoot && <ModelTabHeader Tab={Tab} />}
        <Flex
          px={6}
          flexDirection={['column', 'row']}
          flexWrap={['nowrap', 'wrap']}
          alignItems={['stretch', 'flex-start']}
          gap={[3, 4]}
        >
          <DateRangePicker
            formLabel={t('common:user.Time')}
            w={'fit-content'}
            flexShrink={0}
            defaultDate={filterProps.dateRange}
            dateRange={filterProps.dateRange}
            onSuccess={(e) => setFilterProps({ ...filterProps, dateRange: e })}
          />
          <SingleSelectFilter
            title={t('config_model:channel_name')}
            value={filterProps.channelId ?? ''}
            options={channelList}
            onChange={(val) => setFilterProps({ ...filterProps, channelId: val || undefined })}
            showSearch
          />
          <SingleSelectFilter
            title={t('config_model:model_name')}
            value={filterProps.model ?? ''}
            options={modelList}
            onChange={(val) => setFilterProps({ ...filterProps, model: val || undefined })}
            showSearch
          />
          <SingleSelectFilter
            title={t('config_model:log_status')}
            value={filterProps.code_type}
            options={[
              { label: t('common:All'), value: 'all' as const },
              { label: t('common:Success'), value: 'success' as const },
              { label: t('common:failed'), value: 'error' as const }
            ]}
            onChange={(val) => setFilterProps({ ...filterProps, code_type: val })}
          />
          <Box flex={['0 0 auto', '1 0 200px']} w={'100%'} maxW={['100%', '200px']}>
            <SearchInput
              placeholder={t('config_model:log_request_id_search')}
              defaultValue={filterProps.request_id}
              onBlur={(e) => setFilterProps({ ...filterProps, request_id: e.target.value })}
            />
          </Box>
        </Flex>
        <MyBox
          flex={'1 0 0'}
          h={0}
          minH={0}
          display={'flex'}
          flexDirection={'column'}
          isLoading={isLoading}
        >
          <TableContainer
            ref={scrollContainerRef}
            flex={['0 0 auto', '1 0 0']}
            h={['auto', '100%']}
            minH={0}
            overflowY={['visible', 'auto']}
            px={6}
            fontSize={'sm'}
          >
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('config_model:channel_name')}</Th>
                  <Th>{t('config_model:model')}</Th>
                  <Th>{t('config_model:model_tokens')}</Th>
                  <Th>{t('config_model:duration')}</Th>
                  <Th>{t('config_model:channel_status')}</Th>
                  <Th>{t('config_model:request_at')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {formatData.map((item, index) => (
                  <Tr key={index}>
                    <Td>{item.channelName}</Td>
                    <Td>{item.model}</Td>
                    <Td>
                      {item.usage?.input_tokens} / {item.usage?.output_tokens}
                    </Td>
                    <Td color={item.duration > 10 ? 'red.600' : ''}>{item.duration.toFixed(2)}s</Td>
                    <Td color={item.code === 200 ? 'green.600' : 'red.600'}>
                      {item.code}
                      {item.content && <QuestionTip label={item.content} />}
                    </Td>
                    <Td>{item.request_at}</Td>
                    <Td>
                      <Button
                        leftIcon={<MyIcon name={'menu'} w={'1rem'} />}
                        size={'sm'}
                        variant={'outline'}
                        onClick={() => setLogDetail(item)}
                      >
                        {t('config_model:detail')}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          {total > pageSize && (
            <Flex flexShrink={0} mt={3} px={6} justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
        </MyBox>
      </MyBox>

      {!!logDetail && <LogDetail data={logDetail} onClose={() => setLogDetail(undefined)} />}
    </>
  );
};

export default ChannelLog;

const LogDetailTitle = ({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
  return (
    <Box
      bg={'myGray.50'}
      color="myGray.900 "
      borderRight={'base'}
      p={3}
      flex={'0 0 100px'}
      {...props}
    >
      {children}
    </Box>
  );
};

const LogDetailContainer = ({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
  return (
    <Box p={3} flex={1} {...props}>
      {children}
    </Box>
  );
};

const LogDetail = ({ data, onClose }: { data: LogDetailType; onClose: () => void }) => {
  const { t } = useClientTranslation('config_model');
  const { data: detailData } = useRequest(
    async () => {
      if (data.code === 200) return data;
      try {
        const res = await getLogDetail(data.id);
        return {
          ...res,
          ...data
        };
      } catch (_error) {
        return data;
      }
    },
    {
      manual: false
    }
  );

  return (
    <MyModal
      isOpen
      iconSrc="support/bill/payRecordLight"
      title={t('config_model:log_detail')}
      onClose={onClose}
      maxW={['90vw', '800px']}
      w={'100%'}
    >
      {detailData && (
        <ModalBody>
          {/* 基本信息表格 */}
          <Grid
            templateColumns="repeat(2, 1fr)"
            gap={0}
            borderWidth="1px"
            borderRadius="md"
            fontSize={'sm'}
            overflow={'hidden'}
          >
            {/* 第一行 */}
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogDetailTitle>RequestID</LogDetailTitle>
              <LogDetailContainer>{detailData?.request_id}</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogDetailTitle>Request IP</LogDetailTitle>
              <LogDetailContainer>{detailData?.ip}</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogDetailTitle>{t('config_model:channel_status')}</LogDetailTitle>
              <LogDetailContainer color={detailData.code === 200 ? 'green.600' : 'red.600'}>
                {detailData?.code}
              </LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogDetailTitle>Endpoint</LogDetailTitle>
              <LogDetailContainer>{detailData?.endpoint}</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogDetailTitle>{t('config_model:channel_name')}</LogDetailTitle>
              <LogDetailContainer>{detailData?.channelName}</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogDetailTitle>{t('config_model:model')}</LogDetailTitle>
              <LogDetailContainer>{detailData?.model}</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogDetailTitle>{t('config_model:request_at')}</LogDetailTitle>
              <LogDetailContainer>{detailData?.request_at}</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogDetailTitle>{t('config_model:duration')}</LogDetailTitle>
              <LogDetailContainer>{detailData?.duration.toFixed(2)}s</LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogDetailTitle flex={'0 0 150px'}>
                {t('config_model:model_ttfb_time')}
              </LogDetailTitle>
              <LogDetailContainer>
                {detailData.ttfb_milliseconds ? `${detailData.ttfb_milliseconds}ms` : '-'}
              </LogDetailContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogDetailTitle flex={'0 0 150px'}>{t('config_model:model_tokens')}</LogDetailTitle>
              <LogDetailContainer>
                {detailData?.usage?.input_tokens} / {detailData?.usage?.output_tokens}
              </LogDetailContainer>
            </GridItem>
            {detailData?.retry_times !== undefined && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <LogDetailTitle>{t('config_model:retry_times')}</LogDetailTitle>
                <LogDetailContainer>{detailData?.retry_times}</LogDetailContainer>
              </GridItem>
            )}
            {detailData?.content && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <LogDetailTitle>Content</LogDetailTitle>
                <LogDetailContainer>{detailData?.content}</LogDetailContainer>
              </GridItem>
            )}
            {detailData?.request_body && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <LogDetailTitle>Request Body</LogDetailTitle>
                <LogDetailContainer userSelect={'all'}>
                  {detailData?.request_body}
                </LogDetailContainer>
              </GridItem>
            )}
            {detailData?.response_body && (
              <GridItem display={'flex'} colSpan={2}>
                <LogDetailTitle>Response Body</LogDetailTitle>
                <LogDetailContainer>{detailData?.response_body}</LogDetailContainer>
              </GridItem>
            )}
          </Grid>
        </ModalBody>
      )}
    </MyModal>
  );
};
