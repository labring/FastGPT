import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  BoxProps,
  Flex,
  Input,
  Tag,
  TagCloseButton,
  TagLabel,
  useTheme
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';

type Props = BoxProps & { defaultValues: string[]; onUpdate: (e: string[]) => void };

const TagTextarea = ({ defaultValues, onUpdate, ...props }: Props) => {
  const theme = useTheme();
  const InputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { toast } = useToast();
  const [focus, setFocus] = useState(false);
  const [tags, setTags] = useState<string[]>(defaultValues);

  const onUpdateValue = useCallback(
    (value?: string) => {
      setFocus(false);
      if (!value || !InputRef.current?.value) {
        return;
      }
      if (tags.includes(value)) {
        return toast({
          status: 'warning',
          title: t('common:common.input.Repeat Value')
        });
      }
      setTags([...tags, value]);
      onUpdate([...tags, value]);
      InputRef.current.value = '';
    },
    [onUpdate, t, tags, toast]
  );

  return (
    <Box
      w={'100%'}
      minH={'200px'}
      borderRadius={'md'}
      border={theme.borders.base}
      p={2}
      fontSize={'sm'}
      bg={'myWhite.600'}
      {...(focus && {
        boxShadow: '0px 0px 4px #A8DBFF',
        borderColor: 'primary.500'
      })}
      {...props}
      onClick={() => {
        if (!focus) {
          InputRef.current?.focus();
          setFocus(true);
        }
      }}
    >
      <Flex alignItems={'center'} gap={2} flexWrap={'wrap'}>
        {tags.map((tag, i) => (
          <Tag key={tag} colorScheme="primary" onClick={(e) => e.stopPropagation()}>
            <TagLabel>{tag}</TagLabel>
            <TagCloseButton
              onClick={() => {
                const val = tags.filter((_, index) => index !== i);
                setTags(val);
                onUpdate(val);
              }}
            />
          </Tag>
        ))}
        <Input
          ref={InputRef}
          variant={'unstyled'}
          display={'inline-block'}
          h={'24px'}
          borderRadius={'none'}
          w="auto"
          onBlur={(e) => {
            const value = e.target.value;
            onUpdateValue(value);
          }}
          onKeyDown={(e) => {
            if (e.keyCode === 13) {
              e.preventDefault();
              onUpdateValue(InputRef.current?.value);
            }
          }}
        />
      </Flex>
    </Box>
  );
};

export default TagTextarea;
