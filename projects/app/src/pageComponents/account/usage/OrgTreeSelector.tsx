import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Global, css } from '@emotion/react';
import Tree from 'rc-tree';
import { getOrgList } from '@/web/support/user/team/org/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useTranslation } from 'next-i18next';
import { useDisclosure } from '@chakra-ui/react';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';

interface OrgTreeSelectorProps {
  value: string[];
  onSelect: (val: string[]) => void;
  isSelectAll?: boolean;
  setIsSelectAll?: React.Dispatch<React.SetStateAction<boolean>>;
  h?: string;
  bg?: string;
  rounded?: string;
  borderColor?: string;
  placeholder?: string;
}

interface TreeNodeData {
  key: string;
  title: string;
  children?: TreeNodeData[];
  isLeaf?: boolean;
}

const orgToNode = (org: OrgListItemType): TreeNodeData => ({
  key: org._id,
  title: org.name,
  isLeaf: org.total === 0
});

const updateTreeNodes = (
  list: TreeNodeData[],
  key: string,
  children: TreeNodeData[]
): TreeNodeData[] =>
  list.map((node) => {
    if (node.key === key) {
      return { ...node, children, isLeaf: children.length === 0 };
    }
    if (node.children) {
      return { ...node, children: updateTreeNodes(node.children, key, children) };
    }
    return node;
  });

const collectDescendantKeys = (key: string, nodes: TreeNodeData[]): string[] => {
  for (const node of nodes) {
    if (node.key === key) {
      const result: string[] = [node.key];
      const collect = (children: TreeNodeData[]) => {
        for (const child of children) {
          result.push(child.key);
          if (child.children) collect(child.children);
        }
      };
      if (node.children) collect(node.children);
      return result;
    }
    if (node.children) {
      const found = collectDescendantKeys(key, node.children);
      if (found.length > 0) return found;
    }
  }
  return [];
};

const collectAllLeafKeys = (nodes: TreeNodeData[]): string[] => {
  const keys: string[] = [];
  for (const node of nodes) {
    keys.push(node.key);
    if (node.children) keys.push(...collectAllLeafKeys(node.children));
  }
  return keys;
};

// rc-tree 样式覆盖，匹配 MultipleSelect 下拉列表风格
const rcTreeStyles = css`
  .org-tree-wrap {
    .rc-tree {
      border: none;
      margin: 0;
    }
    .rc-tree .rc-tree-list-holder-inner {
      align-items: flex-start;
    }
    /* 树节点行 */
    .rc-tree .rc-tree-treenode {
      display: flex;
      align-items: center;
      padding: 8px 6px;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      line-height: normal;
      user-select: none;
      width: 100%;
    }
    .rc-tree .rc-tree-treenode:last-child {
      margin-bottom: 0;
    }
    .rc-tree .rc-tree-treenode:hover {
      background-color: var(--chakra-colors-myGray-100);
    }
    /* 节点内容 */
    .rc-tree .rc-tree-treenode .rc-tree-node-content-wrapper {
      display: inline-flex;
      align-items: center;
      height: auto;
      padding: 0;
      cursor: pointer;
      flex: 1;
      min-width: 0;
      color: #333;
      font-size: 14px;
    }
    .rc-tree .rc-tree-treenode .rc-tree-node-content-wrapper.rc-tree-node-selected {
      background: none;
      box-shadow: none;
      opacity: 1;
    }
    /* 展开/收起按钮 */
    .rc-tree .rc-tree-treenode span.rc-tree-switcher {
      background-image: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      margin-right: 2px;
    }
    .rc-tree .rc-tree-treenode span.rc-tree-switcher.rc-tree-switcher-noop {
      background: none;
      cursor: default;
    }
    /* Checkbox */
    .rc-tree .rc-tree-treenode span.rc-tree-checkbox {
      width: 16px;
      height: 16px;
      min-width: 16px;
      border: 1.5px solid var(--chakra-colors-myGray-400);
      border-radius: 3px;
      background-image: none;
      background-color: white;
      position: relative;
      margin: 0 8px 0 2px;
      flex-shrink: 0;
      vertical-align: middle;
    }
    .rc-tree .rc-tree-treenode span.rc-tree-checkbox.rc-tree-checkbox-checked {
      background-color: var(--chakra-colors-primary-600);
      border-color: var(--chakra-colors-primary-600);
      background-image: none;
    }
    .rc-tree .rc-tree-treenode span.rc-tree-checkbox.rc-tree-checkbox-checked::after {
      content: '';
      position: absolute;
      top: 1px;
      left: 3px;
      width: 5px;
      height: 8px;
      border: 1.5px solid white;
      border-top: 0;
      border-left: 0;
      transform: rotate(45deg);
      display: block;
      background: transparent;
    }
    .rc-tree .rc-tree-treenode span.rc-tree-checkbox.rc-tree-checkbox-indeterminate {
      background-color: var(--chakra-colors-primary-600);
      border-color: var(--chakra-colors-primary-600);
      background-image: none;
    }
    .rc-tree .rc-tree-treenode span.rc-tree-checkbox.rc-tree-checkbox-indeterminate::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 2.5px;
      right: 2.5px;
      height: 1.5px;
      background: white;
      transform: translateY(-50%);
      display: block;
      border: none;
    }
    /* 隐藏节点默认 icon */
    .rc-tree .rc-tree-treenode span.rc-tree-iconEle {
      display: none;
    }
    /* 缩进 */
    .rc-tree-indent-unit {
      width: 20px;
      display: inline-block;
    }
    .rc-tree-indent {
      display: inline-block;
      height: 0;
      vertical-align: bottom;
    }
    .rc-tree-title {
      display: inline-block;
      min-width: 0;
      flex: 1;
    }
  }
`;

const OrgTreeSelector = ({
  value,
  onSelect,
  isSelectAll,
  setIsSelectAll,
  h = '32px',
  bg = 'white',
  rounded = '4px',
  borderColor = 'myGray.200',
  placeholder
}: OrgTreeSelectorProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchKey, setSearchKey] = useState('');
  const [debouncedSearchKey, setDebouncedSearchKey] = useState('');
  const [treeData, setTreeData] = useState<TreeNodeData[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([]);
  const [orgNameMap, setOrgNameMap] = useState<Record<string, string>>({});

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchKey(searchKey), 300);
    return () => clearTimeout(timer);
  }, [searchKey]);

  // 获取根部门列表（搜索关键词变化时重置）
  const { data: rootOrgs = [], loading: rootLoading } = useRequest(
    () => getOrgList({ orgId: '', searchKey: debouncedSearchKey }),
    { manual: false, refreshDeps: [debouncedSearchKey] }
  );

  // 搜索词变化时重置展开状态和加载记录
  useEffect(() => {
    setExpandedKeys([]);
    setLoadedKeys([]);
  }, [debouncedSearchKey]);

  // 初始化树数据
  useEffect(() => {
    const nodes = rootOrgs.map(orgToNode);
    setTreeData(nodes);
    const updates: Record<string, string> = {};
    rootOrgs.forEach((o) => {
      updates[o._id] = o.name;
    });
    setOrgNameMap((prev) => ({ ...prev, ...updates }));
  }, [rootOrgs]);

  // 异步加载子部门（节点展开时触发）
  const onLoadData = useCallback(
    async (treeNode: any): Promise<void> => {
      const orgId = treeNode.key as string;
      if (loadedKeys.includes(orgId)) return;

      const children = await getOrgList({ orgId, searchKey: '' });
      const childNodes = children.map(orgToNode);

      const updates: Record<string, string> = {};
      children.forEach((o) => {
        updates[o._id] = o.name;
      });
      setOrgNameMap((prev) => ({ ...prev, ...updates }));
      setTreeData((prev) => updateTreeNodes(prev, orgId, childNodes));
      setLoadedKeys((prev) => [...prev, orgId]);
    },
    [loadedKeys]
  );

  // 计算父节点半选状态（部分子节点被选中）
  const halfCheckedKeys = useMemo(() => {
    const halfSet = new Set<string>();
    const traverse = (nodes: TreeNodeData[]) => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          const allKeys = collectAllLeafKeys(node.children);
          const selectedCount = allKeys.filter((k) => value.includes(k)).length;
          if (selectedCount > 0 && selectedCount < allKeys.length) {
            halfSet.add(node.key);
          }
          traverse(node.children);
        }
      }
    };
    traverse(treeData);
    return Array.from(halfSet);
  }, [treeData, value]);

  // 勾选/取消勾选：级联处理子部门
  const onCheck = useCallback(
    (_: any, info: any) => {
      const nodeKey = info.node.key as string;
      const checked = info.checked as boolean;
      const descendants = collectDescendantKeys(nodeKey, treeData);

      // 全选状态下取消勾选，需要先将所有节点填充到 value 中
      const baseValue = isSelectAll ? collectAllLeafKeys(treeData) : value;

      if (isSelectAll && setIsSelectAll) {
        setIsSelectAll(false);
      }

      const newValue = checked
        ? Array.from(new Set([...baseValue, ...descendants]))
        : baseValue.filter((id) => !descendants.includes(id));

      onSelect(newValue);
    },
    [isSelectAll, setIsSelectAll, value, onSelect, treeData]
  );

  const onSelectAllClick = useCallback(() => {
    if (setIsSelectAll) setIsSelectAll((s) => !s);
    if (!isSelectAll) onSelect([]);
  }, [isSelectAll, setIsSelectAll, onSelect]);

  // 触发器展示文本
  const selectedLabels = useMemo(
    () => value.map((id) => orgNameMap[id] || id),
    [value, orgNameMap]
  );

  const visibleCount = useMemo(() => {
    let count = 0;
    let width = 0;
    const containerWidth = 120;
    for (let i = 0; i < selectedLabels.length; i++) {
      const labelWidth = 16 + selectedLabels[i].length * 8 + 20;
      if (width + labelWidth <= containerWidth) {
        width += labelWidth + 4;
        count++;
      } else break;
    }
    return count;
  }, [selectedLabels]);

  // 自定义展开/收起图标
  const switcherIcon = useCallback((props: any) => {
    if (props.isLeaf) return <span style={{ width: 20, display: 'inline-block' }} />;
    return (
      <MyIcon
        name={props.expanded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
        w={'14px'}
        h={'14px'}
        color={'myGray.500'}
      />
    );
  }, []);

  // 自定义节点标题
  const titleRender = useCallback(
    (node: any) => (
      <Box fontSize={'sm'} color={'#333'} noOfLines={1}>
        {node.title}
      </Box>
    ),
    []
  );

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <>
      <Global styles={rcTreeStyles} />
      <Box ref={containerRef} position={'relative'} w={'full'}>
        {/* 触发器 */}
        <Flex
          alignItems={'center'}
          h={h}
          bg={bg}
          borderRadius={rounded}
          border={'1px solid'}
          borderColor={isOpen ? 'primary.600' : borderColor}
          px={3}
          cursor={'pointer'}
          _hover={{ borderColor: 'primary.300' }}
          {...(isOpen ? { boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' } : {})}
          onClick={onOpen}
        >
          {isSelectAll ? (
            <Box fontSize={'sm'} color={'myGray.900'} flex={1}>
              {t('common:All')}
            </Box>
          ) : selectedLabels.length === 0 ? (
            <Box fontSize={'sm'} color={'myGray.500'} flex={1}>
              {placeholder || t('account_usage:org')}
            </Box>
          ) : (
            <Flex flex={1} gap={1} flexWrap={'nowrap'} overflow={'hidden'} alignItems={'center'}>
              {selectedLabels.slice(0, visibleCount).map((label, i) => (
                <MyTag
                  key={i}
                  bg={'myGray.100'}
                  color={'#333'}
                  borderRadius={'sm'}
                  px={1}
                  py={1}
                  flexShrink={0}
                >
                  {label}
                </MyTag>
              ))}
              {selectedLabels.length > visibleCount && (
                <Box fontSize={'sm'} px={1} py={1} borderRadius={'sm'} bg={'myGray.100'}>
                  +{selectedLabels.length - visibleCount}
                </Box>
              )}
            </Flex>
          )}
          <MyIcon name={'core/chat/chevronDown'} color={'myWhite.1000'} w={4} h={4} ml={1} />
        </Flex>

        {/* 下拉面板 */}
        {isOpen && (
          <Box
            position={'absolute'}
            top={'calc(100% + 4px)'}
            left={0}
            w={'280px'}
            bg={'white'}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            boxShadow={'0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'}
            zIndex={10}
            overflow={'hidden'}
          >
            {/* 搜索框 */}
            <Box px={'6px'} pt={'6px'}>
              <SearchInput
                placeholder={t('account_usage:search')}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
              />
            </Box>

            {/* 全部选项 */}
            {setIsSelectAll && (
              <Flex
                px={'6px'}
                py={2}
                cursor={'pointer'}
                onClick={onSelectAllClick}
                _hover={{ bg: 'myGray.100' }}
                alignItems={'center'}
                gap={2}
                borderBottom={'1px solid'}
                borderColor={'myGray.100'}
                borderRadius={'sm'}
                mx={'6px'}
                my={'6px'}
              >
                <Box
                  w={'16px'}
                  h={'16px'}
                  flexShrink={0}
                  borderRadius={'3px'}
                  border={'1.5px solid'}
                  borderColor={isSelectAll ? 'primary.600' : 'myGray.400'}
                  bg={isSelectAll ? 'primary.600' : 'transparent'}
                  display={'flex'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  {isSelectAll && <MyIcon name={'common/check'} w={'11px'} h={'11px'} color={'white'} />}
                </Box>
                <Box fontSize={'sm'} color={'myWhite.1000'}>
                  {t('common:All')}
                </Box>
              </Flex>
            )}

            {/* 树形组件 */}
            <Box maxH={'40vh'} overflowY={'auto'} px={'6px'} pb={'6px'}>
              {rootLoading && treeData.length === 0 ? (
                <Box px={3} py={4} textAlign={'center'} color={'myGray.500'} fontSize={'sm'}>
                  {t('account_usage:loading')}
                </Box>
              ) : treeData.length === 0 ? (
                <Box px={3} py={4} textAlign={'center'} color={'myGray.500'} fontSize={'sm'}>
                  {t('account_usage:no_data')}
                </Box>
              ) : (
                <Box className="org-tree-wrap">
                  <Tree
                    treeData={treeData}
                    checkable
                    checkStrictly
                    checkedKeys={{ checked: isSelectAll ? collectAllLeafKeys(treeData) : value, halfChecked: halfCheckedKeys }}
                    expandedKeys={expandedKeys}
                    onExpand={(keys) => setExpandedKeys(keys)}
                    loadData={onLoadData}
                    loadedKeys={loadedKeys}
                    onCheck={onCheck}
                    switcherIcon={switcherIcon}
                    titleRender={titleRender}
                    showIcon={false}
                    selectable={false}
                    virtual={false}
                  />
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
};

export default React.memo(OrgTreeSelector);
