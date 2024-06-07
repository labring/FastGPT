import { Box, Flex, useDisclosure, useOutsideClick } from '@chakra-ui/react';
import React, { useRef } from 'react';
import { useTranslation } from 'next-i18next';
import MyTag from '../Tag/index';
import MyIcon from '../Icon';

export type SelectProps = {
  value?: string[];
  placeholder?: string;
  list: {
    icon?: string;
    alias?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  maxH?: number;
  onSelect: (val: any[]) => void;
};

const MultipleSelect = ({
  value = [],
  placeholder,
  list = [],
  maxH = 400,
  onSelect
}: SelectProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  useOutsideClick({
    ref: ref,
    handler: onClose
  });

  return (
    <Box ref={ref} position={'relative'}>
      <Flex
        alignItems={'center'}
        flexWrap={'wrap'}
        border={'base'}
        py={2}
        px={3}
        borderRadius={'md'}
        cursor={'pointer'}
        gap={3}
        onClick={() => (isOpen ? onClose() : onOpen())}
      >
        {value.map((item) => {
          const listItem = list.find((i) => i.value === item);
          if (!listItem) return null;

          return (
            <MyTag colorSchema="blue" p={2} cursor={'default'}>
              {listItem.alias || listItem.label}
              <MyIcon
                name={'common/closeLight'}
                ml={1}
                w="14px"
                cursor={'pointer'}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(value.filter((i) => i !== item));
                }}
              />
            </MyTag>
          );
        })}
        {value.length === 0 && placeholder && (
          <Box color={'myGray.500'} fontSize={'sm'}>
            {placeholder}
          </Box>
        )}
      </Flex>
      {isOpen && (
        <Box
          px={3}
          py={2}
          bg={'white'}
          borderRadius={'md'}
          whiteSpace={'nowrap'}
          maxH={`${maxH}px`}
          overflowY={'auto'}
          boxShadow={'2'}
          position={'absolute'}
          top={'110%'}
          border={'base'}
          w={'100%'}
          zIndex={100}
        >
          {list.map((item) => {
            const selected = value.includes(item.value);

            return (
              <Flex
                alignItems={'center'}
                _notLast={{ mb: 1 }}
                py={2}
                px={3}
                borderRadius={'md'}
                cursor={'pointer'}
                _hover={{
                  bg: 'primary.50'
                }}
                {...(selected
                  ? {
                      color: 'primary.600',
                      onClick: (e) => {
                        e.stopPropagation();
                        onSelect(value.filter((i) => i !== item.value));
                      }
                    }
                  : {
                      onClick: (e) => {
                        e.stopPropagation();
                        onSelect([...value, item.value]);
                      }
                    })}
              >
                {item.icon && <MyIcon name={item.icon as any} w={'14px'} mr={1} />}
                <Box>{item.label}</Box>
              </Flex>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(MultipleSelect);
