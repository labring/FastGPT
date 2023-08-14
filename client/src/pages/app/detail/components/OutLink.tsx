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
  Tbody,
  useDisclosure,
  ModalFooter,
  ModalBody,
  FormControl,
  Input,
  useTheme
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyIcon from '@/components/Icon';
import { useLoading } from '@/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import { getShareChatList, delShareChatById, createShareChat } from '@/api/chat';
import { formatTimeToChatTime, useCopyData } from '@/utils/tools';
import { useForm } from 'react-hook-form';
import { defaultShareChat } from '@/constants/model';
import type { ShareChatEditType } from '@/types/app';
import { useRequest } from '@/hooks/useRequest';
import { formatPrice } from '@/utils/user';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import MyRadio from '@/components/Radio';

const Share = ({ appId }: { appId: string }) => {
  const { Loading, setIsLoading } = useLoading();
  const { copyData } = useCopyData();
  const {
    isOpen: isOpenCreateShareChat,
    onOpen: onOpenCreateShareChat,
    onClose: onCloseCreateShareChat
  } = useDisclosure();
  const {
    register: registerShareChat,
    getValues: getShareChatValues,
    setValue: setShareChatValues,
    handleSubmit: submitShareChat,
    reset: resetShareChat
  } = useForm({
    defaultValues: defaultShareChat
  });

  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () => getShareChatList(appId));

  const { mutate: onclickCreateShareChat, isLoading: creating } = useRequest({
    mutationFn: async (e: ShareChatEditType) =>
      createShareChat({
        ...e,
        appId
      }),
    errorToast: '创建分享链接异常',
    onSuccess(id) {
      onCloseCreateShareChat();
      refetchShareChatList();
      const url = `${location.origin}/chat/share?shareId=${id}`;
      copyData(url, '创建成功。已复制分享地址，可直接分享使用');
      resetShareChat(defaultShareChat);
    }
  });

  return (
    <Box position={'relative'} pt={[3, 5, 8]} px={[5, 8]} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'}>
          免登录窗口
          <MyTooltip
            forceShow
            label="可以直接分享该模型给其他用户去进行对话，对方无需登录即可直接进行对话。注意，这个功能会消耗你账号的tokens。请保管好链接和密码。"
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
          onClick={onOpenCreateShareChat}
        >
          创建新链接
        </Button>
      </Flex>
      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} overflowX={'auto'}>
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>金额消耗</Th>
              <Th>最后使用时间</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>{formatPrice(item.total)}元</Td>
                <Td>{item.lastTime ? formatTimeToChatTime(item.lastTime) : '未使用'}</Td>
                <Td display={'flex'} alignItems={'center'}>
                  <MyTooltip label={'嵌入网页'}>
                    <MyIcon
                      mr={4}
                      name="apiLight"
                      w={'14px'}
                      cursor={'pointer'}
                      _hover={{ color: 'myBlue.600' }}
                      onClick={() => {
                        const url = `${location.origin}/chat/share?shareId=${item.shareId}`;
                        const src = `${location.origin}/js/iframe.js`;
                        const script = `<script src="${src}" id="fastgpt-iframe" data-src="${url}" data-color="#4e83fd"></script>`;
                        copyData(script, '已复制嵌入 Script，可在应用 HTML 底部嵌入', 3000);
                      }}
                    />
                  </MyTooltip>
                  <MyTooltip label={'复制分享链接'}>
                    <MyIcon
                      mr={4}
                      name="copy"
                      w={'14px'}
                      cursor={'pointer'}
                      _hover={{ color: 'myBlue.600' }}
                      onClick={() => {
                        const url = `${location.origin}/chat/share?shareId=${item.shareId}`;
                        copyData(url, '已复制分享链接，可直接分享使用');
                      }}
                    />
                  </MyTooltip>
                  <MyTooltip label={'删除链接'}>
                    <MyIcon
                      name="delete"
                      w={'14px'}
                      cursor={'pointer'}
                      _hover={{ color: 'red' }}
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
                    />
                  </MyTooltip>
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
      {/* create shareChat modal */}
      <MyModal
        isOpen={isOpenCreateShareChat}
        onClose={onCloseCreateShareChat}
        title={'创建免登录窗口'}
      >
        <ModalBody>
          <FormControl>
            <Flex alignItems={'center'}>
              <Box flex={'0 0 60px'} w={0}>
                名称:
              </Box>
              <Input
                placeholder="记录名字，仅用于展示"
                maxLength={20}
                {...registerShareChat('name', {
                  required: '记录名称不能为空'
                })}
              />
            </Flex>
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button variant={'base'} mr={3} onClick={onCloseCreateShareChat}>
            取消
          </Button>

          <Button
            isLoading={creating}
            onClick={submitShareChat((data) => onclickCreateShareChat(data))}
          >
            确认
          </Button>
        </ModalFooter>
      </MyModal>
      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

enum LinkTypeEnum {
  share = 'share',
  iframe = 'iframe'
}

const OutLink = ({ appId }: { appId: string }) => {
  const theme = useTheme();

  const [linkType, setLinkType] = useState<`${LinkTypeEnum}`>(LinkTypeEnum.share);

  return (
    <Box pt={[1, 5]}>
      <Box fontWeight={'bold'} fontSize={['md', 'xl']} mb={2} px={[4, 8]}>
        外部使用途径
      </Box>
      <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
        <MyRadio
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(auto-fill, minmax(0, 360px))']}
          iconSize={'20px'}
          list={[
            {
              icon: 'outlink_share',
              title: '免登录窗口',
              desc: '分享链接给其他用户，无需登录即可直接进行使用',
              value: LinkTypeEnum.share
            }
            // {
            //   icon: 'outlink_iframe',
            //   title: '网页嵌入',
            //   desc: '嵌入到已有网页中，右下角会生成对话按键',
            //   value: LinkTypeEnum.iframe
            // }
          ]}
          value={linkType}
          onChange={(e) => setLinkType(e as `${LinkTypeEnum}`)}
        />
      </Box>

      {linkType === LinkTypeEnum.share && <Share appId={appId} />}
    </Box>
  );
};

export default OutLink;
