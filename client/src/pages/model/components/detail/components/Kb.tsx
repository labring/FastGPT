import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Card,
  Flex,
  Box,
  Button,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalHeader,
  ModalFooter,
  ModalCloseButton,
  Grid,
  useTheme,
  IconButton,
  Tooltip,
  Textarea
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useQuery } from '@tanstack/react-query';
import Avatar from '@/components/Avatar';
import { AddIcon, DeleteIcon, QuestionOutlineIcon } from '@chakra-ui/icons';
import { putModelById } from '@/api/model';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import { useForm } from 'react-hook-form';
import MyIcon from '@/components/Icon';
import MySlider from '@/components/Slider';

const Kb = ({ modelId }: { modelId: string }) => {
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { modelDetail, loadKbList, loadModelDetail } = useUserStore();
  const { Loading, setIsLoading } = useLoading();
  const [selectedIdList, setSelectedIdList] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(false);
  const { register, reset, getValues, setValue } = useForm({
    defaultValues: {
      searchSimilarity: modelDetail.chat.searchSimilarity,
      searchLimit: modelDetail.chat.searchLimit,
      searchEmptyText: modelDetail.chat.searchEmptyText
    }
  });

  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenEditParams,
    onOpen: onOpenEditParams,
    onClose: onCloseEditParams
  } = useDisclosure();

  const onchangeKb = useCallback(
    async (
      data: {
        relatedKbs?: string[];
        searchSimilarity?: number;
        searchLimit?: number;
        searchEmptyText?: string;
      } = {}
    ) => {
      setIsLoading(true);
      try {
        await putModelById(modelId, {
          chat: {
            ...modelDetail.chat,
            ...data
          }
        });
        loadModelDetail(modelId, true);
      } catch (err: any) {
        toast({
          title: err?.message || '更新失败',
          status: 'error'
        });
      }
      setIsLoading(false);
    },
    [setIsLoading, modelId, modelDetail.chat, loadModelDetail, toast]
  );

  // init kb select list
  const { isLoading, data: kbList = [] } = useQuery(['loadKbList'], () => loadKbList());

  return (
    <Box position={'relative'} px={5} minH={'50vh'}>
      <Box fontWeight={'bold'}>关联的知识库({modelDetail.chat?.relatedKbs.length})</Box>
      {(() => {
        const kbs =
          modelDetail.chat?.relatedKbs
            ?.map((id) => kbList.find((kb) => kb._id === id))
            .filter((item) => item) || [];
        return (
          <Grid
            mt={2}
            gridTemplateColumns={[
              'repeat(1,1fr)',
              'repeat(2,1fr)',
              'repeat(3,1fr)',
              'repeat(4,1fr)'
            ]}
            gridGap={[3, 4]}
          >
            <Card
              p={3}
              border={theme.borders.base}
              boxShadow={'sm'}
              cursor={'pointer'}
              bg={'myGray.100'}
              _hover={{
                bg: 'white',
                color: 'myBlue.800'
              }}
              onClick={() => {
                reset({
                  searchSimilarity: modelDetail.chat.searchSimilarity,
                  searchLimit: modelDetail.chat.searchLimit,
                  searchEmptyText: modelDetail.chat.searchEmptyText
                });
                onOpenEditParams();
              }}
            >
              <Flex alignItems={'center'} h={'38px'} fontWeight={'bold'}>
                <IconButton
                  mr={2}
                  size={'sm'}
                  borderRadius={'lg'}
                  icon={<MyIcon name={'edit'} w={'14px'} color={'myGray.600'} />}
                  aria-label={''}
                  variant={'base'}
                />
                调整搜索参数
              </Flex>
              <Flex mt={3} h={'30px'} color={'myGray.600'} fontSize={'sm'}>
                相似度: {modelDetail.chat.searchSimilarity}, 单次搜索数量:{' '}
                {modelDetail.chat.searchLimit}, 空搜索时拒绝回复:{' '}
                {modelDetail.chat.searchEmptyText !== '' ? 'true' : 'false'}
              </Flex>
            </Card>
            <Card
              p={3}
              border={theme.borders.base}
              boxShadow={'sm'}
              cursor={'pointer'}
              bg={'myGray.100'}
              _hover={{
                bg: 'white',
                color: 'myBlue.800'
              }}
              onClick={() => {
                setSelectedIdList(
                  modelDetail.chat?.relatedKbs ? [...modelDetail.chat?.relatedKbs] : []
                );
                onOpenKbSelect();
              }}
            >
              <Flex alignItems={'center'} h={'38px'} fontWeight={'bold'}>
                <IconButton
                  mr={2}
                  size={'sm'}
                  borderRadius={'lg'}
                  icon={<AddIcon />}
                  aria-label={''}
                  variant={'base'}
                />
                选择关联知识库
              </Flex>
              <Flex mt={3} h={'30px'} color={'myGray.600'} fontSize={'sm'}>
                关联知识库，让 AI 应用回答你的特有内容。
              </Flex>
            </Card>
            {kbs.map((item) =>
              item ? (
                <Card
                  key={item._id}
                  p={3}
                  border={theme.borders.base}
                  boxShadow={'sm'}
                  _hover={{
                    boxShadow: 'lg',
                    '& .detailBtn': {
                      display: 'block'
                    },
                    '& .delete': {
                      display: 'block'
                    }
                  }}
                >
                  <Flex alignItems={'center'} h={'38px'}>
                    <Avatar src={item.avatar} w={['26px', '32px', '38px']}></Avatar>
                    <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
                      {item.name}
                    </Box>
                  </Flex>
                  <Flex mt={3} alignItems={'flex-end'} justifyContent={'flex-end'} h={'30px'}>
                    <Button
                      mr={3}
                      className="detailBtn"
                      display={['flex', 'none']}
                      variant={'base'}
                      size={'sm'}
                      onClick={() => router.push(`/kb?kbId=${item._id}`)}
                    >
                      查看详情
                    </Button>
                    <IconButton
                      className="delete"
                      display={['flex', 'none']}
                      icon={<DeleteIcon />}
                      variant={'outline'}
                      aria-label={'delete'}
                      size={'sm'}
                      _hover={{ color: 'red.600' }}
                      onClick={() => {
                        const ids = modelDetail.chat?.relatedKbs
                          ? [...modelDetail.chat.relatedKbs]
                          : [];
                        const i = ids.findIndex((id) => id === item._id);
                        ids.splice(i, 1);
                        onchangeKb({ relatedKbs: ids });
                      }}
                    />
                  </Flex>
                </Card>
              ) : null
            )}
          </Grid>
        );
      })()}
      {/* select kb modal */}
      <Modal isOpen={isOpenKbSelect} onClose={onCloseKbSelect}>
        <ModalOverlay />
        <ModalContent
          display={'flex'}
          flexDirection={'column'}
          w={'800px'}
          maxW={'90vw'}
          h={['90vh', 'auto']}
        >
          <ModalHeader>关联的知识库({selectedIdList.length})</ModalHeader>
          <ModalCloseButton />
          <ModalBody
            flex={['1 0 0', '0 0 auto']}
            maxH={'80vh'}
            overflowY={'auto'}
            display={'grid'}
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
            gridGap={3}
          >
            {kbList.map((item) => (
              <Card
                key={item._id}
                p={3}
                border={theme.borders.base}
                boxShadow={'sm'}
                h={'80px'}
                cursor={'pointer'}
                order={modelDetail.chat?.relatedKbs?.includes(item._id) ? 0 : 1}
                _hover={{
                  boxShadow: 'md'
                }}
                {...(selectedIdList.includes(item._id)
                  ? {
                      bg: 'myBlue.300'
                    }
                  : {})}
                onClick={() => {
                  let ids = [...selectedIdList];
                  if (!selectedIdList.includes(item._id)) {
                    ids = ids.concat(item._id);
                  } else {
                    const i = ids.findIndex((id) => id === item._id);
                    ids.splice(i, 1);
                  }

                  ids = ids.filter((id) => kbList.find((item) => item._id === id));
                  setSelectedIdList(ids);
                }}
              >
                <Flex alignItems={'center'} h={'38px'}>
                  <Avatar src={item.avatar} w={['24px', '28px', '32px']}></Avatar>
                  <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
                    {item.name}
                  </Box>
                </Flex>
              </Card>
            ))}
          </ModalBody>

          <ModalFooter>
            <Button
              onClick={() => {
                onCloseKbSelect();
                onchangeKb({ relatedKbs: selectedIdList });
              }}
            >
              完成
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* edit mode */}
      <Modal isOpen={isOpenEditParams} onClose={onCloseEditParams}>
        <ModalOverlay />
        <ModalContent display={'flex'} flexDirection={'column'} w={'600px'} maxW={'90vw'}>
          <ModalHeader>搜索参数调整</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex pt={3} pb={5}>
              <Box flex={'0 0 100px'}>
                相似度
                <Tooltip label={'高相似度推荐0.8及以上。'}>
                  <QuestionOutlineIcon ml={1} />
                </Tooltip>
              </Box>
              <MySlider
                markList={[
                  { label: '0', value: 0 },
                  { label: '1', value: 1 }
                ]}
                min={0}
                max={1}
                step={0.01}
                activeVal={getValues('searchSimilarity')}
                setVal={(val) => {
                  setValue('searchSimilarity', val);
                  setRefresh(!refresh);
                }}
              />
            </Flex>
            <Flex py={8}>
              <Box flex={'0 0 100px'}>单次搜索数量</Box>
              <Box flex={1}>
                <MySlider
                  markList={[
                    { label: '1', value: 1 },
                    { label: '20', value: 20 }
                  ]}
                  min={1}
                  max={20}
                  activeVal={getValues('searchLimit')}
                  setVal={(val) => {
                    setValue('searchLimit', val);
                    setRefresh(!refresh);
                  }}
                />
              </Box>
            </Flex>
            <Flex pt={3}>
              <Box flex={'0 0 100px'}>空搜索回复</Box>
              <Box flex={1}>
                <Textarea
                  rows={5}
                  maxLength={500}
                  placeholder={
                    '若填写该内容，没有搜索到对应内容时，将直接回复填写的内容。\n为了连贯上下文，FastGpt 会取部分上一个聊天的搜索记录作为补充，因此在连续对话时，该功能可能会失效。'
                  }
                  {...register('searchEmptyText')}
                ></Textarea>
              </Box>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button variant={'base'} mr={3} onClick={onCloseEditParams}>
              取消
            </Button>
            <Button
              onClick={() => {
                onCloseEditParams();
                onchangeKb({
                  searchSimilarity: getValues('searchSimilarity'),
                  searchLimit: getValues('searchLimit'),
                  searchEmptyText: getValues('searchEmptyText')
                });
              }}
            >
              完成
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Loading loading={isLoading} fixed={false} />
    </Box>
  );
};

export default Kb;
