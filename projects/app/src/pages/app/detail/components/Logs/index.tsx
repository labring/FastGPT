import React, { useEffect, useState } from 'react';
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
  useDisclosure,
  ModalBody,
  HStack
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getAppChatLogs } from '@/web/core/app/api';
import dayjs from 'dayjs';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { addDays } from 'date-fns';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import DateRangePicker, { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useUserStore } from '@/web/support/user/useUserStore';
import Tag from '@fastgpt/web/components/common/Tag';
const DetailLogsModal = dynamic(() => import('./DetailLogsModal'));

const Logs = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const appId = useContextSelector(AppContext, (v) => v.appId);
  const { teamMembers, loadAndGetTeamMembers } = useUserStore();

  useEffect(() => {
    loadAndGetTeamMembers();
  }, []);

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
  } = usePagination({
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
    <Flex flexDirection={'column'} h={'100%'}>
      {isPc && (
        <Box {...cardStyles} boxShadow={2} px={[4, 8]} py={[4, 6]}>
          <Box fontWeight={'bold'} fontSize={['md', 'lg']} mb={2}>
            {t('app:chat_logs')}
          </Box>
          <Box color={'myGray.500'} fontSize={'sm'}>
            {t('app:chat_logs_tips')},{' '}
            <Box
              as={'span'}
              mr={2}
              textDecoration={'underline'}
              cursor={'pointer'}
              onClick={onOpenMarkDesc}
            >
              {t('common:core.chat.Read Mark Description')}
            </Box>
          </Box>
        </Box>
      )}

      {/* table */}
      <Flex
        flexDirection={'column'}
        {...cardStyles}
        boxShadow={3.5}
        mt={[0, 4]}
        px={[4, 8]}
        py={[4, 6]}
        flex={'1 0 0'}
      >
        <TableContainer mt={[0, 3]} flex={'1 0 0'} h={0} overflowY={'auto'}>
          <Table variant={'simple'} fontSize={'sm'}>
            <Thead>
              <Tr>
                <Th>{t('common:core.app.logs.Source And Time')}</Th>
                <Th>{t('app:logs_chat_user')}</Th>
                <Th>{t('app:logs_title')}</Th>
                <Th>{t('app:logs_message_total')}</Th>
                <Th>{t('app:feedback_count')}</Th>
                <Th>{t('common:core.app.feedback.Custom feedback')}</Th>
                <Th>{t('app:mark_count')}</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'xs'}>
              {logs.map((item) => (
                <Tr
                  key={item._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  title={t('common:core.view_chat_detail')}
                  onClick={() => setDetailLogsId(item.id)}
                >
                  <Td>
                    {/* @ts-ignore */}
                    <Box>{t(ChatSourceMap[item.source]?.name) || item.source}</Box>
                    <Box color={'myGray.500'}>{dayjs(item.time).format('YYYY/MM/DD HH:mm')}</Box>
                  </Td>
                  <Td>
                    <Box>
                      {!!item.outLinkUid ? (
                        item.outLinkUid
                      ) : (
                        <HStack>
                          <Avatar
                            src={teamMembers.find((v) => v.tmbId === item.tmbId)?.avatar}
                            w="1.25rem"
                          />
                          <Box fontSize={'sm'} ml={1}>
                            {teamMembers.find((v) => v.tmbId === item.tmbId)?.memberName}
                          </Box>
                        </HStack>
                      )}
                    </Box>
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
          {logs.length === 0 && !isLoading && <EmptyTip text={t('app:logs_empty')}></EmptyTip>}
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
        title={t('common:core.chat.Mark Description Title')}
      >
        <ModalBody whiteSpace={'pre-wrap'}>{t('common:core.chat.Mark Description')}</ModalBody>
      </MyModal>
    </Flex>
  );
};

export default React.memo(Logs);
