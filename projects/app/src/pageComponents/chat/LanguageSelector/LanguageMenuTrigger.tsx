import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

type Props = {
  iconName: IconNameType;
  label: string;
  isCollapsed?: boolean;
};

const LanguageMenuTrigger = ({ iconName, label, isCollapsed = false }: Props) => {
  const trigger = (
    <Flex
      alignItems="center"
      justifyContent="flex-start"
      gap={1}
      h="40px"
      px={isCollapsed ? 0 : 2}
      py={1}
      borderRadius="4px"
      cursor="pointer"
      color="myGray.600"
      title={label}
    >
      <Flex alignItems="center" gap={1} flex="0 1 auto" minW={0} maxW="100%">
        <MyIcon name={iconName} w="18px" color="currentColor" flexShrink={0} />
        {!isCollapsed && (
          <Box fontSize="14px" lineHeight="20px" className="textEllipsis">
            {label}
          </Box>
        )}
      </Flex>
    </Flex>
  );

  return (
    <MyTooltip label={label} isDisabled={!isCollapsed} shouldWrapChildren={false}>
      {trigger}
    </MyTooltip>
  );
};

export default React.memo(LanguageMenuTrigger);
