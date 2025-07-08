import { Box, Flex } from '@chakra-ui/react';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const ParentPaths = (props: {
  paths?: ParentTreePathItemType[];
  rootName?: string;
  FirstPathDom?: React.ReactNode;
  onClick: (parentId: string) => void;
  fontSize?: string;
}) => {
  const { t } = useTranslation();
  const { paths = [], rootName = t('common:root_folder'), FirstPathDom, onClick, fontSize } = props;
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

  const displayPaths = useMemo(() => {
    if (concatPaths.length <= 3) {
      return concatPaths;
    } else {
      return [
        concatPaths[0],
        null,
        concatPaths[concatPaths.length - 2],
        concatPaths[concatPaths.length - 1]
      ];
    }
  }, [concatPaths]);

  const renderPathItem = (item: (typeof concatPaths)[0] | null, index: number) => {
    if (item === null) {
      const middlePaths = concatPaths.slice(1, -2);

      return (
        <Flex alignItems={'center'}>
          <MyMenu
            Button={
              <Box fontSize={['sm', fontSize || 'sm']} px={1} color={'myGray.600'} cursor="pointer">
                ...
              </Box>
            }
            trigger={'hover'}
            size={'xs'}
            menuList={[
              {
                children: middlePaths.map((pathItem) => ({
                  label: pathItem.parentName,
                  icon: 'file/fill/folder',
                  onClick: () => onClick(pathItem.parentId)
                }))
              }
            ]}
          />
          <Box mx={1} color={'myGray.500'}>
            /
          </Box>
        </Flex>
      );
    }

    const isLast = index === displayPaths.length - 1;
    const displayName =
      !isLast && item.parentName.length > 10
        ? `${item.parentName.slice(0, 10)}...`
        : item.parentName;

    const pathBox = (
      <Box
        fontSize={['sm', fontSize || 'sm']}
        py={0.5}
        px={1.5}
        borderRadius={'md'}
        {...(isLast
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
        {displayName}
      </Box>
    );

    return (
      <Flex key={item.parentId || index} alignItems={'center'}>
        {!isLast && item.parentName.length > 10 ? (
          <MyTooltip label={item.parentName}>{pathBox}</MyTooltip>
        ) : (
          pathBox
        )}
        {!isLast && (
          <Box mx={1} color={'myGray.500'}>
            /
          </Box>
        )}
      </Flex>
    );
  };

  return paths.length === 0 && !!FirstPathDom ? (
    <>{FirstPathDom}</>
  ) : (
    <Flex flex={1} ml={-2}>
      {displayPaths.map((item, index) => renderPathItem(item, index))}
    </Flex>
  );
};

export default React.memo(ParentPaths);
