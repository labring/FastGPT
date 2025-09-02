import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, FormLabel, Textarea } from '@chakra-ui/react';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

interface AnswerTextareaProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  maxToken?: number;
  required?: boolean;
}

const AnswerTextarea = ({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  maxToken,
  required = false
}: AnswerTextareaProps) => {
  const [fold, setFold] = useState(true);
  const TextareaDom = useRef<HTMLTextAreaElement | null>(null);

  const autoHeightTextarea = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = '40px';
    element.style.height = `${element.scrollHeight + 5}px`;
  }, []);

  useEffect(() => {
    if (TextareaDom.current) {
      autoHeightTextarea(TextareaDom.current);
    }
  }, [value, autoHeightTextarea]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      if (e.target) {
        autoHeightTextarea(e.target);
      }
    },
    [onChange, autoHeightTextarea]
  );

  const handleFocus = useCallback(() => {
    setFold(false);
  }, []);

  const handleClickExpand = useCallback(() => {
    setFold(!fold);
  }, [fold]);

  return (
    <Box p={4} borderRadius={'md'} border={'base'} w={'100%'}>
      {/* Header */}
      {label && (
        <Flex mb={2} alignItems={'center'}>
          <FormLabel flex={'1 0 0'}>{label}</FormLabel>
          <MyIconButton
            icon={fold ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
            onClick={handleClickExpand}
          />
        </Flex>
      )}

      {/* Content */}
      <Box
        pos={'relative'}
        {...(fold
          ? {
              maxH: '50px',
              overflow: 'hidden'
            }
          : {
              maxH: 'auto'
            })}
      >
        {disabled ? (
          <Box fontSize={'sm'} color={'myGray.500'} whiteSpace={'pre-wrap'}>
            {value}
          </Box>
        ) : (
          <Textarea
            maxLength={maxToken}
            borderColor={'transparent'}
            minH="40px"
            px={0}
            pt={0}
            isRequired={required}
            whiteSpace={'pre-wrap'}
            resize={'none'}
            _focus={{
              px: 3,
              py: 1,
              borderColor: 'primary.500',
              boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
              bg: 'white'
            }}
            placeholder={placeholder}
            ref={(e) => {
              if (e) TextareaDom.current = e;
            }}
            value={value}
            onChange={handleTextChange}
            onFocus={handleFocus}
          />
        )}
        {fold && (
          <Box
            pos={'absolute'}
            bottom={0}
            left={0}
            right={0}
            top={0}
            bg={'linear-gradient(182deg, rgba(251, 251, 252, 0.00) 1.76%, #FBFBFC 84.07%)'}
            {...(disabled
              ? {}
              : {
                  cursor: 'pointer',
                  onClick: handleFocus
                })}
          />
        )}
      </Box>
    </Box>
  );
};

export default React.memo(AnswerTextarea);
