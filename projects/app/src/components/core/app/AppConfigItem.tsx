import {
  Box,
  Button,
  Flex,
  type BoxProps,
  type ButtonProps,
  type FlexProps
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import React from 'react';

type AppConfigItemProps = Omit<FlexProps, 'children'> & {
  icon: IconNameType;
  label: React.ReactNode;
  tip?: React.ReactNode;
  action?: React.ReactNode;
  labelProps?: BoxProps;
};

/**
 * Render the shared row layout for an application chat configuration item.
 * The row owns spacing and typography so individual configuration components only provide content.
 */
const AppConfigItem = ({ icon, label, tip, action, labelProps, ...props }: AppConfigItemProps) => {
  return (
    <Flex alignItems={'center'} w={'100%'} minW={0} {...props}>
      <MyIcon name={icon} mr={2} w={'20px'} flexShrink={0} />
      <FormLabel {...labelProps}>{label}</FormLabel>
      {tip}
      <Box flex={1} />
      {action}
    </Flex>
  );
};

export const AppConfigItemAction = ({
  tooltip,
  children,
  ...props
}: Omit<ButtonProps, 'children'> & {
  tooltip: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <MyTooltip label={tooltip}>
      <Button
        variant={'transparentBase'}
        iconSpacing={1}
        size={'sm'}
        mr={'-5px'}
        color={'myGray.600'}
        {...props}
      >
        {children}
      </Button>
    </MyTooltip>
  );
};

export default React.memo(AppConfigItem);
