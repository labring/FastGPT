import React, { useMemo, useState } from 'react';
import { Box, Flex, BoxProps, useDisclosure } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useTranslation } from 'next-i18next';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Markdown from '@/components/Markdown';
import { QuoteList } from '../ChatContainer/ChatBox/components/QuoteModal';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useI18n } from '@/web/context/I18n';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';

type sideTabItemType = {
  moduleLogo?: string;
  moduleName: string;
  runningTime?: number;
  moduleType: string;
  nodeId: string;
  children: sideTabItemType[];
};

function RowRender({
  children,
  mb,
  label,
  ...props
}: { children: React.ReactNode; label: string } & BoxProps) {
  return (
    <Box mb={3}>
      <Box fontSize={'sm'} mb={mb} flex={'0 0 90px'}>
        {label}:
      </Box>
      <Box borderRadius={'sm'} fontSize={['xs', 'sm']} bg={'myGray.50'} {...props}>
        {children}
      </Box>
    </Box>
  );
}
function Row({
  label,
  value,
  rawDom
}: {
  label: string;
  value?: string | number | boolean | object;
  rawDom?: React.ReactNode;
}) {
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
}

const WholeResponseModal = ({
  response,
  showDetail,
  onClose
}: {
  response: ChatHistoryItemResType[];
  showDetail: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      isCentered
      isOpen={true}
      onClose={onClose}
      h={['90vh', '80vh']}
      maxH={['90vh', '700px']}
      minW={['90vw', '880px']}
      iconSrc="/imgs/modal/wholeRecord.svg"
      title={
        <Flex alignItems={'center'}>
          {t('common:core.chat.response.Complete Response')}
          <QuestionTip ml={2} label={'从左往右，为各个模块的响应顺序'}></QuestionTip>
        </Flex>
      }
    >
      <ResponseBox response={response} showDetail={showDetail} />
    </MyModal>
  );
};

export default WholeResponseModal;

export const ResponseBox = React.memo(function ResponseBox({
  response,
  showDetail,
  hideTabs = false,
  useMobile = false
}: {
  response: ChatHistoryItemResType[];
  showDetail: boolean;
  hideTabs?: boolean;
  useMobile?: boolean;
}) {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const flattedResponse = useMemo(() => flattenArray(response), [response]);
  const [currentNodeId, setCurrentNodeId] = useState(
    flattedResponse[0]?.nodeId ? flattedResponse[0].nodeId : ''
  );
  const activeModule = useMemo(
    () => flattedResponse.find((item) => item.nodeId === currentNodeId) as ChatHistoryItemResType,
    [currentNodeId, flattedResponse]
  );
  const sideResponse: sideTabItemType[] = useMemo(() => {
    return pretreatmentResponse(response);
  }, [response]);
  const {
    isOpen: isOpenMobileModal,
    onOpen: onOpenMobileModal,
    onClose: onCloseMobileModal
  } = useDisclosure();

  return (
    <>
      {isPc && !useMobile ? (
        <Flex overflow={'hidden'} height={'100%'}>
          <Box flex={'2 0 0'} borderRight={'sm'} p={3}>
            <Box overflow={'auto'} height={'100%'}>
              <WholeResponseSideTab
                response={sideResponse}
                value={currentNodeId}
                onChange={setCurrentNodeId}
              />
            </Box>
          </Box>
          <Box flex={'5 0 0'} overflowY={'auto'} overflowX={'hidden'} height={'100%'}>
            <WholeResponseContent
              activeModule={activeModule}
              hideTabs={hideTabs}
              showDetail={showDetail}
            />
          </Box>
        </Flex>
      ) : (
        <Box h={'100%'} overflow={'auto'}>
          {!isOpenMobileModal && (
            <WholeResponseSideTab
              response={sideResponse}
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
              <Box flex={'1 0 0'} overflow={'auto'}>
                <WholeResponseContent
                  activeModule={activeModule}
                  hideTabs={hideTabs}
                  showDetail={showDetail}
                />
              </Box>
            </Flex>
          )}
        </Box>
      )}
    </>
  );
});

export const WholeResponseContent = ({
  activeModule,
  hideTabs,
  showDetail
}: {
  activeModule: ChatHistoryItemResType;
  hideTabs?: boolean;
  showDetail: boolean;
}) => {
  const { t } = useTranslation();
  const { workflowT } = useI18n();

  return (
    <>
      {activeModule && (
        <Box
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
            <Row
              label={t('common:core.chat.response.module time')}
              value={`${activeModule?.runningTime || 0}s`}
            />
            <Row label={t('common:core.chat.response.module model')} value={activeModule?.model} />
            <Row
              label={t('common:core.chat.response.module tokens')}
              value={`${activeModule?.tokens}`}
            />
            <Row
              label={t('common:core.chat.response.Tool call tokens')}
              value={`${activeModule?.toolCallTokens}`}
            />

            <Row label={t('common:core.chat.response.module query')} value={activeModule?.query} />
            <Row
              label={t('common:core.chat.response.context total length')}
              value={activeModule?.contextTotalLen}
            />
            <Row label={workflowT('response.Error')} value={activeModule?.error} />
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
                // @ts-ignore
                value={t(DatasetSearchModeMap[activeModule.searchMode]?.title)}
              />
            )}
            <Row
              label={t('common:core.chat.response.module similarity')}
              value={activeModule?.similarity}
            />
            <Row label={t('common:core.chat.response.module limit')} value={activeModule?.limit} />
            <Row
              label={t('common:core.chat.response.search using reRank')}
              value={`${activeModule?.searchUsingReRank}`}
            />
            <Row
              label={t('common:core.chat.response.Extension model')}
              value={activeModule?.extensionModel}
            />
            <Row
              label={t('common:support.wallet.usage.Extension result')}
              value={`${activeModule?.extensionResult}`}
            />
            {activeModule.quoteList && activeModule.quoteList.length > 0 && (
              <Row
                label={t('common:core.chat.response.module quoteList')}
                rawDom={<QuoteList showDetail={showDetail} rawSearch={activeModule.quoteList} />}
              />
            )}
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
          <Row
            label={t('common:core.chat.response.text output')}
            value={activeModule?.textOutput}
          />
          {/* code */}
          <Row label={workflowT('response.Custom outputs')} value={activeModule?.customOutputs} />
          <Row label={workflowT('response.Custom inputs')} value={activeModule?.customInputs} />
          <Row label={workflowT('response.Code log')} value={activeModule?.codeLog} />
        </Box>
      )}
    </>
  );
};

const WholeResponseSideTab = ({
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
          key={item.nodeId}
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
};

const AccordionSideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index
}: {
  sideBarItem: sideTabItemType;
  onChange: (nodeId: string) => void;
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
              key={item.nodeId}
              sideBarItem={item}
              onChange={onChange}
              index={index + 1}
            />
          ))}
        </Box>
      )}
    </>
  );
};

const NormalSideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index,
  children
}: {
  sideBarItem: sideTabItemType;
  onChange: (nodeId: string) => void;
  value: string;
  index: number;
  children?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const leftIndex = index > 3 ? 3 : index;
  return (
    <Flex
      alignItems={'center'}
      onClick={() => {
        onChange(sideBarItem.nodeId);
      }}
      background={value === sideBarItem.nodeId ? 'myGray.100' : ''}
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
          moduleTemplatesFlat.find((template) => sideBarItem.moduleType === template.flowNodeType)
            ?.avatar
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
};

const SideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index
}: {
  sideBarItem: sideTabItemType;
  onChange: (nodeId: string) => void;
  value: string;
  index: number;
}) => {
  if (!sideBarItem) return null;
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

function pretreatmentResponse(res: ChatHistoryItemResType[]): sideTabItemType[] {
  return res.map((item) => {
    let children: sideTabItemType[] = [];
    if (!!(item?.toolDetail || item?.pluginDetail)) {
      if (item?.toolDetail) children.push(...pretreatmentResponse(item?.toolDetail));
      if (item?.pluginDetail) children.push(...pretreatmentResponse(item?.pluginDetail));
    }

    return {
      moduleLogo: item.moduleLogo,
      moduleName: item.moduleName,
      runningTime: item.runningTime,
      moduleType: item.moduleType,
      nodeId: item.nodeId,
      children
    };
  });
}

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
      }
    });
  }

  helper(arr);
  return result;
}
