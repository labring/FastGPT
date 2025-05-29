import React, { useState, useCallback, useEffect } from 'react';
import { Box, Flex, Button, IconButton, type ButtonProps, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowNodeEdgeContext } from '../../WorkflowComponents/context/workflowInitContext';
import { useReactFlow } from 'reactflow';
import { useKeyPress } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const SearchButton = (props: ButtonProps) => {
  const { t } = useTranslation();
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (state) => state.setNodes);
  const { fitView } = useReactFlow();

  const [keyword, setKeyword] = useState<string | null>(null);
  const [searchIndex, setSearchIndex] = useState<number | null>(null);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);

  const isMac =
    typeof window !== 'undefined' && window.navigator.userAgent.toLocaleLowerCase().includes('mac');

  useKeyPress(['ctrl.f', 'meta.f'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    setKeyword('');
  });

  useEffect(() => {
    setNodes((nodes) => {
      if (!keyword) {
        setSearchIndex(null);
        setSearchedNodeCount(0);
        return nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            searched: false
          }
        }));
      }

      const searchResult = nodes.filter((node) => {
        const nodeName = t(node.data.name as any);
        return nodeName.toLowerCase().includes(keyword.toLowerCase());
      });

      setSearchedNodeCount(searchResult.length);

      const searchedNode = (() => {
        if (searchIndex === null) {
          return null;
        }
        if (searchResult.length === 0 || searchIndex >= searchResult.length) {
          return null;
        }
        return searchResult[searchIndex];
      })();

      if (searchedNode) {
        fitView({ nodes: [searchedNode], padding: 0.4 });
      }

      return nodes.map((node) => ({
        ...node,
        selected: node.id === searchedNode?.id,
        data: {
          ...node.data,
          searched: searchResult.map((item) => item.id).includes(node.id)
        }
      }));
    });
  }, [fitView, keyword, searchIndex, setNodes, t]);

  const clearSearch = useCallback(() => {
    setKeyword(null);
    setSearchIndex(0);
    setSearchedNodeCount(0);
  }, []);

  const goToNextMatch = useCallback(() => {
    if (
      searchIndex === searchedNodeCount - 1 ||
      (searchedNodeCount !== 0 && searchIndex === null)
    ) {
      setSearchIndex(0);
    } else if (searchedNodeCount !== 0 && searchIndex !== null) {
      setSearchIndex(searchIndex + 1);
    }
  }, [searchIndex, searchedNodeCount]);

  const goToPreviousMatch = useCallback(() => {
    if (searchIndex === 0) return;
    if (searchIndex !== null) {
      setSearchIndex(searchIndex - 1);
    } else {
      setSearchIndex(searchedNodeCount - 1);
    }
  }, [searchIndex, searchedNodeCount]);

  if (keyword === null) {
    return (
      <Box position={'absolute'} top={'72px'} left={6} zIndex={1}>
        <MyTooltip label={isMac ? t('workflow:find_tip_mac') : t('workflow:find_tip')}>
          <IconButton
            icon={<MyIcon name="common/searchLight" w="20px" color={'#8A95A7'} />}
            aria-label=""
            variant="whitePrimary"
            size={'mdSquare'}
            borderRadius={'50%'}
            bg={'white'}
            _hover={{ bg: 'white', borderColor: 'primary.300' }}
            boxShadow={'0px 4px 10px 0px rgba(19, 51, 107, 0.20)'}
            {...props}
            onClick={() => setKeyword('')}
          />
        </MyTooltip>
      </Box>
    );
  }

  return (
    <Flex
      position="absolute"
      top={3}
      left="50%"
      transform="translateX(-50%)"
      pl={5}
      pr={4}
      py={4}
      zIndex={1}
      borderRadius={'16px'}
      bg={'white'}
      alignItems={'center'}
      boxShadow={
        '0px 20px 24px -8px rgba(19, 51, 107, 0.15), 0px 0px 1px 0px rgba(19, 51, 107, 0.15)'
      }
      border={'0.5px solid rgba(0, 0, 0, 0.13)'}
    >
      <Input
        w="400px"
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
        onBlur={() => {
          if (keyword) return;
          clearSearch();
        }}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            goToNextMatch();
          }
        }}
      />

      <Box fontSize="16px" color="myGray.600" whiteSpace={'nowrap'} userSelect={'none'}>
        {`${searchIndex !== null ? searchIndex + 1 : '?'} / ${searchedNodeCount}`}
      </Box>

      <Box h={5} w={'1px'} bg={'myGray.250'} mx={3} />

      <Button
        size="xs"
        variant="ghost"
        isDisabled={searchIndex === 0 || searchedNodeCount === 0}
        onClick={goToPreviousMatch}
      >
        {t('workflow:previous')}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        isDisabled={searchIndex === searchedNodeCount - 1 || searchedNodeCount === 0}
        onClick={goToNextMatch}
      >
        {t('workflow:next')}
      </Button>

      <Flex
        borderRadius="sm"
        _hover={{ bg: 'myGray.50' }}
        p={'7px'}
        cursor="pointer"
        onClick={clearSearch}
      >
        <MyIcon name="common/closeLight" w="18px" />
      </Flex>
    </Flex>
  );
};

export default React.memo(SearchButton);
