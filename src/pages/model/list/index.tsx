import React, { useCallback } from 'react';
import { Box, Button, Flex, Card } from '@chakra-ui/react';
import type { ModelSchema } from '@/types/mongoSchema';
import { useRouter } from 'next/router';
import ModelTable from './components/ModelTable';
import ModelPhoneList from './components/ModelPhoneList';
import { useScreen } from '@/hooks/useScreen';
import { useQuery } from '@tanstack/react-query';
import { useLoading } from '@/hooks/useLoading';
import { useToast } from '@/hooks/useToast';
import { useUserStore } from '@/store/user';
import { postCreateModel } from '@/api/model';

const modelList = () => {
  const { toast } = useToast();
  const { isPc } = useScreen();
  const router = useRouter();
  const { myModels, getMyModels } = useUserStore();
  const { Loading, setIsLoading } = useLoading();

  /* 加载模型 */
  const { isLoading } = useQuery(['loadModels'], getMyModels);

  const handleCreateModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const id = await postCreateModel({ name: `模型${myModels.length}` });
      toast({
        title: '创建成功',
        status: 'success'
      });
      router.push(`/model/detail?modelId=${id}`);
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err.message || '出现了意外',
        status: 'error'
      });
    }
    setIsLoading(false);
  }, [myModels.length, router, setIsLoading, toast]);

  /* 点前往聊天预览页 */
  const handlePreviewChat = useCallback(
    async (modelId: string) => {
      setIsLoading(true);
      try {
        router.push(`/chat?modelId=${modelId}`, undefined, {
          shallow: true
        });
      } catch (err: any) {
        console.log('error->', err);
        toast({
          title: err.message || '出现一些异常',
          status: 'error'
        });
      }
      setIsLoading(false);
    },
    [router, setIsLoading, toast]
  );

  return (
    <Box position={'relative'}>
      {/* 头部 */}
      <Card px={6} py={3}>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <Box fontWeight={'bold'} fontSize={'xl'}>
            模型列表
          </Box>

          <Button flex={'0 0 145px'} variant={'outline'} onClick={handleCreateModel}>
            新建模型
          </Button>
        </Flex>
      </Card>
      {/* 表单 */}
      <Box mt={5} position={'relative'}>
        {isPc ? (
          <ModelTable models={myModels} handlePreviewChat={handlePreviewChat} />
        ) : (
          <ModelPhoneList models={myModels} handlePreviewChat={handlePreviewChat} />
        )}
      </Box>

      <Loading loading={isLoading} />
    </Box>
  );
};

export default modelList;
