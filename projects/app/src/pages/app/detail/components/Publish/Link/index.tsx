import React, { useEffect, useMemo, useState } from 'react';
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
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useForm } from 'react-hook-form';
import { defaultOutLinkForm } from '@/web/core/app/constants';
import type { OutLinkEditType, OutLinkSchema } from '@fastgpt/global/support/outLink/type.d';
import { useRequest } from '@/web/common/hooks/useRequest';
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
import { useI18n } from '@/web/context/I18n';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyBox from '@fastgpt/web/components/common/MyBox';

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
              <Th>{t('common:common.Name')}</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>{t('common:common.Expired Time')}</Th>
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
              <Th>{t('common:common.Last use time')}</Th>
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
                          : ` / ${t('common:common.Unlimited')}`
                      }`
                    : ''}
                </Td>
                <Td>{item.responseDetail ? '✔' : '✖'}</Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td>{item?.limit?.QPM || '-'}</Td>

                    <Th>{item?.limit?.hookUrl ? '✔' : '✖'}</Th>
                  </>
                )}
                <Td>
                  {item.lastTime
                    ? t(formatTimeToChatTime(item.lastTime) as any).replace('#', ':')
                    : t('common:common.Un used')}
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
                            label: t('common:common.Edit'),
                            icon: 'edit',
                            onClick: () =>
                              setEditLinkData({
                                _id: item._id,
                                name: item.name,
                                responseDetail: item.responseDetail,
                                showCompleteQuote: item.showCompleteQuote,
                                showNodeStatus: item.showNodeStatus,
                                limit: item.limit
                              })
                          },
                          {
                            label: t('common:common.Delete'),
                            icon: 'delete',
                            type: 'danger',
                            onClick: () =>
                              openConfirm(async () => {
                                setIsLoading(true);
                                try {
                                  await delShareChatById(item._id);
                                  refetchShareChatList();
                                } catch (error) {
                                  console.log(error);
                                }
                                setIsLoading(false);
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
              title: t('common:common.Update Successful')
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
  const { publishT } = useI18n();
  const {
    register,
    setValue,
    watch,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const responseDetail = watch('responseDetail');
  const showCompleteQuote = watch('showCompleteQuote');

  useEffect(() => {
    if (!responseDetail) {
      setValue('showCompleteQuote', false);
    }
  }, [responseDetail, setValue]);

  useEffect(() => {
    if (showCompleteQuote) {
      setValue('responseDetail', true);
    }
  }, [showCompleteQuote, setValue]);

  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: OutLinkEditType) =>
      createShareChat({
        ...e,
        appId,
        type
      }),
    errorToast: t('common:common.Create Failed'),
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: OutLinkEditType) => {
      return putShareChat(e);
    },
    errorToast: t('common:common.Update Failed'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? publishT('edit_link') : publishT('create_link')}
      w={'53.125rem'}
    >
      <ModalBody p={6}>
        <Flex flexDir={['column', 'row']}>
          <Box pr={[0, 6]} borderRight={['0px', '1px']} borderColor={['', 'myGray.150']}>
            <Box fontSize={'sm'} fontWeight={'500'} color={'myGray.600'}>
              {t('publish:basic_info')}
            </Box>
            <Flex alignItems={'center'} mt={4}>
              <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
              <Input
                placeholder={publishT('link_name')}
                maxLength={20}
                {...register('name', {
                  required: t('common:common.name_is_empty') || 'name_is_empty'
                })}
              />
            </Flex>
            {feConfigs?.isPlus && (
              <>
                <Flex alignItems={'center'} mt={4}>
                  <FormLabel flex={'0 0 90px'} alignItems={'center'}>
                    {t('common:common.Expired Time')}
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
                    <QuestionTip ml={1} label={publishT('qpm_tips' || '')}></QuestionTip>
                  </Flex>
                  <Input
                    max={1000}
                    {...register('limit.QPM', {
                      min: 0,
                      max: 1000,
                      valueAsNumber: true,
                      required: publishT('qpm_is_empty') || ''
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
                    <FormLabel>{publishT('token_auth')}</FormLabel>
                    <QuestionTip ml={1} label={publishT('token_auth_tips') || ''}></QuestionTip>
                  </Flex>
                  <Input
                    placeholder={publishT('token_auth_tips') || ''}
                    fontSize={'sm'}
                    {...register('limit.hookUrl')}
                  />
                </Flex>
                <Link
                  href={getDocPath('/docs/development/openapi/share')}
                  target={'_blank'}
                  fontSize={'xs'}
                  color={'myGray.500'}
                >
                  {publishT('token_auth_use_cases')}
                </Link>
              </>
            )}
          </Box>
          <Box pl={[0, 6]} flexGrow={1} pt={[6, 0]}>
            <Box fontSize={'sm'} fontWeight={'500'} color={'myGray.600'}>
              {t('publish:config')}
            </Box>
            <Flex alignItems={'center'} mt={4} justify={'space-between'}>
              <Flex alignItems={'center'}>
                <FormLabel>{t('publish:show_node')}</FormLabel>
              </Flex>
              <Switch {...register('showNodeStatus')} />
            </Flex>

            <Flex alignItems={'center'} mt={4} justify={'space-between'}>
              <Flex alignItems={'center'}>
                <FormLabel>{t('common:support.outlink.share.Response Quote')}</FormLabel>
                <QuestionTip
                  ml={1}
                  label={t('common:support.outlink.share.Response Quote tips' || '')}
                ></QuestionTip>
              </Flex>
              <Switch {...register('responseDetail')} isChecked={responseDetail} />
            </Flex>

            <Flex alignItems={'center'} mt={4} justify={'space-between'}>
              <Flex alignItems={'center'}>
                <FormLabel>{t('common:support.outlink.share.show_complete_quote')}</FormLabel>
                <QuestionTip
                  ml={1}
                  label={t('common:support.outlink.share.show_complete_quote_tips' || '')}
                ></QuestionTip>
              </Flex>
              <Switch {...register('showCompleteQuote')} isChecked={showCompleteQuote} />
            </Flex>
          </Box>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default React.memo(Share);
