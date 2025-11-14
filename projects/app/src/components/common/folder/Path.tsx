import { Box, type BoxProps, Flex } from '@chakra-ui/react';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const FolderPath = (props: {
  paths: ParentTreePathItemType[];
  rootName?: string;
  FirstPathDom?: React.ReactNode;
  onClick: (parentId: string) => void;
  fontSize?: string;
  hoverStyle?: BoxProps;
  forbidLastClick?: boolean;
}) => {
  const { t } = useTranslation();
  const {
    paths,
    rootName = t('common:root_folder'),
    FirstPathDom,
    onClick,
    fontSize,
    hoverStyle,
    forbidLastClick = false
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
        <Flex alignItems={'center'} key={index}>
          <MyMenu
            Button={
              <Box
                fontSize={['sm', fontSize || 'sm']}
                py={0.5}
                px={1}
                color={'myGray.600'}
                borderRadius={'sm'}
                cursor="pointer"
                display={'flex'}
                alignItems={'center'}
                _hover={{
                  bg: 'myGray.200'
                }}
              >
                <MyIcon name={'common/ellipsis'} color={'myGray.500'} width={'12px'} />
              </Box>
            }
            trigger={'hover'}
            size={'xs'}
            menuList={[
              {
                children: middlePaths.map((pathItem) => ({
                  label: (
                    <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
                      {pathItem.parentName}
                    </Box>
                  ),
                  icon: 'file/fill/folder',
                  onClick: () => onClick(pathItem.parentId)
                }))
              }
            ]}
          />
          <MyIcon name={'common/line'} color={'myGray.500'} mx={1} width={'5px'} />
        </Flex>
      );
    }

    const isLast = index === displayPaths.length - 1;
    const clickStyles = {
      cursor: 'pointer',
      _hover: {
        bg: 'myGray.100',
        ...hoverStyle
      },
      onClick: () => {
        onClick(item.parentId);
      }
    };

    const shouldTruncate = !isLast && item.parentName.length > 10;
    const displayName = shouldTruncate ? `${item.parentName.slice(0, 10)}...` : item.parentName;

    const pathBox = (
      <Box
        fontSize={['xs', fontSize || 'sm']}
        py={0.5}
        px={1.5}
        borderRadius={'sm'}
        maxW={['45vw', '250px']}
        className={'textEllipsis'}
        {...(isLast && concatPaths.length > 1
          ? {
              color: 'myGray.700',
              fontWeight: 'bold'
            }
          : {
              fontWeight: 'medium',
              color: 'myGray.500',
              ...clickStyles
            })}
        {...(isLast && !forbidLastClick && clickStyles)}
      >
        {displayName}
      </Box>
    );

    return (
      <Flex key={item.parentId || index} alignItems={'center'}>
        {shouldTruncate ? <MyTooltip label={item.parentName}>{pathBox}</MyTooltip> : pathBox}
        {!isLast && <MyIcon name={'common/line'} color={'myGray.500'} mx={1} width={'5px'} />}
      </Flex>
    );
  };

  return paths.length === 0 && !!FirstPathDom ? (
    <>{FirstPathDom}</>
  ) : (
    <Flex flex={1}>{displayPaths.map((item, index) => renderPathItem(item, index))}</Flex>
  );
};

export default React.memo(FolderPath);
