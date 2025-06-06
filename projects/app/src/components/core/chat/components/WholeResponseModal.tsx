import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, type BoxProps, useDisclosure, HStack } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useTranslation } from 'next-i18next';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { completionFinishReasonMap } from '@fastgpt/global/core/ai/constants';

type sideTabItemType = {
  moduleLogo?: string;
  moduleName: string;
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
  chatTime
}: {
  activeModule: ChatHistoryItemResType;
  hideTabs?: boolean;
  dataId?: string;
  chatTime?: Date;
}) => {
  const { t } = useTranslation();

  // Auto scroll to top
  const ContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ContentRef.current) {
      ContentRef.current.scrollTop = 0;
    }
  }, [activeModule]);

  const RowRender = useCallback(
    ({
      children,
      mb,
      label,
      ...props
    }: { children: React.ReactNode; label: string } & BoxProps) => {
      return (
        <Box mb={3}>
          <Box fontSize={'sm'} mb={mb} color={'myGray.800'} flex={'0 0 90px'}>
            {label}:
          </Box>
          <Box borderRadius={'sm'} fontSize={['xs', 'sm']} bg={'myGray.50'} {...props}>
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
        return `${value}`;
      }, [isObject, value]);

      if (rawDom) {
        return (
          <RowRender label={label} mb={1}>
            {rawDom}
          </RowRender>
        );
      }

      if (val === undefined || val === '' || val === 'undefined') return null;

      return (
        <RowRender
          label={label}
          mb={isObject ? 0 : 1}
          {...(isObject
            ? { py: 2, transform: 'translateY(-3px)' }
            : value
              ? { px: 3, py: 2, border: 'base' }
              : {})}
        >
          <Markdown source={formatValue} />
        </RowRender>
      );
    },
    [RowRender]
  );

  return activeModule ? (
    <Box
      h={'100%'}
      ref={ContentRef}
      py={2}
      px={4}
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
          label={t('common:core.chat.response.module name')}
          value={t(activeModule.moduleName as any)}
        />
        {activeModule?.totalPoints !== undefined && (
          <Row
            label={t('common:support.wallet.usage.Total points')}
            value={formatNumber(activeModule.totalPoints)}
          />
        )}
        {activeModule?.childTotalPoints !== undefined && (
          <Row
            label={t('chat:response.child total points')}
            value={formatNumber(activeModule.childTotalPoints)}
          />
        )}
        <Row
          label={t('common:core.chat.response.module time')}
          value={`${activeModule?.runningTime || 0}s`}
        />
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
        {(!!activeModule?.toolCallInputTokens || !!activeModule?.toolCallOutputTokens) && (
          <Row
            label={t('common:core.chat.response.Tool call tokens')}
            value={`Input/Output = ${activeModule?.toolCallInputTokens || 0}/${activeModule?.toolCallOutputTokens || 0}`}
          />
        )}

        <Row label={t('common:core.chat.response.module query')} value={activeModule?.query} />
        <Row
          label={t('common:core.chat.response.context total length')}
          value={activeModule?.contextTotalLen}
        />
        <Row label={t('workflow:response.Error')} value={activeModule?.error} />
        <Row label={t('chat:response.node_inputs')} value={activeModule?.nodeInputs} />
      </>
      {/* ai chat */}
      <>
        <Row
          label={t('common:core.chat.response.module temperature')}
          value={activeModule?.temperature}
        />
        <Row
          label={t('common:core.chat.response.module maxToken')}
          value={activeModule?.maxToken}
        />
        {activeModule?.finishReason && (
          <Row
            label={t('chat:completion_finish_reason')}
            value={t(completionFinishReasonMap[activeModule?.finishReason])}
          />
        )}

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
            label={t('chat:search_results')}
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
        <Row
          label={t('common:core.chat.response.plugin output')}
          value={activeModule?.pluginOutput}
        />
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
  const { t } = useTranslation();

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
            <Box position={'relative'}>
              {sideBarItem.children.map((item) => (
                <SideTabItem
                  value={value}
                  key={item.id}
                  sideBarItem={item}
                  onChange={onChange}
                  index={index + 1}
                />
              ))}
            </Box>
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
      return (
        <Flex
          alignItems={'center'}
          onClick={() => {
            onChange(sideBarItem.id);
          }}
          background={value === sideBarItem.id ? 'myGray.100' : ''}
          _hover={{ background: 'myGray.100' }}
          p={2}
          width={'100%'}
          cursor={'pointer'}
          pl={leftIndex === 0 ? '0.5rem' : `${1.5 * leftIndex + 0.5}rem`}
          borderRadius={'md'}
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
            w={'1.5rem'}
            h={'1.5rem'}
            borderRadius={'sm'}
          />
          <Box ml={2}>
            <Box fontSize={'xs'} fontWeight={'bold'}>
              {t(sideBarItem.moduleName as any)}
            </Box>
            <Box fontSize={'2xs'} color={'myGray.500'}>
              {t(sideBarItem.runningTime as any) + 's'}
            </Box>
          </Box>
          <Box
            h={'20px'}
            w={'20px'}
            position={'absolute'}
            right={2}
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
  const { t } = useTranslation();
  const { isPc } = useSystem();

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
        if (!!(item?.toolDetail || item?.pluginDetail || item?.loopDetail)) {
          if (item?.toolDetail) children.push(...pretreatmentResponse(item?.toolDetail));
          if (item?.pluginDetail) children.push(...pretreatmentResponse(item?.pluginDetail));
          if (item?.loopDetail) children.push(...pretreatmentResponse(item?.loopDetail));
        }

        return {
          moduleLogo: item.moduleLogo,
          moduleName: item.moduleName,
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
        <>
          {response.map((item) => (
            <Box
              key={item.id}
              bg={isMobile ? 'myGray.100' : ''}
              m={isMobile ? 3 : 0}
              borderRadius={'md'}
              minW={'12rem'}
            >
              <SideTabItem value={value} onChange={onChange} sideBarItem={item} index={0} />
            </Box>
          ))}
        </>
      );
    },
    []
  );

  return (
    <>
      {isPc && !useMobile ? (
        <Flex overflow={'hidden'} height={'100%'}>
          <Box flex={'2 0 0'} w={0} borderRight={'sm'} p={3}>
            <Box overflow={'auto'} height={'100%'}>
              <WholeResponseSideTab
                response={sliderResponseList}
                value={currentNodeId}
                onChange={setCurrentNodeId}
              />
            </Box>
          </Box>
          <Box flex={'5 0 0'} w={0} height={'100%'}>
            <WholeResponseContent
              dataId={dataId}
              activeModule={activeModule}
              hideTabs={hideTabs}
              chatTime={chatTime}
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
                  {t(activeModule.moduleName as any)}
                </Box>
              </Flex>
              <Box flex={'1 0 0'}>
                <WholeResponseContent
                  dataId={dataId}
                  activeModule={activeModule}
                  hideTabs={hideTabs}
                  chatTime={chatTime}
                />
              </Box>
            </Flex>
          )}
        </Box>
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
  const { t } = useTranslation();

  const { getHistoryResponseData } = useContextSelector(ChatBoxContext, (v) => v);
  const { loading: isLoading, data: response } = useRequest2(
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
      h={['90vh', '80vh']}
      isLoading={isLoading}
      maxH={['90vh', '700px']}
      minW={['90vw', '880px']}
      iconSrc="/imgs/modal/wholeRecord.svg"
      title={
        <Flex alignItems={'center'}>
          {t('common:core.chat.response.Complete Response')}
          <QuestionTip ml={2} label={t('chat:question_tip')}></QuestionTip>
        </Flex>
      }
    >
      {!!response?.length ? (
        <ResponseBox response={response} dataId={dataId} chatTime={chatTime} />
      ) : (
        <EmptyTip text={t('chat:no_workflow_response')} />
      )}
    </MyModal>
  );
};

export default WholeResponseModal;
