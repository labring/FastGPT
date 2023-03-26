import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  getModelById,
  delModelById,
  postTrainModel,
  putModelTrainingStatus,
  putModelById
} from '@/api/model';
import { getChatSiteId } from '@/api/chat';
import type { ModelSchema } from '@/types/mongoSchema';
import { Card, Box, Flex, Button, Tag, Grid } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useForm } from 'react-hook-form';
import { formatModelStatus, ModelStatusEnum, modelList, defaultModel } from '@/constants/model';
import { useGlobalStore } from '@/store/global';
import { useScreen } from '@/hooks/useScreen';
import ModelEditForm from './components/ModelEditForm';
import Icon from '@/components/Iconfont';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

const Training = dynamic(() => import('./components/Training'));

const ModelDetail = ({ modelId }: { modelId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, media } = useScreen();
  const { setLoading } = useGlobalStore();
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该模型?'
  });
  const SelectFileDom = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<ModelSchema>(defaultModel);
  const formHooks = useForm<ModelSchema>({
    defaultValues: model
  });

  const canTrain = useMemo(() => {
    const openai = modelList.find((item) => item.model === model?.service.modelName);
    return openai && openai.trainName;
  }, [model]);

  /* 加载模型数据 */
  const loadModel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getModelById(modelId);
      console.log(res);
      res.security.expiredTime /= 60 * 60 * 1000;
      setModel(res);
      formHooks.reset(res);
    } catch (err) {
      console.log('error->', err);
    }
    setLoading(false);
    return null;
  }, [formHooks, modelId, setLoading]);

  useQuery([modelId], loadModel);

  /* 点击删除 */
  const handleDelModel = useCallback(async () => {
    if (!model) return;
    setLoading(true);
    try {
      await delModelById(model._id);
      toast({
        title: '删除成功',
        status: 'success'
      });
      router.replace('/model/list');
    } catch (err) {
      console.log('error->', err);
    }
    setLoading(false);
  }, [setLoading, model, router, toast]);

  /* 点前往聊天预览页 */
  const handlePreviewChat = useCallback(async () => {
    setLoading(true);
    try {
      const chatId = await getChatSiteId(model._id);

      router.push(`/chat?chatId=${chatId}`);
    } catch (err) {
      console.log('error->', err);
    }
    setLoading(false);
  }, [setLoading, model, router]);

  /* 上传数据集,触发微调 */
  const startTraining = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!modelId || !e.target.files || e.target.files?.length === 0) return;
      setLoading(true);
      try {
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);
        await postTrainModel(modelId, formData);

        toast({
          title: '开始训练，大约需要 30 分钟',
          status: 'success'
        });

        // 重新获取模型
        loadModel();
      } catch (err: any) {
        toast({
          title: err?.message || '上传文件失败',
          status: 'error'
        });
        console.log('error->', err);
      }
      setLoading(false);
    },
    [setLoading, loadModel, modelId, toast]
  );

  /* 点击更新模型状态 */
  const handleClickUpdateStatus = useCallback(async () => {
    if (!model || model.status !== ModelStatusEnum.training) return;
    setLoading(true);

    try {
      const res = await putModelTrainingStatus(model._id);
      typeof res === 'string' &&
        toast({
          title: res,
          status: 'info'
        });
      loadModel();
    } catch (error: any) {
      console.log('error->', error);
      toast({
        title: error.message || '更新失败',
        status: 'error'
      });
    }
    setLoading(false);
  }, [model, setLoading, loadModel, toast]);

  // 提交保存模型修改
  const saveSubmitSuccess = useCallback(
    async (data: ModelSchema) => {
      setLoading(true);
      try {
        await putModelById(data._id, {
          name: data.name,
          systemPrompt: data.systemPrompt,
          intro: data.intro,
          temperature: data.temperature,
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
      title: deepSearch(formHooks.formState.errors),
      status: 'error',
      duration: 4000,
      isClosable: true
    });
  }, [formHooks.formState.errors, toast]);

  useEffect(() => {
    router.prefetch('/chat');

    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = '内容已修改，确认离开页面吗？';
    };

    return () => {
      window.onbeforeunload = null;
    };
  }, [router]);

  return (
    <>
      {/* 头部 */}
      <Card px={6} py={3}>
        {isPc ? (
          <Flex alignItems={'center'}>
            <Box fontSize={'xl'} fontWeight={'bold'}>
              {model.name}
            </Box>
            <Tag
              ml={2}
              variant="solid"
              colorScheme={formatModelStatus[model.status].colorTheme}
              cursor={model.status === ModelStatusEnum.training ? 'pointer' : 'default'}
              onClick={handleClickUpdateStatus}
            >
              {formatModelStatus[model.status].text}
            </Tag>
            <Box flex={1} />
            <Button variant={'outline'} onClick={handlePreviewChat}>
              对话体验
            </Button>
            <Button ml={4} onClick={formHooks.handleSubmit(saveSubmitSuccess, saveSubmitError)}>
              保存修改
            </Button>
          </Flex>
        ) : (
          <>
            <Flex alignItems={'center'}>
              <Box as={'h3'} fontSize={'xl'} fontWeight={'bold'} flex={1}>
                {model?.name}
              </Box>
              <Tag ml={2} colorScheme={formatModelStatus[model.status].colorTheme}>
                {formatModelStatus[model.status].text}
              </Tag>
            </Flex>
            <Box mt={4} textAlign={'right'}>
              <Button variant={'outline'} onClick={handlePreviewChat}>
                对话体验
              </Button>
              <Button ml={4} onClick={formHooks.handleSubmit(saveSubmitSuccess, saveSubmitError)}>
                保存修改
              </Button>
            </Box>
          </>
        )}
      </Card>
      <Grid mt={5} gridTemplateColumns={media('1fr 1fr', '1fr')} gridGap={5}>
        <ModelEditForm formHooks={formHooks} />

        {canTrain && (
          <Card p={4}>
            <Training model={model} />
          </Card>
        )}

        <Card p={4}>
          <Box fontWeight={'bold'} fontSize={'lg'}>
            神奇操作
          </Box>
          <Flex mt={5} alignItems={'center'}>
            <Box flex={'0 0 80px'}>模型微调:</Box>
            <Button
              size={'sm'}
              onClick={() => {
                SelectFileDom.current?.click();
              }}
              title={!canTrain ? '模型不支持微调' : ''}
              isDisabled={!canTrain}
            >
              上传数据集
            </Button>
            <Flex
              as={'a'}
              href="/TrainingTemplate.jsonl"
              download
              ml={5}
              cursor={'pointer'}
              alignItems={'center'}
              color={'blue.500'}
            >
              <Icon name={'icon-yunxiazai'} color={'#3182ce'} />
              下载模板
            </Flex>
          </Flex>
          {/* 提示 */}
          <Box mt={3} py={3} color={'blackAlpha.600'}>
            <Box as={'li'} lineHeight={1.9}>
              暂时需要使用自己的openai key
            </Box>
            <Box as={'li'} lineHeight={1.9}>
              可以使用
              <Box
                as={'span'}
                fontWeight={'bold'}
                textDecoration={'underline'}
                color={'blackAlpha.800'}
                mx={2}
                cursor={'pointer'}
                onClick={() => router.push('/data/list')}
              >
                数据拆分
              </Box>
              功能，从任意文本中提取数据集。
            </Box>
            <Box as={'li'} lineHeight={1.9}>
              每行包括一个 prompt 和一个 completion
            </Box>
            <Box as={'li'} lineHeight={1.9}>
              prompt 必须以 {'</s>'} 结尾
            </Box>
            <Box as={'li'} lineHeight={1.9}>
              completion 开头必须有一个空格，必须以 {'</s>'} 结尾
            </Box>
          </Box>
          <Flex mt={5} alignItems={'center'}>
            <Box flex={'0 0 80px'}>删除模型:</Box>
            <Button colorScheme={'red'} size={'sm'} onClick={openConfirm(handleDelModel)}>
              删除模型
            </Button>
          </Flex>
        </Card>
      </Grid>

      {/* 文件选择 */}
      <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input ref={SelectFileDom} type="file" accept=".jsonl" onChange={startTraining} />
      </Box>
      <ConfirmChild />
    </>
  );
};

export default ModelDetail;

export async function getServerSideProps(context: any) {
  const modelId = context.query?.modelId || '';

  return {
    props: { modelId }
  };
}
