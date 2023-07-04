import React, { useCallback, useState, useMemo } from 'react';
import { Box, Flex, Button, FormControl, Input, Textarea, Divider } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import { delModelById, putAppById } from '@/api/app';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { useConfirm } from '@/hooks/useConfirm';

import type { AppSchema } from '@/types/mongoSchema';

import Avatar from '@/components/Avatar';

const Settings = ({ modelId }: { modelId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { Loading, setIsLoading } = useLoading();
  const { userInfo, appDetail, myApps, loadAppDetail, refreshModel, setLastModelId } =
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
    defaultValues: appDetail
  });

  const isOwner = useMemo(
    () => appDetail.userId === userInfo?._id,
    [appDetail.userId, userInfo?._id]
  );

  // 提交保存模型修改
  const saveSubmitSuccess = useCallback(
    async (data: AppSchema) => {
      setBtnLoading(true);
      try {
        await putAppById(data._id, {
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
    if (!appDetail) return;
    setIsLoading(true);
    try {
      await delModelById(appDetail._id);
      toast({
        title: '删除成功',
        status: 'success'
      });
      refreshModel.removeModelDetail(appDetail._id);
      router.replace(`/model?modelId=${myApps[1]?._id}`);
    } catch (err: any) {
      toast({
        title: err?.message || '删除失败',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [appDetail, setIsLoading, toast, refreshModel, router, myApps]);

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
  const { isLoading } = useQuery([modelId], () => loadAppDetail(modelId, true), {
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

  return (
    <Box
      pt={[0, 5]}
      pb={3}
      px={[5, '25px', '50px']}
      fontSize={['sm', 'lg']}
      position={'relative'}
      maxW={['auto', '800px']}
    >
      <Box fontSize={['md', 'xl']}>基本信息</Box>
      <Flex mt={5} alignItems={'center'}>
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
