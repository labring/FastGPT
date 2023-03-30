import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getModelById, delModelById, putModelTrainingStatus, putModelById } from '@/api/model';
import { getChatSiteId } from '@/api/chat';
import type { ModelSchema } from '@/types/mongoSchema';
import { Card, Box, Flex, Button, Tag, Grid } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { formatModelStatus, ModelStatusEnum, modelList, defaultModel } from '@/constants/model';
import { useGlobalStore } from '@/store/global';
import { useScreen } from '@/hooks/useScreen';
import ModelEditForm from './components/ModelEditForm';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

const ModelDataCard = dynamic(() => import('./components/ModelDataCard'));

const ModelDetail = ({ modelId }: { modelId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, media } = useScreen();
  const { setLoading } = useGlobalStore();

  // const SelectFileDom = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<ModelSchema>(defaultModel);
  const formHooks = useForm<ModelSchema>({
    defaultValues: model
  });

  const canTrain = useMemo(() => {
    const openai = modelList.find((item) => item.model === model?.service.modelName);
    return !!(openai && openai.trainName);
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
  // const startTraining = useCallback(
  //   async (e: React.ChangeEvent<HTMLInputElement>) => {
  //     if (!modelId || !e.target.files || e.target.files?.length === 0) return;
  //     setLoading(true);
  //     try {
  //       const file = e.target.files[0];
  //       const formData = new FormData();
  //       formData.append('file', file);
  //       await postTrainModel(modelId, formData);

  //       toast({
  //         title: '开始训练...',
  //         status: 'success'
  //       });

  //       // 重新获取模型
  //       loadModel();
  //     } catch (err: any) {
  //       toast({
  //         title: err?.message || '上传文件失败',
  //         status: 'error'
  //       });
  //       console.log('error->', err);
  //     }
  //     setLoading(false);
  //   },
  //   [setLoading, loadModel, modelId, toast]
  // );

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
        <ModelEditForm formHooks={formHooks} handleDelModel={handleDelModel} canTrain={canTrain} />

        {/* {canTrain && (
          <Card p={4}>
            <Training model={model} />
          </Card>
        )} */}
        {canTrain && model._id && (
          <Card
            p={4}
            {...media(
              {
                gridColumnStart: 1,
                gridColumnEnd: 3
              },
              {}
            )}
          >
            <ModelDataCard model={model} />
          </Card>
        )}
      </Grid>

      {/* 文件选择 */}
      {/* <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input ref={SelectFileDom} type="file" accept=".jsonl" onChange={startTraining} />
      </Box> */}
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
