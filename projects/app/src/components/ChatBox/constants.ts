import { BoxProps } from '@chakra-ui/react';

export const MessageCardStyle: BoxProps = {
  px: 4,
  py: 3,
  borderRadius: '0 8px 8px 8px',
  boxShadow: '0 0 8px rgba(0,0,0,0.15)',
  display: 'inline-block',
  maxW: ['calc(100% - 25px)', 'calc(100% - 40px)']
};

export enum StreamResponseTypeEnum {
  text = 'text'
}
