import { Box, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { shadowLight } from '@fastgpt/web/styles/theme';
import type { EvaluationStatus } from './const';
import { evaluationStatusOptions } from './const';

interface EvaluationStatusSelectProps {
  value: EvaluationStatus;
  onSelect: (status: EvaluationStatus) => void;
  w: string;
}

const EvaluationStatusSelect = ({ value, onSelect, w = '200px' }: EvaluationStatusSelectProps) => {
  const { t } = useTranslation();

  const getCurrentStatusLabel = () => {
    const currentOption = evaluationStatusOptions.find((option) => option.value === value);
    return currentOption?.label;
  };

  return (
    <MyPopover
      placement={'bottom'}
      p={0}
      w={w}
      trigger={'click'}
      hasArrow={false}
      closeOnBlur={true}
      Trigger={
        <Flex
          px={3}
          py={1.5}
          alignItems={'center'}
          borderRadius={'md'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          userSelect={'none'}
          cursor={'pointer'}
          bg={'white'}
          h={'36px'}
          w={w}
          _hover={{
            borderColor: 'primary.300'
          }}
          _focus={{
            boxShadow: shadowLight,
            borderColor: 'primary.600'
          }}
        >
          <Flex alignItems={'center'} w={'100%'} h={'100%'}>
            <Box color={'myGray.600'} fontSize={'sm'} whiteSpace={'nowrap'}>
              {t('评测状态')}
            </Box>
            <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
            <Box fontSize={'sm'} color={'myGray.900'} flex={1} noOfLines={1}>
              {t(getCurrentStatusLabel())}
            </Box>
            <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
          </Flex>
        </Flex>
      }
    >
      {({ onClose }) => (
        <Box maxH={'300px'} overflowY={'auto'}>
          {evaluationStatusOptions.map((option) => (
            <Flex
              key={option.value}
              px={3}
              py={2}
              alignItems={'center'}
              cursor={'pointer'}
              _hover={{
                bg: 'myGray.50'
              }}
              bg={value === option.value ? 'primary.50' : 'transparent'}
              color={value === option.value ? 'primary.600' : 'myGray.900'}
              onClick={() => {
                onSelect(option.value as EvaluationStatus);
                onClose();
              }}
            >
              <Box fontSize={'sm'} flex={1}>
                {t(option.label)}
              </Box>
              {value === option.value && (
                <MyIcon name={'common/check'} color={'primary.600'} w={4} h={4} />
              )}
            </Flex>
          ))}
        </Box>
      )}
    </MyPopover>
  );
};

export default EvaluationStatusSelect;
