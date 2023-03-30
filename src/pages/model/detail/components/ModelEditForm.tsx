import React, { useState } from 'react';
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
  Button
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { ModelSchema } from '@/types/mongoSchema';
import { UseFormReturn } from 'react-hook-form';
import { modelList } from '@/constants/model';
import { formatPrice } from '@/utils/user';
import { useConfirm } from '@/hooks/useConfirm';

const ModelEditForm = ({
  formHooks,
  canTrain,
  handleDelModel
}: {
  formHooks: UseFormReturn<ModelSchema>;
  canTrain: boolean;
  handleDelModel: () => void;
}) => {
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该模型?'
  });
  const { register, setValue, getValues } = formHooks;
  const [refresh, setRefresh] = useState(false);

  return (
    <>
      <Card p={4}>
        <Flex justifyContent={'space-between'} alignItems={'center'}>
          <Box fontWeight={'bold'}>基本信息</Box>
        </Flex>
        <FormControl mt={4}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 80px'} w={0}>
              名称:
            </Box>
            <Input
              {...register('name', {
                required: '展示名称不能为空'
              })}
            ></Input>
          </Flex>
        </FormControl>
        <Flex alignItems={'center'} mt={4}>
          <Box flex={'0 0 80px'} w={0}>
            底层模型:
          </Box>
          <Box>{getValues('service.modelName')}</Box>
        </Flex>
        <Flex alignItems={'center'} mt={4}>
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
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 80px'}>删除:</Box>
          <Button
            colorScheme={'gray'}
            variant={'outline'}
            size={'sm'}
            onClick={openConfirm(handleDelModel)}
          >
            删除模型
          </Button>
        </Flex>
        {/* <FormControl mt={4}>
          <Box mb={1}>介绍:</Box>
          <Textarea
            rows={5}
            maxLength={500}
            {...register('intro')}
            placeholder={'模型的介绍，仅做展示，不影响模型的效果'}
          />
        </FormControl> */}
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
              min={1}
              max={10}
              step={1}
              value={getValues('temperature')}
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
        <Box mt={4}>
          {canTrain ? (
            <Box fontWeight={'bold'}>
              训练的模型会自动根据知识库内容回答，无法设置系统prompt。注意：
              使用该模型，在对话时需要消耗等多的 tokens
            </Box>
          ) : (
            <>
              <Box mb={1}>系统提示词</Box>
              <Textarea
                rows={6}
                maxLength={-1}
                {...register('systemPrompt')}
                placeholder={
                  '模型默认的 prompt 词，通过调整该内容，可以生成一个限定范围的模型。\n\n注意，改功能会影响对话的整体朝向！'
                }
              />
            </>
          )}
        </Box>
      </Card>
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
