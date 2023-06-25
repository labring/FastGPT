import React, { useCallback, useState, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  FormControl,
  Input,
  Textarea,
  Divider,
  Tooltip
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import { delModelById, putModelById } from '@/api/model';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { useConfirm } from '@/hooks/useConfirm';
import { ChatModelMap, getChatModelList } from '@/constants/model';
import { formatPrice } from '@/utils/user';

import type { ModelSchema } from '@/types/mongoSchema';

import Avatar from '@/components/Avatar';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';

const systemPromptTip =
  '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。';
const limitPromptTip =
  '限定模型对话范围，会被放置在本次提问前，拥有强引导和限定性。例如:\n1. 知识库是关于 Laf 的介绍，参考知识库回答问题，与 "Laf" 无关内容，直接回复: "我不知道"。\n2. 你仅回答关于 "xxx" 的问题，其他问题回复: "xxxx"';

const Settings = ({ modelId }: { modelId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { Loading, setIsLoading } = useLoading();
  const { userInfo, modelDetail, myModels, loadModelDetail, refreshModel, setLastModelId } =
    useUserStore();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该应用?'
  });

  const [btnLoading, setBtnLoading] = useState(false);
  const [refresh, setRefresh] = useState(false);

  const {
    register,
    setValue,
    getValues,
    formState: { errors },
    reset,
    handleSubmit
  } = useForm({
    defaultValues: modelDetail
  });

  const isOwner = useMemo(
    () => modelDetail.userId === userInfo?._id,
    [modelDetail.userId, userInfo?._id]
  );
  const tokenLimit = useMemo(() => {
    const max = ChatModelMap[getValues('chat.chatModel')]?.contextMaxToken || 4000;

    if (max < getValues('chat.maxToken')) {
      setValue('chat.maxToken', max);
    }

    return max;
  }, [getValues, setValue, refresh]);

  // 提交保存模型修改
  const saveSubmitSuccess = useCallback(
    async (data: ModelSchema) => {
      setBtnLoading(true);
      try {
        await putModelById(data._id, {
          name: data.name,
          avatar: data.avatar,
          intro: data.intro,
          chat: data.chat,
          share: data.share
        });

        refreshModel.updateModelDetail(data);
      } catch (err: any) {
        toast({
          title: err?.message || '更新失败',
          status: 'error'
        });
      }
      setBtnLoading(false);
    },
    [refreshModel, toast]
  );
  // 提交保存表单失败
  const saveSubmitError = useCallback(() => {
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

  const saveUpdateModel = useCallback(
    () => handleSubmit(saveSubmitSuccess, saveSubmitError)(),
    [handleSubmit, saveSubmitError, saveSubmitSuccess]
  );

  /* 点击删除 */
  const handleDelModel = useCallback(async () => {
    if (!modelDetail) return;
    setIsLoading(true);
    try {
      await delModelById(modelDetail._id);
      toast({
        title: '删除成功',
        status: 'success'
      });
      refreshModel.removeModelDetail(modelDetail._id);
      router.replace(`/model?modelId=${myModels[1]?._id}`);
    } catch (err: any) {
      toast({
        title: err?.message || '删除失败',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [modelDetail, setIsLoading, toast, refreshModel, router, myModels]);

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImg({
          file,
          maxW: 100,
          maxH: 100
        });
        setValue('avatar', src);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, '头像选择异常'),
          status: 'warning'
        });
      }
    },
    [setValue, toast]
  );

  // load model data
  const { isLoading } = useQuery([modelId], () => loadModelDetail(modelId, true), {
    onSuccess(res) {
      res && reset(res);
      modelId && setLastModelId(modelId);
      setRefresh(!refresh);
    },
    onError(err: any) {
      toast({
        title: err?.message || '获取应用异常',
        status: 'error'
      });
      setLastModelId('');
      refreshModel.freshMyModels();
      router.replace('/model');
    }
  });

  const { data: chatModelList = [] } = useQuery(['initChatModelList'], getChatModelList);

  return (
    <Box
      pb={3}
      px={[5, '25px', '50px']}
      fontSize={['sm', 'lg']}
      maxW={['auto', '800px']}
      position={'relative'}
    >
      <Flex alignItems={'center'}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          头像
        </Box>
        <Avatar
          src={getValues('avatar')}
          w={['32px', '40px']}
          h={['32px', '40px']}
          cursor={isOwner ? 'pointer' : 'default'}
          title={'点击切换头像'}
          onClick={() => isOwner && onOpenSelectFile()}
        />
      </Flex>
      <FormControl mt={5}>
        <Flex alignItems={'center'}>
          <Box w={['60px', '100px', '140px']} flexShrink={0}>
            名称
          </Box>
          <Input
            isDisabled={!isOwner}
            {...register('name', {
              required: '展示名称不能为空'
            })}
          ></Input>
        </Flex>
      </FormControl>
      <Flex mt={5} alignItems={'flex-start'}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          介绍
        </Box>
        <Textarea
          rows={4}
          maxLength={500}
          placeholder={'给你的 AI 应用一个介绍'}
          {...register('intro')}
        ></Textarea>
      </Flex>

      <Divider mt={5} />

      <Flex alignItems={'center'} mt={5}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          对话模型
        </Box>
        <MySelect
          width={['90%', '280px']}
          value={getValues('chat.chatModel')}
          list={chatModelList.map((item) => ({
            id: item.chatModel,
            label: `${item.name} (${formatPrice(
              ChatModelMap[item.chatModel]?.price,
              1000
            )} 元/1k tokens)`
          }))}
          onchange={(val: any) => {
            setValue('chat.chatModel', val);
            setRefresh(!refresh);
          }}
        />
      </Flex>
      <Flex alignItems={'center'} my={10}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          温度
        </Box>
        <Box flex={1} ml={'10px'}>
          <MySlider
            markList={[
              { label: '严谨', value: 0 },
              { label: '发散', value: 10 }
            ]}
            width={['90%', '260px']}
            min={0}
            max={10}
            activeVal={getValues('chat.temperature')}
            setVal={(val) => {
              setValue('chat.temperature', val);
              setRefresh(!refresh);
            }}
          />
        </Box>
      </Flex>
      <Flex alignItems={'center'} mt={12} mb={10}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          回复上限
        </Box>
        <Box flex={1} ml={'10px'}>
          <MySlider
            markList={[
              { label: '100', value: 100 },
              { label: `${tokenLimit}`, value: tokenLimit }
            ]}
            width={['90%', '260px']}
            min={100}
            max={tokenLimit}
            step={50}
            activeVal={getValues('chat.maxToken')}
            setVal={(val) => {
              setValue('chat.maxToken', val);
              setRefresh(!refresh);
            }}
          />
        </Box>
      </Flex>
      <Flex mt={10} alignItems={'flex-start'}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          提示词
          <Tooltip label={systemPromptTip}>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </Tooltip>
        </Box>
        <Textarea
          rows={8}
          placeholder={systemPromptTip}
          {...register('chat.systemPrompt')}
        ></Textarea>
      </Flex>
      <Flex mt={5} alignItems={'flex-start'}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}>
          限定词
          <Tooltip label={limitPromptTip}>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </Tooltip>
        </Box>
        <Textarea
          rows={5}
          placeholder={limitPromptTip}
          {...register('chat.limitPrompt')}
        ></Textarea>
      </Flex>

      <Flex mt={5} alignItems={'center'}>
        <Box w={['60px', '100px', '140px']} flexShrink={0}></Box>
        <Button
          mr={3}
          w={'120px'}
          size={['sm', 'md']}
          isLoading={btnLoading}
          isDisabled={!isOwner}
          onClick={async () => {
            try {
              await saveUpdateModel();
              toast({
                title: '更新成功',
                status: 'success'
              });
            } catch (error) {
              console.log(error);
              error;
            }
          }}
        >
          {isOwner ? '保存' : '仅读，无法修改'}
        </Button>
        <Button
          mr={3}
          w={'100px'}
          size={['sm', 'md']}
          variant={'base'}
          color={'myBlue.600'}
          borderColor={'myBlue.600'}
          isLoading={btnLoading}
          onClick={async () => {
            try {
              router.prefetch('/chat');
              await saveUpdateModel();
            } catch (error) {}
            router.push(`/chat?modelId=${modelId}`);
          }}
        >
          对话
        </Button>
        {isOwner && (
          <Button
            colorScheme={'gray'}
            variant={'base'}
            size={['sm', 'md']}
            isLoading={btnLoading}
            _hover={{ color: 'red.600' }}
            onClick={openConfirm(handleDelModel)}
          >
            删除
          </Button>
        )}
      </Flex>

      <File onSelect={onSelectFile} />
      <ConfirmChild />
      <Loading loading={isLoading} fixed={false} />
    </Box>
  );
};

export default Settings;
