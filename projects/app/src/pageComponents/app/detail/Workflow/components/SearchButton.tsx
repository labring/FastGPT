import React, { useState, useCallback, useRef } from 'react';
import { Box, Flex, Button, IconButton, type ButtonProps, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useReactFlow } from 'reactflow';
import { useKeyPress, useThrottleEffect } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useWorkflowOverlayActions } from '@/web/core/workflow/editor/session/workflowSession';
import type { ViewOverlayPatch } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useWorkflowSnapshotGetter } from '../../WorkflowComponents/Flow/nodes/render/useWorkflowDocument';
import {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '../../WorkflowComponents/Flow/canvas/workflowCanvasContext';
import { getDimensionedNodes } from '../../WorkflowComponents/Flow/canvas/nodeDimensions';

const SearchButton = (props: ButtonProps) => {
  const { t } = useTranslation();
  // 命中节点读文档一次性算，不建订阅；高亮标记是画布视图数据，写进 host overlay 由投影合并。
  const getWorkflow = useWorkflowSnapshotGetter();
  const patchViewData = useWorkflowOverlayActions();
  const { fitView } = useReactFlow();
  const getNodes = useWorkflowCanvasRendererValue((v) => v.getNodes);
  const getNodeDimension = useWorkflowCanvasValue((v) => v.getNodeDimension);
  const selectNodes = useWorkflowCanvasRendererValue((v) => v.selectNodes);
  const { isMac } = useSystem();

  const [keyword, setKeyword] = useState<string>();
  const [searchIndex, setSearchIndex] = useState<number>(0);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);
  // 上一轮写过标记的节点：只提交增量，避免每次按键都让全画布 overlay 变更并重投影。
  const markedNodeIdsRef = useRef<string[]>([]);
  const fittedSearchTargetRef = useRef<string>();

  useKeyPress(['ctrl.f', 'meta.f'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    setKeyword('');
  });
  useKeyPress(['esc'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    setKeyword(undefined);
  });

  /**
   * 按节点名称搜索：命中标记写 host overlay，当前命中项定位并选中。
   *
   * 标记必须走 overlay 而不是画布数组：数组每次重投影都会从文档重建，
   * 直接写 data 会让高亮在下一次任意编辑后丢失。
   */
  const onSearch = useCallback(() => {
    const lowerKeyword = keyword?.toLowerCase();
    const matchedNodeIds = lowerKeyword
      ? (getWorkflow()?.nodes ?? [])
          .filter((node) => node.name.toLowerCase().includes(lowerKeyword))
          .map((node) => node.nodeId)
      : [];
    const matchedIds = new Set(matchedNodeIds);
    const previousIds = markedNodeIdsRef.current;
    const patches: ViewOverlayPatch[] = [
      ...previousIds
        .filter((nodeId) => !matchedIds.has(nodeId))
        .map((nodeId) => ({ nodeId, values: { searchedText: undefined } })),
      ...matchedNodeIds
        .filter((nodeId) => !previousIds.includes(nodeId))
        .map((nodeId) => ({ nodeId, values: { searchedText: keyword } }))
    ];
    markedNodeIdsRef.current = matchedNodeIds;
    patchViewData(patches);

    if (!keyword) {
      fittedSearchTargetRef.current = undefined;
      setSearchIndex(0);
      setSearchedNodeCount(0);
      return;
    }
    if (matchedNodeIds.length === 0) {
      fittedSearchTargetRef.current = undefined;
      setSearchIndex(0);
      setSearchedNodeCount(0);
      return;
    }

    setSearchedNodeCount(matchedNodeIds.length);
    const activeNodeId = matchedNodeIds[searchIndex] ?? matchedNodeIds[0];
    const activeNode = getNodes().find((node) => node.id === activeNodeId);
    const [dimensionedNode] = activeNode ? getDimensionedNodes([activeNode], getNodeDimension) : [];
    const fitTargetKey = `${keyword}:${searchIndex}:${activeNodeId}`;
    if (dimensionedNode && fittedSearchTargetRef.current !== fitTargetKey) {
      fittedSearchTargetRef.current = fitTargetKey;
      fitView({ nodes: [dimensionedNode], padding: 0.6, minZoom: 0.6 });
    }
    selectNodes([activeNodeId]);
  }, [
    fitView,
    getNodes,
    getNodeDimension,
    getWorkflow,
    keyword,
    patchViewData,
    searchIndex,
    selectNodes
  ]);

  useThrottleEffect(
    () => {
      onSearch();
    },
    [onSearch],
    {
      wait: 500
    }
  );

  const goToNextMatch = useCallback(() => {
    if (searchIndex === searchedNodeCount - 1) {
      setSearchIndex(0);
    } else {
      setSearchIndex(searchIndex + 1);
    }
  }, [searchIndex, searchedNodeCount]);

  const goToPreviousMatch = useCallback(() => {
    if (searchIndex === 0) {
      setSearchIndex(searchedNodeCount - 1);
    } else {
      setSearchIndex(searchIndex - 1);
    }
  }, [searchIndex, searchedNodeCount]);

  const clearSearch = useCallback(() => {
    setKeyword(undefined);
    setSearchIndex(0);
    setSearchedNodeCount(0);
  }, []);

  if (keyword === undefined) {
    return (
      <Box position={'absolute'} top={'180px'} left={6} zIndex={1}>
        <MyTooltip
          shouldWrapChildren={false}
          label={isMac ? t('workflow:find_tip_mac') : t('workflow:find_tip')}
        >
          <IconButton
            icon={<MyIcon name="core/app/workflowToolbarSearch" boxSize={5} color={'myGray.400'} />}
            w={9}
            minW={9}
            h={9}
            p={1.5}
            borderRadius={'50%'}
            aria-label={''}
            variant="whitePrimary"
            _hover={{ bg: 'myGray.50' }}
            border={'none'}
            boxShadow={'0 4px 5px rgba(19, 51, 107, 0.20), 0 0 0.5px rgba(19, 51, 107, 0.50)'}
            onClick={() => setKeyword('')}
            {...props}
          />
        </MyTooltip>
      </Box>
    );
  }

  return (
    <Flex
      position="absolute"
      top={20}
      left="50%"
      transform="translateX(-50%)"
      pl={5}
      pr={4}
      py={4}
      zIndex={1}
      borderRadius={'lg'}
      bg={'white'}
      alignItems={'center'}
      boxShadow={
        '0px 20px 24px -8px rgba(19, 51, 107, 0.15), 0px 0px 1px 0px rgba(19, 51, 107, 0.15)'
      }
      border={'0.5px solid rgba(0, 0, 0, 0.13)'}
      maxW={['90vw', '550px']}
      w={'100%'}
    >
      <Input
        flex="1 0 0"
        h={8}
        border={'none'}
        px={0}
        _focus={{
          border: 'none',
          boxShadow: 'none'
        }}
        fontSize={'16px'}
        value={keyword}
        placeholder={t('workflow:please_enter_node_name')}
        autoFocus
        onFocus={onSearch}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            goToNextMatch();
          }
        }}
      />

      <Box fontSize="sm" color="myGray.600" whiteSpace={'nowrap'} userSelect={'none'}>
        {searchedNodeCount > 0
          ? `${searchIndex + 1} / ${searchedNodeCount}`
          : t('workflow:no_match_node')}
      </Box>

      {/* Border */}
      <Box h={5} w={'1px'} bg={'myGray.250'} ml={3} mr={2} />

      <Button
        size="xs"
        variant="grayGhost"
        px={2}
        isDisabled={searchedNodeCount <= 1}
        onClick={goToPreviousMatch}
      >
        {t('workflow:previous')}
      </Button>
      <Button
        size="xs"
        variant="grayGhost"
        px={2}
        isDisabled={searchedNodeCount <= 1}
        onClick={goToNextMatch}
      >
        {t('workflow:next')}
      </Button>

      <Flex
        ml={2}
        borderRadius="sm"
        _hover={{ bg: 'myGray.100' }}
        p={'1'}
        cursor="pointer"
        onClick={clearSearch}
      >
        <MyIcon name="common/closeLight" w="1.2rem" />
      </Flex>
    </Flex>
  );
};

export default React.memo(SearchButton);
