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
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import { getShareChatList, delShareChatById } from '@/web/support/outLink/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { defaultFeishuOutLinkForm } from '@/web/core/app/constants';
import type { FeishuType, OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const FeiShuEditModal = dynamic(() => import('./FeiShuEditModal'));

const FeiShu = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { Loading, setIsLoading } = useLoading();
  const { feConfigs } = useSystemStore();
  const { copyData } = useCopyData();
  const [editFeiShuLinkData, setEditFeiShuLinkData] = useState<OutLinkEditType<FeishuType>>();
  const { toast } = useToast();
  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () =>
    getShareChatList<FeishuType>({ appId, type: PublishChannelEnum.feishu })
  );

  return (
    <Box position={'relative'} pt={3} px={5} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'} fontSize={['md', 'lg']}>
          {t('core.app.publish.Fei shu bot publish')}
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
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('core.app.share.Ip limit title')}</Th>
                  <Th>{t('common.Expired Time')}</Th>
                </>
              )}
              <Th>{t('common.Last use time')}</Th>
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
                {feConfigs?.isPlus && (
                  <>
                    <Td>{item?.limit?.QPM || '-'}</Td>
                    <Td>
                      {item?.limit?.expiredTime
                        ? dayjs(item.limit?.expiredTime).format('YYYY/MM/DD\nHH:mm')
                        : '-'}
                    </Td>
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
                        children: [
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
                        ]
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
          // type={'feishu' as PublishChannelEnum}
          defaultData={editFeiShuLinkData}
          onCreate={(id) => {
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
      {shareChatList.length === 0 && !isFetching && (
        <EmptyTip text={t('core.app.share.Not share link')}></EmptyTip>
      )}
      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

export default React.memo(FeiShu);
