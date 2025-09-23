import { getChannelList, getChannelLog, getLogDetail } from '@/web/core/ai/channel';
import { getSystemModelList } from '@/web/core/ai/config';
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
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { addDays } from 'date-fns';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import type { ChannelLogListItemType } from '@/global/aiproxy/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';

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
  const { t, i18n } = useTranslation();
  const { userInfo } = useUserStore();
  const { getModelProvider } = useSystemStore();

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

  const { data: channelList = [] } = useRequest2(
    async () => {
      const res = await getChannelList().then((res) =>
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

  const { data: systemModelList = [] } = useRequest2(getSystemModelList, {
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
    <>
      {isRoot && (
        <Flex alignItems={'center'}>
          {Tab}
          <Box flex={1} />
          <Box flex={'0 0 200px'}>
            <SearchInput
              placeholder={t('account_model:log_request_id_search')}
              defaultValue={filterProps.request_id}
              onBlur={(e) => setFilterProps({ ...filterProps, request_id: e.target.value })}
            />
          </Box>
        </Flex>
      )}
      <HStack spacing={4}>
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
        <HStack>
          <FormLabel>{t('account_model:channel_name')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<string>
              bg={'myGray.50'}
              isSearch
              list={channelList}
              placeholder={t('account_model:select_channel')}
              value={filterProps.channelId}
              onChange={(val) => setFilterProps({ ...filterProps, channelId: val })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('account_model:model_name')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<string>
              bg={'myGray.50'}
              isSearch
              list={modelList}
              placeholder={t('account_model:select_model')}
              value={filterProps.model}
              onChange={(val) => setFilterProps({ ...filterProps, model: val })}
            />
          </Box>
        </HStack>
        <HStack flex={'0 0 200px'}>
          <FormLabel>{t('account_model:log_status')}</FormLabel>
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
      </HStack>
      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <ScrollData h={'100%'}>
          <TableContainer fontSize={'sm'}>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('account_model:channel_name')}</Th>
                  <Th>{t('account_model:model')}</Th>
                  <Th>{t('account_model:model_tokens')}</Th>
                  <Th>{t('account_model:duration')}</Th>
                  <Th>{t('account_model:channel_status')}</Th>
                  <Th>{t('account_model:request_at')}</Th>
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
                        {t('account_model:detail')}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </ScrollData>
      </MyBox>

      {!!logDetail && <LogDetail data={logDetail} onClose={() => setLogDetail(undefined)} />}
    </>
  );
};

export default ChannelLog;

const LogDetail = ({ data, onClose }: { data: LogDetailType; onClose: () => void }) => {
  const { t } = useTranslation();
  const { data: detailData } = useRequest2(
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

  const Title = useCallback(({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
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
  }, []);
  const Container = useCallback(
    ({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
      return (
        <Box p={3} flex={1} {...props}>
          {children}
        </Box>
      );
    },
    []
  );

  return (
    <MyModal
      isOpen
      iconSrc="support/bill/payRecordLight"
      title={t('account_model:log_detail')}
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
              <Title>RequestID</Title>
              <Container>{detailData?.request_id}</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <Title>Request IP</Title>
              <Container>{detailData?.ip}</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <Title>{t('account_model:channel_status')}</Title>
              <Container color={detailData.code === 200 ? 'green.600' : 'red.600'}>
                {detailData?.code}
              </Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <Title>Endpoint</Title>
              <Container>{detailData?.endpoint}</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <Title>{t('account_model:channel_name')}</Title>
              <Container>{detailData?.channelName}</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <Title>{t('account_model:model')}</Title>
              <Container>{detailData?.model}</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <Title>{t('account_model:request_at')}</Title>
              <Container>{detailData?.request_at}</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <Title>{t('account_model:duration')}</Title>
              <Container>{detailData?.duration.toFixed(2)}s</Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px" borderRightWidth="1px">
              <Title flex={'0 0 150px'}>{t('account_model:model_ttfb_time')}</Title>
              <Container>
                {detailData.ttfb_milliseconds ? `${detailData.ttfb_milliseconds}ms` : '-'}
              </Container>
            </GridItem>
            <GridItem display={'flex'} borderBottomWidth="1px">
              <Title flex={'0 0 150px'}>{t('account_model:model_tokens')}</Title>
              <Container>
                {detailData?.usage?.input_tokens} / {detailData?.usage?.output_tokens}
              </Container>
            </GridItem>
            {detailData?.retry_times !== undefined && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <Title>{t('account_model:retry_times')}</Title>
                <Container>{detailData?.retry_times}</Container>
              </GridItem>
            )}
            {detailData?.content && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <Title>Content</Title>
                <Container>{detailData?.content}</Container>
              </GridItem>
            )}
            {detailData?.request_body && (
              <GridItem display={'flex'} borderBottomWidth="1px" colSpan={2}>
                <Title>Request Body</Title>
                <Container userSelect={'all'}>{detailData?.request_body}</Container>
              </GridItem>
            )}
            {detailData?.response_body && (
              <GridItem display={'flex'} colSpan={2}>
                <Title>Response Body</Title>
                <Container>{detailData?.response_body}</Container>
              </GridItem>
            )}
          </Grid>
        </ModalBody>
      )}
    </MyModal>
  );
};
