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
  ModalBody
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { usePagination } from '@/web/common/hooks/usePagination';
import { getAppChatLogs } from '@/web/core/app/api';
import dayjs from 'dayjs';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import { AppLogsListItemType } from '@/types/app';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatBox, { type ComponentRef } from '@/components/ChatBox';
import { useQuery } from '@tanstack/react-query';
import { getInitChatInfo } from '@/web/core/chat/api';
import Tag from '@/components/Tag';
import MyModal from '@/components/MyModal';
import DateRangePicker, { type DateRangeType } from '@/components/DateRangePicker';
import { addDays } from 'date-fns';
import MyBox from '@/components/common/MyBox';

const Logs = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();

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
    <Flex flexDirection={'column'} h={'100%'} pt={[1, 5]} position={'relative'}>
      <Box px={[4, 8]}>
        {isPc && (
          <>
            <Box fontWeight={'bold'} fontSize={['md', 'xl']} mb={2}>
              {t('app.Chat logs')}
            </Box>
            <Box color={'myGray.500'} fontSize={'sm'}>
              {t('app.Chat Logs Tips')},{' '}
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
      <TableContainer mt={[0, 3]} flex={'1 0 0'} h={0} overflowY={'auto'} px={[4, 8]}>
        <Table variant={'simple'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>{t('core.app.logs.Source And Time')}</Th>
              <Th>{t('app.Logs Title')}</Th>
              <Th>{t('app.Logs Message Total')}</Th>
              <Th>{t('app.Feedback Count')}</Th>
              <Th>{t('core.app.feedback.Custom feedback')}</Th>
              <Th>{t('app.Mark Count')}</Th>
            </Tr>
          </Thead>
          <Tbody>
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
      </TableContainer>
      {logs.length === 0 && !isLoading && (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'10vh'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            {t('app.Logs Empty')}
          </Box>
        </Flex>
      )}
      <Flex w={'100%'} p={4} alignItems={'center'} justifyContent={'flex-end'}>
        <DateRangePicker
          defaultDate={dateRange}
          position="top"
          onChange={setDateRange}
          onSuccess={() => getData(1)}
        />
        <Box ml={3}>
          <Pagination />
        </Box>
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
    </Flex>
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
    return history[history.length - 2]?.value?.slice(0, 8);
  }, [history]);

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
              <Tag>
                <MyIcon name={'history'} w={'14px'} />
                <Box ml={1}>{`${history.length}条记录`}</Box>
              </Tag>
              {!!chat?.app?.chatModels && (
                <Tag ml={2} colorSchema={'green'}>
                  <MyIcon name={'core/chat/chatModelTag'} w={'14px'} />
                  <Box ml={1}>{chat.app.chatModels.join(',')}</Box>
                </Tag>
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
            userGuideModule={chat?.app?.userGuideModule}
            appId={appId}
            chatId={chatId}
          />
        </Box>
      </MyBox>
      <Box zIndex={2} position={'fixed'} top={0} left={0} bottom={0} right={0} onClick={onClose} />
    </>
  );
};
