import { Box, Button, Flex, Table, Tbody, Td, Th, Thead, Tooltip, Tr } from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type {
  CreateModelData,
  ModelChannelSummary
} from '@fastgpt/global/openapi/core/ai/model/api';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { enableMapSet, produce, type Draft } from 'immer';
import { useRef, useState } from 'react';
import { postImportModelsFromChannel } from '@/web/core/ai/model/api';
import StepContent, { ChannelImportToolbar } from './StepContent';
import type { RowResult } from './types';

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
  rows: CreateModelData[];
  rowResults: Map<string, RowResult>;
  t: ReturnType<typeof useSafeTranslation>['t'];
}) => {
  const { containerRef, virtualDataList, topPlaceholderHeight, bottomPlaceholderHeight } =
    useStaticVirtualList({ data: rows, itemHeight: 56, overscan: 8 });
  const getResultLabel = (status?: RowResult['status']) => {
    switch (status) {
      case 'success':
        return t('config_model:channel_import_result_success');
      case 'failed':
        return t('config_model:channel_import_result_failed');
      case 'unknown':
        return t('config_model:channel_import_result_unknown');
      default:
        return t('config_model:channel_import_result_pending');
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
        <Table minW="580px" sx={{ tableLayout: 'fixed', width: headerTableWidth }}>
          <colgroup>
            <col style={{ width: '260px' }} />
            <col style={{ width: '320px' }} />
          </colgroup>
          <Thead>
            <Tr>
              <Th fontSize="xs">{t('config_model:channel_import_model')}</Th>
              <Th fontSize="xs">{t('config_model:channel_import_result')}</Th>
            </Tr>
          </Thead>
        </Table>
      )}
      renderBody={({ headerTableWidth }) => (
        <Table minW="580px" sx={{ tableLayout: 'fixed', width: headerTableWidth }}>
          <colgroup>
            <col style={{ width: '260px' }} />
            <col style={{ width: '320px' }} />
          </colgroup>
          <Tbody>
            {topPlaceholderHeight > 0 && (
              <Tr h={topPlaceholderHeight + 'px'} aria-hidden>
                <Td colSpan={2} h={topPlaceholderHeight + 'px'} p={0} border={0} />
              </Tr>
            )}
            {virtualDataList.map(({ data: row }) => {
              const result = rowResults.get(row.model);
              const error = result?.error ? t(getErrText(result.error)) : undefined;

              return (
                <Tr key={row.model} h="56px">
                  <Td fontSize="sm">
                    <Box noOfLines={1}>{row.model}</Box>
                  </Td>
                  <Td fontSize="sm">
                    <Tooltip label={error} isDisabled={!error}>
                      <Box
                        color={result?.status === 'failed' ? 'red.500' : 'myGray.700'}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        {getResultLabel(result?.status)}
                        {error && `：${error}`}
                      </Box>
                    </Tooltip>
                  </Td>
                </Tr>
              );
            })}
            {bottomPlaceholderHeight > 0 && (
              <Tr h={bottomPlaceholderHeight + 'px'} aria-hidden>
                <Td colSpan={2} h={bottomPlaceholderHeight + 'px'} p={0} border={0} />
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
  models,
  onSubmittingChange,
  onPrevious,
  onRefresh,
  onImportSuccess
}: {
  channelId: number;
  channel?: ModelChannelSummary;
  models: CreateModelData[];
  onSubmittingChange: (submitting: boolean) => void;
  onPrevious: () => void;
  onRefresh: () => Promise<void>;
  onImportSuccess: () => void;
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

  const applyImport = async () => {
    if (importStartedRef.current || models.length === 0) return;
    // 同步锁住入口，避免 React 更新按钮状态前重复提交。
    importStartedRef.current = true;
    onSubmittingChange(true);

    updateState((draft) => {
      draft.hasStartedImport = true;
      draft.submitting = true;
    });
    const nextResults = new Map<string, RowResult>();
    try {
      let shouldRefresh = false;
      try {
        const response = await postImportModelsFromChannel({ channelId, models });
        const resultByModel = new Map(response.results.map((result) => [result.model, result]));
        for (const { model } of models) {
          const result = resultByModel.get(model);
          shouldRefresh ||= !result || result.status !== 'failed' || result.modelId !== undefined;
          nextResults.set(
            model,
            result
              ? {
                  status: result.status,
                  error: result.status === 'failed' ? result.error : undefined
                }
              : { status: 'unknown' }
          );
        }
      } catch (error) {
        // 连接中断时服务端可能已完成写入，只有逐项响应能确认失败。
        shouldRefresh = true;
        for (const { model } of models) {
          nextResults.set(model, { status: 'unknown', error: getErrText(error) });
        }
      }

      if (models.every(({ model }) => nextResults.get(model)?.status === 'success')) {
        onImportSuccess();
        void onRefresh().catch(() => {});
        return;
      }
      if (shouldRefresh) await onRefresh().catch(() => {});

      updateState((draft) => {
        for (const [model, result] of nextResults) {
          draft.rowResults.set(model, result);
        }
      });
    } finally {
      onSubmittingChange(false);
      updateState((draft) => {
        draft.submitting = false;
      });
    }
  };

  return (
    <StepContent
      footer={
        (!state.hasStartedImport || state.submitting) && (
          <>
            <Button variant="whiteBase" onClick={onPrevious} isDisabled={state.submitting}>
              {t('config_model:previous_step')}
            </Button>
            {models.length > 0 && (
              <Button onClick={() => void applyImport()} isLoading={state.submitting}>
                {t('common:Confirm')}
              </Button>
            )}
          </>
        )
      }
    >
      <Flex direction="column" h="100%" minH={0} minW={0} gap={4}>
        <ChannelImportToolbar channelName={channel?.name} />
        {models.length === 0 ? (
          <Flex flex="1 1 0" minH={0} alignItems="center" justifyContent="center">
            <EmptyTip />
          </Flex>
        ) : (
          <ImportResultsTable rows={models} rowResults={state.rowResults} t={t} />
        )}
      </Flex>
    </StepContent>
  );
};

export default ImportResultsStep;
