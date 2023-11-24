import React, { useMemo, useState } from 'react';
import { Box, useTheme, Flex, Image } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api.d';
import { useTranslation } from 'next-i18next';
import { moduleTemplatesFlat } from '@/web/core/modules/template/system';
import Tabs from '../Tabs';

import MyModal from '../MyModal';
import MyTooltip from '../MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import Markdown from '../Markdown';

function Row({ label, value }: { label: string; value?: string | number }) {
  const theme = useTheme();
  const strValue = `${value}`;
  const isCodeBlock = strValue.startsWith('~~~json');

  return value !== undefined && value !== '' && value !== 'undefined' ? (
    <Box mb={3}>
      <Box fontSize={['sm', 'md']} mb={isCodeBlock ? 0 : 1} flex={'0 0 90px'}>
        {label}:
      </Box>
      <Box
        borderRadius={'md'}
        fontSize={'sm'}
        {...(isCodeBlock
          ? { transform: 'translateY(-3px)' }
          : { px: 3, py: 1, border: theme.borders.base })}
      >
        <Markdown source={strValue} />
      </Box>
    </Box>
  ) : null;
}

const WholeResponseModal = ({
  response,
  onClose
}: {
  response: ChatHistoryItemResType[];
  onClose: () => void;
}) => {
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
            {item.moduleName}
          </Flex>
        ),
        id: `${i}`
      })),
    [response]
  );

  const [currentTab, setCurrentTab] = useState(`0`);

  const activeModule = useMemo(() => response[Number(currentTab)], [currentTab, response]);

  return (
    <MyModal
      isCentered
      isOpen={true}
      onClose={onClose}
      h={['90vh', '80vh']}
      w={['90vw', '500px']}
      iconSrc="/imgs/modal/wholeRecord.svg"
      title={
        <Flex alignItems={'center'}>
          {t('chat.Complete Response')}
          <MyTooltip label={'从左往右，为各个模块的响应顺序'}>
            <QuestionOutlineIcon ml={2} />
          </MyTooltip>
        </Flex>
      }
    >
      <Flex h={'100%'} flexDirection={'column'}>
        <Box>
          <Tabs list={list} activeId={currentTab} onChange={setCurrentTab} />
        </Box>
        <Box py={2} px={4} flex={'1 0 0'} overflow={'auto'}>
          <Row label={t('chat.response.module name')} value={activeModule?.moduleName} />
          {activeModule?.price !== undefined && (
            <Row
              label={t('chat.response.module price')}
              value={`￥${formatPrice(activeModule?.price)}`}
            />
          )}
          <Row
            label={t('chat.response.module time')}
            value={`${activeModule?.runningTime || 0}s`}
          />
          <Row label={t('chat.response.module tokens')} value={`${activeModule?.tokens}`} />
          <Row label={t('chat.response.module model')} value={activeModule?.model} />
          <Row label={t('chat.response.module query')} value={activeModule?.query} />

          {/* ai chat */}
          <Row label={t('chat.response.module temperature')} value={activeModule?.temperature} />
          <Row label={t('chat.response.module maxToken')} value={activeModule?.maxToken} />
          <Row
            label={t('chat.response.module historyPreview')}
            value={(() => {
              if (!activeModule?.historyPreview) return '';
              return activeModule.historyPreview
                .map((item, i) => `**${item.obj}**\n${item.value}`)
                .join('\n---\n');
            })()}
          />
          {activeModule.quoteList && activeModule.quoteList.length > 0 && (
            <Row
              label={t('chat.response.module quoteList')}
              value={`~~~json\n${JSON.stringify(activeModule.quoteList, null, 2)}`}
            />
          )}

          {/* dataset search */}
          <Row label={t('chat.response.module similarity')} value={activeModule?.similarity} />
          <Row label={t('chat.response.module limit')} value={activeModule?.limit} />

          {/* classify question */}
          <Row
            label={t('chat.response.module cq')}
            value={(() => {
              if (!activeModule?.cqList) return '';
              return activeModule.cqList.map((item) => `* ${item.value}`).join('\n');
            })()}
          />
          <Row label={t('chat.response.module cq result')} value={activeModule?.cqResult} />

          {/* extract */}
          <Row
            label={t('chat.response.module extract description')}
            value={activeModule?.extractDescription}
          />
          {activeModule?.extractResult && (
            <Row
              label={t('chat.response.module extract result')}
              value={`~~~json\n${JSON.stringify(activeModule?.extractResult, null, 2)}`}
            />
          )}

          {/* http */}
          {activeModule?.body && (
            <Row
              label={t('chat.response.module http body')}
              value={`~~~json\n${JSON.stringify(activeModule?.body, null, 2)}`}
            />
          )}
          {activeModule?.httpResult && (
            <Row
              label={t('chat.response.module http result')}
              value={`~~~json\n${JSON.stringify(activeModule?.httpResult, null, 2)}`}
            />
          )}

          {/* plugin */}
          {activeModule?.pluginOutput && (
            <Row
              label={t('chat.response.plugin output')}
              value={`~~~json\n${JSON.stringify(activeModule?.pluginOutput, null, 2)}`}
            />
          )}
        </Box>
      </Flex>
    </MyModal>
  );
};

export default WholeResponseModal;
