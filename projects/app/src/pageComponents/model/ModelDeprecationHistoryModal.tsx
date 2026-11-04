import { Box, Button, Flex, HStack, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import type {
  ModelDeprecationInformHistoryItemType,
  ModelDeprecationInformHistoryRunType
} from '@fastgpt/global/openapi/admin/system/inform/api';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelDeprecationInformChannelEnum } from '@fastgpt/global/support/user/inform/constants';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React from 'react';
import {
  postListModelDeprecationFailures,
  postListModelDeprecationInforms,
  postRetryModelDeprecationInformRun,
  postTerminateModelDeprecationInform
} from '@/web/admin/system/inform/api';

const formatDate = (date: string) => new Date(date).toLocaleDateString();
const pageSize = 20;
const historyColumns = [
  { key: 'models', width: '24%' },
  { key: 'plannedDate', width: '17%' },
  { key: 'channels', width: '17%' },
  { key: 'sendTimes', width: '28%' },
  { key: 'actions', width: '14%' }
] as const;
const historyTableMinWidth = '960px';

/** 展示通知计划及各轮发送状态；失败正文只在点击异常标签后读取。 */
const ModelDeprecationHistoryModal = ({
  models,
  onClose
}: {
  models: ModelConfigListItem[];
  onClose: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [pageNum, setPageNum] = React.useState(1);
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
      w={'860px'}
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
          minW: 0,
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
                <Th fontSize={'xs'} color={'myGray.600'} px={6}>
                  {t('config_model:model_deprecation.models')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'} px={3}>
                  {t('config_model:model_deprecation.planned_date')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'} px={3}>
                  {t('config_model:model_deprecation.channel')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'} px={3}>
                  {t('config_model:model_deprecation.send_time')}
                </Th>
                <Th fontSize={'xs'} color={'myGray.600'} px={3} textAlign={'right'}>
                  {t('config_model:model_deprecation.actions')}
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
                      onRefresh={() => void runAsync({ pageNum, pageSize })}
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

/** 用统一换行列表表达模型和渠道，三行以上由 tooltip 承载完整内容。 */
const HistoryLines = ({ values }: { values: string[] }) => {
  const text = values.length ? values.join('\n') : '-';
  return (
    <MyTooltip label={text} isDisabled={values.length <= 3}>
      <Box
        as={'span'}
        display={'block'}
        whiteSpace={'pre-line'}
        overflow={'hidden'}
        maxH={'3lh'}
        cursor={values.length > 3 ? 'help' : undefined}
        lineHeight={'1.5'}
      >
        {values.slice(0, 3).join('\n')}
      </Box>
    </MyTooltip>
  );
};

const HistoryRow = ({
  item,
  modelNames,
  channelLabels,
  onRefresh
}: {
  item: ModelDeprecationInformHistoryItemType;
  modelNames: Map<string, string>;
  channelLabels: Record<ModelDeprecationInformChannelEnum, string>;
  onRefresh: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [failureRunIndex, setFailureRunIndex] = React.useState<number>();
  const { openConfirm, ConfirmModal } = useConfirm();
  const { runAsync: retryRun } = useRequest(postRetryModelDeprecationInformRun, {
    manual: true,
    onSuccess: onRefresh
  });
  const { runAsync: terminatePlan, loading: terminating } = useRequest(
    postTerminateModelDeprecationInform,
    {
      manual: true,
      onSuccess: onRefresh
    }
  );
  const models = item.models.map((modelId) => modelNames.get(modelId) ?? modelId);
  const channels = Array.from(
    new Set(item.runs.flatMap((run) => run.channels ?? []).map((channel) => channelLabels[channel]))
  );
  const canTerminate = item.runs.some(
    (run) => run.status === 'scheduled' || run.status === 'running'
  );
  const planTerminated = item.runs.some(
    (run) => run.status === 'terminated' || run.status === 'skipped'
  );
  const retriedRunIndexes = new Set(
    item.runs
      .filter((run) => run.kind === 'retry')
      .map((run) => run.sourceRunIndex)
      .filter((runIndex): runIndex is number => runIndex !== undefined)
  );

  return (
    <>
      <Tr>
        <Td verticalAlign={'middle'} px={6}>
          <HistoryLines values={models} />
        </Td>
        <Td verticalAlign={'middle'} px={3}>
          {item.plannedDeprecationAt}
        </Td>
        <Td verticalAlign={'middle'} px={3}>
          <HistoryLines values={channels} />
        </Td>
        <Td verticalAlign={'middle'} px={3}>
          <Flex direction={'column'} gap={'2px'}>
            {item.runs.map((run) => (
              <RunStatus
                key={run.runIndex}
                run={run}
                onShowFailures={() => setFailureRunIndex(run.runIndex)}
                onRetry={
                  !planTerminated &&
                  run.status === 'completed' &&
                  run.failureCount > 0 &&
                  !retriedRunIndexes.has(run.runIndex)
                    ? () => retryRun({ campaignId: item.id, runIndex: run.runIndex })
                    : undefined
                }
              />
            ))}
          </Flex>
        </Td>
        <Td verticalAlign={'middle'} px={3} textAlign={'right'}>
          {canTerminate ? (
            <Button
              size={'md'}
              variant={'whiteBase'}
              isLoading={terminating}
              onClick={() => {
                openConfirm({
                  onConfirm: () => terminatePlan({ campaignId: item.id }),
                  customContent: t('config_model:model_deprecation.terminate_confirm'),
                  confirmText: t('config_model:model_deprecation.terminate')
                })();
              }}
            >
              {t('config_model:model_deprecation.terminate')}
            </Button>
          ) : (
            <Box textAlign={'center'}>-</Box>
          )}
        </Td>
      </Tr>
      {failureRunIndex !== undefined && (
        <FailureModal
          campaignId={item.id}
          runIndex={failureRunIndex}
          key={`${item.id}-${failureRunIndex}`}
          onClose={() => setFailureRunIndex(undefined)}
        />
      )}
      <ConfirmModal />
    </>
  );
};

const getStatusColor = (run: ModelDeprecationInformHistoryRunType) => {
  if (run.failureCount > 0 || run.status === 'failed' || run.status === 'interrupted') {
    return 'red.500';
  }
  if (run.status === 'running') return 'green.600';
  if (run.status === 'scheduled') return 'primary.600';
  return 'myGray.700';
};

const RunStatus = ({
  run,
  onShowFailures,
  onRetry
}: {
  run: ModelDeprecationInformHistoryRunType;
  onShowFailures: () => void;
  onRetry?: () => void;
}) => {
  const { t } = useSafeTranslation();
  const time =
    run.status === 'scheduled' || run.status === 'skipped'
      ? run.scheduledAt
      : (run.lastStatusAt ?? run.scheduledAt);
  const statusLabel =
    run.failureCount > 0
      ? t('config_model:model_deprecation.failure_count', { count: run.failureCount })
      : run.status === 'completed'
        ? t('config_model:model_deprecation.all_completed')
        : run.status === 'scheduled'
          ? t('config_model:model_deprecation.waiting')
          : t(`config_model:model_deprecation.status_${run.status}`);

  return (
    <HStack gap={'8px'} alignItems={'center'} minH={'20px'}>
      <Box w={'9ch'} flexShrink={0} color={'myGray.600'} fontSize={'sm'} lineHeight={'20px'}>
        {time ? formatDate(time) : '-'}
      </Box>
      <MyTooltip label={statusLabel} isDisabled={run.failureCount === 0} placement={'top'}>
        <Box
          as={'button'}
          type={'button'}
          fontSize={'10px'}
          lineHeight={'14px'}
          fontWeight={'500'}
          color={getStatusColor(run)}
          textDecoration={run.failureCount > 0 ? 'underline' : undefined}
          whiteSpace={'nowrap'}
          cursor={run.failureCount > 0 ? 'pointer' : undefined}
          onClick={run.failureCount > 0 ? onShowFailures : undefined}
        >
          {statusLabel}
        </Box>
      </MyTooltip>
      {onRetry && (
        <Button
          size={'xs'}
          variant={'transparentBase'}
          px={0}
          h={'auto'}
          minW={0}
          color={'myGray.600'}
          fontWeight={'500'}
          leftIcon={<MyIcon name={'common/refresh'} w={'14px'} />}
          onClick={onRetry}
        >
          {t('config_model:model_deprecation.retry')}
        </Button>
      )}
    </HStack>
  );
};

/** 与升级任务失败明细保持同一种只读 JSON 展示。 */
const FailureModal = ({
  campaignId,
  runIndex,
  onClose
}: {
  campaignId: string;
  runIndex: number;
  onClose: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [pageNum, setPageNum] = React.useState(1);
  const [items, setItems] = React.useState<
    Awaited<ReturnType<typeof postListModelDeprecationFailures>>['list']
  >([]);
  const [total, setTotal] = React.useState<number>();
  const { loading, runAsync } = useRequest(postListModelDeprecationFailures);

  React.useEffect(() => {
    void runAsync({ campaignId, runIndex, pageNum, pageSize }).then((data) => {
      setItems(data.list);
      setTotal(data.total);
    });
  }, [campaignId, runIndex, pageNum, runAsync]);

  return (
    <MyModal
      title={t('config_model:model_deprecation.failures_title', { count: total ?? 0 })}
      onClose={onClose}
      size={'xl'}
      bodyStyles={{
        minH: '520px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}
    >
      {loading && !items.length ? (
        <Flex flex={1} alignItems={'center'} justifyContent={'center'}>
          <MyIcon name={'common/loading'} w={'20px'} />
        </Flex>
      ) : (
        <JsonEditor value={JSON.stringify(items, null, 2)} readOnly defaultHeight={480} />
      )}
      {!!total && total > pageSize && (
        <Flex justifyContent={'center'} gap={3} mt={3} alignItems={'center'}>
          <Button
            size={'sm'}
            variant={'whiteBase'}
            isDisabled={pageNum <= 1}
            onClick={() => setPageNum((value) => value - 1)}
          >
            {t('config_model:model_deprecation.previous_page')}
          </Button>
          <Box>{`${pageNum} / ${Math.ceil(total / pageSize)}`}</Box>
          <Button
            size={'sm'}
            variant={'whiteBase'}
            isDisabled={pageNum * pageSize >= total}
            onClick={() => setPageNum((value) => value + 1)}
          >
            {t('config_model:model_deprecation.next_page')}
          </Button>
        </Flex>
      )}
    </MyModal>
  );
};

export default ModelDeprecationHistoryModal;
