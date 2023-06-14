import React, { useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import ModelList from './components/ModelList';
import dynamic from 'next/dynamic';
import { useUserStore } from '@/store/user';
import { useGlobalStore } from '@/store/global';
import Loading from '@/components/Loading';
import SideBar from '@/components/SideBar';

const ModelDetail = dynamic(() => import('./components/detail/index'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

const Model = ({ modelId }: { modelId: string }) => {
  const router = useRouter();
  const { isPc } = useGlobalStore();
  const { lastModelId } = useUserStore();

  // redirect modelId
  useEffect(() => {
    if (isPc && !modelId && lastModelId) {
      router.replace(`/model?modelId=${lastModelId}`);
    }
  }, [isPc, lastModelId, modelId, router]);

  return (
    <Flex h={'100%'} position={'relative'} overflow={'hidden'}>
      {/* 模型列表 */}
      {(isPc || !modelId) && (
        <SideBar w={['100%', '0 0 250px', '0 0 270px', '0 0 290px']}>
          <ModelList modelId={modelId} />
        </SideBar>
      )}
      <Box flex={1} h={'100%'} position={'relative'}>
        {modelId && <ModelDetail modelId={modelId} isPc={isPc} />}
      </Box>
    </Flex>
  );
};

export default Model;

Model.getInitialProps = ({ query, req }: any) => {
  return {
    modelId: query?.modelId || ''
  };
};
