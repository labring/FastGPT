import React, { useState } from 'react';
import {
  Flex,
  Box,
  Button,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import { getShareChatList, delShareChatById } from '@/web/support/outLink/api';
import { formatTimeToChatTime } from '@/utils/tools';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { defaultFeishuOutLinkForm } from '@/constants/app';
import type {
  FeishuType,
  OutLinkEditType,
  OutLinkSchema
} from '@fastgpt/global/support/outLink/type.d';
import { OutlinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTooltip from '@/components/MyTooltip';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import FeiShuEditModal from './Modal/FeiShuEditModal';
const SelectUsingWayModal = dynamic(() => import('./Modal/SelectUsingWayModal'));

const FeiShu = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { Loading, setIsLoading } = useLoading();
  const { feConfigs } = useSystemStore();
  const { copyData } = useCopyData();
  const [editFeiShuLinkData, setEditFeiShuLinkData] = useState<OutLinkEditType<FeishuType>>();
  const [selectedLinkData, setSelectedLinkData] = useState<OutLinkSchema<FeishuType>>();
  const { toast } = useToast();
  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () =>
    getShareChatList<FeishuType>({ appId, type: OutlinkTypeEnum.feishu })
  );

  return (
    <Box position={'relative'} pt={3} px={5} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'} fontSize={['md', 'xl']}>
          {t('core.app.FeiShu Bot')}
          <MyTooltip forceShow label={t('core.app.FeiShu Bot Dec')}>
            <QuestionOutlineIcon ml={1} />
          </MyTooltip>
        </Box>
        <Button
          variant={'whitePrimary'}
          colorScheme={'blue'}
          size={['sm', 'md']}
          {...(shareChatList.length >= 10
            ? {
                isDisabled: true,
                title: t('core.app.share.Amount limit tip')
              }
            : {})}
          onClick={() => setEditFeiShuLinkData(defaultFeishuOutLinkForm)}
        >
          {t('core.app.share.Create link')}
        </Button>
      </Flex>
      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} overflowX={'auto'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>{t('common.Name')}</Th>
              <Th>{t('support.outlink.Usage points')}</Th>
              <Th>{t('core.app.share.Is response quote')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('core.app.share.Ip limit title')}</Th>
                  <Th>{t('common.Expired Time')}</Th>
                  <Th>{t('core.app.share.Role check')}</Th>
                </>
              )}
              <Th>{t('common.Last use time')}</Th>
              <Th>{t('core.app.App params config')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>
                  {Math.round(item.usagePoints)}
                  {feConfigs?.isPlus
                    ? `${
                        item.limit?.maxUsagePoints && item.limit.maxUsagePoints > -1
                          ? ` / ${item.limit.maxUsagePoints}`
                          : ` / ${t('common.Unlimited')}`
                      }`
                    : ''}
                </Td>
                <Td>{item.responseDetail ? '✔' : '✖'}</Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td>{item?.limit?.QPM || '-'}</Td>
                    <Td>
                      {item?.limit?.expiredTime
                        ? dayjs(item.limit?.expiredTime).format('YYYY/MM/DD\nHH:mm')
                        : '-'}
                    </Td>
                    <Th>{item?.limit?.hookUrl ? '✔' : '✖'}</Th>
                  </>
                )}
                <Td>
                  {item.lastTime ? t(formatTimeToChatTime(item.lastTime)) : t('common.Un used')}
                </Td>
                <Td display={'flex'} alignItems={'center'}>
                  <MyMenu
                    Button={
                      <MyIcon
                        name={'more'}
                        _hover={{ bg: 'myGray.100  ' }}
                        cursor={'pointer'}
                        borderRadius={'md'}
                        w={'14px'}
                        p={2}
                      />
                    }
                    menuList={[
                      {
                        label: t('core.app.outLink.Select Mode'),
                        icon: 'copy',
                        onClick: () => {
                          setSelectedLinkData(item);
                        }
                      },
                      {
                        label: t('common.Edit'),
                        icon: 'edit',
                        onClick: () =>
                          setEditFeiShuLinkData({
                            _id: item._id,
                            name: item.name,
                            limit: item.limit,
                            app: item.app,
                            responseDetail: item.responseDetail,
                            defaultResponse: item.defaultResponse,
                            immediateResponse: item.immediateResponse
                          })
                      },
                      {
                        label: t('common.Delete'),
                        icon: 'delete',
                        onClick: async () => {
                          setIsLoading(true);
                          try {
                            await delShareChatById(item._id);
                            refetchShareChatList();
                          } catch (error) {
                            console.log(error);
                          }
                          setIsLoading(false);
                        }
                      }
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      {editFeiShuLinkData && (
        <FeiShuEditModal
          appId={appId}
          // type={'feishu' as OutLinkTypeEnum}
          defaultData={editFeiShuLinkData}
          onCreate={(id) => {
            const url = `${location.origin}/chat/share?shareId=${id}`;
            copyData(url, t('core.app.share.Create link tip'));
            refetchShareChatList();
            setEditFeiShuLinkData(undefined);
          }}
          onEdit={() => {
            toast({
              status: 'success',
              title: t('common.Update Successful')
            });
            refetchShareChatList();
            setEditFeiShuLinkData(undefined);
          }}
          onClose={() => setEditFeiShuLinkData(undefined)}
        />
      )}
      {!!selectedLinkData && (
        <SelectUsingWayModal
          share={selectedLinkData}
          onClose={() => setSelectedLinkData(undefined)}
        />
      )}
      {shareChatList.length === 0 && !isFetching && (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'10vh'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            {t('core.app.share.Not share link')}
          </Box>
        </Flex>
      )}
      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

export default React.memo(FeiShu);
