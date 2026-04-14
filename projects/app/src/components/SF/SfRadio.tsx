import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';

type SfRadioItem = {
  title: string | React.ReactNode;
  desc?: string;
  value: any;
  forbidTip?: string;
};

type Props = Omit<FlexProps, 'onChange'> & {
  list: SfRadioItem[];
  value: any;
  onChange: (e: any) => void;
};

const SfRadio = ({ list, value, onChange, ...props }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  return (
    <Flex gap={'8px'} {...props}>
      {list.map((item) => (
        <Flex
          key={item.value}
          flex={1}
          alignItems={'center'}
          cursor={'pointer'}
          userSelect={'none'}
          h={'32px'}
          px={'12px'}
          borderRadius={'4px'}
          border={'1px solid'}
          fontSize={'12px'}
          lineHeight={'20px'}
          color={'myGray.800'}
          flexDirection={'row'}
          justifyContent={'flex-start'}
          transition={'all 0.15s ease'}
          {...(value === item.value
            ? {
                borderColor: '#1770E6',
                boxShadow: '0px 0px 0px 2.15px rgba(23, 112, 230, 0.15)'
              }
            : {
                borderColor: '#E8EBF0',
                _hover: {
                  borderColor: '#1770E6',
                  bg: 'white'
                }
              })}
          onClick={() => {
            if (item.forbidTip) {
              toast({ status: 'warning', title: item.forbidTip });
            } else {
              onChange(item.value);
            }
          }}
        >
          <Box fontWeight={'400'} noOfLines={1} w="100%">
            {item.title}
          </Box>
        </Flex>
      ))}
    </Flex>
  );
};

export default SfRadio;
