import React, { useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useScreen } from '@/hooks/useScreen';
import { useRouter } from 'next/router';
import ModelList from './components/ModelList';
import dynamic from 'next/dynamic';
import { useUserStore } from '@/store/user';
import Loading from '@/components/Loading';

const ModelDetail = dynamic(() => import('./components/detail/index'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

const Model = ({ modelId, isPcDevice }: { modelId: string; isPcDevice: boolean }) => {
  const router = useRouter();
  const { isPc } = useScreen({
    defaultIsPc: isPcDevice
  });
  const { lastModelId } = useUserStore();

  // redirect modelId
  useEffect(() => {
    if (isPc && !modelId && lastModelId) {
      router.replace(`/model?modelId=${lastModelId}`);
    }
  }, [isPc, lastModelId, modelId, router]);

  return (
    <Flex h={'100%'} position={'relative'}>
      {/* 模型列表 */}
      {(isPc || !modelId) && (
        <Box w={['100%', '250px']}>
          <ModelList modelId={modelId} />
        </Box>
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
    modelId: query?.modelId || '',
    isPcDevice: !/Mobile/.test(req ? req.headers['user-agent'] : navigator.userAgent)
  };
};
