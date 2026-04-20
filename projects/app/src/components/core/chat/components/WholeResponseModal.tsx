import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, type BoxProps, useDisclosure, HStack, Grid } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import Markdown from '@/components/Markdown';
import QuoteList from '../ChatContainer/ChatBox/components/QuoteList';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
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
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
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
  dataId,
  chatTime,
  onOpenRequestIdDetail
}: {
  activeModule: ChatHistoryItemResType;
  hideTabs?: boolean;
  dataId?: string;
  chatTime?: Date;
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
  const { t } = useSafeTranslation();

  // Auto scroll to top
  const ContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ContentRef.current) {
      ContentRef.current.scrollTop = 0;
    }
  }, [activeModule]);

  const RowRender = useCallback(
    ({ children, label, ...props }: { children: React.ReactNode; label: string } & BoxProps) => {
      return (
        <Box>
          <Box
            fontSize={'12px'}
            lineHeight={'18px'}
            mb={2}
            color={'myGray.900'}
            fontWeight={500}
            letterSpacing={'0.5px'}
          >
            {label}
          </Box>
          <Box borderRadius={'6px'} fontSize={'12px'} bg={'myGray.50'} {...props}>
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
          <RowRender label={label} bg={'transparent'}>
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
                bg: '#F7F8FA'
              })}
        >
          <Box
            sx={{
              '& .markdown': { fontSize: '12px !important' },
              '& .markdown pre': { fontSize: '12px !important' }
            }}
          >
            <Markdown source={formatValue} />
          </Box>
        </RowRender>
      );
    },
    [RowRender, t]
  );

  return activeModule ? (
    <Box
      h={'100%'}
      ref={ContentRef}
      py={3}
      px={hideTabs ? 4 : 3}
      display={'flex'}
      flexDirection={'column'}
      gap={3}
      {...(hideTabs
        ? {}
        : {
            flex: '1 0 0',
            overflow: 'auto'
          })}
    >
      {/* common info */}
      <>
        <Row
          label={t('chat:response.node_name')}
          value={t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
        />
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
        <Row label={t('common:core.chat.response.module model')} value={activeModule?.model} />
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

        <Row label={t('chat:reasoning_content')} value={activeModule?.reasoningText} />
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
                <Box>
                  {/* @ts-ignore */}
                  {t(DatasetSearchModeMap[activeModule.searchMode]?.title)}
                </Box>
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
          value={activeModule?.similarity}
        />
        <Row label={t('common:core.chat.response.module limit')} value={activeModule?.limit} />
        <Row label={t('chat:response_embedding_model')} value={activeModule?.embeddingModel} />
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
                    activeModule?.rerankModel ? (
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
              value={`${activeModule?.reRankInputTokens}`}
            />
          </>
        )}
        {activeModule.queryExtensionResult && (
          <>
            <Row
              label={t('common:core.chat.response.Extension model')}
              value={activeModule.queryExtensionResult.model}
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
          value={activeModule?.extensionModel}
        />
        <Row label={t('chat:query_extension_result')} value={`${activeModule?.extensionResult}`} />
        {activeModule.quoteList && activeModule.quoteList.length > 0 && (
          <Row
            label={t('chat:response_search_results', { len: activeModule.quoteList.length })}
            rawDom={<QuoteList chatItemDataId={dataId} rawSearch={activeModule.quoteList} />}
          />
        )}
      </>
      {/* dataset concat */}
      <>
        <Row label={t('chat:response.dataset_concat_length')} value={activeModule?.concatLength} />
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
      <Row label={t('common:core.chat.response.text output')} value={activeModule?.textOutput} />
      {/* code */}
      <>
        <Row label={t('workflow:response.Custom inputs')} value={activeModule?.customInputs} />
        <Row label={t('workflow:response.Custom outputs')} value={activeModule?.customOutputs} />
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
      <Row label={t('common:core.chat.response.loop_output')} value={activeModule?.loopResult} />

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
              fontSize={'12px'}
              lineHeight={'16px'}
              fontWeight={500}
              color={'myGray.900'}
              letterSpacing={'0.5px'}
            >
              {t(sideBarItem.moduleName as any, sideBarItem.moduleNameArgs)}
            </Box>
            <Box
              fontSize={'11px'}
              lineHeight={'16px'}
              fontWeight={500}
              color={'myGray.500'}
              letterSpacing={'0.5px'}
            >
              {t(sideBarItem.runningTime as any) + 's'}
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
  useMobile = false
}: {
  response: ChatHistoryItemResType[];
  dataId?: string;
  chatTime: Date;
  hideTabs?: boolean;
  useMobile?: boolean;
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
              helper(item.pluginDetail);
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
        if (item?.pluginDetail) children.push(...pretreatmentResponse(item?.pluginDetail));
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
          mx={'32px'}
          bg={'myGray.25'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'12px'}
        >
          <Box
            w={'204px'}
            flexShrink={0}
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
            p={3}
            overflowY={'auto'}
            overflowX={'hidden'}
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
      py={8}
      headerPx={'32px'}
      title={
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'20px'} lineHeight={'26px'} letterSpacing={'0.15px'} fontWeight={500}>
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
