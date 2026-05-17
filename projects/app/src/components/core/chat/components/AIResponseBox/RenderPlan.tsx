import { Box, Flex } from '@chakra-ui/react';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import { planStepPulseAfterStyle, planStepPulseSx, planStepStatusStyle } from './constants';

const RenderPlan = React.memo(function RenderPlan({ plan }: { plan: AgentPlanType }) {
  return (
    <Box border={'base'} bg={'white'} overflow={'hidden'} borderRadius={'md'} w={'full'}>
      <Flex alignItems={'center'} px={4} py={3} bg={'myGray.50'} borderBottom={'base'}>
        <MyIcon name={'common/list'} w={'1rem'} mr={2} color={'myGray.600'} />
        <Box fontWeight={'bold'} fontSize={'sm'} flex={1}>
          {plan.task || '-'}
        </Box>
      </Flex>
      <Box px={4} py={4}>
        <Flex direction="column" gap={0}>
          {plan.steps.map((step, index) => {
            const style = planStepStatusStyle[step.status];

            return (
              <Flex key={step.id} gap={3}>
                <Flex direction="column" alignItems="center">
                  <Box
                    w="10px"
                    h="10px"
                    borderRadius="full"
                    border="2px solid"
                    borderColor={style.dot}
                    bg={style.dot}
                    flexShrink={0}
                    mt={1.5}
                    position="relative"
                    _after={step.status === 'in_progress' ? planStepPulseAfterStyle : undefined}
                    sx={step.status === 'in_progress' ? planStepPulseSx : undefined}
                  />
                  {index < plan.steps.length - 1 && (
                    <Box
                      w="1.5px"
                      h="100%"
                      bg={style.line ?? 'myGray.250'}
                      mb={-1}
                      flexGrow={1}
                      minH="28px"
                    />
                  )}
                </Flex>

                <Box flex={1} pb={index < plan.steps.length - 1 ? 4 : 0} minW={0}>
                  <Box fontSize="sm" fontWeight="medium" color="myGray.900">
                    {step.title}
                  </Box>
                  {step.description && (
                    <Box fontSize="xs" mt={1} color="myGray.500">
                      {step.description}
                    </Box>
                  )}
                </Box>
              </Flex>
            );
          })}
        </Flex>
      </Box>
    </Box>
  );
});

export default RenderPlan;
