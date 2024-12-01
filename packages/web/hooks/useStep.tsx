import {
  Box,
  Flex,
  IconButton,
  Step,
  StepDescription,
  StepIcon,
  StepIndicator,
  StepNumber,
  StepSeparator,
  StepStatus,
  StepTitle,
  Stepper,
  css,
  useSteps
} from '@chakra-ui/react';
import React, { useCallback, useState } from 'react';
export const useMyStep = ({
  defaultStep = 0,
  steps = [],
  adjustTraining = 'false'
}: {
  defaultStep?: number;
  steps: { title?: string; description?: string }[];
  adjustTraining?: string;
}) => {
  const effectiveStep = adjustTraining === 'true' ? 1 : defaultStep;

  const { activeStep, goToNext, goToPrevious } = useSteps({
    index: effectiveStep,
    count: steps.length
  });

  const MyStep = useCallback(
    () => (
      <Stepper
        size={['xs', 'sm']}
        index={activeStep}
        colorScheme="primary"
        gap={5}
        css={css({
          '.chakra-step__indicator': {
            borderWidth: '0 !important'
          }
        })}
      >
        {steps.map((step, index) => (
          <Step key={step.title}>
            <StepIndicator>
              <StepStatus
                complete={<StepIcon />}
                incomplete={
                  <Flex
                    bg={'myGray.250'}
                    color={'myGray.500'}
                    w={'100%'}
                    h={'100%'}
                    lineHeight={'100%'}
                    borderRadius={'50%'}
                    alignItems={'center'}
                    justifyContent={'center'}
                  >
                    {index + 1}
                  </Flex>
                }
                active={
                  <Flex
                    bg={'primary.500'}
                    color={'white'}
                    w={'100%'}
                    h={'100%'}
                    lineHeight={'100%'}
                    borderRadius={'50%'}
                    alignItems={'center'}
                    justifyContent={'center'}
                  >
                    {index + 1}
                  </Flex>
                }
              />
            </StepIndicator>

            <Box flexShrink="0">
              <StepTitle>{step.title}</StepTitle>
            </Box>

            <StepSeparator />
          </Step>
        ))}
      </Stepper>
    ),
    [steps, activeStep]
  );

  return {
    activeStep,
    goToNext,
    goToPrevious,
    MyStep
  };
};
