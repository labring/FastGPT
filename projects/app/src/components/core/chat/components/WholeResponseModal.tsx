import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Box, Flex, type BoxProps, useDisclosure, HStack, Grid } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Markdown from '@/components/Markdown';
import QuoteList from '../ChatContainer/ChatBox/components/ChunkCardList';
import DatasetSearchRetrievalResults from './DatasetSearchRetrievalResults';
import {
  DatasetSearchModeMap,
  DatasetSearchModeEnum,
  DatasetRetrievalModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../ChatContainer/ChatBox/Provider';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { completionFinishReasonMap } from '@fastgpt/global/core/ai/constants';
import { isEmpty } from 'lodash';
import { isDatabaseSource } from '@fastgpt/global/core/dataset/utils';
import { isCorrectionRecord } from '@/global/core/chat/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import dynamic from 'next/dynamic';

const RequestIdDetailModal = dynamic(() => import('@/components/core/ai/requestId'), {
  ssr: false
});

type sideTabItemType = {
  moduleLogo?: string;
  moduleName: string;
  moduleNameArgs?: Record<string, any>;
  runningTime?: number;
  moduleType: string;
  // nodeId:string; // abandon
  id: string;
  children: sideTabItemType[];
};

/* Per response value */
export const WholeResponseContent = ({
  activeModule,
  hideTabs,
  hideNodeName,
  isNested,
  dataId,
  chatTime,
  appId,
  chatId,
  onOpenRequestIdDetail
}: {
  activeModule: ChatHistoryItemResType;
  hideTabs?: boolean;
  hideNodeName?: boolean;
  isNested?: boolean;
  dataId?: string;
  chatTime?: Date;
  appId?: string;
  chatId?: string;
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
  const { t } = useSafeTranslation();
  const { systemModelList } = useSystemStore();

  const getModelDisplayName = useCallback(
    (modelId?: string) => {
      if (!modelId) return undefined;
      return systemModelList?.find((item) => item.id === modelId)?.name || modelId;
    },
    [systemModelList]
  );

  const retrievalModeTextMap: Record<DatasetRetrievalModeEnum, string> = {
    [DatasetRetrievalModeEnum.agentic]: t('app:retrieval_mode_multiple'),
    [DatasetRetrievalModeEnum.standard]: t('app:retrieval_mode_single')
  };

  const ContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ContentRef.current) {
      ContentRef.current.scrollTop = 0;
    }
  }, [activeModule]);

  const RowRender = useCallback(
    ({
      children,
      mb = 1,
      label,
      ...props
    }: { children: React.ReactNode; label: string } & BoxProps) => {
      return (
        <Box mb={3}>
          <Box fontSize={'sm'} mb={mb} color={'myGray.800'} flex={'0 0 90px'}>
            {label}:
          </Box>
          <Box borderRadius={'sm'} fontSize={['xs', 'sm']} {...props}>
            {children}
          </Box>
        </Box>
      );
    },
    []
  );
  const Row = useCallback(
    ({
      label,
      value,
      rawDom
    }: {
      label: string;
      value?: string | number | boolean | object;
      rawDom?: React.ReactNode;
    }) => {
      const val = value || rawDom;
      const isObject = typeof value === 'object';

      const formatValue = useMemo(() => {
        if (isObject) {
          return `~~~json\n${JSON.stringify(value, null, 2)}`;
        }
        if (typeof value === 'string') {
          return t(value);
        }
        return `${value}`;
      }, [isObject, value]);

      if (rawDom) {
        return (
          <RowRender label={label} bg={'transparent'} mb={1}>
            {rawDom}
          </RowRender>
        );
      }

      if (val === undefined || val === '' || val === 'undefined') return null;

      return (
        <RowRender
          label={label}
          {...(isObject
            ? { bg: 'transparent' }
            : {
                minH: '32px',
                px: 3,
                display: 'flex',
                alignItems: 'center',
                border: '1px solid',
                borderColor: 'myGray.200',
                color: 'myGray.900',
                bg: 'white'
              })}
        >
          <Box
            sx={{
              '& .markdown': { fontSize: '14px !important' },
              '& .markdown pre': { fontSize: '14px !important' }
            }}
          >
            <Markdown source={formatValue} />
          </Box>
        </RowRender>
      );
    },
    [RowRender, t]
  );

  const searchModeDisplay = useMemo(() => {
    if (activeModule.searchMode === DatasetSearchModeEnum.database) {
      return t(DatasetSearchModeMap[DatasetSearchModeEnum.database]?.title);
    }

    if (!isEmpty(activeModule.sqlResult)) {
      const model = activeModule.searchMode as any;
      // @ts-ignore
      const textList = [
        t(DatasetSearchModeMap[DatasetSearchModeEnum.database]?.title),
        // @ts-ignore
        t(DatasetSearchModeMap[model]?.title)
      ].filter((v) => v);
      return textList.join(t('common:semicolon'));
    }
    // @ts-ignore
    return t(DatasetSearchModeMap[activeModule.searchMode]?.title);
  }, [activeModule.searchMode, activeModule.sqlResult, t]);

  const otherKnowledgeBaseDataList = useMemo(
    () =>
      (activeModule?.quoteList || []).filter(
        (item) => !isDatabaseSource(item.id) && !isCorrectionRecord(item.id)
      ),
    [activeModule.quoteList]
  );
  const hasOtherKnowledgeBase = useMemo(
    () => otherKnowledgeBaseDataList.length > 0,
    [otherKnowledgeBaseDataList]
  );

  const databaseDataList = useMemo(
    () => (activeModule?.quoteList || []).filter((item) => isDatabaseSource(item.id)),
    [activeModule.quoteList]
  );
  const hasDatabase = useMemo(() => databaseDataList.length > 0, [databaseDataList]);

  const correctionRecordDataList = useMemo(
    () => (activeModule?.quoteList || []).filter((item) => isCorrectionRecord(item.id)),
    [activeModule.quoteList]
  );

  const hasCorrectionRecord = useMemo(
    () => correctionRecordDataList.length > 0,
    [correctionRecordDataList]
  );

  const isAgenticMode = useMemo(
    () =>
      activeModule.retrievalMode === DatasetRetrievalModeEnum.agentic &&
      !!activeModule.agenticSearchResult,
    [activeModule]
  );

  const isDataSearch = useMemo(
    () => activeModule.moduleType === FlowNodeTypeEnum.datasetSearchNode,
    [activeModule]
  );

  const isAssistantAppModule = useMemo(
    () =>
      activeModule.moduleType === FlowNodeTypeEnum.appModule &&
      activeModule.appType === AppTypeEnum.assistant,
    [activeModule.moduleType, activeModule.appType]
  );

  const isAgentModule = useMemo(
    () => activeModule.moduleType === FlowNodeTypeEnum.agent,
    [activeModule.moduleType]
  );

  const datasetSearchChild = useMemo(() => {
    if (!isAssistantAppModule) return null;
    return (
      activeModule.pluginDetail?.find(
        (item) => item.moduleType === FlowNodeTypeEnum.datasetSearchNode
      ) ?? null
    );
  }, [isAssistantAppModule, activeModule.pluginDetail]);

  const quoteListDom = useMemo(() => {
    const isEmpty = !activeModule.quoteList || activeModule.quoteList.length === 0;
    if (isEmpty && isDataSearch) {
      return (
        <Row
          label={
            hasDatabase && hasOtherKnowledgeBase
              ? t('chat:other_knowledge_base_search_results')
              : t('chat:search_results')
          }
          value={t('chat:no_matching_knowledge')}
        />
      );
    }
    if (isEmpty) return null;
    // 多轮智能检索逻辑
    if (isAgenticMode) {
      return (
        <Row
          label={t('chat:search_results')}
          rawDom={
            <QuoteList
              chatItemDataId={dataId}
              rawSearch={activeModule.quoteList!}
              applicationId={appId}
              chatId={chatId}
              isAgenticMode={isAgenticMode}
            />
          }
        />
      );
    }
    return (
      <>
        {hasDatabase && (
          <Row
            label={
              hasDatabase && (hasOtherKnowledgeBase || hasCorrectionRecord)
                ? t('chat:database_search_results')
                : t('chat:search_results')
            }
            rawDom={
              <QuoteList
                chatItemDataId={dataId}
                rawSearch={databaseDataList}
                applicationId={appId}
                chatId={chatId}
              />
            }
          />
        )}
        {hasOtherKnowledgeBase && (
          <Row
            label={
              hasDatabase && hasOtherKnowledgeBase
                ? t('chat:other_knowledge_base_search_results')
                : t('chat:search_results')
            }
            rawDom={
              <QuoteList
                chatItemDataId={dataId}
                rawSearch={otherKnowledgeBaseDataList}
                applicationId={appId}
                chatId={chatId}
              />
            }
          />
        )}
        {hasCorrectionRecord && (
          <Row
            label={t('chat:response_search_results', { len: activeModule.quoteList?.length ?? 0 })}
            rawDom={
              <QuoteList
                chatItemDataId={dataId}
                rawSearch={correctionRecordDataList}
                applicationId={appId}
                chatId={chatId}
              />
            }
          />
        )}
      </>
    );
  }, [
    activeModule.quoteList,
    hasCorrectionRecord,
    hasDatabase,
    hasOtherKnowledgeBase,
    databaseDataList,
    otherKnowledgeBaseDataList,
    correctionRecordDataList,
    dataId,
    appId,
    chatId,
    t,
    Row,
    isDataSearch,
    isAgenticMode
  ]);

  return activeModule ? (
    <Box
      {...(isNested ? { h: 'auto' } : { h: '100%' })}
      ref={ContentRef}
      {...(isNested ? {} : { px: 4, py: 1 })}
      backgroundColor={'white'}
      {...(hideTabs
        ? {}
        : {
            flex: '1 0 0',
            overflow: 'auto'
          })}
    >
      {isAssistantAppModule ? (
        <>
          {/* 父节点名 */}
          <Row
            label={t('chat:response.node_name')}
            value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
          />
          {/* 知识检索子节点信息（除节点名外） */}
          {datasetSearchChild && (
            <WholeResponseContent
              activeModule={datasetSearchChild}
              hideTabs={true}
              hideNodeName={true}
              isNested={true}
              dataId={dataId}
              appId={appId}
              chatId={chatId}
              onOpenRequestIdDetail={onOpenRequestIdDetail}
            />
          )}
          {/* 父节点文本输出 */}
          <Row
            label={t('common:core.chat.response.text output')}
            value={activeModule?.textOutput}
          />
        </>
      ) : isAgenticMode ? (
        <>
          {/* 节点名 */}
          <Row
            label={t('chat:response.node_name')}
            value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
          />
          {/* 问题/检索词 */}
          <Row label={t('common:core.chat.response.module query')} value={activeModule?.query} />
          {/* 检索策略 */}
          {activeModule.retrievalMode && (
            <Row
              label={t('chat:retrieval_mode')}
              value={retrievalModeTextMap[activeModule.retrievalMode]}
            />
          )}
          {/* 检索过程 */}
          {activeModule.agenticSearchResult && (
            <Row
              label={t('chat:retrieval_process')}
              value={activeModule.agenticSearchResult.reasoningText}
            />
          )}
          {/* 检索结果 */}
          {quoteListDom}
        </>
      ) : isAgentModule ? (
        <>
          {/* Agent node name */}
          <Row
            label={t('chat:response.node_name')}
            value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
          />
          {/* Step query */}
          <Row label={t('chat:step_query')} value={activeModule?.stepQuery} />
          {/* Model info */}
          <Row
            label={t('common:core.chat.response.module model')}
            value={getModelDisplayName(activeModule?.modelId)}
          />
          {activeModule?.temperature !== undefined && (
            <Row
              label={t('common:core.chat.response.module temperature')}
              value={activeModule?.temperature}
            />
          )}
          {activeModule?.maxToken !== undefined && (
            <Row
              label={t('common:core.chat.response.module maxToken')}
              value={activeModule?.maxToken}
            />
          )}
          {/* Tokens */}
          {(!!activeModule?.inputTokens || !!activeModule?.outputTokens) && (
            <Row
              label={t('chat:llm_tokens')}
              value={`Input/Output = ${activeModule?.inputTokens || 0}/${activeModule?.outputTokens || 0}`}
            />
          )}
          {activeModule?.totalPoints !== undefined && (
            <Row
              label={t('common:support.wallet.usage.Total points')}
              value={formatNumber(activeModule.totalPoints)}
            />
          )}
          {/* Child total points */}
          {activeModule?.childrenResponses && activeModule.childrenResponses.length > 0 && (
            <Row
              label={t('chat:response.child total points')}
              value={formatNumber(
                activeModule.childrenResponses.reduce(
                  (sum, item) => sum + (item.totalPoints || 0),
                  0
                )
              )}
            />
          )}
          {/* Finish reason */}
          {activeModule?.finishReason && (
            <Row
              label={t('chat:completion_finish_reason')}
              value={t(completionFinishReasonMap[activeModule?.finishReason])}
            />
          )}
          {/* Reasoning text */}
          <Row label={t('chat:reasoning_text')} value={activeModule?.reasoningText} />
          {/* Compress context info */}
          {activeModule?.compressTextAgent && (
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
          {/* Text output (final answer) */}
          <Row
            label={t('common:core.chat.response.text output')}
            value={activeModule?.textOutput}
          />
          {/* History preview */}
          <Row
            label={t('common:core.chat.response.module historyPreview')}
            rawDom={
              activeModule.historyPreview ? (
                <Box px={3} py={2} border={'base'} borderRadius={'md'}>
                  {activeModule.historyPreview?.map((item, i) => (
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
          {/* LLM Request IDs */}
          {activeModule?.llmRequestIds &&
            activeModule.llmRequestIds.length > 0 &&
            onOpenRequestIdDetail && (
              <Row
                label={t('chat:llm_request_ids')}
                rawDom={
                  <Grid templateColumns={'repeat(2, minmax(0, 1fr))'} gap={2}>
                    {activeModule.llmRequestIds.map((requestId, index) => (
                      <Flex
                        key={index}
                        role={'group'}
                        alignItems={'center'}
                        gap={2}
                        bg={'myGray.50'}
                        borderRadius={'8px'}
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
                          lineHeight={'18px'}
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
            )}
          {/* Tool call children list */}
          {activeModule?.childrenResponses && activeModule.childrenResponses.length > 0 && (
            <Row
              label={t('chat:tool_call_process')}
              rawDom={
                <Flex flexDirection={'column'} gap={2}>
                  {activeModule.childrenResponses.map((child, i) => (
                    <Box
                      key={i}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                      borderRadius={'md'}
                      p={3}
                    >
                      <Flex alignItems={'center'} gap={2} mb={2}>
                        {child.moduleLogo && (
                          <Avatar src={child.moduleLogo} w={'20px'} h={'20px'} />
                        )}
                        <Box fontWeight={'bold'} fontSize={'sm'}>
                          {t(child.moduleName as any) || child.moduleName}
                        </Box>
                        {child.runningTime !== undefined && (
                          <Box fontSize={'xs'} color={'myGray.500'}>
                            {child.runningTime.toFixed(2)}s
                          </Box>
                        )}
                        {child.totalPoints !== undefined && (
                          <Box fontSize={'xs'} color={'myGray.500'}>
                            {formatNumber(child.totalPoints)} points
                          </Box>
                        )}
                      </Flex>
                      {child.toolInput !== undefined && (
                        <Row label={t('chat:tool_input')} value={child.toolInput} />
                      )}
                      {child.toolRes !== undefined && (
                        <Row label={t('chat:tool_output')} value={child.toolRes} />
                      )}
                    </Box>
                  ))}
                </Flex>
              }
            />
          )}
          {/* Error info */}
          <Row label={t('workflow:response.Error')} value={activeModule?.errorText} />
        </>
      ) : (
        <>
          {/* common info */}
          <>
            {!hideNodeName && (
              <Row
                label={t('chat:response.node_name')}
                value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
              />
            )}
            {activeModule?.totalPoints !== undefined && (
              <Row
                label={t('common:support.wallet.usage.Total points')}
                value={formatNumber(activeModule.totalPoints)}
              />
            )}
            {(activeModule?.childrenResponses ||
              activeModule.toolDetail ||
              activeModule.pluginDetail) && (
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
            <Row label={t('workflow:response.Error')} value={activeModule?.error} />
            <Row label={t('workflow:response.Error')} value={activeModule?.errorText} />
            <Row label={t('chat:response.node_inputs')} value={activeModule?.nodeInputs} />
          </>
          {/* ai chat */}
          <>
            {activeModule?.finishReason && (
              <Row
                label={t('chat:completion_finish_reason')}
                value={t(completionFinishReasonMap[activeModule?.finishReason])}
              />
            )}
            <Row
              label={t('common:core.chat.response.module model')}
              value={getModelDisplayName(activeModule?.modelId)}
            />
            {activeModule?.tokens && (
              <Row label={t('chat:llm_tokens')} value={`${activeModule?.tokens}`} />
            )}
            {(!!activeModule?.inputTokens || !!activeModule?.outputTokens) && (
              <Row
                label={t('chat:llm_tokens')}
                value={`Input/Output = ${activeModule?.inputTokens || 0}/${activeModule?.outputTokens || 0}`}
              />
            )}
            {activeModule.queryExtensionResult && (
              <Row
                label={t('chat:query_extension_IO_tokens')}
                value={`${activeModule.queryExtensionResult.inputTokens}/${activeModule.queryExtensionResult.outputTokens}`}
              />
            )}
            {(!!activeModule?.toolCallInputTokens || !!activeModule?.toolCallOutputTokens) && (
              <Row
                label={t('common:core.chat.response.Tool call tokens')}
                value={`Input/Output = ${activeModule?.toolCallInputTokens || 0}/${activeModule?.toolCallOutputTokens || 0}`}
              />
            )}
            {activeModule?.compressTextAgent && (
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
            {/* LLM Request IDs */}
            {activeModule?.llmRequestIds &&
              activeModule.llmRequestIds.length > 0 &&
              onOpenRequestIdDetail && (
                <Row
                  label={t('chat:llm_request_ids')}
                  rawDom={
                    <Grid templateColumns={'repeat(2, minmax(0, 1fr))'} gap={2}>
                      {activeModule.llmRequestIds.map((requestId, index) => (
                        <Flex
                          key={index}
                          role={'group'}
                          alignItems={'center'}
                          gap={2}
                          bg={'myGray.50'}
                          borderRadius={'8px'}
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
                            lineHeight={'18px'}
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
              )}
            <Row label={t('chat:step_query')} value={activeModule?.stepQuery} />

            <Row label={t('common:core.chat.response.module query')} value={activeModule?.query} />
            {activeModule.retrievalMode && (
              <Row
                label={t('chat:retrieval_mode')}
                value={retrievalModeTextMap[activeModule.retrievalMode]}
              />
            )}
            {activeModule.agenticSearchResult && (
              <Row
                label={t('chat:retrieval_process')}
                value={activeModule.agenticSearchResult.reasoningText}
              />
            )}
            <Row
              label={t('common:core.chat.response.context total length')}
              value={activeModule?.contextTotalLen}
            />
            <Row
              label={t('common:core.chat.response.module temperature')}
              value={activeModule?.temperature}
            />
            <Row
              label={t('common:core.chat.response.module maxToken')}
              value={activeModule?.maxToken}
            />

            <Row label={t('chat:reasoning_text')} value={activeModule?.reasoningText} />
            <Row
              label={t('common:core.chat.response.module historyPreview')}
              rawDom={
                activeModule.historyPreview ? (
                  <Box px={3} py={2} border={'base'} borderRadius={'md'}>
                    {activeModule.historyPreview?.map((item, i) => (
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
          {/* dataset search */}
          <>
            {activeModule?.searchMode && (
              <Row
                label={t('common:core.dataset.search.search mode')}
                rawDom={
                  <Flex border={'base'} borderRadius={'md'} p={2}>
                    <Box>{searchModeDisplay}</Box>
                    {activeModule.embeddingWeight && (
                      <>{`(${t('chat:response_hybrid_weight', {
                        emb: formatNumber(activeModule.embeddingWeight, 100),
                        text: formatNumber(1 - activeModule.embeddingWeight, 100)
                      })})`}</>
                    )}
                  </Flex>
                }
              />
            )}
            <Row
              label={t('common:core.chat.response.module similarity')}
              value={activeModule?.similarity}
            />
            <Row label={t('common:core.chat.response.module limit')} value={activeModule?.limit} />
            <Row
              label={t('chat:response_embedding_model')}
              value={getModelDisplayName(activeModule?.embeddingModelId)}
            />
            <Row
              label={t('chat:response_embedding_model_tokens')}
              value={`${activeModule?.embeddingTokens}`}
            />
            {activeModule?.searchUsingReRank !== undefined && (
              <>
                <Row
                  label={t('common:core.chat.response.search using reRank')}
                  rawDom={
                    <Box border={'base'} borderRadius={'md'} p={2}>
                      {activeModule?.searchUsingReRank ? (
                        activeModule?.rerankModelId ? (
                          <Box>{`${getModelDisplayName(activeModule.rerankModelId)}: ${
                            activeModule.rerankWeight
                          }`}</Box>
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
                  value={`${activeModule?.reRankInputTokens}`}
                />
              </>
            )}
            {activeModule.queryExtensionResult && (
              <>
                <Row
                  label={t('common:core.chat.response.Extension model')}
                  value={getModelDisplayName(activeModule.queryExtensionResult.modelId)}
                />
                <Row
                  label={t('chat:query_extension_IO_tokens')}
                  value={`${activeModule.queryExtensionResult.inputTokens}/${activeModule.queryExtensionResult.outputTokens}`}
                />
                <Row
                  label={t('chat:query_extension_result')}
                  value={activeModule.queryExtensionResult.query}
                />
              </>
            )}
            <Row
              label={t('common:core.chat.response.Extension model')}
              value={getModelDisplayName(activeModule?.extensionModelId)}
            />
            <Row
              label={t('chat:query_extension_result')}
              value={`${activeModule?.extensionResult}`}
            />
            {isDataSearch ? (
              <DatasetSearchRetrievalResults
                activeModule={activeModule}
                dataId={dataId}
                chatId={chatId}
                appId={appId}
                Row={Row}
                quoteListDom={quoteListDom}
              />
            ) : (
              quoteListDom
            )}
          </>
          {/* dataset concat */}
          <>
            <Row
              label={t('chat:response.dataset_concat_length')}
              value={activeModule?.concatLength}
            />
          </>
          {/* classify question */}
          <>
            <Row
              label={t('common:core.chat.response.module cq result')}
              value={activeModule?.cqResult}
            />
            <Row
              label={t('common:core.chat.response.module cq')}
              value={(() => {
                if (!activeModule?.cqList) return '';
                return activeModule.cqList.map((item) => `* ${item.value}`).join('\n');
              })()}
            />
          </>
          {/* if-else */}
          <>
            <Row
              label={t('common:core.chat.response.module if else Result')}
              value={activeModule?.ifElseResult}
            />
          </>
          {/* extract */}
          <>
            <Row
              label={t('common:core.chat.response.module extract description')}
              value={activeModule?.extractDescription}
            />
            <Row
              label={t('common:core.chat.response.module extract result')}
              value={activeModule?.extractResult}
            />
          </>
          {/* http */}
          <>
            <Row label={'Headers'} value={activeModule?.headers} />
            <Row label={'Params'} value={activeModule?.params} />
            <Row label={'Body'} value={activeModule?.body} />
            <Row
              label={t('common:core.chat.response.module http result')}
              value={activeModule?.httpResult}
            />
          </>
          {/* plugin */}
          <>
            <Row label={t('chat:tool_input')} value={activeModule?.toolInput} />
            <Row label={t('chat:tool_output')} value={activeModule?.pluginOutput} />
          </>
          {/* text output */}
          <Row
            label={t('common:core.chat.response.text output')}
            value={activeModule?.textOutput}
          />
          {/* code */}
          <>
            <Row label={t('workflow:response.Custom inputs')} value={activeModule?.customInputs} />
            <Row
              label={t('workflow:response.Custom outputs')}
              value={activeModule?.customOutputs}
            />
            <Row label={t('workflow:response.Code log')} value={activeModule?.codeLog} />
          </>

          {/* read files */}
          <>
            {activeModule?.readFiles && activeModule?.readFiles.length > 0 && (
              <Row
                label={t('workflow:response.read files')}
                rawDom={
                  <Flex flexWrap={'wrap'} gap={3} px={4} py={2}>
                    {activeModule?.readFiles.map((file, i) => (
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
            <Row
              label={t('workflow:response.Read file result')}
              value={activeModule?.readFilesResult}
            />
          </>

          {/* user select */}
          <Row
            label={t('common:core.chat.response.user_select_result')}
            value={activeModule?.userSelectResult}
          />

          {/* update var */}
          <Row
            label={t('common:core.chat.response.update_var_result')}
            value={activeModule?.updateVarResult}
          />

          {/* loop */}
          <Row label={t('common:core.chat.response.loop_input')} value={activeModule?.loopInput} />
          <Row
            label={t('common:core.chat.response.loop_output')}
            value={activeModule?.loopResult}
          />

          {/* parallel */}
          <Row
            label={t('common:core.chat.response.parallel_input')}
            value={activeModule?.parallelInput}
          />
          <Row
            label={t('common:core.chat.response.parallel_output')}
            value={activeModule?.parallelResult}
          />
          <Row
            label={t('common:core.chat.response.parallel_run_detail')}
            value={activeModule?.parallelRunDetail}
          />

          {/* loopStart */}
          <Row
            label={t('common:core.chat.response.loop_input_element')}
            value={activeModule?.loopInputValue}
          />

          {/* loopEnd */}
          <Row
            label={t('common:core.chat.response.loop_output_element')}
            value={activeModule?.loopOutputValue}
          />

          {/* form input */}
          <Row label={t('workflow:form_input_result')} value={activeModule?.formInputResult} />

          {/* tool params */}
          <Row
            label={t('workflow:tool_params.tool_params_result')}
            value={activeModule?.toolParamsResult}
          />

          {/* tool */}
          <Row label={t('workflow:tool.tool_result')} value={activeModule?.toolRes} />
        </>
      )}
    </Box>
  ) : null;
};

/* Side tab: With and without children */
const SideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index
}: {
  sideBarItem: sideTabItemType;
  onChange: (id: string) => void;
  value: string;
  index: number;
}) => {
  const { t } = useSafeTranslation();

  if (!sideBarItem) return null;

  const AccordionSideTabItem = useCallback(
    ({
      sideBarItem,
      onChange,
      value,
      index
    }: {
      sideBarItem: sideTabItemType;
      onChange: (id: string) => void;
      value: string;
      index: number;
    }) => {
      const { isOpen: isShowAccordion, onToggle: onToggleShowAccordion } = useDisclosure({
        defaultIsOpen: false
      });
      return (
        <>
          <Flex align={'center'} position={'relative'}>
            <NormalSideTabItem
              index={index}
              value={value}
              onChange={onChange}
              sideBarItem={sideBarItem}
            >
              <MyIcon
                h={'20px'}
                w={'20px'}
                name={isShowAccordion ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleShowAccordion();
                }}
                _hover={{ color: 'primary.600', cursor: 'pointer' }}
              />
            </NormalSideTabItem>
          </Flex>
          {isShowAccordion && (
            <Flex flexDirection={'column'} gap={1} position={'relative'}>
              {sideBarItem.children.map((item) => (
                <SideTabItem
                  value={value}
                  key={item.id}
                  sideBarItem={item}
                  onChange={onChange}
                  index={index + 1}
                />
              ))}
            </Flex>
          )}
        </>
      );
    },
    []
  );

  const NormalSideTabItem = useCallback(
    ({
      sideBarItem,
      onChange,
      value,
      index,
      children
    }: {
      sideBarItem: sideTabItemType;
      onChange: (id: string) => void;
      value: string;
      index: number;
      children?: React.ReactNode;
    }) => {
      const leftIndex = index > 3 ? 3 : index;
      const leftPad = leftIndex === 0 ? '8px' : `${8 + leftIndex * 32}px`;
      return (
        <Flex
          alignItems={'center'}
          onClick={() => {
            onChange(sideBarItem.id);
          }}
          background={value === sideBarItem.id ? 'myGray.100' : ''}
          _hover={{ background: 'myGray.100' }}
          py={'6px'}
          pl={leftPad}
          pr={'4px'}
          width={'100%'}
          cursor={'pointer'}
          borderRadius={'6px'}
          position={'relative'}
        >
          <Avatar
            src={
              sideBarItem.moduleLogo ||
              moduleTemplatesFlat.find(
                (template) => sideBarItem.moduleType === template.flowNodeType
              )?.avatar
            }
            alt={''}
            w={'24px'}
            h={'24px'}
            borderRadius={'4px'}
          />
          <Box ml={2}>
            <Box
              fontSize={'14px'}
              lineHeight={'16px'}
              fontWeight={500}
              color={'myGray.550'}
              letterSpacing={'0.5px'}
            >
              {t(sideBarItem.moduleName as any, sideBarItem.moduleNameArgs)}
            </Box>
            <Box fontSize={'12px'} lineHeight={'16px'} color={'#667085'} letterSpacing={'0.5px'}>
              {sideBarItem.runningTime !== undefined ? `${sideBarItem.runningTime}s` : ''}
            </Box>
          </Box>
          <Box
            h={'24px'}
            w={'24px'}
            position={'absolute'}
            right={'4px'}
            top={'50%'}
            transform={'translateY(-50%)'}
          >
            {children}
          </Box>
        </Flex>
      );
    },
    [t]
  );

  return sideBarItem.children.length !== 0 ? (
    <>
      <Box>
        <AccordionSideTabItem
          sideBarItem={sideBarItem}
          onChange={onChange}
          value={value}
          index={index}
        />
      </Box>
    </>
  ) : (
    <NormalSideTabItem index={index} value={value} onChange={onChange} sideBarItem={sideBarItem} />
  );
};

/* Modal main container */
export const ResponseBox = React.memo(function ResponseBox({
  response,
  dataId,
  chatTime,
  hideTabs = false,
  useMobile = false,
  appId,
  chatId
}: {
  response: ChatHistoryItemResType[];
  dataId?: string;
  chatTime: Date;
  hideTabs?: boolean;
  useMobile?: boolean;
  appId?: string;
  chatId?: string;
}) {
  const { t } = useSafeTranslation();
  const { isPc } = useSystem();

  // LLM Request Detail Modal state
  const [selectedRequestId, setSelectedRequestId] = useState<string>();

  const handleOpenRequestIdDetail = useCallback((requestId: string) => {
    setSelectedRequestId(requestId);
  }, []);

  const handleCloseRequestIdModal = useCallback(() => {
    setSelectedRequestId(undefined);
  }, []);

  const flattedResponse = useMemo(() => {
    /* Flat response */
    function flattenArray(arr: ChatHistoryItemResType[]) {
      const result: ChatHistoryItemResType[] = [];

      function helper(currentArray: ChatHistoryItemResType[]) {
        currentArray.forEach((item) => {
          if (item && typeof item === 'object') {
            result.push(item);

            if (Array.isArray(item.toolDetail)) {
              helper(item.toolDetail);
            }
            if (Array.isArray(item.pluginDetail)) {
              const isAssistantApp =
                item.moduleType === FlowNodeTypeEnum.appModule &&
                item.appType === AppTypeEnum.assistant;
              if (!isAssistantApp) {
                helper(item.pluginDetail);
              }
            }
            if (Array.isArray(item.loopDetail)) {
              helper(item.loopDetail);
            }
            if (Array.isArray(item.parallelDetail)) {
              helper(item.parallelDetail);
            }
            if (Array.isArray(item.childrenResponses)) {
              helper(item.childrenResponses);
            }
          }
        });
      }

      helper(arr);
      return result;
    }

    return flattenArray(response).map((item) => ({
      ...item,
      id: item.id ?? item.nodeId
    }));
  }, [response]);
  const [currentNodeId, setCurrentNodeId] = useState(
    flattedResponse[0]?.id ?? flattedResponse[0]?.nodeId ?? ''
  );

  const activeModule = useMemo(
    () => flattedResponse.find((item) => item.id === currentNodeId) as ChatHistoryItemResType,
    [currentNodeId, flattedResponse]
  );

  const sliderResponseList: sideTabItemType[] = useMemo(() => {
    /* Format response data to slider data */
    function pretreatmentResponse(res: ChatHistoryItemResType[]): sideTabItemType[] {
      return res.map((item) => {
        let children: sideTabItemType[] = [];

        if (item?.toolDetail) children.push(...pretreatmentResponse(item?.toolDetail));
        if (item?.pluginDetail) {
          const isAssistantApp =
            item.moduleType === FlowNodeTypeEnum.appModule &&
            item.appType === AppTypeEnum.assistant;
          if (!isAssistantApp) {
            children.push(...pretreatmentResponse(item.pluginDetail));
          }
        }
        if (item?.loopDetail) children.push(...pretreatmentResponse(item?.loopDetail));
        if (item?.parallelDetail) children.push(...pretreatmentResponse(item?.parallelDetail));
        if (item?.childrenResponses)
          children.push(...pretreatmentResponse(item?.childrenResponses));

        return {
          moduleLogo: item.moduleLogo,
          moduleName: item.moduleName,
          moduleNameArgs: item.moduleNameArgs,
          runningTime: item.runningTime,
          moduleType: item.moduleType,
          id: item.id ?? item.nodeId,
          children
        };
      });
    }
    return pretreatmentResponse(response);
  }, [response]);

  const {
    isOpen: isOpenMobileModal,
    onOpen: onOpenMobileModal,
    onClose: onCloseMobileModal
  } = useDisclosure();

  const WholeResponseSideTab = useCallback(
    ({
      response,
      value,
      onChange,
      isMobile = false
    }: {
      response: sideTabItemType[];
      value: string;
      onChange: (index: string) => void;
      isMobile?: boolean;
    }) => {
      return (
        <Flex flexDirection={'column'} gap={1}>
          {response.map((item) => (
            <Flex
              key={item.id}
              flexDirection={'column'}
              gap={1}
              bg={isMobile ? 'myGray.100' : ''}
              m={isMobile ? 3 : 0}
              borderRadius={'md'}
              w={isMobile ? 'auto' : '180px'}
            >
              <SideTabItem value={value} onChange={onChange} sideBarItem={item} index={0} />
            </Flex>
          ))}
        </Flex>
      );
    },
    []
  );

  return (
    <>
      {isPc && !useMobile ? (
        <Flex
          overflow={'hidden'}
          height={'100%'}
          bg={'myGray.25'}
          borderTop={'1px solid'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box
            w={'204px'}
            flexShrink={0}
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
            p={3}
            overflowY={'auto'}
            overflowX={'hidden'}
            bg={'white'}
          >
            <WholeResponseSideTab
              response={sliderResponseList}
              value={currentNodeId}
              onChange={setCurrentNodeId}
            />
          </Box>
          <Box flex={'1 0 0'} w={0} height={'100%'}>
            <WholeResponseContent
              dataId={dataId}
              activeModule={activeModule}
              hideTabs={hideTabs}
              chatTime={chatTime}
              onOpenRequestIdDetail={handleOpenRequestIdDetail}
              appId={appId}
              chatId={chatId}
            />
          </Box>
        </Flex>
      ) : (
        <Box h={'100%'} overflow={'auto'}>
          {!isOpenMobileModal && (
            <WholeResponseSideTab
              response={sliderResponseList}
              value={currentNodeId}
              onChange={(item: string) => {
                setCurrentNodeId(item);
                onOpenMobileModal();
              }}
              isMobile={true}
            />
          )}
          {isOpenMobileModal && (
            <Flex flexDirection={'column'} h={'100%'}>
              <Flex
                align={'center'}
                justifyContent={'center'}
                px={2}
                py={2}
                borderBottom={'sm'}
                position={'relative'}
                height={'40px'}
              >
                <MyIcon
                  width={4}
                  height={4}
                  name="common/backLight"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseMobileModal();
                  }}
                  position={'absolute'}
                  left={2}
                  top={'50%'}
                  transform={'translateY(-50%)'}
                  cursor={'pointer'}
                  _hover={{ color: 'primary.500' }}
                />

                <Avatar
                  src={
                    activeModule.moduleLogo ||
                    moduleTemplatesFlat.find(
                      (template) => activeModule.moduleType === template.flowNodeType
                    )?.avatar
                  }
                  w={'1.25rem'}
                  h={'1.25rem'}
                  borderRadius={'sm'}
                />

                <Box ml={1.5} lineHeight={'1.25rem'} alignItems={'center'}>
                  {t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
                </Box>
              </Flex>
              <Box flex={'1 0 0'}>
                <WholeResponseContent
                  dataId={dataId}
                  activeModule={activeModule}
                  hideTabs={hideTabs}
                  chatTime={chatTime}
                  appId={appId}
                  chatId={chatId}
                  onOpenRequestIdDetail={handleOpenRequestIdDetail}
                />
              </Box>
            </Flex>
          )}
        </Box>
      )}

      {/* LLM Request Detail Modal */}
      {selectedRequestId && (
        <RequestIdDetailModal onClose={handleCloseRequestIdModal} requestId={selectedRequestId} />
      )}
    </>
  );
});

const WholeResponseModal = ({
  onClose,
  dataId,
  chatTime
}: {
  onClose: () => void;
  dataId: string;
  chatTime: Date;
}) => {
  const { t } = useSafeTranslation();

  const { getHistoryResponseData } = useContextSelector(ChatBoxContext, (v) => v);
  const { loading: isLoading, data: response } = useRequest(
    () => getHistoryResponseData({ dataId }),
    {
      manual: false
    }
  );

  return (
    <MyModal
      isCentered
      isOpen={true}
      onClose={onClose}
      isLoading={isLoading}
      w={['90vw', '880px']}
      maxW={['90vw', '880px']}
      h={['90vh', '80vh']}
      maxH={['90vh', '700px']}
      px={0}
      py={0}
      title={
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'16px'} lineHeight={'32px'} fontWeight={500}>
            {t('common:core.chat.response.Complete Response')}
          </Box>
          <QuestionTip label={t('chat:question_tip')} />
        </Flex>
      }
    >
      {!isLoading &&
        (!!response?.length ? (
          <ResponseBox response={response} dataId={dataId} chatTime={chatTime} />
        ) : (
          <EmptyTip text={t('chat:no_workflow_response')} />
        ))}
    </MyModal>
  );
};

export default WholeResponseModal;
