import React, { useCallback, useEffect, useRef } from 'react';
import { Grid, Box, Card, Flex, Button, FormControl, Input, Textarea } from '@chakra-ui/react';
import type { ModelType } from '@/types/model';
import { useForm } from 'react-hook-form';
import { useToast } from '@/hooks/useToast';
import { putModelById } from '@/api/model';
import { useScreen } from '@/hooks/useScreen';
import { useGlobalStore } from '@/store/global';

const ModelEditForm = ({ model }: { model?: ModelType }) => {
  const isInit = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<ModelType>();
  const { setLoading } = useGlobalStore();
  const { toast } = useToast();
  const { media } = useScreen();

  const onclickSave = useCallback(
    async (data: ModelType) => {
      setLoading(true);
      try {
        await putModelById(data._id, {
          name: data.name,
          systemPrompt: data.systemPrompt,
          service: data.service,
          security: data.security
        });
        toast({
          title: '更新成功',
          status: 'success'
        });
      } catch (err) {
        console.log('error->', err);
        toast({
          title: err as string,
          status: 'success'
        });
      }
      setLoading(false);
    },
    [setLoading, toast]
  );
  const submitError = useCallback(() => {
    // deep search message
    const deepSearch = (obj: any): string => {
      if (!obj) return '提交表单错误';
      if (!!obj.message) {
        return obj.message;
      }
      return deepSearch(Object.values(obj)[0]);
    };
    toast({
      title: deepSearch(errors),
      status: 'error',
      duration: 4000,
      isClosable: true
    });
  }, [errors, toast]);

  /* model 只会改变一次 */
  useEffect(() => {
    if (model && !isInit.current) {
      reset(model);
      isInit.current = true;
    }
  }, [model, reset]);

  return (
    <Grid gridTemplateColumns={media('1fr 1fr', '1fr')} gridGap={5}>
      <Card p={4}>
        <Flex justifyContent={'space-between'} alignItems={'center'}>
          <Box fontWeight={'bold'} fontSize={'lg'}>
            修改模型信息
          </Box>
          <Button onClick={handleSubmit(onclickSave, submitError)}>保存</Button>
        </Flex>
        <FormControl mt={5}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 80px'}>展示名称:</Box>
            <Input
              {...register('name', {
                required: '展示名称不能为空'
              })}
            ></Input>
          </Flex>
        </FormControl>
        <FormControl mt={5}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 80px'}>对话模型:</Box>
            <Box>{model?.service.modelName}</Box>
          </Flex>
        </FormControl>
        <FormControl mt={5}>
          <Textarea
            rows={4}
            maxLength={500}
            {...register('systemPrompt')}
            placeholder={'系统的提示词，会在进入聊天时放置在第一句，用于限定模型的聊天范围'}
          />
        </FormControl>
      </Card>
      <Card p={4}>
        <Box fontWeight={'bold'} fontSize={'lg'}>
          安全策略
        </Box>
        <FormControl mt={2}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 120px'}>单句最大长度:</Box>
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
            <Box flex={'0 0 120px'}>上下文最大长度:</Box>
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
            <Box flex={'0 0 120px'}>聊天过期时间:</Box>
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
            <Box flex={'0 0 130px'}>聊天最大加载次数:</Box>
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
      </Card>
    </Grid>
  );
};

export default ModelEditForm;
