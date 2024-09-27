import { Box, BoxProps, Flex } from '@chakra-ui/react';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

const FolderPath = (props: {
  paths: ParentTreePathItemType[];
  rootName?: string;
  FirstPathDom?: React.ReactNode;
  onClick: (parentId: string) => void;
  fontSize?: string;
  hoverStyle?: BoxProps;
}) => {
  const { t } = useTranslation();
  const {
    paths,
    rootName = t('common:common.folder.Root Path'),
    FirstPathDom,
    onClick,
    fontSize,
    hoverStyle
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
    <Flex flex={1}>
      {concatPaths.map((item, i) => (
        <Flex key={item.parentId || i} alignItems={'center'}>
          <Box
            fontSize={['xs', fontSize || 'sm']}
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
                  fontWeight: 'medium',
                  color: 'myGray.500',
                  _hover: {
                    bg: 'myGray.100',
                    ...hoverStyle
                  },
                  onClick: () => {
                    onClick(item.parentId);
                  }
                })}
          >
            {item.parentName}
          </Box>
          {i !== concatPaths.length - 1 && (
            <MyIcon name={'common/line'} color={'myGray.500'} mx={1} width={'5px'} />
          )}
        </Flex>
      ))}
    </Flex>
  );
};

export default React.memo(FolderPath);
