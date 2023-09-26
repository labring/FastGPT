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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Link
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyIcon from '@/components/Icon';
import { useLoading } from '@/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import {
  getShareChatList,
  delShareChatById,
  createShareChat,
  putShareChat
} from '@/api/support/outLink';
import { formatTimeToChatTime } from '@/utils/tools';
import { useCopyData } from '@/hooks/useCopyData';
import { useForm } from 'react-hook-form';
import { defaultOutLinkForm } from '@/constants/model';
import type { OutLinkEditType } from '@/types/support/outLink';
import { useRequest } from '@/hooks/useRequest';
import { formatPrice } from '@fastgpt/common/bill/index';
import { OutLinkTypeEnum } from '@/constants/chat';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { feConfigs } from '@/store/static';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import dayjs from 'dayjs';

const Share = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { Loading, setIsLoading } = useLoading();
  const { copyData } = useCopyData();
  const [editLinkData, setEditLinkData] = useState<OutLinkEditType>();
  const { toast } = useToast();

  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () => getShareChatList(appId));

  return (
    <Box position={'relative'} pt={[3, 5, 8]} px={[2, 8]} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'}>
          免登录窗口
          <MyTooltip
            forceShow
            label="可以直接分享该模型给其他用户去进行对话，对方无需登录即可直接进行对话。注意，这个功能会消耗你账号的余额，请保管好链接！"
          >
            <QuestionOutlineIcon ml={1} />
          </MyTooltip>
        </Box>
        <Button
          variant={'base'}
          colorScheme={'myBlue'}
          size={['sm', 'md']}
          {...(shareChatList.length >= 10
            ? {
                isDisabled: true,
                title: '最多创建10组'
              }
            : {})}
          onClick={() => setEditLinkData(defaultOutLinkForm)}
        >
          创建新链接
        </Button>
      </Flex>
      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} overflowX={'auto'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>金额消耗(￥)</Th>
              <Th>返回详情</Th>
              {feConfigs?.isPlus && (
                <>
                  <Th>金额限制(￥)</Th>
                  <Th>IP限流（人/分钟）</Th>
                  <Th>过期时间</Th>
                  <Th>身份校验</Th>
                </>
              )}
              <Th>最后使用时间</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>{formatPrice(item.total)}</Td>
                <Td>{item.responseDetail ? '✔' : '✖'}</Td>
                {feConfigs?.isPlus && (
                  <>
                    <Td>
                      {item.limit && item.limit.credit > -1 ? `${item.limit.credit}元` : '无限制'}
                    </Td>
                    <Td>{item?.limit?.QPM || '-'}</Td>
                    <Td>
                      {item?.limit?.expiredTime
                        ? dayjs(item.limit?.expiredTime).format('YYYY/MM/DD\nHH:mm')
                        : '-'}
                    </Td>
                    <Th>{item?.limit?.hookUrl ? '✔' : '✖'}</Th>
                  </>
                )}
                <Td>{item.lastTime ? formatTimeToChatTime(item.lastTime) : '未使用'}</Td>
                <Td display={'flex'} alignItems={'center'}>
                  <Menu autoSelect={false} isLazy>
                    <MenuButton
                      _hover={{ bg: 'myWhite.600  ' }}
                      cursor={'pointer'}
                      borderRadius={'md'}
                    >
                      <MyIcon name={'more'} w={'14px'} p={2} />
                    </MenuButton>
                    <MenuList color={'myGray.700'} minW={`120px !important`} zIndex={10}>
                      <MenuItem
                        onClick={() =>
                          setEditLinkData({
                            _id: item._id,
                            name: item.name,
                            responseDetail: item.responseDetail,
                            limit: item.limit
                          })
                        }
                        py={[2, 3]}
                      >
                        <MyIcon name={'edit'} w={['14px', '16px']} />
                        <Box ml={[1, 2]}>{t('common.Edit')}</Box>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          const url = `${location.origin}/chat/share?shareId=${item.shareId}`;
                          copyData(url, '已复制分享链接，可直接分享使用');
                        }}
                        py={[2, 3]}
                      >
                        <MyIcon name={'copy'} w={['14px', '16px']} />
                        <Box ml={[1, 2]}>{t('common.Copy')}</Box>
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          const url = `${location.origin}/chat/share?shareId=${item.shareId}`;
                          const src = `${location.origin}/js/iframe.js`;
                          const script = `<script src="${src}" id="fastgpt-iframe" data-src="${url}" data-color="#4e83fd"></script>`;
                          copyData(script, '已复制嵌入 Script，可在应用 HTML 底部嵌入', 3000);
                        }}
                        py={[2, 3]}
                      >
                        <MyIcon name={'apiLight'} w={['14px', '16px']} />
                        <Box ml={[1, 2]}>{t('outlink.Copy Iframe')}</Box>
                      </MenuItem>
                      <MenuItem
                        onClick={async () => {
                          setIsLoading(true);
                          try {
                            await delShareChatById(item._id);
                            refetchShareChatList();
                          } catch (error) {
                            console.log(error);
                          }
                          setIsLoading(false);
                        }}
                        py={[2, 3]}
                      >
                        <MyIcon name={'delete'} w={['14px', '16px']} />
                        <Box ml={[1, 2]}>{t('common.Delete')}</Box>
                      </MenuItem>
                    </MenuList>
                  </Menu>
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
            没有创建分享链接
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
            copyData(url, '创建成功。已复制分享地址，可直接分享使用');
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
  const { t } = useTranslation();
  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);

  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: OutLinkEditType) =>
      createShareChat({
        ...e,
        appId,
        type
      }),
    errorToast: '创建链接异常',
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: OutLinkEditType) => {
      return putShareChat(e);
    },
    errorToast: '更新链接异常',
    onSuccess: onEdit
  });

  return (
    <MyModal isOpen={true} title={isEdit ? t('outlink.Edit Link') : t('outlink.Create Link')}>
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 90px'}>{t('Name')}:</Box>
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
                QPM:
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
                {t('common.Max credit')}:
                <MyTooltip label={t('common.Max credit tips' || '')}>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Flex>
              <Input
                {...register('limit.credit', {
                  min: -1,
                  max: 1000,
                  valueAsNumber: true,
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Flex flex={'0 0 90px'} alignItems={'center'}>
                {t('common.Expired Time')}:
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
              <Flex flex={'0 0 90px'}>
                {t('outlink.token auth')}
                <MyTooltip label={t('outlink.token auth Tips') || ''}>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Flex>
              <Input
                placeholder={t('outlink.token auth Tips') || ''}
                {...register('limit.hookUrl')}
              />
            </Flex>
            <Link
              href="https://doc.fastgpt.run/docs/development/openapi/#分享链接中增加额外-query"
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
            {t('outlink.Response Detail')}:
            <MyTooltip label={t('outlink.Response Detail tips' || '')}>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Flex>
          <Switch {...register('responseDetail')} size={'lg'} />
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          取消
        </Button>

        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default React.memo(Share);
