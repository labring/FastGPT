import { Box, Flex } from '@chakra-ui/react';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';

const ParentPaths = (props: {
  paths?: ParentTreePathItemType[];
  rootName?: string;
  FirstPathDom?: React.ReactNode;
  onClick: (parentId: string) => void;
  fontSize?: string;
}) => {
  const { t } = useTranslation();
  const {
    paths = [],
    rootName = t('common:common.folder.Root Path'),
    FirstPathDom,
    onClick,
    fontSize
  } = props;
  const concatPaths = useMemo(
    () => [
      {
        parentId: '',
        parentName: rootName
      },
      ...paths
    ],
    [rootName, paths]
  );

  return paths.length === 0 && !!FirstPathDom ? (
    <>{FirstPathDom}</>
  ) : (
    <Flex flex={1} ml={-2}>
      {concatPaths.map((item, i) => (
        <Flex key={item.parentId || i} alignItems={'center'}>
          <Box
            fontSize={['sm', fontSize || 'sm']}
            py={0.5}
            px={1.5}
            borderRadius={'md'}
            {...(i === concatPaths.length - 1
              ? {
                  cursor: 'default',
                  color: 'myGray.700',
                  fontWeight: 'bold'
                }
              : {
                  cursor: 'pointer',
                  color: 'myGray.600',
                  _hover: {
                    bg: 'myGray.100'
                  },
                  onClick: () => {
                    onClick(item.parentId);
                  }
                })}
          >
            {item.parentName}
          </Box>
          {i !== concatPaths.length - 1 && (
            <Box mx={1} color={'myGray.500'}>
              /
            </Box>
          )}
        </Flex>
      ))}
    </Flex>
  );
};

export default React.memo(ParentPaths);
