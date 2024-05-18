import { Box, BoxProps, Flex } from '@chakra-ui/react';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import React, { useCallback, useEffect } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';

export default function QuestionGuide({
  guides,
  setDropdownValue,
  ...props
}: {
  guides: string[];
  setDropdownValue?: (value: string) => void;
} & BoxProps) {
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const { appT } = useI18n();

  const handleKeyDown = useCallback(
    (event: any) => {
      if (event.keyCode === 38) {
        setHighlightedIndex((prevIndex) => Math.max(prevIndex - 1, 0));
      } else if (event.keyCode === 40) {
        setHighlightedIndex((prevIndex) => Math.min(prevIndex + 1, guides.length - 1));
      } else if (event.keyCode === 13 && guides[highlightedIndex]) {
        setDropdownValue?.(guides[highlightedIndex]);
        event.preventDefault();
      }
    },
    [highlightedIndex, setDropdownValue, guides]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return guides.length ? (
    <Box
      bg={'white'}
      boxShadow={'lg'}
      borderWidth={'1px'}
      borderColor={'borderColor.base'}
      p={2}
      borderRadius={'md'}
      position={'absolute'}
      top={'100%'}
      w={'auto'}
      zIndex={99999}
      maxH={'300px'}
      overflow={'auto'}
      className="nowheel"
      {...props}
    >
      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'} gap={2} mb={2} px={2}>
        <MyIcon name={'union'} />
        <Box>{appT('modules.Input Guide')}</Box>
      </Flex>
      {guides.map((item, index) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item}
          px={4}
          py={3}
          borderRadius={'sm'}
          cursor={'pointer'}
          maxH={'300px'}
          overflow={'auto'}
          _notLast={{
            mb: 1
          }}
          {...(highlightedIndex === index
            ? {
                bg: 'primary.50',
                color: 'primary.600'
              }
            : {
                bg: 'myGray.50',
                color: 'myGray.600'
              })}
          onMouseDown={(e) => {
            e.preventDefault();

            setDropdownValue?.(item);
          }}
          onMouseEnter={() => {
            setHighlightedIndex(index);
          }}
        >
          <Box fontSize={'sm'}>{item}</Box>
        </Flex>
      ))}
    </Box>
  ) : null;
}
