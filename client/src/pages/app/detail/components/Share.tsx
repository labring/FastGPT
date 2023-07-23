import React, { useCallback, useState } from 'react';
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Input
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyIcon from '@/components/Icon';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import { getShareChatList, delShareChatById, createShareChat } from '@/api/chat';
import { formatTimeToChatTime, useCopyData, getErrText } from '@/utils/tools';
import { useForm } from 'react-hook-form';
import { defaultShareChat } from '@/constants/model';
import type { ShareChatEditType } from '@/types/app';
import MyTooltip from '@/components/MyTooltip';
import { useRequest } from '@/hooks/useRequest';
import { formatPrice } from '@/utils/user';

const Share = ({ appId }: { appId: string }) => {
  const { toast } = useToast();
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

  const [refresh, setRefresh] = useState(false);

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
      const url = `对话地址为：${location.origin}/chat/share?shareId=${id}`;
      copyData(url, '已复制分享地址');
      resetShareChat(defaultShareChat);
    }
  });

  return (
    <Box position={'relative'} pt={[0, 5, 8]} px={[5, 8]} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'}>
          免登录聊天窗口
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
          创建新窗口
        </Button>
      </Flex>
      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} overflowX={'auto'}>
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>最大上下文</Th>
              <Th>金额消耗</Th>
              <Th>最后使用时间</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>{item.maxContext}</Td>
                <Td>{formatPrice(item.total)}元</Td>
                <Td>{item.lastTime ? formatTimeToChatTime(item.lastTime) : '未使用'}</Td>
                <Td>
                  <Flex>
                    <MyTooltip label={'复制分享地址'}>
                      <MyIcon
                        mr={3}
                        name="copy"
                        w={'14px'}
                        cursor={'pointer'}
                        _hover={{ color: 'myBlue.600' }}
                        onClick={() => {
                          const url = `${location.origin}/chat/share?shareId=${item.shareId}`;
                          copyData(url, '已复制分享地址');
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
                  </Flex>
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
      <Modal isOpen={isOpenCreateShareChat} onClose={onCloseCreateShareChat}>
        <ModalOverlay />
        <ModalContent maxW={'min(90vw,500px)'}>
          <ModalHeader>创建免登录窗口</ModalHeader>
          <ModalCloseButton />
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
            <FormControl mt={9}>
              <Flex alignItems={'center'}>
                <Box flex={'0 0 120px'} w={0}>
                  最长上下文（组）
                </Box>
                <Slider
                  aria-label="slider-ex-1"
                  min={1}
                  max={20}
                  step={1}
                  value={getShareChatValues('maxContext')}
                  onChange={(e) => {
                    setShareChatValues('maxContext', e);
                    setRefresh(!refresh);
                  }}
                >
                  <SliderMark
                    value={getShareChatValues('maxContext')}
                    textAlign="center"
                    bg="myBlue.600"
                    color="white"
                    w={'18px'}
                    h={'18px'}
                    borderRadius={'100px'}
                    fontSize={'xs'}
                    transform={'translate(-50%, -200%)'}
                  >
                    {getShareChatValues('maxContext')}
                  </SliderMark>
                  <SliderTrack>
                    <SliderFilledTrack bg={'myBlue.700'} />
                  </SliderTrack>
                  <SliderThumb />
                </Slider>
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
        </ModalContent>
      </Modal>
      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

export default Share;
