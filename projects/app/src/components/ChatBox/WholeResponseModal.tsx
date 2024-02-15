import React, { useMemo, useState } from 'react';
import { Box, useTheme, Flex, Image } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useTranslation } from 'next-i18next';
import { moduleTemplatesFlat } from '@/web/core/modules/template/system';

import Tabs from '../Tabs';
import MyModal from '../MyModal';
import MyTooltip from '../MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import Markdown from '../Markdown';
import { QuoteList } from './QuoteModal';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';

function Row({
  label,
  value,
  rawDom
}: {
  label: string;
  value?: string | number | boolean;
  rawDom?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const val = value || rawDom;
  const strValue = `${value}`;
  const isCodeBlock = strValue.startsWith('~~~json');

  return val !== undefined && val !== '' && val !== 'undefined' ? (
    <Box mb={3}>
      <Box fontSize={['sm', 'md']} mb={isCodeBlock ? 0 : 1} flex={'0 0 90px'}>
        {t(label)}:
      </Box>
      <Box
        borderRadius={'md'}
        fontSize={'sm'}
        {...(isCodeBlock
          ? { transform: 'translateY(-3px)' }
          : value
            ? { px: 3, py: 1, border: theme.borders.base }
            : {})}
      >
        {value && <Markdown source={strValue} />}
        {rawDom}
      </Box>
    </Box>
  ) : null;
}

const WholeResponseModal = ({
  response,
  isShare,
  onClose
}: {
  response: ChatHistoryItemResType[];
  isShare: boolean;
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
          <MyTooltip label={'从左往右，为各个模块的响应顺序'}>
            <QuestionOutlineIcon ml={2} />
          </MyTooltip>
        </Flex>
      }
    >
      <Flex h={'100%'} flexDirection={'column'}>
        <ResponseBox response={response} isShare={isShare} />
      </Flex>
    </MyModal>
  );
};

export default WholeResponseModal;

const ResponseBox = React.memo(function ResponseBox({
  response,
  isShare
}: {
  response: ChatHistoryItemResType[];
  isShare: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const list = useMemo(
    () =>
      response.map((item, i) => ({
        label: (
          <Flex alignItems={'center'} justifyContent={'center'} px={2}>
            <Image
              mr={2}
              src={
                item.moduleLogo ||
                moduleTemplatesFlat.find((template) => item.moduleType === template.flowType)
                  ?.avatar
              }
              alt={''}
              w={['14px', '16px']}
            />
            {t(item.moduleName)}
          </Flex>
        ),
        id: `${i}`
      })),
    [response, t]
  );

  const [currentTab, setCurrentTab] = useState(`0`);

  const activeModule = useMemo(() => response[Number(currentTab)], [currentTab, response]);

  return (
    <>
      <Box>
        <Tabs list={list} activeId={currentTab} onChange={setCurrentTab} />
      </Box>
      <Box py={2} px={4} flex={'1 0 0'} overflow={'auto'}>
        <>
          <Row label={t('core.chat.response.module name')} value={t(activeModule.moduleName)} />
          {activeModule?.price !== undefined && (
            <Row
              label={t('core.chat.response.module price')}
              value={`￥${formatStorePrice2Read(activeModule?.price)}`}
            />
          )}
          <Row
            label={t('core.chat.response.module time')}
            value={`${activeModule?.runningTime || 0}s`}
          />
          <Row label={t('core.chat.response.module model')} value={activeModule?.model} />
          <Row label={t('wallet.bill.Chars length')} value={`${activeModule?.charsLength}`} />
          <Row label={t('wallet.bill.Input Token Length')} value={`${activeModule?.inputTokens}`} />
          <Row
            label={t('wallet.bill.Output Token Length')}
            value={`${activeModule?.outputTokens}`}
          />
          <Row label={t('core.chat.response.module query')} value={activeModule?.query} />
          <Row
            label={t('core.chat.response.context total length')}
            value={activeModule?.contextTotalLen}
          />
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
          {activeModule.quoteList && activeModule.quoteList.length > 0 && (
            <Row
              label={t('core.chat.response.module quoteList')}
              rawDom={<QuoteList isShare={isShare} rawSearch={activeModule.quoteList} />}
            />
          )}
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
            value={activeModule?.searchUsingReRank}
          />
          <Row
            label={t('core.chat.response.Extension model')}
            value={activeModule?.extensionModel}
          />
          <Row
            label={t('wallet.bill.Extension result')}
            value={`${activeModule?.extensionResult}`}
          />
        </>

        {/* classify question */}
        <>
          <Row
            label={t('core.chat.response.module cq')}
            value={(() => {
              if (!activeModule?.cqList) return '';
              return activeModule.cqList.map((item) => `* ${item.value}`).join('\n');
            })()}
          />
          <Row label={t('core.chat.response.module cq result')} value={activeModule?.cqResult} />
        </>

        {/* extract */}
        <>
          <Row
            label={t('core.chat.response.module extract description')}
            value={activeModule?.extractDescription}
          />
          {activeModule?.extractResult && (
            <Row
              label={t('core.chat.response.module extract result')}
              value={`~~~json\n${JSON.stringify(activeModule?.extractResult, null, 2)}`}
            />
          )}
        </>

        {/* http */}
        <>
          {activeModule?.headers && (
            <Row
              label={'Headers'}
              value={`~~~json\n${JSON.stringify(activeModule?.headers, null, 2)}`}
            />
          )}
          {activeModule?.params && (
            <Row
              label={'Params'}
              value={`~~~json\n${JSON.stringify(activeModule?.params, null, 2)}`}
            />
          )}
          {activeModule?.body && (
            <Row label={'Body'} value={`~~~json\n${JSON.stringify(activeModule?.body, null, 2)}`} />
          )}
          {activeModule?.httpResult && (
            <Row
              label={t('core.chat.response.module http result')}
              value={`~~~json\n${JSON.stringify(activeModule?.httpResult, null, 2)}`}
            />
          )}
        </>

        {/* plugin */}
        <>
          {activeModule?.pluginDetail && activeModule?.pluginDetail.length > 0 && (
            <Row
              label={t('core.chat.response.Plugin Resonse Detail')}
              rawDom={<ResponseBox response={activeModule.pluginDetail} isShare={isShare} />}
            />
          )}
          {activeModule?.pluginOutput && (
            <Row
              label={t('core.chat.response.plugin output')}
              value={`~~~json\n${JSON.stringify(activeModule?.pluginOutput, null, 2)}`}
            />
          )}
        </>

        {/* text output */}
        <Row label={t('core.chat.response.text output')} value={activeModule?.textOutput} />
      </Box>
    </>
  );
});
