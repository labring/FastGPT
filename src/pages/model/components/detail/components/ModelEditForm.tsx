import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  Flex,
  FormControl,
  Input,
  Textarea,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Tooltip,
  Button,
  Select,
  Switch,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tfoot,
  Tr,
  Th,
  Td,
  TableContainer,
  Checkbox
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useForm, UseFormReturn } from 'react-hook-form';
import { ChatModelMap, ModelVectorSearchModeMap, getChatModelList } from '@/constants/model';
import { formatPrice } from '@/utils/user';
import { useConfirm } from '@/hooks/useConfirm';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useToast } from '@/hooks/useToast';
import { compressImg } from '@/utils/file';
import { useQuery } from '@tanstack/react-query';
import { getShareChatList, createShareChat, delShareChatById } from '@/api/chat';
import { useRouter } from 'next/router';
import { defaultShareChat } from '@/constants/model';
import type { ShareChatEditType } from '@/types/model';
import type { ModelSchema } from '@/types/mongoSchema';
import { formatTimeToChatTime, useCopyData } from '@/utils/tools';
import MyIcon from '@/components/Icon';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import type { KbItemType } from '@/types/plugin';

const ModelEditForm = ({
  formHooks,
  isOwner,
  handleDelModel
}: {
  formHooks: UseFormReturn<ModelSchema>;
  isOwner: boolean;
  handleDelModel: () => void;
}) => {
  const { modelId } = useRouter().query as { modelId: string };
  const [refresh, setRefresh] = useState(false);
  const { toast } = useToast();
  const { setLoading } = useGlobalStore();
  const { loadKbList } = useUserStore();

  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该AI助手?'
  });
  const { copyData } = useCopyData();
  const { register, setValue, getValues } = formHooks;
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
    isOpen: isOpenCreateShareChat,
    onOpen: onOpenCreateShareChat,
    onClose: onCloseCreateShareChat
  } = useDisclosure();
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const base64 = await compressImg({
          file,
          maxW: 100,
          maxH: 100
        });
        setValue('avatar', base64);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: typeof err === 'string' ? err : '头像选择异常',
          status: 'warning'
        });
      }
    },
    [setValue, toast]
  );

  const { data: chatModelList = [] } = useQuery(['initChatModelList'], getChatModelList);

  const { data: shareChatList = [], refetch: refetchShareChatList } = useQuery(
    ['initShareChatList', modelId],
    () => getShareChatList(modelId)
  );

  const onclickCreateShareChat = useCallback(
    async (e: ShareChatEditType) => {
      try {
        setLoading(true);
        const id = await createShareChat({
          ...e,
          modelId
        });
        onCloseCreateShareChat();
        refetchShareChatList();

        const url = `你可以与 ${getValues('name')} 进行对话。
对话地址为：${location.origin}/chat/share?shareId=${id}
${e.password ? `密码为: ${e.password}` : ''}`;
        copyData(url, '已复制分享地址');

        resetShareChat(defaultShareChat);
      } catch (error) {
        console.log(error);
      }
      setLoading(false);
    },
    [
      copyData,
      getValues,
      modelId,
      onCloseCreateShareChat,
      refetchShareChatList,
      resetShareChat,
      setLoading
    ]
  );

  // format share used token
  const formatTokens = (tokens: number) => {
    if (tokens < 10000) return tokens;
    return `${(tokens / 10000).toFixed(2)}万`;
  };

  // init kb select list
  const { data: kbList = [] } = useQuery(['loadKbList'], () => loadKbList());
  const RenderSelectedKbList = useCallback(() => {
    const kbs = getValues('chat.relatedKbs').map((id) => kbList.find((kb) => kb._id === id));

    return (
      <>
        {kbs.map((item) =>
          item ? (
            <Card key={item._id} p={3} mt={3}>
              <Flex alignItems={'center'}>
                <Image
                  src={item.avatar}
                  fallbackSrc="/icon/logo.png"
                  w={'20px'}
                  h={'20px'}
                  alt=""
                ></Image>
                <Box ml={3} fontWeight={'bold'}>
                  {item.name}
                </Box>
              </Flex>
            </Card>
          ) : null
        )}
      </>
    );
  }, [getValues, kbList]);

  return (
    <>
      {/* basic info */}
      <Card p={4}>
        <Box fontWeight={'bold'}>基本信息</Box>
        <Flex alignItems={'center'} mt={4}>
          <Box flex={'0 0 80px'} w={0}>
            modelId:
          </Box>
          <Box>{getValues('_id')}</Box>
        </Flex>
        <Flex mt={4} alignItems={'center'}>
          <Box flex={'0 0 80px'} w={0}>
            头像:
          </Box>
          <Image
            src={getValues('avatar') || '/icon/logo.png'}
            alt={'avatar'}
            w={['28px', '36px']}
            h={['28px', '36px']}
            objectFit={'cover'}
            cursor={isOwner ? 'pointer' : 'default'}
            title={'点击切换头像'}
            onClick={() => isOwner && onOpenSelectFile()}
          />
        </Flex>
        <FormControl mt={4}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 80px'} w={0}>
              名称:
            </Box>
            <Input
              isDisabled={!isOwner}
              {...register('name', {
                required: '展示名称不能为空'
              })}
            ></Input>
          </Flex>
        </FormControl>

        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 80px'} w={0}>
            对话模型:
          </Box>
          <Select
            isDisabled={!isOwner}
            {...register('chat.chatModel', {
              onChange() {
                setRefresh((state) => !state);
              }
            })}
          >
            {chatModelList.map((item) => (
              <option key={item.chatModel} value={item.chatModel}>
                {item.name}
              </option>
            ))}
          </Select>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 80px'} w={0}>
            价格:
          </Box>
          <Box>
            {formatPrice(ChatModelMap[getValues('chat.chatModel')]?.price, 1000)}
            元/1K tokens(包括上下文和回答)
          </Box>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 80px'} w={0}>
            收藏人数:
          </Box>
          <Box>{getValues('share.collection')}人</Box>
        </Flex>
        {isOwner && (
          <Flex mt={5} alignItems={'center'}>
            <Box flex={'0 0 120px'}>删除AI和知识库</Box>
            <Button
              colorScheme={'gray'}
              variant={'outline'}
              size={'sm'}
              onClick={openConfirm(handleDelModel)}
            >
              删除AI助手
            </Button>
          </Flex>
        )}
      </Card>
      {/* model effect */}
      <Card p={4}>
        <Box fontWeight={'bold'}>模型效果</Box>
        <FormControl mt={4}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 80px'} w={0}>
              <Box as={'span'} mr={2}>
                温度
              </Box>
              <Tooltip label={'温度越高，模型的发散能力越强；温度越低，内容越严谨。'}>
                <QuestionOutlineIcon />
              </Tooltip>
            </Box>

            <Slider
              aria-label="slider-ex-1"
              min={0}
              max={10}
              step={1}
              value={getValues('chat.temperature')}
              isDisabled={!isOwner}
              onChange={(e) => {
                setValue('chat.temperature', e);
                setRefresh(!refresh);
              }}
            >
              <SliderMark
                value={getValues('chat.temperature')}
                textAlign="center"
                bg="myBlue.600"
                color="white"
                w={'18px'}
                h={'18px'}
                borderRadius={'100px'}
                fontSize={'xs'}
                transform={'translate(-50%, -200%)'}
              >
                {getValues('chat.temperature')}
              </SliderMark>
              <SliderTrack>
                <SliderFilledTrack bg={'myBlue.700'} />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          </Flex>
        </FormControl>
        {getValues('chat.relatedKbs').length > 0 && (
          <Flex mt={4} alignItems={'center'}>
            <Box mr={4} whiteSpace={'nowrap'}>
              搜索模式&emsp;
            </Box>
            <Select
              isDisabled={!isOwner}
              {...register('chat.searchMode', { required: '搜索模式不能为空' })}
            >
              {Object.entries(ModelVectorSearchModeMap).map(([key, { text }]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </Select>
          </Flex>
        )}

        <Box mt={4}>
          <Box mb={1}>系统提示词</Box>
          <Textarea
            rows={8}
            maxLength={-1}
            isDisabled={!isOwner}
            placeholder={'模型默认的 prompt 词，通过调整该内容，可以引导模型聊天方向。'}
            {...register('chat.systemPrompt')}
          />
        </Box>
      </Card>
      {isOwner && (
        <>
          {/* model share setting */}
          <Card p={4}>
            <Box fontWeight={'bold'}>分享设置</Box>
            <Box>
              <Flex mt={5} alignItems={'center'}>
                <Box mr={1} fontSize={['sm', 'md']}>
                  模型分享:
                </Box>
                <Tooltip label="开启模型分享后，你的模型将会出现在共享市场，可供 FastGpt 所有用户使用。用户使用时不会消耗你的 tokens，而是消耗使用者的 tokens。">
                  <QuestionOutlineIcon mr={3} />
                </Tooltip>
                <Switch
                  isChecked={getValues('share.isShare')}
                  onChange={() => {
                    setValue('share.isShare', !getValues('share.isShare'));
                    setRefresh(!refresh);
                  }}
                />

                <Box ml={12} mr={1} fontSize={['sm', 'md']}>
                  分享模型细节:
                </Box>
                <Tooltip label="开启分享详情后，其他用户可以查看该模型的特有数据：温度、提示词和数据集。">
                  <QuestionOutlineIcon mr={3} />
                </Tooltip>
                <Switch
                  isChecked={getValues('share.isShareDetail')}
                  onChange={() => {
                    setValue('share.isShareDetail', !getValues('share.isShareDetail'));
                    setRefresh(!refresh);
                  }}
                />
              </Flex>
              <Box mt={5}>
                <Box>模型介绍</Box>
                <Textarea
                  mt={1}
                  rows={6}
                  maxLength={150}
                  {...register('share.intro')}
                  placeholder={'介绍模型的功能、场景等，吸引更多人来使用！最多150字。'}
                />
              </Box>
            </Box>
          </Card>
          <Card p={4}>
            <Flex justifyContent={'space-between'}>
              <Box fontWeight={'bold'}>关联的知识库</Box>
              <Button
                size={'sm'}
                variant={'outline'}
                colorScheme={'myBlue'}
                onClick={onOpenKbSelect}
              >
                选择
              </Button>
            </Flex>
            <RenderSelectedKbList />
          </Card>
          {/* shareChat */}
          <Card p={4} gridColumnStart={1} gridColumnEnd={[2, 3]}>
            <Flex justifyContent={'space-between'}>
              <Box fontWeight={'bold'}>
                免登录聊天窗口
                <Tooltip label="可以直接分享该模型给其他用户去进行对话，对方无需登录即可直接进行对话。注意，这个功能会消耗你账号的tokens。请保管好链接和密码。">
                  <QuestionOutlineIcon ml={1} />
                </Tooltip>
                （Beta）
              </Box>
              <Button
                size={'sm'}
                variant={'outline'}
                colorScheme={'myBlue'}
                {...(shareChatList.length >= 10
                  ? {
                      isDisabled: true,
                      title: '最多创建10组'
                    }
                  : {})}
                onClick={onOpenCreateShareChat}
              >
                创建分享窗口
              </Button>
            </Flex>
            <TableContainer mt={1} minH={'100px'}>
              <Table variant={'simple'} w={'100%'}>
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
                              setLoading(true);
                              try {
                                await delShareChatById(item._id);
                                refetchShareChatList();
                              } catch (error) {
                                console.log(error);
                              }
                              setLoading(false);
                            }}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Card>
        </>
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
              <Box fontSize={'xs'} ml={'60px'}>
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
                  isDisabled={!isOwner}
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
            <Button variant={'outline'} mr={3} onClick={onCloseCreateShareChat}>
              取消
            </Button>
            <Button onClick={submitShareChat(onclickCreateShareChat)}>确认</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* select kb modal */}
      <Modal isOpen={isOpenKbSelect} onClose={onCloseKbSelect}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>选择关联的知识库</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {kbList.map((item) => (
              <Card key={item._id} p={3} mb={3}>
                <Checkbox
                  isChecked={getValues('chat.relatedKbs').includes(item._id)}
                  onChange={(e) => {
                    const ids = getValues('chat.relatedKbs');
                    // toggle to true
                    if (e.target.checked) {
                      setValue('chat.relatedKbs', ids.concat(item._id));
                    } else {
                      const i = ids.findIndex((id) => id === item._id);
                      ids.splice(i, 1);
                      setValue('chat.relatedKbs', ids);
                    }
                    setRefresh(!refresh);
                  }}
                >
                  <Flex alignItems={'center'}>
                    <Image
                      src={item.avatar}
                      fallbackSrc="/icon/logo.png"
                      w={'20px'}
                      h={'20px'}
                      alt=""
                    ></Image>
                    <Box ml={3} fontWeight={'bold'}>
                      {item.name}
                    </Box>
                  </Flex>
                </Checkbox>
              </Card>
            ))}
          </ModalBody>

          <ModalFooter>
            <Button onClick={onCloseKbSelect}>完成,记得点保存修改</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <File onSelect={onSelectFile} />
      <ConfirmChild />
    </>
  );
};

export default ModelEditForm;
