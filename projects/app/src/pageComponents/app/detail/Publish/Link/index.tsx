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
  IconButton,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import {
  getShareChatList,
  delShareChatById,
  createShareChat,
  putShareChat
} from '@/web/support/outLink/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useForm } from 'react-hook-form';
import { defaultOutLinkForm } from '@/web/core/app/constants';
import type { OutLinkEditType, OutLinkSchema } from '@fastgpt/global/support/outLink/type.d';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import dayjs from 'dayjs';
import { getDocPath } from '@/web/common/system/doc';
import dynamic from 'next/dynamic';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const SelectUsingWayModal = dynamic(() => import('./SelectUsingWayModal'));

const Share = ({ appId }: { appId: string; type: PublishChannelEnum }) => {
  const { t } = useTranslation();
  const { Loading, setIsLoading } = useLoading();
  const { feConfigs } = useSystemStore();
  const { copyData } = useCopyData();
  const [editLinkData, setEditLinkData] = useState<OutLinkEditType>();
  const [selectedLinkData, setSelectedLinkData] = useState<OutLinkSchema>();
  const { toast } = useToast();
  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('common:support.outlink.Delete link tip'),
    type: 'delete'
  });

  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () =>
    getShareChatList({ appId, type: PublishChannelEnum.share })
  );

  return (
    <MyBox h={'100%'} isLoading={isFetching} position={'relative'}>
      <Flex justifyContent={'space-between'}>
        <HStack>
          <Box color={'myGray.900'} fontSize={'lg'}>
            {t('common:core.app.Share link')}
          </Box>
          <QuestionTip label={t('common:core.app.Share link desc detail')} />
        </HStack>
        <Button
          variant={'whitePrimary'}
          colorScheme={'blue'}
          size={['sm', 'md']}
          {...(shareChatList.length >= 10
            ? {
                isDisabled: true,
                title: t('common:core.app.share.Amount limit tip')
              }
            : {})}
          onClick={() => setEditLinkData(defaultOutLinkForm)}
        >
          {t('common:core.app.share.Create link')}
        </Button>
      </Flex>
      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} overflowX={'auto'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>{t('common:Name')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('common:expired_time')}</Th>
                </>
              )}
              <Th>{t('common:support.outlink.Usage points')}</Th>
              <Th>{t('common:core.app.share.Is response quote')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('common:core.app.share.Ip limit title')}</Th>
                  <Th>{t('common:core.app.share.Role check')}</Th>
                </>
              )}
              <Th>{t('common:last_use_time')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td>
                      {item.limit?.expiredTime
                        ? dayjs(item.limit.expiredTime).format('YYYY-MM-DD HH:mm')
                        : '-'}
                    </Td>
                  </>
                )}
                <Td>
                  {Math.round(item.usagePoints)}
                  {feConfigs?.isPlus
                    ? `${
                        item.limit?.maxUsagePoints && item.limit.maxUsagePoints > -1
                          ? ` / ${item.limit.maxUsagePoints}`
                          : ` / ${t('common:Unlimited')}`
                      }`
                    : ''}
                </Td>
                <Td>{item.showCite ? '✔' : '✖'}</Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td>{item?.limit?.QPM || '-'}</Td>

                    <Th>{item?.limit?.hookUrl ? '✔' : '✖'}</Th>
                  </>
                )}
                <Td>
                  {item.lastTime
                    ? t(formatTimeToChatTime(item.lastTime) as any).replace('#', ':')
                    : t('common:un_used')}
                </Td>
                <Td display={'flex'} alignItems={'center'}>
                  <Button
                    onClick={() => setSelectedLinkData(item as OutLinkSchema)}
                    size={'sm'}
                    mr={3}
                    variant={'whitePrimary'}
                  >
                    {t('common:core.app.outLink.Select Mode')}
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
                        children: [
                          {
                            label: t('common:Edit'),
                            icon: 'edit',
                            onClick: () =>
                              setEditLinkData({
                                _id: item._id,
                                name: item.name,
                                showCite: item.showCite,
                                canDownloadSource: item.canDownloadSource,
                                showFullText: item.showFullText,
                                showRunningStatus: item.showRunningStatus,
                                limit: item.limit
                              })
                          },
                          {
                            label: t('common:Delete'),
                            icon: 'delete',
                            type: 'danger',
                            onClick: () =>
                              openConfirm({
                                onConfirm: async () => {
                                  setIsLoading(true);
                                  try {
                                    await delShareChatById(item._id);
                                    refetchShareChatList();
                                  } catch (error) {
                                    console.log(error);
                                  }
                                  setIsLoading(false);
                                }
                              })()
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
      {!!editLinkData && (
        <EditLinkModal
          appId={appId}
          type={PublishChannelEnum.share}
          defaultData={editLinkData}
          onCreate={(id) => {
            const url = `${location.origin}/chat/share?shareId=${id}`;
            copyData(url, t('common:core.app.share.Create link tip'));
            refetchShareChatList();
            setEditLinkData(undefined);
          }}
          onEdit={() => {
            toast({
              status: 'success',
              title: t('common:update_success')
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
    </MyBox>
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
  type: PublishChannelEnum;
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
    watch,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const showCite = watch('showCite');
  const showFullText = watch('showFullText');
  const canDownloadSource = watch('canDownloadSource');

  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);

  const { runAsync: onclickCreate, loading: creating } = useRequest2(
    async (e: OutLinkEditType) =>
      createShareChat({
        ...e,
        appId,
        type
      }),
    {
      errorToast: t('common:create_failed'),
      onSuccess: onCreate
    }
  );
  const { runAsync: onclickUpdate, loading: updating } = useRequest2(putShareChat, {
    errorToast: t('common:update_failed'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? t('publish:edit_link') : t('publish:create_link')}
      maxW={['90vw', '700px']}
      w={'100%'}
      h={['90vh', 'auto']}
    >
      <ModalBody
        p={6}
        display={['block', 'flex']}
        flex={['1 0 0', 'auto']}
        overflow={'auto'}
        gap={4}
      >
        <Box pr={[0, 4]} flex={1} borderRight={['0px', '1px']} borderColor={['', 'myGray.150']}>
          <Box fontSize={'sm'} fontWeight={'500'} color={'myGray.600'}>
            {t('publish:basic_info')}
          </Box>
          <Flex alignItems={'center'} mt={4}>
            <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
            <Input
              placeholder={t('publish:link_name')}
              maxLength={100}
              {...register('name', {
                required: t('common:name_is_empty')
              })}
            />
          </Flex>
          {feConfigs?.isPlus && (
            <>
              <Flex alignItems={'center'} mt={4}>
                <FormLabel flex={'0 0 90px'} alignItems={'center'}>
                  {t('common:expired_time')}
                </FormLabel>
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
                  <FormLabel>QPM</FormLabel>
                  <QuestionTip ml={1} label={t('publish:qpm_tips')}></QuestionTip>
                </Flex>
                <Input
                  max={1000}
                  {...register('limit.QPM', {
                    min: 0,
                    max: 1000,
                    valueAsNumber: true,
                    required: t('publish:qpm_is_empty')
                  })}
                />
              </Flex>
              <Flex alignItems={'center'} mt={4}>
                <Flex flex={'0 0 90px'} alignItems={'center'}>
                  <FormLabel>{t('common:support.outlink.Max usage points')}</FormLabel>
                  <QuestionTip
                    ml={1}
                    label={t('common:support.outlink.Max usage points tip')}
                  ></QuestionTip>
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
                  <FormLabel>{t('publish:token_auth')}</FormLabel>
                  <QuestionTip ml={1} label={t('publish:token_auth_tips')}></QuestionTip>
                </Flex>
                <Input
                  placeholder={t('publish:token_auth_tips')}
                  fontSize={'sm'}
                  {...register('limit.hookUrl')}
                />
              </Flex>
              <Link
                href={getDocPath('/docs/introduction/development/openapi/share')}
                target={'_blank'}
                fontSize={'xs'}
                color={'myGray.500'}
              >
                {t('publish:token_auth_use_cases')}
              </Link>
            </>
          )}
        </Box>
        <Box flex={1} pt={[6, 0]}>
          <Box fontSize={'sm'} fontWeight={'500'} color={'myGray.600'}>
            {t('publish:private_config')}
          </Box>
          <Flex alignItems={'center'} mt={4} justify={'space-between'} height={'36px'}>
            <FormLabel>{t('publish:show_node')}</FormLabel>
            <Switch {...register('showRunningStatus')} />
          </Flex>
          <Flex alignItems={'center'} mt={4} justify={'space-between'} height={'36px'}>
            <Flex alignItems={'center'}>
              <FormLabel>{t('common:support.outlink.share.Response Quote')}</FormLabel>
              <QuestionTip
                ml={1}
                label={t('common:support.outlink.share.Response Quote tips')}
              ></QuestionTip>
            </Flex>
            <Switch
              {...register('showCite', {
                onChange(e) {
                  if (!e.target.checked) {
                    setValue('showFullText', false);
                    setValue('canDownloadSource', false);
                  }
                }
              })}
              isChecked={showCite}
            />
          </Flex>
          <Flex alignItems={'center'} mt={4} justify={'space-between'} height={'36px'}>
            <Flex alignItems={'center'}>
              <FormLabel>{t('common:core.app.share.Show full text')}</FormLabel>
              <QuestionTip
                ml={1}
                label={t('common:support.outlink.share.Show full text tips')}
              ></QuestionTip>
            </Flex>
            <Switch
              {...register('showFullText', {
                onChange(e) {
                  if (!e.target.checked) {
                    setValue('canDownloadSource', false);
                  } else {
                    setValue('showCite', true);
                  }
                }
              })}
              isChecked={showFullText}
            />
          </Flex>
          <Flex alignItems={'center'} mt={4} justify={'space-between'} height={'36px'}>
            <Flex alignItems={'center'}>
              <FormLabel>{t('common:core.app.share.Download source')}</FormLabel>
              <QuestionTip
                ml={1}
                label={t('common:support.outlink.share.Download source tips')}
              ></QuestionTip>
            </Flex>
            <Switch
              {...register('canDownloadSource', {
                onChange(e) {
                  if (e.target.checked) {
                    setValue('showFullText', true);
                    setValue('showCite', true);
                  }
                }
              })}
              isChecked={canDownloadSource}
            />
          </Flex>
        </Box>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default React.memo(Share);
