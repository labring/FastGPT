import { Box, Flex, Grid, HStack } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { completionFinishReasonMap } from '@fastgpt/global/core/ai/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import QuoteList from '../../ChatContainer/ChatBox/components/QuoteList';
import FormInputResult from '../FormInputResult';
import { agentPlanStatusMap } from './constants';
import { Row } from './Row';

const ImageQuery = dynamic(() => import('./ImageQuery'));

export const CommonInfoRows = ({ activeModule }: { activeModule: ChatHistoryItemResType }) => {
  const { t } = useSafeTranslation();

  return (
    <>
      <Row
        label={t('chat:response.node_name')}
        value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
      />
      <Row
        label={t('common:Status')}
        value={
          activeModule.agentPlanStatus
            ? t(agentPlanStatusMap[activeModule.agentPlanStatus] as any)
            : undefined
        }
      />
      {activeModule.totalPoints !== undefined && (
        <Row
          label={t('common:support.wallet.usage.Total points')}
          value={formatNumber(activeModule.totalPoints)}
        />
      )}
      {(activeModule.childrenResponses || activeModule.toolDetail || activeModule.pluginDetail) && (
        <Row
          label={t('chat:response.child total points')}
          value={formatNumber(
            [
              ...(activeModule.childrenResponses || []),
              ...(activeModule.toolDetail || []),
              ...(activeModule.pluginDetail || [])
            ]?.reduce((sum, item) => sum + (item.totalPoints || 0), 0) || 0
          )}
        />
      )}
      <Row
        label={t('workflow:response.Error')}
        value={activeModule.errorText ?? activeModule.error}
      />
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
      label={t('chat:llm_request_ids')}
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
              title={t('common:Click_to_expand')}
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

export const AiChatRows = ({
  activeModule,
  queryPreviewDatasetId,
  onOpenRequestIdDetail
}: {
  activeModule: ChatHistoryItemResType;
  queryPreviewDatasetId?: string;
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
  const { t } = useSafeTranslation();

  return (
    <>
      {activeModule.finishReason && (
        <Row
          label={t('chat:completion_finish_reason')}
          value={t(completionFinishReasonMap[activeModule.finishReason])}
        />
      )}
      <Row label={t('common:core.chat.response.module model')} value={activeModule.model} />
      {activeModule.tokens && <Row label={t('chat:llm_tokens')} value={`${activeModule.tokens}`} />}
      {(!!activeModule.inputTokens || !!activeModule.outputTokens) && (
        <Row
          label={t('chat:llm_tokens')}
          value={`Input/Output = ${activeModule.inputTokens || 0}/${activeModule.outputTokens || 0}`}
        />
      )}
      {(!!activeModule.toolCallInputTokens || !!activeModule.toolCallOutputTokens) && (
        <Row
          label={t('common:core.chat.response.Tool call tokens')}
          value={`Input/Output = ${activeModule.toolCallInputTokens || 0}/${activeModule.toolCallOutputTokens || 0}`}
        />
      )}
      {activeModule.compressTextAgent && (
        <>
          <Row
            label={t('chat:compress_llm_usage_point')}
            value={`${activeModule.compressTextAgent.totalPoints}`}
          />
          <Row
            label={t('chat:compress_llm_usage')}
            value={`${activeModule.compressTextAgent.inputTokens}/${activeModule.compressTextAgent.outputTokens}`}
          />
        </>
      )}
      <LlmRequestIdsRow
        requestIds={activeModule.llmRequestIds}
        onOpenRequestIdDetail={onOpenRequestIdDetail}
      />
      <Row label={t('chat:step_query')} value={activeModule.stepQuery} />

      <Row label={t('common:core.chat.response.module query')} value={activeModule.query} />
      <Row
        label={t('common:core.chat.response.context total length')}
        value={activeModule.contextTotalLen}
      />
      <Row
        label={t('common:core.chat.response.module temperature')}
        value={activeModule.temperature}
      />
      <Row label={t('common:core.chat.response.module maxToken')} value={activeModule.maxToken} />
      <Row label={t('chat:reasoning_content')} value={activeModule.reasoningText} />
      <Row
        label={t('common:core.chat.response.module historyPreview')}
        rawDom={
          activeModule.historyPreview ? (
            <Box px={3} py={2} border={'base'} borderRadius={'md'}>
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
          label={t('common:core.dataset.search.search mode')}
          rawDom={
            <Flex border={'base'} borderRadius={'md'} p={2}>
              <Box>{t(DatasetSearchModeMap[activeModule.searchMode]?.title as any)}</Box>
              {activeModule.embeddingWeight && (
                <>{`(${t('chat:response_hybrid_weight', {
                  emb: activeModule.embeddingWeight,
                  text: 1 - activeModule.embeddingWeight
                })})`}</>
              )}
            </Flex>
          }
        />
      )}
      <Row
        label={t('common:core.chat.response.module similarity')}
        value={activeModule.similarity}
      />
      {activeModule.datasetQueries && activeModule.datasetQueries.length > 0 && (
        <Row
          label={t('common:core.chat.response.module query')}
          rawDom={
            <ImageQuery
              datasetQueries={activeModule.datasetQueries}
              datasetId={activeModule.quoteList?.[0]?.datasetId}
            />
          }
        />
      )}
      <Row label={t('common:core.chat.response.module limit')} value={activeModule.limit} />
      <Row label={t('chat:response_embedding_model')} value={activeModule.embeddingModel} />
      <Row
        label={t('chat:response_embedding_model_tokens')}
        value={`${activeModule.embeddingTokens}`}
      />
      {activeModule.searchUsingReRank !== undefined && (
        <>
          <Row
            label={t('common:core.chat.response.search using reRank')}
            rawDom={
              <Box border={'base'} borderRadius={'md'} p={2}>
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
            label={t('chat:response_rerank_tokens')}
            value={`${activeModule.reRankInputTokens}`}
          />
        </>
      )}
      <Row
        label={t('common:core.chat.response.Extension model')}
        value={activeModule.extensionModel}
      />
      <Row label={t('chat:query_extension_result')} value={`${activeModule.extensionResult}`} />
      {activeModule.quoteList && activeModule.quoteList.length > 0 && (
        <Row
          label={t('chat:response_search_results', { len: activeModule.quoteList.length })}
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
          label={t('workflow:response.read files')}
          rawDom={
            <Flex flexWrap={'wrap'} gap={3} px={4} py={2}>
              {activeModule.readFiles.map((file, i) => (
                <HStack
                  key={i}
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
                  <MyIcon name={getFileIcon(file.name) as any} w={'1rem'} />
                  <Box>{file.name}</Box>
                </HStack>
              ))}
            </Flex>
          }
        />
      )}
      <Row label={t('workflow:response.Read file result')} value={activeModule.readFilesResult} />
    </>
  );
};

export const WorkflowResultRows = ({ activeModule }: { activeModule: ChatHistoryItemResType }) => {
  const { t } = useSafeTranslation();

  return (
    <>
      <Row label={t('chat:response.dataset_concat_length')} value={activeModule.concatLength} />
      <Row label={t('common:core.chat.response.module cq result')} value={activeModule.cqResult} />
      <Row
        label={t('common:core.chat.response.module cq')}
        value={(() => {
          if (!activeModule.cqList) return '';
          return activeModule.cqList.map((item) => `* ${item.value}`).join('\n');
        })()}
      />
      <Row
        label={t('common:core.chat.response.module if else Result')}
        value={activeModule.ifElseResult}
      />
      <Row
        label={t('common:core.chat.response.module extract description')}
        value={activeModule.extractDescription}
      />
      <Row
        label={t('common:core.chat.response.module extract result')}
        value={activeModule.extractResult}
      />
      <Row label={'Headers'} value={activeModule.headers} />
      <Row label={'Params'} value={activeModule.params} />
      <Row label={'Body'} value={activeModule.body} />
      <Row
        label={t('common:core.chat.response.module http result')}
        value={activeModule.httpResult}
      />
      <Row label={t('chat:tool_input')} value={activeModule.toolInput} />
      <Row label={t('chat:tool_output')} value={activeModule.pluginOutput} />
      <Row label={t('common:core.chat.response.text output')} value={activeModule.textOutput} />
      <Row label={t('workflow:response.Custom inputs')} value={activeModule.customInputs} />
      <Row label={t('workflow:response.Custom outputs')} value={activeModule.customOutputs} />
      <Row label={t('workflow:response.Code log')} value={activeModule.codeLog} />
      <ReadFilesRows activeModule={activeModule} />
      <Row
        label={t('common:core.chat.response.user_select_result')}
        value={activeModule.userSelectResult}
      />
      <Row
        label={t('common:core.chat.response.update_var_result')}
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
      <Row label={t('common:core.chat.response.loop_input')} value={activeModule.loopInput} />
      <Row label={t('common:core.chat.response.loop_output')} value={activeModule.loopResult} />
      <Row
        label={t('common:core.chat.response.parallel_input')}
        value={activeModule.parallelInput}
      />
      <Row
        label={t('common:core.chat.response.parallel_output')}
        value={activeModule.parallelResult}
      />
      <Row
        label={t('common:core.chat.response.parallel_run_detail')}
        value={activeModule.parallelRunDetail}
      />
      <Row
        label={t('common:core.chat.response.loop_run_input')}
        value={activeModule.loopRunInput}
      />
      <Row
        label={t('common:core.chat.response.loop_run_iterations')}
        value={activeModule.loopRunIterations}
      />
      <Row
        label={t('common:core.chat.response.loop_run_history')}
        value={activeModule.loopRunHistory}
      />
      <Row
        label={t('common:core.chat.response.loop_input_element')}
        value={activeModule.loopInputValue}
      />
      <Row
        label={t('common:core.chat.response.loop_output_element')}
        value={activeModule.loopOutputValue}
      />
      {activeModule.formInputResult && (
        <Row
          label={t('workflow:form_input_result')}
          rawDom={<FormInputResult value={activeModule.formInputResult} />}
        />
      )}
      <Row
        label={t('workflow:tool_params.tool_params_result')}
        value={activeModule.toolParamsResult}
      />
      <Row label={t('workflow:tool.tool_result')} value={activeModule.toolRes} />
    </>
  );
};
