import React from 'react';
import {
  Box,
  Flex,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { CollectionStatusEnum } from '@fastgpt/global/core/dataset/constants';

type Props = {
  value: CollectionStatusEnum | undefined;
  onChange: (status: CollectionStatusEnum | undefined) => void;
  hideNotExist?: boolean;
};

const StatusFilter = ({ value, onChange, hideNotExist = false }: Props) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const options: { key: CollectionStatusEnum | undefined; label: string }[] = [
    { key: undefined, label: t('common:All') },
    { key: CollectionStatusEnum.ready, label: t('common:core.dataset.collection.status.active') },
    { key: CollectionStatusEnum.training, label: t('dataset:processing') },
    { key: CollectionStatusEnum.error, label: t('dataset:exception_state') },
    ...(!hideNotExist
      ? [{ key: CollectionStatusEnum.notExist, label: t('common:table_not_exist') }]
      : [])
  ];

  return (
    <Popover placement="bottom" isLazy isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <PopoverTrigger>
        <Box as="span" cursor="pointer" display="inline-flex" alignItems="center">
          <MyIcon
            name={'common/table/filter'}
            w={'12px'}
            color={isOpen || value !== undefined ? '#1770E6' : undefined}
            _hover={{ color: '#1770E6' }}
          />
        </Box>
      </PopoverTrigger>
      <PopoverContent
        w="120px"
        borderRadius="6px"
        p="6px"
        _focus={{ outline: 'none', boxShadow: 'none' }}
        boxShadow="lg"
      >
        <PopoverArrow />
        <PopoverBody p={0}>
          {options.map((option) => {
            const isSelected = value === option.key;
            return (
              <Flex
                key={String(option.key)}
                h="28px"
                px="8px"
                py="6px"
                cursor="pointer"
                borderRadius={isSelected ? '4px' : 'none'}
                bg={isSelected ? 'rgba(50, 136, 250, 0.06)' : 'transparent'}
                color={isSelected ? '#1770E6' : '#333'}
                _hover={{ bg: isSelected ? 'rgba(50, 136, 250, 0.06)' : 'myGray.50' }}
                onClick={() => {
                  onChange(option.key);
                  onClose();
                }}
                fontSize="xs"
                alignItems="center"
                whiteSpace="nowrap"
              >
                {option.label}
              </Flex>
            );
          })}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default StatusFilter;
