import React, { useMemo, useState } from 'react';
import { Box, useTheme, Flex, Image, BoxProps } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useTranslation } from 'next-i18next';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';

import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Markdown from '../../Markdown';
import { QuoteList } from './QuoteModal';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useI18n } from '@/web/context/I18n';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

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
  const theme = useTheme();
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
        ? { transform: 'translateY(-3px)' }
        : value
          ? { px: 3, py: 2, border: theme.borders.base }
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
      minW={['90vw', '600px']}
      iconSrc="/imgs/modal/wholeRecord.svg"
      title={
        <Flex alignItems={'center'}>
          {t('core.chat.response.Complete Response')}
          <QuestionTip ml={2} label={'从左往右，为各个模块的响应顺序'}></QuestionTip>
        </Flex>
      }
    >
      <Flex h={'100%'} flexDirection={'column'}>
        <ResponseBox response={response} showDetail={showDetail} />
      </Flex>
    </MyModal>
  );
};

export default WholeResponseModal;

export const ResponseBox = React.memo(function ResponseBox({
  response,
  showDetail,
  hideTabs = false
}: {
  response: ChatHistoryItemResType[];
  showDetail: boolean;
  hideTabs?: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { workflowT } = useI18n();

  const list = useMemo(
    () =>
      response.map((item, i) => ({
        label: (
          <Flex alignItems={'center'} justifyContent={'center'} px={2}>
            <Image
              mr={2}
              src={
                item.moduleLogo ||
                moduleTemplatesFlat.find((template) => item.moduleType === template.flowNodeType)
                  ?.avatar
              }
              alt={''}
              w={['14px', '16px']}
            />
            {t(item.moduleName)}
          </Flex>
        ),
        value: `${i}`
      })),
    [response, t]
  );

  const [currentTab, setCurrentTab] = useState(`0`);

  const activeModule = useMemo(() => response[Number(currentTab)], [currentTab, response]);

  return (
    <>
      {!hideTabs && (
        <Box>
          <LightRowTabs list={list} value={currentTab} onChange={setCurrentTab} />
        </Box>
      )}
      <Box py={2} px={4} flex={'1 0 0'} overflow={'auto'}>
        <>
          <Row label={t('core.chat.response.module name')} value={t(activeModule.moduleName)} />
          {activeModule?.totalPoints !== undefined && (
            <Row
              label={t('support.wallet.usage.Total points')}
              value={formatNumber(activeModule.totalPoints)}
            />
          )}
          <Row
            label={t('core.chat.response.module time')}
            value={`${activeModule?.runningTime || 0}s`}
          />
          <Row label={t('core.chat.response.module model')} value={activeModule?.model} />
          <Row label={t('core.chat.response.module tokens')} value={`${activeModule?.tokens}`} />
          <Row
            label={t('core.chat.response.Tool call tokens')}
            value={`${activeModule?.toolCallTokens}`}
          />

          <Row label={t('core.chat.response.module query')} value={activeModule?.query} />
          <Row
            label={t('core.chat.response.context total length')}
            value={activeModule?.contextTotalLen}
          />
          <Row label={workflowT('response.Error')} value={activeModule?.error} />
        </>

        {/* ai chat */}
        <>
          <Row
            label={t('core.chat.response.module temperature')}
            value={activeModule?.temperature}
          />
          <Row label={t('core.chat.response.module maxToken')} value={activeModule?.maxToken} />
          <Row
            label={t('core.chat.response.module historyPreview')}
            rawDom={
              activeModule.historyPreview ? (
                <Box px={3} py={2} border={theme.borders.base} borderRadius={'md'}>
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
              label={t('core.dataset.search.search mode')}
              // @ts-ignore
              value={t(DatasetSearchModeMap[activeModule.searchMode]?.title)}
            />
          )}
          <Row label={t('core.chat.response.module similarity')} value={activeModule?.similarity} />
          <Row label={t('core.chat.response.module limit')} value={activeModule?.limit} />
          <Row
            label={t('core.chat.response.search using reRank')}
            value={`${activeModule?.searchUsingReRank}`}
          />
          <Row
            label={t('core.chat.response.Extension model')}
            value={activeModule?.extensionModel}
          />
          <Row
            label={t('support.wallet.usage.Extension result')}
            value={`${activeModule?.extensionResult}`}
          />
          {activeModule.quoteList && activeModule.quoteList.length > 0 && (
            <Row
              label={t('core.chat.response.module quoteList')}
              rawDom={<QuoteList showDetail={showDetail} rawSearch={activeModule.quoteList} />}
            />
          )}
        </>

        {/* classify question */}
        <>
          <Row label={t('core.chat.response.module cq result')} value={activeModule?.cqResult} />
          <Row
            label={t('core.chat.response.module cq')}
            value={(() => {
              if (!activeModule?.cqList) return '';
              return activeModule.cqList.map((item) => `* ${item.value}`).join('\n');
            })()}
          />
        </>

        {/* if-else */}
        <>
          <Row
            label={t('core.chat.response.module if else Result')}
            value={activeModule?.ifElseResult}
          />
        </>

        {/* extract */}
        <>
          <Row
            label={t('core.chat.response.module extract description')}
            value={activeModule?.extractDescription}
          />
          <Row
            label={t('core.chat.response.module extract result')}
            value={activeModule?.extractResult}
          />
        </>

        {/* http */}
        <>
          <Row label={'Headers'} value={activeModule?.headers} />
          <Row label={'Params'} value={activeModule?.params} />
          <Row label={'Body'} value={activeModule?.body} />
          <Row
            label={t('core.chat.response.module http result')}
            value={activeModule?.httpResult}
          />
        </>

        {/* plugin */}
        <>
          <Row label={t('core.chat.response.plugin output')} value={activeModule?.pluginOutput} />
          {activeModule?.pluginDetail && activeModule?.pluginDetail.length > 0 && (
            <Row
              label={t('core.chat.response.Plugin response detail')}
              rawDom={<ResponseBox response={activeModule.pluginDetail} showDetail={showDetail} />}
            />
          )}
        </>

        {/* text output */}
        <Row label={t('core.chat.response.text output')} value={activeModule?.textOutput} />

        {/* tool call */}
        {activeModule?.toolDetail && activeModule?.toolDetail.length > 0 && (
          <Row
            label={t('core.chat.response.Tool call response detail')}
            rawDom={<ResponseBox response={activeModule.toolDetail} showDetail={showDetail} />}
          />
        )}

        {/* code */}
        <Row label={workflowT('response.Custom outputs')} value={activeModule?.customOutputs} />
        <Row label={workflowT('response.Custom inputs')} value={activeModule?.customInputs} />
        <Row label={workflowT('response.Code log')} value={activeModule?.codeLog} />
      </Box>
    </>
  );
});
