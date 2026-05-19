import { Box, Flex, SkeletonText } from '@chakra-ui/react';
import type { AgentPlanStatusType } from '@fastgpt/global/core/ai/agent/type';
import { useTranslation } from 'next-i18next';
import React from 'react';

const RenderPlanStatus = React.memo(function RenderPlanStatus({
  planStatus
}: {
  planStatus: AgentPlanStatusType;
}) {
  const { t } = useTranslation();
  const title =
    planStatus.status === 'updating'
      ? t('chat:agent_plan_updating')
      : t('chat:agent_plan_generating');

  return (
    <Box border={'base'} bg={'white'} overflow={'hidden'} borderRadius={'md'} w={'full'}>
      <Flex alignItems={'center'} px={4} py={3} bg={'myGray.50'} borderBottom={'base'}>
        <Box fontWeight={'bold'} fontSize={'sm'} color={'myGray.700'}>
          {title}
        </Box>
      </Flex>
      <Box px={4} py={4}>
        <Flex direction="column" gap={4}>
          {[0, 1, 2].map((item) => (
            <Flex key={item} gap={3}>
              <Flex direction="column" alignItems="center">
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor="myGray.200"
                  bg="white"
                  mt={1.5}
                />
                {item < 2 && <Box w="1.5px" h="34px" bg="myGray.200" mt={1} />}
              </Flex>
              <Box flex={1} minW={0}>
                <SkeletonText noOfLines={2} spacing={2} skeletonHeight="10px" />
              </Box>
            </Flex>
          ))}
        </Flex>
      </Box>
    </Box>
  );
});

export default RenderPlanStatus;
