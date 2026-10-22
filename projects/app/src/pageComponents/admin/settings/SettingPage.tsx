import { Children, Fragment, isValidElement, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { Box, Button, Flex } from '@chakra-ui/react';
import type { BoxProps } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import FirstTitle from './FirstTitle';
import SecondTitle from './SecondTitle';

interface titleType {
  mainTitle: string;
  subTitles: string[];
}

/** 简单节流：限制高频触发（滚动监听） */
const throttle = (fn: () => void, wait: number) => {
  let lastTime = 0;
  return () => {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn();
    }
  };
};

type TitleLevel = 1 | 2;

/**
 * 展开配置页中的 Fragment，确保标题和内容可以按层级统一包裹。
 * 配置页大量使用 Fragment 组织可选字段，直接遍历 Children 会漏掉其中的二级标题。
 */
const flattenSettingChildren = (children: ReactNode): ReactNode[] =>
  Children.toArray(children).flatMap((child) => {
    if (isValidElement(child) && child.type === Fragment) {
      return flattenSettingChildren(child.props.children);
    }
    return [child];
  });

const getTitleLevel = (child: ReactNode): TitleLevel | undefined => {
  if (!isValidElement(child)) return undefined;
  const componentLevel = (child.type as { settingTitleLevel?: TitleLevel }).settingTitleLevel;
  if (componentLevel === 1 || componentLevel === 2) return componentLevel;
  if (child.type === FirstTitle) return 1;
  if (child.type === SecondTitle) return 2;
  const level = (child.props as { 'data-setting-title-level'?: TitleLevel })[
    'data-setting-title-level'
  ];
  return level === 1 || level === 2 ? level : undefined;
};

/**
 * 将二级标题与其后的字段组成一个区块。区块的间距由这里统一控制，
 * 最后一个区块不保留底部 margin，避免页面底部出现多余空白。
 */
const renderSecondLevelGroups = (children: ReactNode[]) => {
  const groups: Array<{ title?: ReactNode; children: ReactNode[] }> = [];
  let currentGroup: { title?: ReactNode; children: ReactNode[] } = { children: [] };

  const flushGroup = () => {
    if (currentGroup.title || currentGroup.children.length > 0) {
      groups.push(currentGroup);
    }
    currentGroup = { children: [] };
  };

  children.forEach((child) => {
    if (getTitleLevel(child) === 2) {
      flushGroup();
      currentGroup = { title: child, children: [] };
      return;
    }
    currentGroup.children.push(child);
  });
  flushGroup();

  const lastTitleIndex = groups.reduce(
    (lastIndex, group, index) => (group.title ? index : lastIndex),
    -1
  );

  return groups.map((group, index) => {
    if (!group.title) return group.children;
    return (
      <Box
        key={`setting-second-group-${index}`}
        mb={index === lastTitleIndex ? 0 : 4}
        sx={{ '& > :last-child': { mb: 0 } }}
      >
        {group.title}
        {group.children}
      </Box>
    );
  });
};

/** 将一级标题后的内容放入统一的内边距容器。 */
const renderSettingSections = (children: ReactNode) => {
  const nodes = flattenSettingChildren(children);
  const sections: ReactNode[] = [];
  let firstTitle: ReactNode | undefined;
  let sectionChildren: ReactNode[] = [];
  let sectionIndex = 0;

  const flushSection = () => {
    if (!firstTitle) {
      sections.push(...sectionChildren);
    } else {
      sections.push(
        <Box key={`setting-first-section-${sectionIndex}`}>
          {firstTitle}
          <Box p={4}>{renderSecondLevelGroups(sectionChildren)}</Box>
        </Box>
      );
      sectionIndex += 1;
    }
    firstTitle = undefined;
    sectionChildren = [];
  };

  nodes.forEach((child) => {
    if (getTitleLevel(child) === 1) {
      flushSection();
      firstTitle = child;
      return;
    }
    sectionChildren.push(child);
  });
  flushSection();

  return sections;
};

function SettingPage({
  titles,
  loading,
  children,
  onSubmit,
  maxW = '800px'
}: {
  titles: Array<titleType>;
  loading?: boolean;
  children: React.ReactNode;
  onSubmit: () => void;
  /** 配置页内容的统一最大宽度，标题与表单字段共同受此约束。 */
  maxW?: BoxProps['maxW'];
}) {
  const [activeTitle, setActiveTitle] = useState('');

  const handleScroll = throttle(() => {
    let firstVisibleTitle: any = null;

    titles.forEach((title: titleType) => {
      const anchors = title.subTitles.length > 0 ? title.subTitles : [title.mainTitle];
      anchors.forEach((anchor: string) => {
        const anchorElement = document.getElementById(anchor);
        if (!anchorElement) return;

        const anchorRect = anchorElement.getBoundingClientRect();
        if (anchorRect.top <= window.innerHeight && anchorRect.bottom >= 0) {
          if (
            !firstVisibleTitle ||
            anchorRect.top < firstVisibleTitle.getBoundingClientRect().top
          ) {
            firstVisibleTitle = anchorElement;
          }
        }
      });
    });

    if (firstVisibleTitle) {
      setActiveTitle(firstVisibleTitle.id);
    }
  }, 100);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 迁移自 pro/admin，保持原逻辑
    if (!activeTitle) setActiveTitle(titles[0].mainTitle);
  }, [activeTitle]);

  const { isPc } = useSystem();

  return (
    <>
      {loading && <MyLoading />}
      {/* 配置页是连续的分栏工作区，外层区域不使用卡片间距或圆角。 */}
      <Flex h={'100%'} gap={0} overflow={'hidden'}>
        <Box flex={'1 0 0'} minW={0} overflowY={'auto'} onScroll={handleScroll}>
          <Box p={6} bg={'white'} overflow={'hidden'}>
            <Box w={'100%'} maxW={maxW} mx={'auto'}>
              {renderSettingSections(children)}
            </Box>
          </Box>
        </Box>
        <Flex
          flex={'0 0 200px'}
          flexDirection={'column'}
          position={isPc ? 'relative' : 'absolute'}
          h={'100%'}
          gap={0}
          borderLeft={'1px solid'}
          borderColor={'myGray.200'}
        >
          <BoxCard
            flex={'1 0 0'}
            overflow={'overlay'}
            display={['none', 'block']}
            userSelect={'none'}
            px={4}
            py={4}
            borderRadius={0}
            boxShadow={'none'}
          >
            <Box>
              {titles.map((title: titleType) => (
                <Box key={title.mainTitle}>
                  <Box
                    {...(activeTitle === title.mainTitle
                      ? {
                          bg: 'primary.600',
                          color: 'white'
                        }
                      : {
                          _hover: {
                            color: 'primary.600'
                          },
                          onClick: () => {
                            const anchor = document.getElementById(title.mainTitle);
                            if (anchor) {
                              anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
                            }
                          }
                        })}
                    py={1}
                    px={2}
                    borderRadius={'md'}
                    cursor={'pointer'}
                  >
                    {title.mainTitle}
                  </Box>
                  <Box ml={3} fontSize={'sm'}>
                    {title?.subTitles.map((subTitle: string) => (
                      <Box
                        key={subTitle}
                        {...(activeTitle === subTitle
                          ? {
                              bg: 'primary.600',
                              color: 'white'
                            }
                          : {
                              _hover: {
                                color: 'primary.600'
                              },
                              onClick: () => {
                                const anchor = document.getElementById(subTitle);
                                if (anchor) {
                                  anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
                                }
                              }
                            })}
                        py={1}
                        px={2}
                        borderRadius={'md'}
                        cursor={'pointer'}
                      >
                        {subTitle}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </BoxCard>
          <Box w={'100%'} p={4}>
            <Box>
              {/* <ImportModal value={rawData} setFormData={reset} setRawData={setRawData}>
              <Button variant={'whiteBase'} mb={3} w={'100%'} isLoading={isLoading}>
                配置文件
              </Button>
            </ImportModal> */}
            </Box>
            <Button onClick={onSubmit} w={'100%'}>
              保存
            </Button>
          </Box>
        </Flex>
      </Flex>
    </>
  );
}

export default SettingPage;
