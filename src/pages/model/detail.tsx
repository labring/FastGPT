import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getModelById, delModelById, postTrainModel, putModelTrainingStatus } from '@/api/model';
import { getChatSiteId } from '@/api/chat';
import type { ModelType } from '@/types/model';
import { Card, Box, Flex, Button, Tag, Grid } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { formatModelStatus, ModelStatusEnum, OpenAiList } from '@/constants/model';
import { useGlobalStore } from '@/store/global';
import { useScreen } from '@/hooks/useScreen';
import ModelEditForm from './components/ModelEditForm';
import Icon from '@/components/Icon';
import dynamic from 'next/dynamic';

const Training = dynamic(() => import('./components/Training'));

const ModelDetail = () => {
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, media } = useScreen();
  const { setLoading } = useGlobalStore();
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认删除该模型?'
  });
  const SelectFileDom = useRef<HTMLInputElement>(null);

  const { modelId } = router.query as { modelId: string };
  const [model, setModel] = useState<ModelType>();

  const canTrain = useMemo(() => {
    const openai = OpenAiList.find((item) => item.model === model?.service.modelName);
    return openai && openai.canTraining === true;
  }, [model]);

  /* 加载模型数据 */
  const loadModel = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    try {
      const res = await getModelById(modelId as string);
      res.security.expiredTime /= 60 * 60 * 1000;
      setModel(res);
    } catch (err) {
      console.log('error->', err);
    }
    setLoading(false);
  }, [modelId, setLoading]);

  useEffect(() => {
    loadModel();
    router.prefetch('/chat');
  }, [loadModel, modelId, router]);

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
    if (!model) return;
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
      } catch (err) {
        toast({
          title: typeof err === 'string' ? err : '文件格式错误',
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
      await putModelTrainingStatus(model._id);
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

  return (
    <>
      {/* 头部 */}
      <Card px={6} py={3}>
        {isPc ? (
          <Flex alignItems={'center'}>
            <Box fontSize={'xl'} fontWeight={'bold'}>
              {model?.name || '模型'} 配置
            </Box>
            {!!model && (
              <Tag
                ml={2}
                variant="solid"
                colorScheme={formatModelStatus[model.status].colorTheme}
                cursor={model.status === ModelStatusEnum.training ? 'pointer' : 'default'}
                onClick={handleClickUpdateStatus}
              >
                {formatModelStatus[model.status].text}
              </Tag>
            )}
            <Box flex={1} />
            <Button variant={'outline'} onClick={handlePreviewChat}>
              对话体验
            </Button>
          </Flex>
        ) : (
          <>
            <Flex alignItems={'center'}>
              <Box as={'h3'} fontSize={'xl'} fontWeight={'bold'} flex={1}>
                {model?.name || '模型'} 配置
              </Box>
              {!!model && (
                <Tag ml={2} colorScheme={formatModelStatus[model.status].colorTheme}>
                  {formatModelStatus[model.status].text}
                </Tag>
              )}
            </Flex>
            <Box mt={4} textAlign={'right'}>
              <Button variant={'outline'} onClick={handlePreviewChat}>
                对话体验
              </Button>
            </Box>
          </>
        )}
      </Card>
      {/* 基本信息编辑 */}
      <Box mt={5}>
        <ModelEditForm model={model} />
      </Box>
      {/* 其他配置 */}
      <Grid mt={5} gridTemplateColumns={media('1fr 1fr', '1fr')} gridGap={5}>
        <Card p={4}>{!!model && <Training model={model} />}</Card>
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
              title={!canTrain ? '' : '模型不支持微调'}
              isDisabled={!canTrain}
            >
              上传微调数据集
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
          <Box mt={3} py={3} color={'blackAlpha.500'}>
            <Box as={'li'} lineHeight={1.9}>
              每行包括一个 prompt 和一个 completion
            </Box>
            <Box as={'li'} lineHeight={1.9}>
              prompt 必须以 \n\n###\n\n 结尾，且尽量保障每个 prompt
              内容不都是同一个标点结尾，可以加一个空格打断相同性，
            </Box>
            <Box as={'li'} lineHeight={1.9}>
              completion 开头必须有一个空格，末尾必须以 ### 结尾，同样的不要都是同一个标点结尾。
            </Box>
          </Box>
          <Flex mt={5} alignItems={'center'}>
            <Box flex={'0 0 80px'}>删除模型:</Box>
            <Button
              colorScheme={'red'}
              size={'sm'}
              onClick={() => {
                openConfirm(() => {
                  handleDelModel();
                });
              }}
            >
              删除模型
            </Button>
          </Flex>
        </Card>
      </Grid>
      <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
        <input ref={SelectFileDom} type="file" accept=".jsonl" onChange={startTraining} />
      </Box>
      <ConfirmChild />
    </>
  );
};

export default ModelDetail;
