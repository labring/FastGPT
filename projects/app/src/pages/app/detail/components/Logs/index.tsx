import React, { useMemo, useRef, useState } from 'react';
import {
  Flex,
  Box,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  useTheme,
  useDisclosure,
  ModalBody,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getAppChatLogs } from '@/web/core/app/api';
import dayjs from 'dayjs';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import { AppLogsListItemType } from '@/types/app';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatBox from '@/components/ChatBox';
import type { ComponentRef } from '@/components/ChatBox/type.d';
import { useQuery } from '@tanstack/react-query';
import { getInitChatInfo } from '@/web/core/chat/api';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { addDays } from 'date-fns';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import DateRangePicker, { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { formatChatValue2InputType } from '@/components/ChatBox/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useI18n } from '@/web/context/I18n';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';

const Logs = () => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { isPc } = useSystemStore();

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });

  const {
    isOpen: isOpenMarkDesc,
    onOpen: onOpenMarkDesc,
    onClose: onCloseMarkDesc
  } = useDisclosure();

  const {
    data: logs,
    isLoading,
    Pagination,
    getData,
    pageNum
  } = usePagination<AppLogsListItemType>({
    api: getAppChatLogs,
    pageSize: 20,
    params: {
      appId,
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1)
    }
  });

  const [detailLogsId, setDetailLogsId] = useState<string>();

  return (
    <>
      <Box {...cardStyles} boxShadow={2} px={[4, 8]} py={[4, 6]}>
        {isPc && (
          <>
            <Box fontWeight={'bold'} fontSize={['md', 'lg']} mb={2}>
              {appT('Chat logs')}
            </Box>
            <Box color={'myGray.500'} fontSize={'sm'}>
              {appT('Chat Logs Tips')},{' '}
              <Box
                as={'span'}
                mr={2}
                textDecoration={'underline'}
                cursor={'pointer'}
                onClick={onOpenMarkDesc}
              >
                {t('core.chat.Read Mark Description')}
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* table */}
      <Flex
        flexDirection={'column'}
        {...cardStyles}
        boxShadow={3.5}
        mt={4}
        px={[4, 8]}
        py={[4, 6]}
        flex={'1 0 0'}
      >
        <TableContainer mt={[0, 3]} flex={'1 0 0'} h={0} overflowY={'auto'}>
          <Table variant={'simple'} fontSize={'sm'}>
            <Thead>
              <Tr>
                <Th>{t('core.app.logs.Source And Time')}</Th>
                <Th>{appT('Logs Title')}</Th>
                <Th>{appT('Logs Message Total')}</Th>
                <Th>{appT('Feedback Count')}</Th>
                <Th>{t('core.app.feedback.Custom feedback')}</Th>
                <Th>{appT('Mark Count')}</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'xs'}>
              {logs.map((item) => (
                <Tr
                  key={item._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  title={'点击查看对话详情'}
                  onClick={() => setDetailLogsId(item.id)}
                >
                  <Td>
                    <Box>{t(ChatSourceMap[item.source]?.name || 'UnKnow')}</Box>
                    <Box color={'myGray.500'}>{dayjs(item.time).format('YYYY/MM/DD HH:mm')}</Box>
                  </Td>
                  <Td className="textEllipsis" maxW={'250px'}>
                    {item.title}
                  </Td>
                  <Td>{item.messageCount}</Td>
                  <Td w={'100px'}>
                    {!!item?.userGoodFeedbackCount && (
                      <Flex
                        mb={item?.userGoodFeedbackCount ? 1 : 0}
                        bg={'green.100'}
                        color={'green.600'}
                        px={3}
                        py={1}
                        alignItems={'center'}
                        justifyContent={'center'}
                        borderRadius={'md'}
                        fontWeight={'bold'}
                      >
                        <MyIcon
                          mr={1}
                          name={'core/chat/feedback/goodLight'}
                          color={'green.600'}
                          w={'14px'}
                        />
                        {item.userGoodFeedbackCount}
                      </Flex>
                    )}
                    {!!item?.userBadFeedbackCount && (
                      <Flex
                        bg={'#FFF2EC'}
                        color={'#C96330'}
                        px={3}
                        py={1}
                        alignItems={'center'}
                        justifyContent={'center'}
                        borderRadius={'md'}
                        fontWeight={'bold'}
                      >
                        <MyIcon
                          mr={1}
                          name={'core/chat/feedback/badLight'}
                          color={'#C96330'}
                          w={'14px'}
                        />
                        {item.userBadFeedbackCount}
                      </Flex>
                    )}
                    {!item?.userGoodFeedbackCount && !item?.userBadFeedbackCount && <>-</>}
                  </Td>
                  <Td>{item.customFeedbacksCount || '-'}</Td>
                  <Td>{item.markCount}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {logs.length === 0 && !isLoading && <EmptyTip text={appT('Logs Empty')}></EmptyTip>}
        </TableContainer>

        <HStack w={'100%'} mt={3} justifyContent={'flex-end'}>
          <DateRangePicker
            defaultDate={dateRange}
            position="top"
            onChange={setDateRange}
            onSuccess={() => getData(1)}
          />
          <Pagination />
        </HStack>
      </Flex>

      {!!detailLogsId && (
        <DetailLogsModal
          appId={appId}
          chatId={detailLogsId}
          onClose={() => {
            setDetailLogsId(undefined);
            getData(pageNum);
          }}
        />
      )}
      <MyModal
        isOpen={isOpenMarkDesc}
        onClose={onCloseMarkDesc}
        title={t('core.chat.Mark Description Title')}
      >
        <ModalBody whiteSpace={'pre-wrap'}>{t('core.chat.Mark Description')}</ModalBody>
      </MyModal>
    </>
  );
};

export default React.memo(Logs);

const DetailLogsModal = ({
  appId,
  chatId,
  onClose
}: {
  appId: string;
  chatId: string;
  onClose: () => void;
}) => {
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { isPc } = useSystemStore();
  const theme = useTheme();

  const { data: chat, isFetching } = useQuery(
    ['getChatDetail', chatId],
    () => getInitChatInfo({ appId, chatId, loadCustomFeedbacks: true }),
    {
      onSuccess(res) {
        const history = res.history.map((item) => ({
          ...item,
          dataId: item.dataId || getNanoid(),
          status: 'finish' as any
        }));
        ChatBoxRef.current?.resetHistory(history);
        ChatBoxRef.current?.resetVariables(res.variables);
        if (res.history.length > 0) {
          setTimeout(() => {
            ChatBoxRef.current?.scrollToBottom('auto');
          }, 500);
        }
      }
    }
  );

  const history = useMemo(() => (chat?.history ? chat.history : []), [chat]);

  const title = useMemo(() => {
    const { text } = formatChatValue2InputType(history[history.length - 2]?.value);
    return text?.slice(0, 8);
  }, [history]);
  const chatModels = chat?.app?.chatModels;

  return (
    <>
      <MyBox
        isLoading={isFetching}
        display={'flex'}
        flexDirection={'column'}
        zIndex={3}
        position={['fixed', 'absolute']}
        top={[0, '2%']}
        right={0}
        h={['100%', '96%']}
        w={'100%'}
        maxW={['100%', '600px']}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'md'}
        overflow={'hidden'}
        transition={'.2s ease'}
      >
        <Flex
          alignItems={'center'}
          px={[3, 5]}
          h={['46px', '60px']}
          borderBottom={theme.borders.base}
          borderBottomColor={'gray.200'}
          color={'myGray.900'}
        >
          {isPc ? (
            <>
              <Box mr={3} color={'myGray.1000'}>
                {title}
              </Box>
              <MyTag colorSchema="blue">
                <MyIcon name={'history'} w={'14px'} />
                <Box ml={1}>{`${history.length}条记录`}</Box>
              </MyTag>
              {!!chatModels && chatModels.length > 0 && (
                <MyTag ml={2} colorSchema={'green'}>
                  <MyIcon name={'core/chat/chatModelTag'} w={'14px'} />
                  <Box ml={1}>{chatModels.join(',')}</Box>
                </MyTag>
              )}
              <Box flex={1} />
            </>
          ) : (
            <>
              <Flex px={3} alignItems={'center'} flex={'1 0 0'} w={0} justifyContent={'center'}>
                <Box ml={1} className="textEllipsis">
                  {title}
                </Box>
              </Flex>
            </>
          )}

          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            w={'20px'}
            h={'20px'}
            borderRadius={'50%'}
            cursor={'pointer'}
            _hover={{ bg: 'myGray.100' }}
            onClick={onClose}
          >
            <MyIcon name={'common/closeLight'} w={'12px'} h={'12px'} color={'myGray.700'} />
          </Flex>
        </Flex>
        <Box pt={2} flex={'1 0 0'}>
          <ChatBox
            ref={ChatBoxRef}
            appAvatar={chat?.app.avatar}
            userAvatar={HUMAN_ICON}
            feedbackType={'admin'}
            showMarkIcon
            showVoiceIcon={false}
            chatConfig={chat?.app?.chatConfig}
            appId={appId}
            chatId={chatId}
          />
        </Box>
      </MyBox>
      <Box zIndex={2} position={'fixed'} top={0} left={0} bottom={0} right={0} onClick={onClose} />
    </>
  );
};
