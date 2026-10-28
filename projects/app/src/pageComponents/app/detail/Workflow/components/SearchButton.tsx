import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Flex, Button, IconButton, type ButtonProps, Input, Portal } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useKeyPress, useThrottleEffect } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useWorkflowOverlayActions } from '@/web/core/workflow/editor/session/workflowSession';
import type { ViewOverlayPatch } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useWorkflowSnapshotGetter } from '../../WorkflowComponents/Flow/nodes/render/useWorkflowDocument';
import {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '../../WorkflowComponents/Flow/canvas/workflowCanvasContext';
import WorkflowToolbarTooltip from '../../WorkflowComponents/WorkflowBuilder/presentation/WorkflowToolbarTooltip';

type SearchButtonProps = ButtonProps & {
  inToolbar?: boolean;
  portalContainerRef?: React.RefObject<HTMLElement | null>;
};

const SearchButton = ({ inToolbar = false, portalContainerRef, ...props }: SearchButtonProps) => {
  const { t } = useTranslation();
  // 命中节点读文档一次性算，不建订阅；高亮标记是画布视图数据，写进 host overlay 由投影合并。
  const getWorkflow = useWorkflowSnapshotGetter();
  const patchViewData = useWorkflowOverlayActions();
  const focusNodes = useWorkflowCanvasValue((v) => v.focusNodes);
  const selectNodes = useWorkflowCanvasRendererValue((v) => v.selectNodes);
  const { isMac } = useSystem();

  const [keyword, setKeyword] = useState<string>();
  const [searchIndex, setSearchIndex] = useState<number>(0);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);
  const isSearchOpen = keyword !== undefined;
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 上一轮写过标记的节点：只提交增量，避免每次按键都让全画布 overlay 变更并重投影。
  const markedNodeIdsRef = useRef<string[]>([]);
  const fittedSearchTargetRef = useRef<string>();

  useEffect(() => {
    if (!isSearchOpen) return;

    const frame = requestAnimationFrame(() =>
      searchInputRef.current?.focus({ preventScroll: true })
    );
    return () => cancelAnimationFrame(frame);
  }, [isSearchOpen]);

  useKeyPress(['ctrl.f', 'meta.f'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    setKeyword('');
    searchInputRef.current?.focus({ preventScroll: true });
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
    const fitTargetKey = `${keyword}:${searchIndex}:${activeNodeId}`;
    if (fittedSearchTargetRef.current !== fitTargetKey) {
      fittedSearchTargetRef.current = fitTargetKey;
      focusNodes([activeNodeId], { padding: 0.6, minZoom: 0.6 });
    }
    selectNodes([activeNodeId]);
  }, [focusNodes, getWorkflow, keyword, patchViewData, searchIndex, selectNodes]);

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

  const trigger = (
    <WorkflowToolbarTooltip label={isMac ? t('workflow:find_tip_mac') : t('workflow:find_tip')}>
      <IconButton
        icon={<MyIcon name="core/app/workflowToolbarSearch" boxSize={'18px'} color={'#485264'} />}
        w={8}
        minW={8}
        h={8}
        p={'7px'}
        borderRadius={'6px'}
        aria-label={t('workflow:please_enter_node_name')}
        variant="unstyled"
        bg={isSearchOpen ? 'myGray.50' : 'transparent'}
        _hover={{ bg: 'myGray.50' }}
        onClick={isSearchOpen ? clearSearch : () => setKeyword('')}
        {...props}
      />
    </WorkflowToolbarTooltip>
  );

  if (!isSearchOpen) {
    if (inToolbar) return trigger;
    return (
      <Box position={'absolute'} top={'176px'} left={6} zIndex={1}>
        {trigger}
      </Box>
    );
  }

  const searchPanel = (
    <Flex
      position="absolute"
      top={20}
      left="50%"
      transform="translateX(-50%)"
      pl={5}
      pr={4}
      py={4}
      zIndex={330}
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
        ref={searchInputRef}
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

  return inToolbar && portalContainerRef ? (
    <>
      {trigger}
      <Portal containerRef={portalContainerRef}>{searchPanel}</Portal>
    </>
  ) : (
    searchPanel
  );
};

export default React.memo(SearchButton);
