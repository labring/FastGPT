import React, { useMemo, useState } from 'react';
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
  Tbody,
  ModalFooter,
  ModalBody,
  Input,
  Switch,
  Link,
  IconButton
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import {
  getShareChatList,
  delShareChatById,
  createShareChat,
  putShareChat
} from '@/web/support/outLink/api';
import { formatTimeToChatTime } from '@/utils/tools';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useForm } from 'react-hook-form';
import { defaultOutLinkForm } from '@/constants/app';
import type { OutLinkEditType, OutLinkSchema } from '@fastgpt/global/support/outLink/type.d';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { OutLinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import dayjs from 'dayjs';
import { getDocPath } from '@/web/common/system/doc';
import dynamic from 'next/dynamic';
import MyMenu from '@/components/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

const SelectUsingWayModal = dynamic(() => import('./SelectUsingWayModal'));

const Share = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { Loading, setIsLoading } = useLoading();
  const { feConfigs } = useSystemStore();
  const { copyData } = useCopyData();
  const [editLinkData, setEditLinkData] = useState<OutLinkEditType>();
  const [selectedLinkData, setSelectedLinkData] = useState<OutLinkSchema>();
  const { toast } = useToast();
  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('support.outlink.Delete link tip'),
    type: 'delete'
  });

  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () => getShareChatList(appId));

  return (
    <Box position={'relative'} pt={3} px={5} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'} fontSize={['md', 'xl']}>
          {t('core.app.Share link')}
          <MyTooltip forceShow label={t('core.app.Share link desc detail')}>
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
          onClick={() => setEditLinkData(defaultOutLinkForm)}
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
                <Td>{item.lastTime ? formatTimeToChatTime(item.lastTime) : t('common.Un used')}</Td>
                <Td display={'flex'} alignItems={'center'}>
                  <Button
                    onClick={() => setSelectedLinkData(item)}
                    size={'sm'}
                    mr={3}
                    variant={'whitePrimary'}
                  >
                    {t('core.app.outLink.Select Mode')}
                  </Button>
                  <MyMenu
                    Button={
                      <IconButton
                        icon={<MyIcon name={'more'} w={'14px'} />}
                        name={'more'}
                        variant={'whiteBase'}
                        size={'sm'}
                        aria-label={''}
                      />
                    }
                    menuList={[
                      {
                        label: t('common.Edit'),
                        icon: 'edit',
                        onClick: () =>
                          setEditLinkData({
                            _id: item._id,
                            name: item.name,
                            responseDetail: item.responseDetail,
                            limit: item.limit
                          })
                      },
                      {
                        label: t('common.Delete'),
                        icon: 'delete',
                        type: 'danger',
                        onClick: openConfirm(async () => {
                          setIsLoading(true);
                          try {
                            await delShareChatById(item._id);
                            refetchShareChatList();
                          } catch (error) {
                            console.log(error);
                          }
                          setIsLoading(false);
                        })
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
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'10vh'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            {t('core.app.share.Not share link')}
          </Box>
        </Flex>
      )}
      {!!editLinkData && (
        <EditLinkModal
          appId={appId}
          type={'share'}
          defaultData={editLinkData}
          onCreate={(id) => {
            const url = `${location.origin}/chat/share?shareId=${id}`;
            copyData(url, t('core.app.share.Create link tip'));
            refetchShareChatList();
            setEditLinkData(undefined);
          }}
          onEdit={() => {
            toast({
              status: 'success',
              title: t('common.Update Successful')
            });
            refetchShareChatList();
            setEditLinkData(undefined);
          }}
          onClose={() => setEditLinkData(undefined)}
        />
      )}
      {!!selectedLinkData && (
        <SelectUsingWayModal
          share={selectedLinkData}
          onClose={() => setSelectedLinkData(undefined)}
        />
      )}
      <ConfirmModal />
      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

// edit link modal
function EditLinkModal({
  appId,
  type,
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  appId: string;
  type: `${OutLinkTypeEnum}`;
  defaultData: OutLinkEditType;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) {
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: OutLinkEditType) =>
      createShareChat({
        ...e,
        appId,
        type
      }),
    errorToast: t('common.Create Failed'),
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: OutLinkEditType) => {
      return putShareChat(e);
    },
    errorToast: t('common.Update Failed'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? t('outlink.Edit Link') : t('outlink.Create Link')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 90px'}>{t('Name')}</Box>
          <Input
            placeholder={t('outlink.Link Name') || 'Link Name'}
            maxLength={20}
            {...register('name', {
              required: t('common.Name is empty') || 'Name is empty'
            })}
          />
        </Flex>
        {feConfigs?.isPlus && (
          <>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                QPM
                <MyTooltip label={t('outlink.QPM Tips' || '')}>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Flex>
              <Input
                max={1000}
                {...register('limit.QPM', {
                  min: 0,
                  max: 1000,
                  valueAsNumber: true,
                  required: t('outlink.QPM is empty') || ''
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                {t('support.outlink.Max usage points')}
                <MyTooltip label={t('support.outlink.Max usage points tip')}>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Flex>
              <Input
                {...register('limit.maxUsagePoints', {
                  min: -1,
                  max: 10000000,
                  valueAsNumber: true,
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                {t('common.Expired Time')}
              </Flex>
              <Input
                type="datetime-local"
                defaultValue={
                  defaultData.limit?.expiredTime
                    ? dayjs(defaultData.limit?.expiredTime).format('YYYY-MM-DDTHH:mm')
                    : ''
                }
                onChange={(e) => {
                  setValue('limit.expiredTime', new Date(e.target.value));
                }}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                {t('outlink.token auth')}
                <MyTooltip label={t('outlink.token auth Tips') || ''}>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Flex>
              <Input
                placeholder={t('outlink.token auth Tips') || ''}
                fontSize={'sm'}
                {...register('limit.hookUrl')}
              />
            </Flex>
            <Link
              href={getDocPath('/docs/development/openapi/share')}
              target={'_blank'}
              fontSize={'sm'}
              color={'myGray.500'}
            >
              {t('outlink.token auth use cases')}
            </Link>
          </>
        )}

        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            {t('support.outlink.share.Response Quote')}
            <MyTooltip label={t('support.outlink.share.Response Quote tips' || '')}>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>
          <Switch {...register('responseDetail')} size={'lg'} />
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default React.memo(Share);
