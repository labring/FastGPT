import { Box, type BoxProps, Flex } from '@chakra-ui/react';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

type DisplayPathItem = ParentTreePathItemType & {
  /** 标记详情页传入的当前资源节点；永远不可点击，避免触发目录跳转。 */
  isCurrent?: boolean;
};

/**
 * 通用目录面包屑导航。
 * 统一表达“根节点 / 祖先目录... / 当前节点”的完整路径：
 * - `paths` 仅传真实目录节点；详情页通过 `currentName` 追加当前资源名。
 * - 默认禁止点击末项（`forbidLastClick = true`），且 `currentName` 对应项始终不可点击。
 */
const FolderPath = (props: {
  paths: ParentTreePathItemType[];
  currentName?: string;
  rootName?: string;
  FirstPathDom?: React.ReactNode;
  onClick: (parentId: ParentIdType) => void;
  fontSize?: string;
  hoverStyle?: BoxProps;
  forbidLastClick?: boolean;
}) => {
  const { t } = useTranslation();
  const {
    paths,
    currentName,
    rootName = t('common:root_folder'),
    FirstPathDom,
    onClick,
    fontSize,
    hoverStyle,
    forbidLastClick = true
  } = props;

  const normalizedCurrentName = currentName?.trim() || '';

  const concatPaths = useMemo<DisplayPathItem[]>(() => {
    const basePaths: DisplayPathItem[] = [
      {
        parentId: '',
        parentName: rootName
      },
      ...paths
    ];

    if (normalizedCurrentName) {
      basePaths.push({
        parentId: '',
        parentName: normalizedCurrentName,
        isCurrent: true
      });
    }

    return basePaths;
  }, [rootName, paths, normalizedCurrentName]);

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
        <Flex alignItems={'center'} flexShrink={0} key={index}>
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
          <MyIcon name={'common/line'} color={'myGray.500'} mx={1} width={'5px'} flexShrink={0} />
        </Flex>
      );
    }

    const isRoot = index === 0;
    const isLast = index === displayPaths.length - 1;
    const isClickable =
      !item.isCurrent && (!isLast || concatPaths.length === 1 || !forbidLastClick);
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

    const pathBox = (
      <Box
        fontSize={['xs', fontSize || 'sm']}
        py={0.5}
        px={1.5}
        borderRadius={'sm'}
        minW={0}
        maxW={['45vw', '250px']}
        className={'textEllipsis'}
        {...(isLast && concatPaths.length > 1
          ? {
              color: 'myGray.700',
              fontWeight: 'bold'
            }
          : {
              fontWeight: 'medium',
              color: 'myGray.500'
            })}
        {...(isClickable && clickStyles)}
      >
        {item.parentName}
      </Box>
    );

    return (
      <Flex
        key={item.isCurrent ? '__current__' : item.parentId || index}
        alignItems={'center'}
        // 根节点固定不收缩以始终保留返回入口；后续目录与当前资源名可在受限顶栏中按剩余宽度截断。
        flex={isRoot ? '0 0 auto' : '0 1 auto'}
        minW={isRoot ? 'auto' : 0}
        overflow={isRoot ? 'visible' : 'hidden'}
      >
        <MyTooltip label={item.parentName} showOnlyWhenOverflow>
          {pathBox}
        </MyTooltip>
        {!isLast && (
          <MyIcon name={'common/line'} color={'myGray.500'} mx={1} width={'5px'} flexShrink={0} />
        )}
      </Flex>
    );
  };

  return paths.length === 0 && !normalizedCurrentName && !!FirstPathDom ? (
    <>{FirstPathDom}</>
  ) : (
    <Flex flex={1} minW={0} overflow={'hidden'} alignItems={'center'}>
      {displayPaths.map((item, index) => renderPathItem(item, index))}
    </Flex>
  );
};

export default React.memo(FolderPath);
