import React, { useCallback, useState } from 'react';
import {
  Flex,
  Box,
  Tooltip,
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
import type { ShareChatEditType } from '@/types/model';

const Share = ({ modelId }: { modelId: string }) => {
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
  } = useQuery(['initShareChatList', modelId], () => getShareChatList(modelId));

  const onclickCreateShareChat = useCallback(
    async (e: ShareChatEditType) => {
      try {
        setIsLoading(true);
        const id = await createShareChat({
          ...e,
          modelId
        });
        onCloseCreateShareChat();
        refetchShareChatList();

        const url = `对话地址为：${location.origin}/chat/share?shareId=${id}
${e.password ? `密码为: ${e.password}` : ''}`;
        copyData(url, '已复制分享地址');

        resetShareChat(defaultShareChat);
      } catch (err) {
        toast({
          title: getErrText(err, '创建分享链接异常'),
          status: 'warning'
        });
        console.log(err);
      }
      setIsLoading(false);
    },
    [
      copyData,
      modelId,
      onCloseCreateShareChat,
      refetchShareChatList,
      resetShareChat,
      setIsLoading,
      toast
    ]
  );

  // format share used token
  const formatTokens = (tokens: number) => {
    if (tokens < 10000) return tokens;
    return `${(tokens / 10000).toFixed(2)}万`;
  };

  return (
    <Box position={'relative'} px={5} minH={'50vh'}>
      <Flex justifyContent={'space-between'}>
        <Box fontWeight={'bold'}>
          免登录聊天窗口
          <Tooltip label="可以直接分享该模型给其他用户去进行对话，对方无需登录即可直接进行对话。注意，这个功能会消耗你账号的tokens。请保管好链接和密码。">
            <QuestionOutlineIcon ml={1} />
          </Tooltip>
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
              <Th>密码</Th>
              <Th>最大上下文</Th>
              <Th>tokens消耗</Th>
              <Th>最后使用时间</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>{item.password === '1' ? '已开启' : '未使用'}</Td>
                <Td>{item.maxContext}</Td>
                <Td>{formatTokens(item.tokens)}</Td>
                <Td>{item.lastTime ? formatTimeToChatTime(item.lastTime) : '未使用'}</Td>
                <Td>
                  <Flex>
                    <MyIcon
                      mr={3}
                      name="copy"
                      w={'14px'}
                      cursor={'pointer'}
                      _hover={{ color: 'myBlue.600' }}
                      onClick={() => {
                        const url = `${location.origin}/chat/share?shareId=${item._id}`;
                        copyData(url, '已复制分享地址');
                      }}
                    />
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
        <ModalContent>
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
            <FormControl mt={4}>
              <Flex alignItems={'center'}>
                <Box flex={'0 0 60px'} w={0}>
                  密码:
                </Box>
                <Input placeholder={'不设置密码，可直接访问'} {...registerShareChat('password')} />
              </Flex>
              <Box fontSize={'xs'} ml={'60px'} color={'myGray.600'}>
                密码不会再次展示，请记住你的密码
              </Box>
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
            <Button onClick={submitShareChat(onclickCreateShareChat)}>确认</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Loading loading={isFetching} fixed={false} />
    </Box>
  );
};

export default Share;
