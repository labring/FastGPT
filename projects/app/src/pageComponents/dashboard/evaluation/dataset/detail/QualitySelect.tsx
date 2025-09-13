import { Box, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { shadowLight } from '@fastgpt/web/styles/theme';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import type { EvaluationStatus } from './const';
import { modifiableEvaluationStatusOptions } from './const';

interface QualitySelectProps {
  value: EvaluationStatus;
  onSelect: (status: EvaluationStatus) => void;
  w?: string;
}

const QualitySelect = ({ value, onSelect, w = '200px' }: QualitySelectProps) => {
  const { t } = useTranslation();

  const getCurrentStatusOption = () => {
    return modifiableEvaluationStatusOptions.find((option) => option.value === value);
  };

  const currentOption = getCurrentStatusOption();

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
            <Box flex={1} noOfLines={1}>
              {currentOption && (
                <MyTag
                  colorSchema={currentOption.colorSchema as any}
                  type={'fill'}
                  fontWeight={500}
                >
                  {t(currentOption.label)}
                </MyTag>
              )}
            </Box>
            <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
          </Flex>
        </Flex>
      }
    >
      {({ onClose }) => (
        <Box maxH={'300px'} overflowY={'auto'}>
          {modifiableEvaluationStatusOptions.map((option) => (
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
              onClick={() => {
                onSelect(option.value as EvaluationStatus);
                onClose();
              }}
            >
              <Box flex={1}>
                <MyTag
                  colorSchema={option.colorSchema as any}
                  type={'fill'}
                  fontWeight={500}
                  flex={1}
                >
                  {t(option.label)}
                </MyTag>
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

export default QualitySelect;
