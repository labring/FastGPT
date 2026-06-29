import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

type PricePlanTabItem<T extends string> = {
  label: string;
  value: T;
};

/** 购买套餐页 Tab，选中项为圆角 pill 白底样式 */
const PricePlanTabs = <T extends string>({
  list,
  value,
  onChange
}: {
  list: PricePlanTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) => {
  return (
    <Flex
      display={'inline-flex'}
      p={'4px'}
      alignItems={'flex-start'}
      gap={'8px'}
      borderRadius={'full'}
      bg={'#F5F6F8'}
    >
      {list.map((item) => {
        const isActive = value === item.value;

        return (
          <Flex
            key={item.value}
            h={'36px'}
            px={'14px'}
            flexDirection={'column'}
            justifyContent={'center'}
            alignItems={'center'}
            borderRadius={'full'}
            borderWidth={isActive ? '1px' : '0'}
            borderColor={isActive ? '#D4D4D4' : 'transparent'}
            bg={isActive ? '#FFF' : 'transparent'}
            cursor={'pointer'}
            userSelect={'none'}
            whiteSpace={'nowrap'}
            onClick={() => {
              if (!isActive) {
                onChange(item.value);
              }
            }}
          >
            <Box
              color={'#475569'}
              textAlign={'center'}
              fontFamily={'Inter, sans-serif'}
              fontSize={'14px'}
              fontStyle={'normal'}
              fontWeight={500}
              lineHeight={'21px'}
            >
              {item.label}
            </Box>
          </Flex>
        );
      })}
    </Flex>
  );
};

export default PricePlanTabs;
