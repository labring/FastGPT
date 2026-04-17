import React, { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Link,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { getShareChatList, delShareChatById } from '@/web/support/outLink/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { defaultOutLinkForm } from '@/web/core/app/constants';
import type { WechatAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import dynamic from 'next/dynamic';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import { POST } from '@/web/common/api/request';
import type { ColorSchemaType } from '@fastgpt/web/components/common/Tag/index';
import MyTag from '@fastgpt/web/components/common/Tag/index';

const WechatEditModal = dynamic(() => import('./WechatEditModal'));
const QRLoginModal = dynamic(() => import('./QRLoginModal'));

const Wechat = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { Loading, setIsLoading } = useLoading();
  const { feConfigs } = useSystemStore();
  const [editData, setEditData] = useState<OutLinkEditType<WechatAppType>>();
  const [isEdit, setIsEdit] = useState(false);
  const [loginShareId, setLoginShareId] = useState<string>();

  const {
    data: shareChatList = [],
    loading: isFetching,
    runAsync: refetch
  } = useRequest(
    () => getShareChatList<WechatAppType>({ appId, type: PublishChannelEnum.wechat }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );

  const statusBadge = (status?: string) => {
    const map: Record<string, { colorSchema: ColorSchemaType; label: string }> = {
      online: { colorSchema: 'green', label: t('publish:wechat.status.online') },
      offline: { colorSchema: 'gray', label: t('publish:wechat.status.offline') },
      error: { colorSchema: 'red', label: t('publish:wechat.status.error') }
    };
    const cfg = map[status || 'offline'] ?? map['offline'];
    return <MyTag colorSchema={cfg.colorSchema}>{cfg.label}</MyTag>;
  };

  return (
    <Box position={'relative'} pt={3} px={5} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Flex alignItems={'center'}>
          <Box fontWeight={'bold'} fontSize={['md', 'lg']}>
            {t('publish:wechat.title')}
          </Box>
          {feConfigs?.docUrl && (
            <Link
              href={getDocPath('/docs/use-cases/external-integration/wechat')}
              target={'_blank'}
              ml={2}
              color={'primary.500'}
              fontSize={'sm'}
            >
              <Flex alignItems={'center'}>
                <MyIcon name="book" w={'17px'} h={'17px'} mr="1" />
                {t('common:read_doc')}
              </Flex>
            </Link>
          )}
        </Flex>
        <Button
          variant={'primary'}
          size={['sm', 'md']}
          leftIcon={<MyIcon name={'common/addLight'} w="1.25rem" color="white" />}
          {...(shareChatList.length >= 10
            ? { isDisabled: true, title: t('common:core.app.share.Amount limit tip') }
            : {})}
          onClick={() => {
            setEditData(defaultOutLinkForm as any);
            setIsEdit(false);
          }}
        >
          {t('common:add_new')}
        </Button>
      </Flex>

      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>{t('common:Name')}</Th>
              <Th>{t('publish:wechat.status')}</Th>
              <Th>{t('common:support.outlink.Usage points')}</Th>
              <Th>{t('common:last_use_time')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>{statusBadge(item.app?.status)}</Td>
                <Td>{Math.round(item.usagePoints)}</Td>
                <Td>
                  {item.lastTime
                    ? t(formatTimeToChatTime(item.lastTime) as any).replace('#', ':')
                    : t('common:un_used')}
                </Td>
                <Td display={'flex'} alignItems={'center'}>
                  {!item.app?.token ? (
                    <Button
                      size={'sm'}
                      mr={3}
                      colorScheme="green"
                      onClick={() => {
                        setLoginShareId(item.shareId);
                      }}
                    >
                      {t('publish:wechat.login')}
                    </Button>
                  ) : item.app.status === 'online' ? (
                    <Button
                      size={'sm'}
                      mr={3}
                      variant={'whiteBase'}
                      onClick={async () => {
                        setIsLoading(true);
                        try {
                          await POST('/support/outLink/wechat/logout', {
                            shareId: item.shareId
                          });
                          refetch();
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                    >
                      {t('publish:wechat.logout')}
                    </Button>
                  ) : (
                    <Button
                      size={'sm'}
                      mr={3}
                      variant={'whitePrimary'}
                      onClick={() => {
                        setLoginShareId(item.shareId);
                      }}
                    >
                      {t('publish:wechat.relogin')}
                    </Button>
                  )}
                  <MyMenu
                    Button={
                      <Button size={'smSquare'} variant={'whiteBase'}>
                        <MyIcon name={'more'} w={'14px'} />
                      </Button>
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: t('common:Edit'),
                            icon: 'edit',
                            onClick: () => {
                              setEditData({
                                _id: item._id,
                                name: item.name,
                                limit: item.limit,
                                app: item.app,
                                defaultResponse: item.defaultResponse,
                                immediateResponse: item.immediateResponse
                              });
                              setIsEdit(true);
                            }
                          },
                          {
                            label: t('common:Delete'),
                            icon: 'delete',
                            onClick: async () => {
                              setIsLoading(true);
                              try {
                                await delShareChatById(item._id);
                                refetch();
                              } finally {
                                setIsLoading(false);
                              }
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

      {shareChatList.length === 0 && !isFetching && (
        <EmptyTip text={t('common:core.app.share.Not share link')} />
      )}

      {editData && (
        <WechatEditModal
          appId={appId}
          defaultData={editData}
          isEdit={isEdit}
          onCreate={async (shareId) => {
            const newList = await refetch();
            return newList?.find((i) => i.shareId === shareId)?._id;
          }}
          onEdit={() => refetch()}
          onClose={() => setEditData(undefined)}
        />
      )}

      {loginShareId && (
        <QRLoginModal
          shareId={loginShareId}
          onSuccess={() => {
            refetch();
            setLoginShareId(undefined);
          }}
          onClose={() => setLoginShareId(undefined)}
        />
      )}

      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

export default React.memo(Wechat);
