import React, { useMemo, useState } from 'react';
import { Box, useTheme, Flex, Image } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@/types/chat';
import { useTranslation } from 'react-i18next';
import { ModuleTemplatesFlat } from '@/constants/flow/ModuleTemplate';
import Tabs from '../Tabs';

import MyModal from '../MyModal';
import MyTooltip from '../MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { formatPrice } from '@fastgpt/common/bill/index';

function Row({ label, value }: { label: string; value?: string | number | React.ReactNode }) {
  const theme = useTheme();
  return value !== undefined && value !== '' && value !== 'undefined' ? (
    <Box mb={2}>
      <Box fontSize={['sm', 'md']} mb={1} flex={'0 0 90px'}>
        {label}:
      </Box>
      <Box
        borderRadius={'lg'}
        border={theme.borders.base}
        px={3}
        py={1}
        position={'relative'}
        whiteSpace={'pre-wrap'}
        fontSize={'sm'}
      >
        {value}
      </Box>
    </Box>
  ) : null;
}

const ResponseModal = ({
  response,
  onClose
}: {
  response: ChatHistoryItemResType[];
  onClose: () => void;
}) => {
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
                ModuleTemplatesFlat.find((template) => item.moduleType === template.flowType)?.logo
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

          {/* ai chat */}
          <Row label={t('chat.response.module question')} value={activeModule?.question} />
          <Row label={t('chat.response.module temperature')} value={activeModule?.temperature} />
          <Row label={t('chat.response.module maxToken')} value={activeModule?.maxToken} />
          <Row
            label={t('chat.response.module quoteList')}
            value={(() => {
              try {
                JSON.stringify(activeModule.quoteList, null, 2);
              } catch (error) {
                return '';
              }
            })()}
          />
          <Row
            label={t('chat.response.module historyPreview')}
            value={(() => {
              if (!activeModule?.historyPreview) return '';
              return (
                <>
                  {activeModule.historyPreview.map((item, i) => (
                    <Box key={i} _notLast={{ mb: 3, borderBottom: theme.borders.base }} pb={3}>
                      <Box fontWeight={'bold'}>{item.obj}</Box>
                      <Box>{item.value}</Box>
                    </Box>
                  ))}
                </>
              );
            })()}
          />

          {/* dataset search */}
          <Row label={t('chat.response.module similarity')} value={activeModule?.similarity} />
          <Row label={t('chat.response.module limit')} value={activeModule?.limit} />

          {/* classify question */}
          <Row
            label={t('chat.response.module cq')}
            value={(() => {
              if (!activeModule?.cqList) return '';
              return (
                <Box as={'ol'} px={3}>
                  {activeModule.cqList.map((item) => (
                    <Box key={item.key} as={'li'}>
                      {item.value}
                    </Box>
                  ))}
                </Box>
              );
            })()}
          />
          <Row label={t('chat.response.module cq result')} value={activeModule?.cqResult} />

          {/* extract */}
          <Row
            label={t('chat.response.module extract description')}
            value={activeModule?.extractDescription}
          />
          <Row
            label={t('chat.response.module extract result')}
            value={(() => {
              try {
                return JSON.stringify(activeModule?.extractResult, null, 2);
              } catch (error) {
                return '';
              }
            })()}
          />

          {/* http */}
          <Row
            label={t('chat.response.module http body')}
            value={(() => {
              try {
                return JSON.stringify(activeModule?.body, null, 2);
              } catch (error) {
                return '';
              }
            })()}
          />
          <Row
            label={t('chat.response.module http result')}
            value={(() => {
              try {
                return JSON.stringify(activeModule?.httpResult, null, 2);
              } catch (error) {
                return '';
              }
            })()}
          />
        </Box>
      </Flex>
    </MyModal>
  );
};

export default ResponseModal;
