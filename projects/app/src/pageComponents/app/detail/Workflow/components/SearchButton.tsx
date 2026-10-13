import React, { useState, useCallback } from 'react';
import { Box, Flex, Button, IconButton, type ButtonProps, Input, Portal } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../WorkflowComponents/context/workflowInitContext';
import { useReactFlow } from 'reactflow';
import { useKeyPress, useThrottleEffect } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import WorkflowToolbarTooltip from '../../WorkflowComponents/WorkflowBuilder/WorkflowToolbarTooltip';

type SearchButtonProps = ButtonProps & {
  inToolbar?: boolean;
  portalContainerRef?: React.RefObject<HTMLElement | null>;
};

const SearchButton = ({ inToolbar = false, portalContainerRef, ...props }: SearchButtonProps) => {
  const { t } = useTranslation();
  const setNodes = useContextSelector(WorkflowBufferDataContext, (state) => state.setNodes);
  const { fitView } = useReactFlow();
  const { isMac } = useSystem();

  const [keyword, setKeyword] = useState<string>();
  const [searchIndex, setSearchIndex] = useState<number>(0);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);
  const isSearchOpen = keyword !== undefined;

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

  const onSearch = useCallback(() => {
    setNodes((nodes) => {
      if (!keyword) {
        setSearchIndex(0);
        setSearchedNodeCount(0);
        return nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            searchedText: undefined
          }
        }));
      }

      const searchResult = nodes.filter((node) => {
        return node.data.name.toLowerCase().includes(keyword.toLowerCase());
      });

      if (searchResult.length === 0) {
        return nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            searchedText: undefined
          }
        }));
      }

      setSearchedNodeCount(searchResult.length);

      const searchedNode = searchResult[searchIndex] ?? searchResult[0];

      if (searchedNode) {
        fitView({ nodes: [searchedNode], padding: 0.6 });
      }

      return nodes.map((node) => ({
        ...node,
        selected: node.id === searchedNode.id,
        data: {
          ...node.data,
          searchedText: searchResult.find((item) => item.id === node.id) ? keyword : undefined
        }
      }));
    });
  }, [fitView, keyword, searchIndex, setNodes]);

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
