import { getChannelList, getChannelLog, getLogDetail } from '@/web/core/ai/channel';
import { getModelList } from '@/web/core/ai/config';
import { useSystemStore } from '@/web/common/system/useSystemStore';
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
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { addDays } from 'date-fns';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import type { ChannelLogListItemType } from '@/global/aiproxy/type';

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

/**
 * Channel-dimension call log (aiproxy passthrough). Kept alive after the model
 * log page moved to usage_items (design §5.1 has no channel-log page): it now
 * lives inside the channel page as a modal, optionally preset to one channel.
 */
const LogTitle = ({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
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
const LogContainer = ({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
  return (
    <Box p={3} flex={1} {...props}>
      {children}
    </Box>
  );
};

const ChannelLogModal = ({
  channelId,
  channelType = 'system',
  onClose
}: {
  channelId?: number;
  channelType?: 'system' | 'team';
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { getModelProvider } = useSystemStore();

  const [filterProps, setFilterProps] = useState<{
    request_id?: string;
    channelId?: string;
    model?: string;
    code_type: 'all' | 'success' | 'error';
    dateRange: DateRangeType;
  }>({
    request_id: '',
    channelId: channelId ? `${channelId}` : '',
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
      // Root-only modal: mirror the tab the modal was opened from (design §2.9.4),
      // otherwise the filter would list the root's own group channels only.
      const res = await getChannelList({ groupType: channelType }).then((res) =>
        res.map((item) => ({
          label: item.name,
          value: `${item.id}`
        }))
      );
      return [
        {
          label: t('common:All'),
          value: ''
        },
        ...res
      ];
    },
    {
      manual: false
    }
  );

  const { data: systemModelList = [] } = useRequest(getModelList, {
    manual: false
  });
  const modelList = useMemo(() => {
    const res = systemModelList
      .map((item) => {
        const provider = getModelProvider(item.provider, i18n.language);

        return {
          order: provider.order,
          icon: provider.avatar,
          label: item.model,
          value: item.model
        };
      })
      .sort((a, b) => a.order - b.order);
    return [
      {
        label: t('common:All'),
        value: ''
      },
      ...res
    ];
  }, [getModelProvider, i18n.language, systemModelList, t]);

  const { data, isLoading, ScrollData } = useScrollPagination(getChannelLog, {
    pageSize: 20,
    refreshDeps: [filterProps],
    params: {
      request_id: filterProps.request_id,
      channel: filterProps.channelId,
      model_name: filterProps.model,
      code_type: filterProps.code_type,
      start_timestamp: filterProps.dateRange.from?.getTime() || 0,
      end_timestamp: filterProps.dateRange.to?.getTime() || 0
    }
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
    <MyModal
      isOpen
      iconSrc="support/bill/payRecordLight"
      title={t('config_model:log')}
      onClose={onClose}
      maxW={['95vw', '1400px']}
      w={'100%'}
      h={'90vh'}
    >
      <ModalBody display={'flex'} flexDirection={'column'} gap={4} h={'100%'}>
        <HStack spacing={4} flexWrap={'wrap'}>
          <HStack>
            <FormLabel>{t('common:user.Time')}</FormLabel>
            <Box>
              <DateRangePicker
                defaultDate={filterProps.dateRange}
                dateRange={filterProps.dateRange}
                onSuccess={(e) => setFilterProps({ ...filterProps, dateRange: e })}
              />
            </Box>
          </HStack>
          {!channelId && (
            <HStack>
              <FormLabel>{t('config_model:channel_name')}</FormLabel>
              <Box flex={'1 0 0'}>
                <MySelect<string>
                  bg={'myGray.50'}
                  isSearch
                  list={channelList}
                  placeholder={t('config_model:select_channel')}
                  value={filterProps.channelId}
                  onChange={(val) => setFilterProps({ ...filterProps, channelId: val })}
                />
              </Box>
            </HStack>
          )}
          <HStack>
            <FormLabel>{t('config_model:model_name')}</FormLabel>
            <Box flex={'1 0 0'}>
              <MySelect<string>
                bg={'myGray.50'}
                isSearch
                list={modelList}
                placeholder={t('config_model:select_model')}
                value={filterProps.model}
                onChange={(val) => setFilterProps({ ...filterProps, model: val })}
              />
            </Box>
          </HStack>
          <HStack>
            <FormLabel>{t('config_model:log_status')}</FormLabel>
            <Box flex={'1 0 0'}>
              <MySelect<'all' | 'success' | 'error'>
                bg={'myGray.50'}
                list={[
                  { label: t('common:All'), value: 'all' },
                  { label: t('common:Success'), value: 'success' },
                  { label: t('common:failed'), value: 'error' }
                ]}
                value={filterProps.code_type}
                onChange={(val) => setFilterProps({ ...filterProps, code_type: val })}
              />
            </Box>
          </HStack>
          <Box flex={'0 0 200px'}>
            <SearchInput
              placeholder={t('config_model:log_request_id_search')}
              defaultValue={filterProps.request_id}
              onBlur={(e) => setFilterProps({ ...filterProps, request_id: e.target.value })}
            />
          </Box>
        </HStack>
        <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
          <ScrollData h={'100%'}>
            <TableContainer fontSize={'sm'}>
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
                      <Td color={item.duration > 10 ? 'red.600' : ''}>
                        {item.duration.toFixed(2)}s
                      </Td>
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
          </ScrollData>
        </MyBox>
      </ModalBody>

      {!!logDetail && <LogDetail data={logDetail} onClose={() => setLogDetail(undefined)} />}
    </MyModal>
  );
};

export default React.memo(ChannelLogModal);

const LogDetail = ({ data, onClose }: { data: LogDetailType; onClose: () => void }) => {
  const { t } = useTranslation();
  const { data: detailData } = useRequest(
    async () => {
      if (data.code === 200) return data;
      try {
        const res = await getLogDetail(data.id);
        return {
          ...res,
          ...data
        };
      } catch (error) {
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
          {/* Basic info grid */}
          <Grid
            templateColumns="repeat(2, 1fr)"
            gap={0}
            borderWidth="1px"
            borderRadius="md"
            fontSize={'sm'}
            overflow={'hidden'}
          >
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogTitle>RequestID</LogTitle>
              <LogContainer>{detailData?.request_id}</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogTitle>Request IP</LogTitle>
              <LogContainer>{detailData?.ip}</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogTitle>{t('config_model:channel_status')}</LogTitle>
              <LogContainer color={detailData.code === 200 ? 'green.600' : 'red.600'}>
                {detailData?.code}
              </LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogTitle>Endpoint</LogTitle>
              <LogContainer>{detailData?.endpoint}</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogTitle>{t('config_model:channel_name')}</LogTitle>
              <LogContainer>{detailData?.channelName}</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogTitle>{t('config_model:model')}</LogTitle>
              <LogContainer>{detailData?.model}</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogTitle>{t('config_model:request_at')}</LogTitle>
              <LogContainer>{detailData?.request_at}</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogTitle>{t('config_model:duration')}</LogTitle>
              <LogContainer>{detailData?.duration.toFixed(2)}s</LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <LogTitle flex={'0 0 150px'}>{t('config_model:model_ttfb_time')}</LogTitle>
              <LogContainer>
                {detailData.ttfb_milliseconds ? `${detailData.ttfb_milliseconds}ms` : '-'}
              </LogContainer>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <LogTitle flex={'0 0 150px'}>{t('config_model:model_tokens')}</LogTitle>
              <LogContainer>
                {detailData?.usage?.input_tokens} / {detailData?.usage?.output_tokens}
              </LogContainer>
            </GridItem>
            {detailData?.retry_times !== undefined && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <LogTitle>{t('config_model:retry_times')}</LogTitle>
                <LogContainer>{detailData?.retry_times}</LogContainer>
              </GridItem>
            )}
            {detailData?.content && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <LogTitle>Content</LogTitle>
                <LogContainer>{detailData?.content}</LogContainer>
              </GridItem>
            )}
            {detailData?.request_body && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <LogTitle>Request Body</LogTitle>
                <LogContainer userSelect={'all'}>{detailData?.request_body}</LogContainer>
              </GridItem>
            )}
            {detailData?.response_body && (
              <GridItem display={'flex'} colSpan={2}>
                <LogTitle>Response Body</LogTitle>
                <LogContainer>{detailData?.response_body}</LogContainer>
              </GridItem>
            )}
          </Grid>
        </ModalBody>
      )}
    </MyModal>
  );
};
