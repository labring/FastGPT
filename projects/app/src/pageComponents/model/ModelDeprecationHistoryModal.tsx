import { Box, Button, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ModelDeprecationInformHistoryItemType } from '@fastgpt/global/openapi/admin/system/inform/api';
import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React from 'react';
import { getPlannedDeprecationDateLabel } from '@/pageComponents/admin/inform/modelDeprecationUtils';
import { postListModelDeprecationInforms } from '@/web/admin/system/inform/api';

const formatDate = (date: string) => new Date(date).toLocaleDateString();
const historyColumns = [
  { key: 'models', width: '240px' },
  { key: 'plannedDate', width: '150px' },
  { key: 'channels', width: '150px' },
  { key: 'sendTimes', width: '180px' }
] as const;
const historyTableMinWidth = '780px';

/** 展示通知计划及其三轮发送信息；多个值按行展示，超出三行时悬停查看全部。 */
const ModelDeprecationHistoryModal = ({
  models,
  onClose
}: {
  models: ModelConfigListItem[];
  onClose: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [pageNum, setPageNum] = React.useState(1);
  const pageSize = 20;
  const { data, loading, runAsync } = useRequest(postListModelDeprecationInforms, {
    manual: true
  });
  React.useEffect(() => {
    void runAsync({ pageNum, pageSize });
  }, [pageNum, runAsync]);
  const modelNames = React.useMemo(
    () => new Map(models.map((model) => [model.modelId, model.name || model.model])),
    [models]
  );
  const channelLabels: Record<ModelDeprecationInformChannelEnum, string> = {
    [ModelDeprecationInformChannelEnum.inApp]: t('config_model:model_deprecation.channel_in_app'),
    [ModelDeprecationInformChannelEnum.email]: t('config_model:model_deprecation.channel_email'),
    [ModelDeprecationInformChannelEnum.sms]: t('config_model:model_deprecation.channel_email')
  };

  return (
    <MyModal
      title={t('config_model:model_deprecation.history_title')}
      onClose={onClose}
      w={'820px'}
      footer={
        <Button minW={'64px'} onClick={onClose}>
          {t('config_model:model_deprecation.done')}
        </Button>
      }
      bodyStyles={{ overflow: 'hidden' }}
    >
      <FixedTableLayout
        scrollMode={'normal'}
        horizontalScroll
        rootProps={{
          w: '100%',
          h: '400px',
          border: '1px solid',
          borderColor: 'myGray.200',
          borderRadius: 'lg',
          boxShadow: 'none'
        }}
        bodyProps={{ flex: '1 1 0', minH: 0, overflow: 'auto' }}
        footer={
          (data?.total ?? 0) > pageSize ? (
            <Flex px={4} py={3} justifyContent={'flex-end'} gap={3} alignItems={'center'}>
              <Button
                variant={'whiteBase'}
                size={'sm'}
                isDisabled={pageNum <= 1}
                onClick={() => setPageNum((value) => value - 1)}
              >
                {t('config_model:model_deprecation.previous_page')}
              </Button>
              <Box>{`${pageNum} / ${Math.ceil((data?.total ?? 0) / pageSize)}`}</Box>
              <Button
                variant={'whiteBase'}
                size={'sm'}
                isDisabled={pageNum * pageSize >= (data?.total ?? 0)}
                onClick={() => setPageNum((value) => value + 1)}
              >
                {t('config_model:model_deprecation.next_page')}
              </Button>
            </Flex>
          ) : null
        }
        renderHeader={({ headerTableWidth }) => (
          <Table
            minW={historyTableMinWidth}
            sx={{ tableLayout: 'fixed', width: `${headerTableWidth} !important` }}
          >
            <colgroup>
              {historyColumns.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>
            <Thead>
              <Tr bg={'myGray.100'}>
                <Th fontSize={'xs'} color={'myGray.600'}>
                  {t('config_model:model_deprecation.models')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'}>
                  {t('config_model:model_deprecation.planned_date')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'}>
                  {t('config_model:model_deprecation.channel')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'}>
                  {t('config_model:model_deprecation.send_time')}
                </Th>
              </Tr>
            </Thead>
          </Table>
        )}
        renderBody={() =>
          !loading && !data?.list.length ? (
            <Flex
              h={'calc(400px - 41px)'}
              alignItems={'center'}
              justifyContent={'center'}
              color={'myGray.500'}
            >
              {t('config_model:model_deprecation.no_history')}
            </Flex>
          ) : (
            <Table minW={historyTableMinWidth} w={'100%'} sx={{ tableLayout: 'fixed' }}>
              <colgroup>
                {historyColumns.map((column) => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>
              <Tbody>
                {loading ? (
                  <Tr>
                    <Td colSpan={historyColumns.length} textAlign={'center'}>
                      {t('common:Loading')}
                    </Td>
                  </Tr>
                ) : (
                  data?.list.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      modelNames={modelNames}
                      channelLabels={channelLabels}
                    />
                  ))
                )}
              </Tbody>
            </Table>
          )
        }
      />
    </MyModal>
  );
};

/** 用统一换行列表表达模型、渠道和发送时间，三行以上由 tooltip 承载完整内容。 */
const HistoryLines = ({ values }: { values: string[] }) => {
  const text = values.length ? values.join('\n') : '-';
  return (
    <MyTooltip label={text} isDisabled={values.length <= 3}>
      <Box
        as={'span'}
        display={'block'}
        whiteSpace={'pre-line'}
        overflow={'hidden'}
        maxH={'60px'}
        cursor={values.length > 3 ? 'help' : undefined}
      >
        {values.slice(0, 3).join('\n')}
      </Box>
    </MyTooltip>
  );
};

const HistoryRow = ({
  item,
  modelNames,
  channelLabels
}: {
  item: ModelDeprecationInformHistoryItemType;
  modelNames: Map<string, string>;
  channelLabels: Record<ModelDeprecationInformChannelEnum, string>;
}) => {
  const models = item.models.map((modelId) => modelNames.get(modelId) ?? modelId);
  const channels = [...new Set(item.jobs.flatMap((job) => job.channels))].map(
    (channel) => channelLabels[channel]
  );
  const sendTimes = item.jobs.flatMap((job) =>
    job.completedAt ? [formatDate(job.completedAt)] : []
  );

  return (
    <Tr>
      <Td verticalAlign={'middle'}>
        <HistoryLines values={models} />
      </Td>
      <Td verticalAlign={'middle'}>{getPlannedDeprecationDateLabel(item.plannedDeprecationAt)}</Td>
      <Td verticalAlign={'middle'}>
        <HistoryLines values={channels} />
      </Td>
      <Td verticalAlign={'middle'}>
        <HistoryLines values={sendTimes} />
      </Td>
    </Tr>
  );
};

export default ModelDeprecationHistoryModal;
