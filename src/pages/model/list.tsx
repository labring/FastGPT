import React, { useState, useCallback } from 'react';
import { Box, Button, Flex, Card } from '@chakra-ui/react';
import { getMyModels } from '@/api/model';
import { getChatSiteId } from '@/api/chat';
import { ModelType } from '@/types/model';
import { useRouter } from 'next/router';
import ModelTable from './components/ModelTable';
import ModelPhoneList from './components/ModelPhoneList';
import { useScreen } from '@/hooks/useScreen';
import { useQuery } from '@tanstack/react-query';
import { useLoading } from '@/hooks/useLoading';
import dynamic from 'next/dynamic';

const CreateModel = dynamic(() => import('./components/CreateModel'));

const ModelList = () => {
  const { isPc } = useScreen();
  const router = useRouter();
  const [models, setModels] = useState<ModelType[]>([]);
  const [openCreateModel, setOpenCreateModel] = useState(false);
  const { Loading, setIsLoading } = useLoading();

  /* 加载模型 */
  const { isLoading } = useQuery(['loadModels'], () => getMyModels(), {
    onSuccess(res) {
      if (!res) return;
      setModels(res);
    }
  });

  /* 创建成功回调 */
  const createModelSuccess = useCallback((data: ModelType) => {
    setModels((state) => [data, ...state]);
  }, []);

  /* 点前往聊天预览页 */
  const handlePreviewChat = useCallback(
    async (modelId: string) => {
      setIsLoading(true);
      try {
        const chatId = await getChatSiteId(modelId);

        router.push(`/chat?chatId=${chatId}`, undefined, {
          shallow: true
        });
      } catch (err) {
        console.log(err);
      }
      setIsLoading(false);
    },
    [router, setIsLoading]
  );

  return (
    <Box position={'relative'}>
      {/* 头部 */}
      <Card px={6} py={3}>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <Box fontWeight={'bold'} fontSize={'xl'}>
            模型列表
          </Box>

          <Button flex={'0 0 145px'} variant={'outline'} onClick={() => setOpenCreateModel(true)}>
            新建模型
          </Button>
        </Flex>
      </Card>
      {/* 表单 */}
      <Box mt={5} position={'relative'}>
        {isPc ? (
          <ModelTable models={models} handlePreviewChat={handlePreviewChat} />
        ) : (
          <ModelPhoneList models={models} handlePreviewChat={handlePreviewChat} />
        )}
      </Box>
      {/* 创建弹窗 */}
      {openCreateModel && (
        <CreateModel setCreateModelOpen={setOpenCreateModel} onSuccess={createModelSuccess} />
      )}

      <Loading loading={isLoading} />
    </Box>
  );
};

export default ModelList;
