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
        <Flex align="stretch" w="250px" key={index} gap={1} mt={1}>
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
            <Flex w="full">
              <Text
                color="gray.800"
                fontSize="sm"
                fontWeight="normal"
                textAlign="right"
                flex="1"
                noOfLines={1}
              >
                {indicator.name}
              </Text>
            </Flex>

            {/* indicator value and unit */}
            <Flex w="full">
              <Text
                color="blue.500"
                fontSize="lg"
                fontWeight="bold"
                textAlign="right"
                flex="1"
                noOfLines={1}
              >
                {indicator.value || t('common:core.chat.indicator.no_data')}
              </Text>
            </Flex>
          </Flex>
        </Flex>
      ))}
    </VStack>
  );
};

export default IndicatorCard;
