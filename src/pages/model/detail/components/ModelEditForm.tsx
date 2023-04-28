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
  Grid,
  Switch,
  Image
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { ModelSchema } from '@/types/mongoSchema';
import { UseFormReturn } from 'react-hook-form';
import { modelList, ModelVectorSearchModeMap } from '@/constants/model';
import { formatPrice } from '@/utils/user';
import { useConfirm } from '@/hooks/useConfirm';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useToast } from '@/hooks/useToast';
import { fileToBase64 } from '@/utils/file';

const ModelEditForm = ({
  formHooks,
  canTrain,
  isOwner,
  handleDelModel
}: {
  formHooks: UseFormReturn<ModelSchema>;
  canTrain: boolean;
  isOwner: boolean;
  handleDelModel: () => void;
}) => {
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该模型?'
  });
  const { register, setValue, getValues } = formHooks;
  const [refresh, setRefresh] = useState(false);
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });
  const { toast } = useToast();

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;

      if (file.size > 100 * 1024) {
        return toast({
          title: '头像需小于 100kb',
          status: 'warning'
        });
      }

      const base64 = (await fileToBase64(file)) as string;
      setValue('avatar', base64);
      setRefresh((state) => !state);
    },
    [setValue, toast]
  );

  return (
    <>
      <Card p={4}>
        <Box fontWeight={'bold'}>基本信息</Box>
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
            modelId:
          </Box>
          <Box>{getValues('_id')}</Box>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 80px'} w={0}>
            模型类型:
          </Box>
          <Box>{modelList.find((item) => item.model === getValues('service.modelName'))?.name}</Box>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 80px'} w={0}>
            价格:
          </Box>
          <Box>
            {formatPrice(
              modelList.find((item) => item.model === getValues('service.modelName'))?.price || 0,
              1000
            )}
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
            <Box flex={'0 0 150px'}>删除模型和知识库</Box>
            <Button
              colorScheme={'gray'}
              variant={'outline'}
              size={'sm'}
              onClick={openConfirm(handleDelModel)}
            >
              删除模型
            </Button>
          </Flex>
        )}
      </Card>
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
              value={getValues('temperature')}
              isDisabled={!isOwner}
              onChange={(e) => {
                setValue('temperature', e);
                setRefresh(!refresh);
              }}
            >
              <SliderMark
                value={getValues('temperature')}
                textAlign="center"
                bg="blue.500"
                color="white"
                w={'18px'}
                h={'18px'}
                borderRadius={'100px'}
                fontSize={'xs'}
                transform={'translate(-50%, -200%)'}
              >
                {getValues('temperature')}
              </SliderMark>
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          </Flex>
        </FormControl>
        {canTrain && (
          <FormControl mt={4}>
            <Flex alignItems={'center'}>
              <Box flex={'0 0 70px'}>搜索模式</Box>
              <Select
                isDisabled={!isOwner}
                {...register('search.mode', { required: '搜索模式不能为空' })}
              >
                {Object.entries(ModelVectorSearchModeMap).map(([key, { text }]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
              </Select>
            </Flex>
          </FormControl>
        )}
        <Box mt={4}>
          <Box mb={1}>系统提示词</Box>
          <Textarea
            rows={8}
            maxLength={-1}
            isDisabled={!isOwner}
            placeholder={
              canTrain
                ? '训练的模型会根据知识库内容，生成一部分系统提示词，因此在对话时需要消耗更多的 tokens。你可以增加提示词，让效果更符合预期。例如: \n1. 请根据知识库内容回答用户问题。\n2. 知识库是电影《铃芽之旅》的内容，根据知识库内容回答。无关问题，拒绝回复！'
                : '模型默认的 prompt 词，通过调整该内容，可以生成一个限定范围的模型。\n注意，改功能会影响对话的整体朝向！'
            }
            {...register('systemPrompt')}
          />
        </Box>
      </Card>
      {isOwner && (
        <Card p={4} gridColumnStart={[1, 1]} gridColumnEnd={[2, 3]}>
          <Box fontWeight={'bold'}>分享设置</Box>

          <Grid gridTemplateColumns={['1fr', '1fr 410px']} gridGap={5}>
            <Box>
              <Flex mt={5} alignItems={'center'}>
                <Box mr={3}>模型分享:</Box>
                <Switch
                  isChecked={getValues('share.isShare')}
                  onChange={() => {
                    setValue('share.isShare', !getValues('share.isShare'));
                    setRefresh(!refresh);
                  }}
                />
                <Box ml={12} mr={3}>
                  分享模型细节:
                </Box>
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
            <Box
              textAlign={'justify'}
              fontSize={'sm'}
              border={'1px solid #f4f4f4'}
              borderRadius={'sm'}
              p={3}
            >
              <Box fontWeight={'bold'}>Tips</Box>
              <Box mt={1} as={'ul'} pl={4}>
                <li>
                  开启模型分享后，你的模型将会出现在共享市场，可供 FastGpt
                  所有用户使用。用户使用时不会消耗你的 tokens，而是消耗使用者的 tokens。
                </li>
                <li>开启分享详情后，其他用户可以查看该模型的特有数据：温度、提示词和数据集。</li>
              </Box>
            </Box>
          </Grid>
        </Card>
      )}
      <File onSelect={onSelectFile} />

      {/* <Card p={4}>
        <Box fontWeight={'bold'}>安全策略</Box>
        <FormControl mt={2}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 120px'} w={0}>
              单句最大长度:
            </Box>
            <Input
              flex={1}
              type={'number'}
              {...register('security.contentMaxLen', {
                required: '单句长度不能为空',
                min: {
                  value: 0,
                  message: '单句长度最小为0'
                },
                max: {
                  value: 4000,
                  message: '单句长度最长为4000'
                },
                valueAsNumber: true
              })}
            ></Input>
          </Flex>
        </FormControl>
        <FormControl mt={5}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 120px'} w={0}>
              上下文最大长度:
            </Box>
            <Input
              flex={1}
              type={'number'}
              {...register('security.contextMaxLen', {
                required: '上下文长度不能为空',
                min: {
                  value: 1,
                  message: '上下文长度最小为5'
                },
                max: {
                  value: 400000,
                  message: '上下文长度最长为 400000'
                },
                valueAsNumber: true
              })}
            ></Input>
          </Flex>
        </FormControl>
        <FormControl mt={5}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 120px'} w={0}>
              聊天过期时间:
            </Box>
            <Input
              flex={1}
              type={'number'}
              {...register('security.expiredTime', {
                required: '聊天过期时间不能为空',
                min: {
                  value: 0.1,
                  message: '聊天过期时间最小为0.1小时'
                },
                max: {
                  value: 999999,
                  message: '聊天过期时间最长为 999999 小时'
                },
                valueAsNumber: true
              })}
            ></Input>
            <Box ml={3}>小时</Box>
          </Flex>
        </FormControl>
        <FormControl mt={5} pb={5}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 130px'} w={0}>
              聊天最大加载次数:
            </Box>
            <Box flex={1}>
              <Input
                type={'number'}
                {...register('security.maxLoadAmount', {
                  required: '聊天最大加载次数不能为空',
                  max: {
                    value: 999999,
                    message: '聊天最大加载次数最小为 999999 次'
                  },
                  valueAsNumber: true
                })}
              ></Input>
              <Box fontSize={'sm'} color={'blackAlpha.400'} position={'absolute'}>
                设置为-1代表不限制次数
              </Box>
            </Box>
            <Box ml={3}>次</Box>
          </Flex>
        </FormControl>
      </Card> */}
      <ConfirmChild />
    </>
  );
};

export default ModelEditForm;
