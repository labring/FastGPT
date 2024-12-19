import { Flex } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props = {
  list: { label: string; value: string; icon?: string }[];
  value: string;
  onChange: (value: string) => void;
};

const SegmentedControl = ({ list, value, onChange }: Props) => {
  return (
    <Flex
      bg={'myGray.50'}
      borderRadius={'sm'}
      p={'3px'}
      gap={1}
      border={'1px solid'}
      borderColor={'myGray.200'}
      display={'inline-flex'}
    >
      {list.map((item, i) => (
        <Flex
          key={item.value}
          flex={i === list.length - 1 ? 1 : undefined}
          bg={value === item.value ? 'white' : 'transparent'}
          color={value === item.value ? 'primary.700' : 'myGray.500'}
          boxShadow={
            value === item.value
              ? '0px 1px 2px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.15)'
              : 'none'
          }
          borderRadius={'4px'}
          transition={'all 0.2s'}
          fontSize={'mini'}
          textAlign={'center'}
          px={2}
          py={'3px'}
          alignItems={'center'}
          cursor={'pointer'}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <MyIcon name={item.icon as any} w={4} mr={1.5} />}
          {item.label}
        </Flex>
      ))}
    </Flex>
  );
};

export default SegmentedControl;
