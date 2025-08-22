import type { getMyApps } from '@/web/core/app/api';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useMemo, useState, useCallback } from 'react';

export type App = Awaited<ReturnType<typeof getMyApps>>[number];

export const TreeItem = ({
  app,
  depth,
  folder,
  checked,
  expanded,
  onCheck,
  onCollapse
}: {
  app: App;
  depth: number;
  folder: boolean;
  checked: boolean;
  expanded: boolean;
  onCheck: (id: string) => void;
  onCollapse: (id: string) => void;
}) => {
  return (
    <Flex
      py="2"
      gap={2}
      w="100%"
      key={app._id}
      alignItems="center"
      color="myGray.700"
      cursor="pointer"
      flexShrink="0"
      borderRadius="sm"
      pl={depth === 0 ? '0.5rem' : `${1.75 * (depth - 1) + 2.3}rem`}
      _hover={{
        bg: 'myGray.50'
      }}
      onClick={() => (folder ? onCollapse(app._id) : onCheck(app._id))}
    >
      {folder ? (
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          visibility={folder ? 'visible' : 'hidden'}
          w={'1.25rem'}
          h={'1.25rem'}
          cursor={'pointer'}
          borderRadius={'xs'}
          _hover={{
            bg: 'rgba(31, 35, 41, 0.08)'
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (folder) onCollapse(app._id);
          }}
        >
          <MyIcon
            w={'14px'}
            color={'myGray.500'}
            name={'common/rightArrowFill'}
            transform={expanded ? 'rotate(90deg)' : 'none'}
          />
        </Flex>
      ) : (
        <Checkbox isChecked={checked} onChange={() => onCheck(app._id)} size="sm" />
      )}

      <Flex alignItems="center" gap={1} flex="1" userSelect="none">
        <Avatar src={app.avatar} borderRadius={'md'} w="1.5rem" />
        <Box className="textEllipsis" flex="1" pr="1">
          {app.name}
        </Box>
      </Flex>
    </Flex>
  );
};

export const Tree = ({
  apps,
  checkedIds,
  onCheck
}: {
  apps: App[];
  checkedIds: string[];
  onCheck: (id: string) => void;
}) => {
  const children = useMemo(() => {
    const map = new Map<string, App[]>();
    apps.forEach((item) => {
      const key = item.parentId ? String(item.parentId) : '__root__';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [apps]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const handleExpand = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const RenderNodes = useCallback(
    ({ parent, depth }: { parent: string; depth: number }) => {
      const list = children.get(parent) || [];
      return (
        <>
          {list.map((node) => {
            const nodeId = String(node._id);
            const isExpanded = !!expanded[nodeId];
            const folder = node.type === AppTypeEnum.folder;

            return (
              <Box key={nodeId} w="100%">
                <TreeItem
                  app={node}
                  depth={depth}
                  folder={folder}
                  onCheck={onCheck}
                  expanded={isExpanded}
                  checked={checkedIds.includes(nodeId)}
                  onCollapse={handleExpand}
                />

                {folder && isExpanded && (
                  <Box mt={0.5}>
                    <RenderNodes parent={nodeId} depth={depth + 1} />
                  </Box>
                )}
              </Box>
            );
          })}
        </>
      );
    },
    [children, checkedIds, expanded, onCheck, handleExpand]
  );

  return <RenderNodes parent="__root__" depth={0} />;
};

export default Tree;
