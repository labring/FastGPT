import {
  Box,
  Flex,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useDisclosure
} from '@chakra-ui/react';
import Tag from '@fastgpt/web/components/common/Tag';
import React from 'react';

type Props = {
  max: number;
  names?: string[];
};

function GroupTags({ max, names }: Props) {
  const length = names?.length || 0;
  const { isOpen, onToggle, onClose } = useDisclosure();

  return (
    <Flex flexWrap="wrap" rowGap={2}>
      {names?.slice(0, max).map((name, index) => (
        <Tag key={index} colorSchema={'gray'} ml={2}>
          {name.length > 10 ? name.slice(0, 10) + '...' : name}
        </Tag>
      ))}

      <Popover
        isOpen={isOpen}
        trigger={'hover'}
        onOpen={onToggle}
        onClose={onClose}
        placement="bottom"
      >
        <PopoverTrigger>
          <Box>
            {length > max && (
              <Tag colorSchema={'gray'} ml={2} cursor={'pointer'}>
                {'+' + (length - max)}
              </Tag>
            )}
          </Box>
        </PopoverTrigger>
        <PopoverContent w={'fit-content'} bg={'white'} px={4} py={2}>
          <Flex rowGap={2} flexWrap={'wrap'} columnGap={2}>
            {names?.slice(max)?.map((name, index) => (
              <Tag key={index + length} colorSchema={'gray'}>
                {name}
              </Tag>
            ))}
          </Flex>
        </PopoverContent>
      </Popover>
    </Flex>
  );
}

export default GroupTags;
