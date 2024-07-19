import { ChevronRightIcon } from '@chakra-ui/icons';
import { Box, Flex } from '@chakra-ui/react';
import { DEFAULT_PARENT_ID } from '@fastgpt/global/common/string/constant';
import MyIcon from '../../../../../../../components/common/Icon';
import { IconNameType } from 'components/common/Icon/type';

export default function VariableLabel({
  variableKey,
  variableLabel,
  nodeAvatar
}: {
  variableKey: string;
  variableLabel: string;
  nodeAvatar: IconNameType;
}) {
  const [parentLabel, childLabel] = variableLabel.split('.');
  return (
    <>
      <Box
        display="inline-flex"
        alignItems="center"
        m={'2px'}
        rounded={'4px'}
        px={1.5}
        py={'1px'}
        bg={parentLabel !== 'undefined' ? 'primary.50' : 'red.50'}
        color={parentLabel !== 'undefined' ? 'myGray.900' : 'red.600'}
        cursor={'pointer'}
      >
        {parentLabel !== 'undefined' ? (
          <>
            <Flex hidden={parentLabel === DEFAULT_PARENT_ID} alignItems={'center'}>
              <Box mr={1}>
                <MyIcon name={nodeAvatar} w={'16px'} rounded={'2.8px'} mt={'2.5px'} />
              </Box>
              {parentLabel}
              <ChevronRightIcon />
            </Flex>
            <Box>{childLabel}</Box>
          </>
        ) : (
          <>
            <Box>{'无效变量'}</Box>
          </>
        )}
      </Box>
    </>
  );
}
