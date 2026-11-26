import React, { type CSSProperties } from 'react';
import { Box, Flex, Grid, HStack } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getChildrenTotalPoints } from '@fastgpt/global/core/chat/utils/mergeNode';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
import styles from '@/components/Markdown/index.module.scss';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { completionFinishReasonMap } from '@fastgpt/global/core/ai/constants';
import {
  formatModerationLabel,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { NodeModerationRecordType } from '@fastgpt/global/core/plugin/moderation/type';
import {
  extractContentSnippet,
  renderHighlightedModerationContent
} from '@/web/core/plugin/admin/moderation/highlight';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import QuoteList from '../../ChatContainer/ChatBox/components/QuoteList';
import FormInputResult from '../FormInputResult';
import { agentPlanStatusMap } from './constants';
import { responseRowValueBoxStyles, Row } from './Row';

const ImageQuery = dynamic(() => import('./ImageQuery'));

const ModerationRecordsRow = ({
  moderationRecords
}: {
  moderationRecords?: NodeModerationRecordType[];
}) => {
  const { t } = useSafeTranslation();

  if (!moderationRecords || moderationRecords.length === 0) return null;

  const renderModerationStageText = (stage: NodeModerationRecordType['stage']) => {
    switch (stage) {
      case ModerationStageEnum.entry:
        return t('chat:response.moderation_stage_entry');
      case ModerationStageEnum.modelInput:
        return t('chat:response.moderation_stage_model_input');
      case ModerationStageEnum.output:
      default:
        return t('chat:response.moderation_stage_output');
    }
  };

  const renderModerationVerdictText = (verdict: NodeModerationRecordType['verdict']) => {
    switch (verdict) {
      case 'error':
        return t('chat:response.moderation_result_error');
      case 'suspected':
        return t('chat:response.moderation_result_suspected');
      case 'block':
      default:
        return t('chat:response.moderation_result_block');
    }
  };

  return (
    <Row
      label={t('chat:response.moderation_records')}
      rawDom={
        <Flex direction={'column'} gap={2}>
          {moderationRecords.map((record, index) => {
            const isError = record.verdict === 'error';
            const hitLabels = Array.from(
              new Set(
                (record.hits ?? [])
                  .map((hit) => {
                    const labelName = formatModerationLabel(
                      hit.label,
                      t as (key: string) => string
                    );
                    if (hit.score !== undefined && !Number.isNaN(hit.score)) {
                      return `${labelName}（${Number(hit.score.toFixed(2))}）`;
                    }
                    return labelName;
                  })
                  .filter(Boolean)
              )
            );
            const allKeywords = Array.from(
              new Set([
                ...(record.keywords ?? []),
                ...(record.hits ?? []).flatMap((h) => h.keywords ?? [])
              ])
            ).filter(Boolean);

            return (
              <Box
                key={index}
                {...responseRowValueBoxStyles}
                borderRadius={'6px'}
                fontSize={'12px'}
                lineHeight={'16px'}
              >
                <Flex direction={'column'} gap={2}>
                  <Flex alignItems={'flex-start'} gap={2}>
                    <Box w={'80px'} flexShrink={0} color={'myGray.500'} fontWeight={500}>
                      {t('chat:response.moderation_stage')}
                    </Box>
                    <Box flex={'1 0 0'} minW={0} color={'myGray.900'} wordBreak={'break-word'}>
                      {renderModerationStageText(record.stage)}
                    </Box>
                  </Flex>

                  <Flex alignItems={'flex-start'} gap={2}>
                    <Box w={'80px'} flexShrink={0} color={'myGray.500'} fontWeight={500}>
                      {t('chat:response.moderation_result')}
                    </Box>
                    <Box flex={'1 0 0'} minW={0} color={'myGray.900'} wordBreak={'break-word'}>
                      {renderModerationVerdictText(record.verdict)}
                    </Box>
                  </Flex>

                  {!isError && hitLabels.length > 0 && (
                    <Flex alignItems={'flex-start'} gap={2}>
                      <Box w={'80px'} flexShrink={0} color={'myGray.500'} fontWeight={500}>
                        {t('chat:response.moderation_hit_labels')}
                      </Box>
                      <Box flex={'1 0 0'} minW={0} color={'myGray.900'} wordBreak={'break-word'}>
                        {hitLabels.join('、')}
                      </Box>
                    </Flex>
                  )}

                  {!isError && allKeywords.length > 0 && (
                    <Flex alignItems={'flex-start'} gap={2}>
                      <Box w={'80px'} flexShrink={0} color={'myGray.500'} fontWeight={500}>
                        {t('chat:response.moderation_keywords')}
                      </Box>
                      <Box flex={'1 0 0'} minW={0} color={'myGray.900'} wordBreak={'break-word'}>
                        {allKeywords.join('、')}
                      </Box>
                    </Flex>
                  )}

                  {!isError && record.content && (
                    <Flex alignItems={'flex-start'} gap={2}>
                      <Box w={'80px'} flexShrink={0} color={'myGray.500'} fontWeight={500}>
                        {t('chat:response.moderation_content_detail')}
                      </Box>
                      <Box
                        flex={'1 0 0'}
                        minW={0}
                        color={'myGray.900'}
                        whiteSpace={'pre-wrap'}
                        wordBreak={'break-word'}
                      >
                        {renderHighlightedModerationContent(
                          extractContentSnippet(record.content, allKeywords),
                          allKeywords
                        )}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              </Box>
            );
          })}
        </Flex>
      }
    />
  );
};

export const CommonInfoRows = ({ activeModule }: { activeModule: ChatHistoryItemResType }) => {
  const { t } = useSafeTranslation();
  const hasChildResponses = (activeModule.childrenResponses?.length ?? 0) > 0;
  const childTotalPoints = getChildrenTotalPoints(activeModule);

  return (
    <>
      <Row
        label={t('chat:response.node_name')}
        value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
      />
      <Row
        label={t('chat:response.status')}
        value={
          activeModule.agentPlanStatus
            ? t(agentPlanStatusMap[activeModule.agentPlanStatus] as any)
            : undefined
        }
      />
      {activeModule.totalPoints !== undefined && (
        <Row
          label={t('chat:response.total_points')}
          value={formatNumber(activeModule.totalPoints)}
        />
      )}
      {hasChildResponses && (
        <Row label={t('chat:response.child_total_points')} value={formatNumber(childTotalPoints)} />
      )}
      <Row label={t('chat:response.error')} value={activeModule.errorText ?? activeModule.error} />
      <ModerationRecordsRow moderationRecords={activeModule.moderationRecords} />
      <Row label={t('chat:response.node_inputs')} value={activeModule.nodeInputs} />
    </>
  );
};

const LlmRequestIdsRow = ({
  requestIds,
  onOpenRequestIdDetail
}: {
  requestIds?: string[];
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
  const { t } = useSafeTranslation();

  if (!requestIds || requestIds.length === 0 || !onOpenRequestIdDetail) return null;

  return (
    <Row
      label={t('chat:response.llm_request_ids')}
      rawDom={
        <Grid templateColumns={'repeat(2, minmax(0, 1fr))'} gap={2}>
          {requestIds.map((requestId, index) => (
            <Flex
              key={index}
              role={'group'}
              alignItems={'center'}
              gap={2}
              bg={'myGray.100'}
              borderRadius={'6px'}
              px={3}
              py={2}
              cursor={'pointer'}
              color={'myGray.900'}
              _hover={{ color: 'primary.600' }}
              onClick={() => onOpenRequestIdDetail(requestId)}
              title={t('chat:response.click_to_expand')}
            >
              <Box
                flex={'1 0 0'}
                w={0}
                fontSize={'12px'}
                lineHeight={'16px'}
                letterSpacing={'0.4px'}
                textOverflow={'ellipsis'}
                overflow={'hidden'}
                whiteSpace={'nowrap'}
              >
                {requestId}
              </Box>
              <MyIcon
                name={'common/upperRight'}
                w={'16px'}
                h={'16px'}
                color={'myGray.500'}
                _groupHover={{ color: 'primary.600' }}
              />
            </Flex>
          ))}
        </Grid>
      }
    />
  );
};

type TokenUsageCounts = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

const hasPositiveTokenCount = (value?: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const formatTokenNumber = (value: number) => value.toLocaleString('en-US');

/**
 * 统一展示 LLM Token 消耗明细（输入 / 输出 / 缓存读取 / 缓存创建），缺省或零值项自动省略。
 */
const TokenUsageRow = ({ label, usage }: { label: string; usage: TokenUsageCounts }) => {
  const { t } = useSafeTranslation();
  const candidates: { key: string; label: string; value?: number }[] = [
    { key: 'input', label: t('chat:response.token_input'), value: usage.inputTokens },
    { key: 'output', label: t('chat:response.token_output'), value: usage.outputTokens },
    {
      key: 'cacheRead',
      label: t('chat:response.token_cache_read'),
      value: usage.cacheReadTokens
    },
    {
      key: 'cacheCreation',
      label: t('chat:response.token_cache_creation'),
      value: usage.cacheCreationTokens
    }
  ];
  const items = candidates.filter((item): item is { key: string; label: string; value: number } =>
    hasPositiveTokenCount(item.value)
  );

  if (items.length === 0) return null;

  return (
    <Row
      label={label}
      rawDomBoxProps={responseRowValueBoxStyles}
      rawDom={
        <Box lineHeight={'18px'} wordBreak={'break-word'}>
          {items.map((item, index) => (
            <React.Fragment key={item.key}>
              {index > 0 && (
                <Box as={'span'} color={'myGray.400'}>
                  {' · '}
                </Box>
              )}
              <Box as={'span'} color={'myGray.600'}>
                {item.label}
              </Box>{' '}
              <Box
                as={'span'}
                color={'myGray.900'}
                fontWeight={500}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTokenNumber(item.value)}
              </Box>
            </React.Fragment>
          ))}
        </Box>
      }
    />
  );
};

export const AiChatRows = ({
  activeModule,
  onOpenRequestIdDetail
}: {
  activeModule: ChatHistoryItemResType;
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
  const { t } = useSafeTranslation();
  const hasError = Boolean(activeModule.error || activeModule.errorText);
  const hasLlmTokens =
    hasPositiveTokenCount(activeModule.inputTokens) ||
    hasPositiveTokenCount(activeModule.outputTokens);
  const hasToolCallTokens =
    hasPositiveTokenCount(activeModule.toolCallInputTokens) ||
    hasPositiveTokenCount(activeModule.toolCallOutputTokens);

  return (
    <>
      {!hasError && activeModule.finishReason && (
        <Row
          label={t('chat:response.completion_finish_reason')}
          value={t(completionFinishReasonMap[activeModule.finishReason])}
        />
      )}
      <Row label={t('chat:response.model')} value={activeModule.model} />
      {hasPositiveTokenCount(activeModule.tokens) && (
        <Row
          label={t('chat:response.llm_tokens')}
          value={formatTokenNumber(activeModule.tokens)}
          renderStringAsMarkdown={false}
        />
      )}
      <TokenUsageRow
        label={t('chat:response.llm_tokens')}
        usage={
          !hasLlmTokens && hasToolCallTokens
            ? {
                inputTokens: activeModule.toolCallInputTokens,
                outputTokens: activeModule.toolCallOutputTokens,
                cacheReadTokens: activeModule.cacheReadTokens,
                cacheCreationTokens: activeModule.cacheCreationTokens
              }
            : {
                inputTokens: activeModule.inputTokens,
                outputTokens: activeModule.outputTokens,
                cacheReadTokens: activeModule.cacheReadTokens,
                cacheCreationTokens: activeModule.cacheCreationTokens
              }
        }
      />
      {hasLlmTokens && hasToolCallTokens && (
        <TokenUsageRow
          label={t('chat:response.tool_call_tokens')}
          usage={{
            inputTokens: activeModule.toolCallInputTokens,
            outputTokens: activeModule.toolCallOutputTokens
          }}
        />
      )}
      {activeModule.compressTextAgent && (
        <>
          <Row
            label={t('chat:response.compress_llm_usage_point')}
            value={`${activeModule.compressTextAgent.totalPoints}`}
          />
          <TokenUsageRow
            label={t('chat:response.compress_llm_usage')}
            usage={activeModule.compressTextAgent}
          />
        </>
      )}
      {activeModule.firstTokenTime !== undefined && (
        <Row
          label={t('chat:response.first_token_time')}
          value={`${activeModule.firstTokenTime}s`}
          renderStringAsMarkdown={false}
        />
      )}
      <LlmRequestIdsRow
        requestIds={activeModule.llmRequestIds}
        onOpenRequestIdDetail={onOpenRequestIdDetail}
      />
      <Row label={t('chat:response.step_query')} value={activeModule.stepQuery} />

      <Row label={t('chat:response.query')} value={activeModule.query} />
      <Row label={t('chat:response.context_total_length')} value={activeModule.contextTotalLen} />
      <Row label={t('chat:response.temperature')} value={activeModule.temperature} />
      <Row label={t('chat:response.max_tokens')} value={activeModule.maxToken} />
      <Row label={t('chat:response.reasoning_content')} value={activeModule.reasoningText} />
      <Row
        label={t('chat:response.history_preview')}
        rawDomBoxProps={responseRowValueBoxStyles}
        rawDom={
          activeModule.historyPreview ? (
            <Box>
              {activeModule.historyPreview.map((item, i) => (
                <Box
                  key={i}
                  _notLast={{
                    borderBottom: '1px solid',
                    borderBottomColor: 'myWhite.700',
                    mb: 2
                  }}
                  pb={2}
                >
                  <Box fontWeight={'bold'}>{item.obj}</Box>
                  <Box whiteSpace={'pre-wrap'}>{item.value}</Box>
                </Box>
              ))}
            </Box>
          ) : (
            ''
          )
        }
      />
    </>
  );
};

export const DatasetSearchRows = ({
  activeModule,
  dataId
}: {
  activeModule: ChatHistoryItemResType;
  dataId?: string;
}) => {
  const { t } = useSafeTranslation();

  return (
    <>
      {activeModule.searchMode && (
        <Row
          label={t('chat:response.search_mode')}
          rawDomBoxProps={responseRowValueBoxStyles}
          rawDom={
            <Flex>
              <Box>{t(DatasetSearchModeMap[activeModule.searchMode]?.title as any)}</Box>
              {activeModule.embeddingWeight && (
                <>{`(${t('chat:response.hybrid_weight', {
                  emb: activeModule.embeddingWeight,
                  text: 1 - activeModule.embeddingWeight
                })})`}</>
              )}
            </Flex>
          }
        />
      )}
      <Row label={t('chat:response.similarity')} value={activeModule.similarity} />
      {activeModule.datasetQueries && activeModule.datasetQueries.length > 0 && (
        <Row
          label={t('chat:response.query')}
          rawDom={
            <ImageQuery
              datasetQueries={activeModule.datasetQueries}
              datasetId={activeModule.quoteList?.[0]?.datasetId}
            />
          }
        />
      )}
      <Row label={t('chat:response.limit')} value={activeModule.limit} />
      <Row label={t('chat:response.embedding_model')} value={activeModule.embeddingModel} />
      <Row
        label={t('chat:response.embedding_model_tokens')}
        value={`${activeModule.embeddingTokens}`}
      />
      {activeModule.searchUsingReRank !== undefined && (
        <>
          <Row
            label={t('chat:response.search_using_rerank')}
            rawDomBoxProps={responseRowValueBoxStyles}
            rawDom={
              <Box>
                {activeModule.searchUsingReRank ? (
                  activeModule.rerankModel ? (
                    <Box>{`${activeModule.rerankModel}: ${activeModule.rerankWeight}`}</Box>
                  ) : (
                    'True'
                  )
                ) : (
                  `False`
                )}
              </Box>
            }
          />
          <Row
            label={t('chat:response.rerank_tokens')}
            value={`${activeModule.reRankInputTokens}`}
          />
        </>
      )}
      <Row label={t('chat:response.extension_model')} value={activeModule.extensionModel} />
      <Row
        label={t('chat:response.query_extension_result')}
        value={`${activeModule.extensionResult}`}
      />
      {activeModule.quoteList && activeModule.quoteList.length > 0 && (
        <Row
          label={t('chat:response.search_results', { len: activeModule.quoteList.length })}
          rawDom={<QuoteList chatItemDataId={dataId} rawSearch={activeModule.quoteList} />}
        />
      )}
    </>
  );
};

const ReadFilesRows = ({ activeModule }: { activeModule: ChatHistoryItemResType }) => {
  const { t } = useSafeTranslation();

  return (
    <>
      {activeModule.readFiles && activeModule.readFiles.length > 0 && (
        <Row
          label={t('chat:response.read_files')}
          rawDom={
            <Grid templateColumns={'repeat(2, minmax(0, 1fr))'} gap={3}>
              {activeModule.readFiles.map((file, i) => (
                <HStack
                  key={i}
                  minW={0}
                  w={'100%'}
                  bg={'white'}
                  boxShadow={'base'}
                  borderRadius={'sm'}
                  py={1}
                  px={2}
                  {...(file.url
                    ? {
                        cursor: 'pointer',
                        onClick: () => window.open(file.url)
                      }
                    : {})}
                >
                  <MyIcon name={getFileIcon(file.name) as any} w={'1rem'} flexShrink={0} />
                  <MyTooltip
                    label={file.name || ''}
                    showOnlyWhenOverflow
                    shouldWrapChildren={false}
                  >
                    <Box
                      minW={0}
                      flex={'1 1 0'}
                      overflow={'hidden'}
                      textOverflow={'ellipsis'}
                      whiteSpace={'nowrap'}
                    >
                      {file.name}
                    </Box>
                  </MyTooltip>
                </HStack>
              ))}
            </Grid>
          }
        />
      )}
      <Row label={t('chat:response.read_file_result')} value={activeModule.readFilesResult} />
    </>
  );
};

export const WorkflowResultRows = ({
  activeModule,
  contentHeight
}: {
  activeModule: ChatHistoryItemResType;
  contentHeight?: number;
}) => {
  const { t } = useSafeTranslation();
  const responseCodeBlockHeight = contentHeight
    ? `${Math.floor(contentHeight * 0.8)}px`
    : undefined;
  const codeBlockContentBoxProps = responseCodeBlockHeight
    ? {
        className: styles.codeJsonConstrained,
        style: {
          '--response-code-block-height': responseCodeBlockHeight
        } as CSSProperties
      }
    : undefined;
  const isPlanOperation =
    activeModule.agentPlanStatus === 'set_plan' || activeModule.agentPlanStatus === 'update_plan';
  const planResult = isPlanOperation ? activeModule.agentPlanResult : undefined;

  return (
    <>
      <Row label={t('chat:response.dataset_concat_length')} value={activeModule.concatLength} />
      <Row label={t('chat:response.cq_result')} value={activeModule.cqResult} />
      <Row
        label={t('chat:response.cq')}
        value={(() => {
          if (!activeModule.cqList) return '';
          return activeModule.cqList.map((item) => `* ${item.value}`).join('\n');
        })()}
      />
      <Row label={t('chat:response.if_else_result')} value={activeModule.ifElseResult} />
      <Row label={t('chat:response.extract_description')} value={activeModule.extractDescription} />
      <Row label={t('chat:response.extract_result')} value={activeModule.extractResult} />
      <Row label={t('chat:response.headers')} value={activeModule.headers} />
      <Row label={t('chat:response.params')} value={activeModule.params} />
      <Row label={t('chat:response.body')} value={activeModule.body} />
      <Row label={t('chat:response.http_result')} value={activeModule.httpResult} />
      <Row label={t('chat:response.http_error_result')} value={activeModule.httpErrorResult} />
      <Row label={t('chat:response.tool_input')} value={activeModule.toolInput} />
      <Row label={t('chat:response.tool_output')} value={activeModule.pluginOutput} />
      <Row
        label={t('chat:response.plan_result')}
        value={planResult}
        contentBoxProps={codeBlockContentBoxProps}
      />
      <Row
        label={t('chat:response.text_output')}
        value={isPlanOperation ? undefined : activeModule.textOutput}
        contentBoxProps={codeBlockContentBoxProps}
      />
      <Row
        label={t('chat:response.custom_inputs')}
        value={activeModule.customInputs}
        contentBoxProps={codeBlockContentBoxProps}
      />
      <Row
        label={t('chat:response.custom_outputs')}
        value={activeModule.customOutputs}
        contentBoxProps={codeBlockContentBoxProps}
      />
      <Row label={t('chat:response.code_log')} value={activeModule.codeLog} />
      <ReadFilesRows activeModule={activeModule} />
      <Row label={t('chat:response.user_select_result')} value={activeModule.userSelectResult} />
      <Row
        label={t('chat:response.update_var_result')}
        value={(() => {
          /**
           * updateVarResult 是 updateList.map(...) 的结果。单行配置时，外层数组只是噪音；
           * 但 null/undefined 代表无效引用信号，需要保留外层数组，避免 Row 直接隐藏。
           */
          const r = activeModule.updateVarResult;
          if (Array.isArray(r) && r.length === 1 && r[0] !== null && r[0] !== undefined) {
            return r[0];
          }
          return r;
        })()}
      />
      <Row label={t('chat:response.loop_input')} value={activeModule.loopInput} />
      <Row label={t('chat:response.loop_output')} value={activeModule.loopResult} />
      <Row label={t('chat:response.parallel_input')} value={activeModule.parallelInput} />
      <Row label={t('chat:response.parallel_output')} value={activeModule.parallelResult} />
      <Row label={t('chat:response.parallel_run_detail')} value={activeModule.parallelRunDetail} />
      <Row label={t('chat:response.loop_run_input')} value={activeModule.loopRunInput} />
      <Row label={t('chat:response.loop_run_iterations')} value={activeModule.loopRunIterations} />
      <Row label={t('chat:response.loop_run_history')} value={activeModule.loopRunHistory} />
      <Row label={t('chat:response.loop_input_element')} value={activeModule.loopInputValue} />
      <Row label={t('chat:response.loop_output_element')} value={activeModule.loopOutputValue} />
      {activeModule.formInputResult && (
        <Row
          label={t('chat:response.form_input_result')}
          rawDom={<FormInputResult value={activeModule.formInputResult} />}
        />
      )}
      <Row label={t('chat:response.tool_params_result')} value={activeModule.toolParamsResult} />
      <Row
        label={t('chat:response.tool_result')}
        value={activeModule.toolRes}
        renderStringAsMarkdown={false}
      />
    </>
  );
};
