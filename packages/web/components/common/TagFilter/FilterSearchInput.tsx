import React from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props = {
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
};

/** TagFilter 下拉里 32px 搜索框，有内容时显示清空。 */
const FilterSearchInput = ({ value, placeholder, onChange }: Props) => (
  <Box position={'relative'}>
    <Input
      h={'32px'}
      px={1}
      pr={value ? 7 : 1}
      borderRadius={'sm'}
      fontSize={'xs'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
    {!!value && (
      <Flex
        position={'absolute'}
        right={1}
        top={0}
        h={'32px'}
        alignItems={'center'}
        cursor={'pointer'}
        onClick={() => onChange('')}
      >
        <MyIcon name={'common/closeLight'} w={'14px'} h={'14px'} color={'myGray.500'} />
      </Flex>
    )}
  </Box>
);

export default FilterSearchInput;
