import React from 'react';
import { Box, Flex, SimpleGrid } from '@chakra-ui/react';

/** 将服务地址、凭据和探测状态组合为响应式布局。 */
const ConnectivityTestGroup = ({
  address,
  credential,
  button,
  result
}: {
  address: React.ReactNode;
  credential: React.ReactNode;
  button: React.ReactNode;
  result: React.ReactNode;
}) => (
  <Box w={'full'} mb={4}>
    <SimpleGrid columns={[1, 2]} spacing={5} alignItems={'start'}>
      {address}
      {credential}
    </SimpleGrid>
    <Flex justifyContent={'flex-end'} alignItems={'center'} flexWrap={'wrap'} gap={3}>
      {result}
      {button}
    </Flex>
  </Box>
);

export default ConnectivityTestGroup;
