import React, { useMemo } from 'react';
import { Box, Flex, Grid, Image } from '@chakra-ui/react';
import type { GridProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

// @ts-ignore
interface Props extends GridProps {
  list: { id: string; icon?: string; label: string | React.ReactNode }[];
  activeId: string;
  size?: 'sm' | 'md' | 'lg';
  onChange: (id: string) => void;
}

const Tabs = ({ list, size = 'md', activeId, onChange, ...props }: Props) => {
  const { t } = useTranslation();
  const sizeMap = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          fontSize: 'sm',
          outP: '3px',
          inlineP: 1
        };
      case 'md':
        return {
          fontSize: ['sm', 'md'],
          outP: '4px',
          inlineP: 1
        };
      case 'lg':
        return {
          fontSize: ['md', 'lg'],
          outP: '5px',
          inlineP: 2
        };
    }
  }, [size]);

  return (
    <Grid
      gridTemplateColumns={`repeat(${list.length},1fr)`}
      p={sizeMap.outP}
      borderRadius={'sm'}
      fontSize={sizeMap.fontSize}
      overflowX={'auto'}
      {...props}
    >
      {list.map((item) => (
        <Flex
          key={item.id}
          py={sizeMap.inlineP}
          alignItems={'center'}
          justifyContent={'center'}
          borderBottom={'2px solid transparent'}
          px={3}
          whiteSpace={'nowrap'}
          {...(activeId === item.id
            ? {
                color: 'primary.600',
                cursor: 'default',
                fontWeight: 'bold',
                borderBottomColor: 'primary.600'
              }
            : {
                cursor: 'pointer'
              })}
          onClick={() => {
            if (activeId === item.id) return;
            onChange(item.id);
          }}
        >
          {item.icon && (
            <>
              {item.icon.startsWith('/') ? (
                <Image mr={1} src={item.icon} alt={''} w={'16px'} />
              ) : (
                <MyIcon mr={1} name={item.icon as any} w={'16px'} />
              )}
            </>
          )}
          {typeof item.label === 'string' ? t(item.label) : item.label}
        </Flex>
      ))}
    </Grid>
  );
};

export default Tabs;
