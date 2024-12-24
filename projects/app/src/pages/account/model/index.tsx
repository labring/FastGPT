import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import React from 'react';
import AccountContainer from '../components/AccountContainer';
import { Box } from '@chakra-ui/react';
import ModelTable from '@/components/core/ai/ModelTable';

const ModelProvider = () => {
  return (
    <AccountContainer>
      <Box h={'100%'} py={4} px={6}>
        <ModelTable />
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account']))
    }
  };
}

export default ModelProvider;
