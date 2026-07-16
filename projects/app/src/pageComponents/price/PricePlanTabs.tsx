import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

type PricePlanTabItem<T extends string> = {
  label: string;
  value: T;
};

/** 购买套餐页 Tab，按设计稿使用灰底容器和选中白底 pill 样式 */
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
      bg={'myGray.150'}
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
              color={isActive ? 'myGray.900' : '#475569'}
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
