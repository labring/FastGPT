import React from 'react';
import { Box, Text, VStack, Flex } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

type IndicatorCardProps = {
  dataList: {
    name: string;
    value: string | number;
  }[];
};

const IndicatorCard: React.FC<IndicatorCardProps> = ({ dataList }) => {
  const { t } = useSafeTranslation();
  if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
    return <Box>No indicator data available</Box>;
  }

  return (
    <VStack align="stretch">
      {dataList.map((indicator, index) => (
        <Flex align="stretch" minW="250px" key={index} gap={1} mt={1}>
          <Flex w="5px" bg="blue.500"></Flex>
          <Flex
            flex="1"
            borderRadius="md"
            bg="gray.100"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            {/* indicator name */}
            <Box
              color="gray.800"
              fontSize="sm"
              fontWeight="normal"
              textAlign="right"
              flex="1"
              noOfLines={1}
              my={'4px'}
            >
              {indicator.name}
            </Box>

            {/* indicator value and unit */}
            <Box
              my={'4px'}
              color="blue.500"
              fontSize="lg"
              fontWeight="bold"
              textAlign="right"
              flex="1"
              noOfLines={1}
            >
              {indicator.value || t('common:core.chat.indicator.no_data')}
            </Box>
          </Flex>
        </Flex>
      ))}
    </VStack>
  );
};

export default IndicatorCard;
