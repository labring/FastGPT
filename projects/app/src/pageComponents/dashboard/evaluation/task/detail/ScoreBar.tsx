import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

interface ScoreBarProps {
  dimensionName: string;
  threshold: number;
  actualScore: number;
  maxScore?: number;
}

const ScoreBar: React.FC<ScoreBarProps> = ({
  dimensionName,
  threshold,
  actualScore,
  maxScore = 100
}) => {
  // Check if actual score meets threshold
  const isAboveThreshold = actualScore >= threshold;

  // Set color based on threshold
  const scoreColor = isAboveThreshold ? 'blue.600' : 'yellow.400';

  return (
    <Flex
      alignItems={'center'}
      py={'4px'}
      px={'8px'}
      bg={'white'}
      borderRadius={'md'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      mb={2}
      gap={4}
    >
      {/* Dimension name */}
      <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'} minW={'80px'}>
        {dimensionName}
      </Box>

      {/* Score bar */}
      <Box position={'relative'} flex={1} h={'2px'} bg={'myGray.200'}>
        {/* Threshold line */}
        <Box
          position={'absolute'}
          left={`${Math.min((threshold / maxScore) * 100, 100)}%`}
          top={'50%'}
          w={'2px'}
          h={'6px'}
          bg={'myGray.200'}
          transform={'translate(-50%, -50%)'}
        />

        {/* Actual score line */}
        <Box
          position={'absolute'}
          left={`${Math.min((actualScore / maxScore) * 100, 100)}%`}
          top={'50%'}
          w={'2px'}
          h={'6px'}
          bg={scoreColor}
          transform={'translate(-50%, -50%)'}
        />
      </Box>

      {/* Score number */}
      <Box
        fontSize={'14px'}
        fontWeight={'600'}
        color={scoreColor}
        minW={'30px'}
        textAlign={'right'}
      >
        {actualScore}
      </Box>
    </Flex>
  );
};

export default ScoreBar;
