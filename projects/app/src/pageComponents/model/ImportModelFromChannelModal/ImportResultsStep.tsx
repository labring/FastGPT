import { Box, Button, Flex, Table, Tbody, Td, Th, Thead, Tooltip, Tr } from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ModelChannelSummary } from '@fastgpt/global/openapi/core/ai/model/api';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import MyTag from '@fastgpt/web/components/common/Tag';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { enableMapSet, produce, type Draft } from 'immer';
import { useRef, useState } from 'react';
import { postApplyChannelImportChanges } from '@/web/core/ai/model/api';
import StepModal from './StepModal';
import type { ChannelImportPlan, RowResult } from './types';

enableMapSet();

type ResultsState = {
  rowResults: Map<string, RowResult>;
  submitting: boolean;
  hasStartedImport: boolean;
};

/** 在 Modal 内容挂载后再测量表格容器，避免 Portal 延迟挂载导致首次列表窗口为空。 */
const ImportResultsTable = ({
  rows,
  rowResults,
  t
}: {
  rows: ChannelImportPlan['rows'];
  rowResults: Map<string, RowResult>;
  t: ReturnType<typeof useSafeTranslation>['t'];
}) => {
  const { containerRef, virtualDataList, topPlaceholderHeight, bottomPlaceholderHeight } =
    useStaticVirtualList({ data: rows, itemHeight: 56, overscan: 8 });
  const getCategoryLabel = (category: (typeof rows)[number]['category']) => {
    switch (category) {
      case 'associated':
        return t('config_model:channel_import_category_associated');
      case 'existing':
        return t('config_model:channel_import_category_existing');
      case 'template':
        return t('config_model:channel_import_category_template');
      case 'blank':
        return t('config_model:channel_import_category_blank');
    }
  };

  return (
    <FixedTableLayout
      scrollMode="virtual"
      bodyRef={containerRef}
      rootProps={{ flex: '1 1 0', minH: 0, minW: 0, px: 0 }}
      bodyProps={{
        flex: '1 1 0',
        minH: 0,
        minW: 0,
        overflowX: 'auto',
        overflowY: 'auto'
      }}
      renderHeader={({ headerTableWidth }) => (
        <Table minW="760px" sx={{ tableLayout: 'fixed', width: headerTableWidth }}>
          <colgroup>
            <col style={{ width: '260px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '320px' }} />
          </colgroup>
          <Thead>
            <Tr>
              <Th fontSize="xs">{t('config_model:channel_import_model')}</Th>
              <Th fontSize="xs">{t('config_model:channel_import_action')}</Th>
              <Th fontSize="xs">{t('config_model:channel_import_result')}</Th>
            </Tr>
          </Thead>
        </Table>
      )}
      renderBody={({ headerTableWidth }) => (
        <Table minW="760px" sx={{ tableLayout: 'fixed', width: headerTableWidth }}>
          <colgroup>
            <col style={{ width: '260px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '320px' }} />
          </colgroup>
          <Tbody>
            {topPlaceholderHeight > 0 && (
              <Tr h={topPlaceholderHeight + 'px'} aria-hidden>
                <Td colSpan={3} h={topPlaceholderHeight + 'px'} p={0} border={0} />
              </Tr>
            )}
            {virtualDataList.map(({ data: row }) => {
              const result = rowResults.get(row.providerModelSlug);

              return (
                <Tr key={row.providerModelSlug} h="56px">
                  <Td fontSize="sm">
                    <Box noOfLines={1}>{row.providerModelSlug}</Box>
                  </Td>
                  <Td>
                    <MyTag type="borderFill" colorSchema="gray">
                      {getCategoryLabel(row.category)}
                    </MyTag>
                  </Td>
                  <Td fontSize="sm">
                    <Tooltip label={result?.error} isDisabled={!result?.error}>
                      <Box
                        color={result?.status === 'failed' ? 'red.500' : 'myGray.700'}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        {result?.status === 'success'
                          ? t('config_model:channel_import_result_success')
                          : result?.status === 'skipped'
                            ? t('config_model:channel_import_result_skipped')
                            : result?.status === 'failed'
                              ? t('config_model:channel_import_result_failed')
                              : t('config_model:channel_import_result_pending')}
                        {result?.error && `：${result.error}`}
                      </Box>
                    </Tooltip>
                  </Td>
                </Tr>
              );
            })}
            {bottomPlaceholderHeight > 0 && (
              <Tr h={bottomPlaceholderHeight + 'px'} aria-hidden>
                <Td colSpan={3} h={bottomPlaceholderHeight + 'px'} p={0} border={0} />
              </Tr>
            )}
          </Tbody>
        </Table>
      )}
    />
  );
};

const ImportResultsStep = ({
  channelId,
  channel,
  plan,
  onClose,
  onPrevious,
  onSuccess
}: {
  channelId: number;
  channel?: ModelChannelSummary;
  plan: ChannelImportPlan;
  onClose: () => void;
  onPrevious: () => void;
  onSuccess: () => Promise<void>;
}) => {
  const { t } = useSafeTranslation();
  const [state, setState] = useState<ResultsState>(() => ({
    rowResults: new Map(),
    submitting: false,
    hasStartedImport: false
  }));
  const importStartedRef = useRef(false);
  const updateState = (recipe: (draft: Draft<ResultsState>) => void) =>
    setState((current) => produce(current, recipe));

  const pendingRows = plan.rows.filter((row) => !state.rowResults.has(row.providerModelSlug));

  const applyImport = async () => {
    if (importStartedRef.current || pendingRows.length === 0) return;
    // 同步锁住入口，避免 React 更新按钮状态前重复提交。
    importStartedRef.current = true;

    updateState((draft) => {
      draft.hasStartedImport = true;
      draft.submitting = true;
    });
    const nextResults = new Map<string, RowResult>();
    for (const row of pendingRows) {
      if (!row.operation) {
        nextResults.set(row.providerModelSlug, {
          status: 'failed',
          error: t('config_model:channel_import_apply_error')
        });
      }
    }
    const operations = pendingRows.flatMap((row) => (row.operation ? [row.operation] : []));

    try {
      if (operations.length > 0) {
        try {
          const response = await postApplyChannelImportChanges({
            channelId,
            channelType: 'system',
            operations
          });
          const resultBySlug = new Map(
            response.results.map((result) => [result.providerModelSlug, result] as const)
          );
          for (const operation of operations) {
            const result = resultBySlug.get(operation.providerModelSlug);
            nextResults.set(
              operation.providerModelSlug,
              result
                ? {
                    status: result.status,
                    error: result.status === 'failed' ? result.error : undefined
                  }
                : {
                    status: 'failed',
                    error: t('config_model:channel_import_apply_error')
                  }
            );
          }
          if (
            response.results.some(
              (result) =>
                result.status !== 'failed' ||
                (result.action === 'create' && result.modelId !== undefined)
            )
          ) {
            await onSuccess().catch(() => {});
          }
        } catch (error) {
          for (const operation of operations) {
            nextResults.set(operation.providerModelSlug, {
              status: 'failed',
              error: getErrText(error, t('config_model:channel_import_apply_error'))
            });
          }
        }
      }

      updateState((draft) => {
        for (const [providerModelSlug, result] of nextResults) {
          draft.rowResults.set(providerModelSlug, result);
        }
      });
    } finally {
      updateState((draft) => {
        draft.submitting = false;
      });
    }
  };

  return (
    <StepModal
      isOpen
      title={t('config_model:channel_import_import_step')}
      onClose={onClose}
      height="min(560px, calc(100vh - 32px))"
      footer={
        state.hasStartedImport ? (
          <Button onClick={onClose} isLoading={state.submitting} isDisabled={state.submitting}>
            {t('config_model:channel_import_done')}
          </Button>
        ) : (
          <>
            <Button variant="whiteBase" onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button variant="whiteBase" onClick={onPrevious}>
              {t('config_model:previous_step')}
            </Button>
            {pendingRows.length > 0 && (
              <Button onClick={() => void applyImport()}>
                {t('config_model:channel_import_apply')}
              </Button>
            )}
          </>
        )
      }
    >
      <Flex direction="column" h="100%" minH={0} minW={0} gap={4}>
        <Flex alignItems="center" gap={3} flexShrink={0}>
          <Box fontWeight="500">{t('config_model:channel_import_channel')}</Box>
          <Box color="myGray.700">{channel?.name}</Box>
        </Flex>
        {plan.rows.length === 0 ? (
          <Flex flex="1 1 0" minH={0} alignItems="center" justifyContent="center">
            <EmptyTip />
          </Flex>
        ) : (
          <ImportResultsTable rows={plan.rows} rowResults={state.rowResults} t={t} />
        )}
      </Flex>
    </StepModal>
  );
};

export default ImportResultsStep;
