import React, { useState, useCallback } from 'react';
import { Box, Flex, Button, IconButton, type ButtonProps, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useReactFlow, type Node } from '@xyflow/react';
import { useKeyPress, useThrottleEffect } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const SearchButton = (props: ButtonProps) => {
  const { t } = useTranslation();
  const { fitView, getNodes, setNodes } = useReactFlow<Node<FlowNodeItemType>>();
  const { isMac } = useSystem();

  const [keyword, setKeyword] = useState<string>();
  const [searchIndex, setSearchIndex] = useState<number>(0);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);

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
    const nodes = getNodes();

    if (!keyword) {
      setSearchIndex(0);
      setSearchedNodeCount(0);
      setNodes((nds) => {
        let changed = false;
        const nextNodes = nds.map((node) => {
          if (node.data.searchedText) {
            changed = true;
            return {
              ...node,
              data: {
                ...node.data,
                searchedText: undefined
              }
            };
          }
          return node;
        });
        return changed ? nextNodes : nds;
      });
      return;
    }

    const searchResult = nodes.filter((node) => {
      return node.data.name.toLowerCase().includes(keyword.toLowerCase());
    });

    if (searchResult.length === 0) {
      setSearchedNodeCount(0);
      setNodes((nds) => {
        let changed = false;
        const nextNodes = nds.map((node) => {
          if (node.data.searchedText) {
            changed = true;
            return {
              ...node,
              data: {
                ...node.data,
                searchedText: undefined
              }
            };
          }
          return node;
        });
        return changed ? nextNodes : nds;
      });
      return;
    }

    setSearchedNodeCount(searchResult.length);
    const searchedNode = searchResult[searchIndex] ?? searchResult[0];
    const matchingIdSet = new Set(searchResult.map((item) => item.id));

    setNodes((nds) =>
      nds.map((node) => {
        const isMatch = matchingIdSet.has(node.id);
        const shouldSelect = node.id === searchedNode.id;
        const currentSearched = node.data.searchedText;
        const targetSearched = isMatch ? keyword : undefined;

        if (node.selected === shouldSelect && currentSearched === targetSearched) {
          return node;
        }

        return {
          ...node,
          selected: shouldSelect,
          data: {
            ...node.data,
            searchedText: targetSearched
          }
        };
      })
    );

    if (searchedNode) {
      fitView({
        nodes: [{ id: searchedNode.id }],
        includeHiddenNodes: true,
        padding: 0.6,
        minZoom: 0.7,
        maxZoom: 1
      });
    }
  }, [fitView, getNodes, keyword, searchIndex, setNodes]);

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
