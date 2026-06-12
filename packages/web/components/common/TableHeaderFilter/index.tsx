import React from 'react';
import {
  Box,
  HStack,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useTranslation } from 'next-i18next';

type TableHeaderFilterOption = {
  key: string;
  label: string;
};

type Props = {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: TableHeaderFilterOption[];
  label: string;
  allLabel?: string;
};

const TableHeaderFilter = ({ value, onChange, options, label, allLabel }: Props) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Popover placement="bottom" isLazy isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <PopoverTrigger>
        <HStack spacing={1} cursor={'pointer'} userSelect={'none'}>
          <Text>{label}</Text>
          <MyIcon
            name={'common/table/filter'}
            w={'12px'}
            color={isOpen || value !== undefined ? '#1770E6' : undefined}
            _hover={{ color: '#1770E6' }}
          />
        </HStack>
      </PopoverTrigger>
      <PopoverContent
        w={'120px'}
        borderRadius={'6px'}
        p={'6px'}
        zIndex={999}
        _focus={{ outline: 'none', boxShadow: 'none' }}
        boxShadow={'lg'}
      >
        <PopoverArrow />
        <PopoverBody p={0}>
          <Box
            h={'28px'}
            px={'8px'}
            py={'6px'}
            cursor={'pointer'}
            borderRadius={!value ? '4px' : 'none'}
            bg={!value ? 'rgba(50, 136, 250, 0.06)' : 'transparent'}
            color={!value ? '#1770E6' : '#333'}
            _hover={{
              bg: !value ? 'rgba(50, 136, 250, 0.06)' : 'myGray.50'
            }}
            onClick={() => {
              onChange(undefined);
              onClose();
            }}
            fontSize={'xs'}
            alignItems={'center'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
            title={allLabel || t('common:All')}
          >
            {allLabel || t('common:All')}
          </Box>
          <Box maxH={'200px'} overflowY={'auto'}>
            {options.map((option) => {
              const isSelected = value === option.key;

              return (
                <Box
                  key={option.key}
                  h={'28px'}
                  px={'8px'}
                  py={'6px'}
                  cursor={'pointer'}
                  borderRadius={isSelected ? '4px' : 'none'}
                  bg={isSelected ? 'rgba(50, 136, 250, 0.06)' : 'transparent'}
                  color={isSelected ? '#1770E6' : '#333'}
                  _hover={{ bg: isSelected ? 'rgba(50, 136, 250, 0.06)' : 'myGray.50' }}
                  onClick={() => {
                    onChange(isSelected ? undefined : option.key);
                    onClose();
                  }}
                  fontSize={'xs'}
                  alignItems={'center'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                  title={option.label}
                >
                  {option.label}
                </Box>
              );
            })}
          </Box>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export type { TableHeaderFilterOption };
export default TableHeaderFilter;
