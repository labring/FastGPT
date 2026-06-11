import { useMemo, type ReactNode } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import markdownStyles from '../../ChatContainer/ChatBox/components/AIChatBubble/index.module.scss';

export const responseRowValueBoxStyles: BoxProps = {
  minH: '32px',
  px: 3,
  py: 2,
  border: '1px solid',
  borderColor: 'myGray.200',
  color: 'myGray.900',
  bg: 'myGray.50'
};

const RowRender = ({
  children,
  label,
  ...props
}: {
  children: ReactNode;
  label: string;
} & BoxProps) => {
  return (
    <Box>
      <Box
        fontSize={'12px'}
        lineHeight={'18px'}
        mb={2}
        color={'myGray.900'}
        fontWeight={500}
        letterSpacing={'0.5px'}
      >
        {label}
      </Box>
      <Box borderRadius={'6px'} fontSize={'12px'} bg={'myGray.50'} {...props}>
        {children}
      </Box>
    </Box>
  );
};

export const Row = ({
  label,
  value,
  rawDom,
  rawDomBoxProps,
  contentBoxProps
}: {
  label: string;
  value?: string | number | boolean | object;
  rawDom?: ReactNode;
  rawDomBoxProps?: BoxProps;
  contentBoxProps?: BoxProps;
}) => {
  const { t } = useSafeTranslation();
  const val = value || rawDom;
  const isObject = typeof value === 'object';

  const formatValue = useMemo(() => {
    if (isObject) {
      return `~~~json\n${JSON.stringify(value, null, 2)}\n~~~`;
    }
    if (typeof value === 'string') {
      return t(value);
    }
    return `${value}`;
  }, [isObject, t, value]);

  if (rawDom) {
    return (
      <RowRender label={label} bg={'transparent'} {...rawDomBoxProps}>
        {rawDom}
      </RowRender>
    );
  }

  if (val === undefined || val === '' || val === 'undefined') return null;

  return (
    <RowRender
      label={label}
      {...(isObject
        ? { bg: 'transparent' }
        : {
            ...responseRowValueBoxStyles,
            display: 'flex',
            alignItems: 'flex-start'
          })}
    >
      <Box
        {...contentBoxProps}
        minW={0}
        w={'100%'}
        sx={{
          '& .markdown': { fontSize: '12px !important' },
          '& .markdown pre': { fontSize: '12px !important' },
          ...contentBoxProps?.sx
        }}
      >
        <Markdown className={markdownStyles.markdown} source={formatValue} />
      </Box>
    </RowRender>
  );
};
