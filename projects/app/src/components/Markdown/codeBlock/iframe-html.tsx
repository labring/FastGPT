import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  Box,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  useDisclosure
} from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';
import { codeLight } from '../CodeLight';

const StyledButton = ({
  label,
  iconName,
  onClick,
  isActive,
  viewMode
}: {
  label: string;
  iconName: string;
  onClick: () => void;
  isActive?: boolean;
  viewMode: 'source' | 'iframe';
}) => (
  <Button
    bg={
      viewMode === 'iframe'
        ? isActive
          ? '#F0F1F6'
          : 'rgba(255, 255, 255, 0.9)'
        : isActive
          ? '#333A47'
          : '#232833'
    }
    color={viewMode === 'iframe' ? '#2C2C2E' : 'rgba(255, 255, 255, 0.8)'}
    fontFamily="PingFang SC"
    fontSize="14px"
    fontWeight="500"
    lineHeight="16px"
    letterSpacing="0.5px"
    px={4}
    py={2}
    borderRadius="5px"
    _hover={{
      bg:
        viewMode === 'iframe'
          ? isActive
            ? '#F0F1F6'
            : '#F7F7F7'
          : isActive
            ? '#444B55'
            : '#2C2F3A'
    }}
    alignItems="center"
    justifyContent="center"
    onClick={onClick}
    ml={2}
  >
    <Icon name={iconName as IconNameType} width={'15px'} height={'15px'} />
    <Box ml={2} fontSize="sm">
      {label}
    </Box>
  </Button>
);

const IframeHtmlCodeBlock = ({
  children,
  className,
  codeBlock,
  match
}: {
  children: React.ReactNode & React.ReactNode[];
  className?: string;
  codeBlock?: boolean;
  match: RegExpExecArray | null;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const [viewMode, setViewMode] = useState<'source' | 'iframe'>('source');
  const { isOpen, onOpen, onClose } = useDisclosure();

  if (codeBlock) {
    const codeBoxName = useMemo(() => {
      const input = match?.['input'] || '';
      if (!input) return match?.[1]?.toUpperCase();

      const splitInput = input.split('#');
      return splitInput[1] || match?.[1]?.toUpperCase();
    }, [match]);

    return (
      <Box
        my={3}
        borderRadius={'md'}
        overflow={'overlay'}
        boxShadow={
          '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
        }
      >
        <Flex
          className="code-header"
          py={1}
          px={4}
          bg={viewMode === 'iframe' ? 'rgba(255, 255, 255, 0.8)' : '#232833'}
          color={'white'}
          fontSize={'sm'}
          userSelect={'none'}
          gap="5px"
          alignItems="center"
        >
          <Box
            flex={1}
            display="flex"
            alignItems="center"
            color={viewMode === 'iframe' ? '#2C2C2E' : 'rgba(255, 255, 255, 0.9)'}
          >
            {codeBoxName}
            <Flex
              cursor="pointer"
              onClick={() => copyData(String(children))}
              alignItems="center"
              ml={2}
            >
              <Icon name="copy" width={15} height={15} />
            </Flex>
          </Box>
          <StyledButton
            label={t('common:common.SourceCode')}
            iconName="code"
            onClick={() => setViewMode('source')}
            isActive={viewMode === 'source'}
            viewMode={viewMode}
          />
          <StyledButton
            label={t('common:common.Preview')}
            iconName="preview"
            onClick={() => setViewMode('iframe')}
            isActive={viewMode === 'iframe'}
            viewMode={viewMode}
          />
          <StyledButton
            label={t('common:common.FullScreen')}
            iconName="fullScreen"
            onClick={onOpen}
            viewMode={viewMode}
          />
        </Flex>
        {viewMode === 'source' ? (
          <SyntaxHighlighter style={codeLight as any} language={match?.[1]} PreTag="pre">
            {String(children).replace(/&nbsp;/g, ' ')}
          </SyntaxHighlighter>
        ) : (
          <Box w="100%" h="400px">
            <iframe
              srcDoc={String(children)}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
            />
          </Box>
        )}
        <Modal isOpen={isOpen} onClose={onClose} size="full">
          <ModalOverlay />
          <ModalContent>
            <Flex
              alignItems="center"
              px={5}
              py={2}
              bg="#white"
              borderBottom="1px solid #E0E0E0"
              position="fixed"
              top="0"
              left="0"
              right="0"
              zIndex="1000"
              height="60px"
            >
              <Box flex={1} display="flex" alignItems="center">
                <Box px={4} py={1} color="#24282C" fontSize="18px" display="inline-block">
                  {t('common:common.FullScreenLight')}
                </Box>
              </Box>
              <Box onClick={onClose} cursor="pointer" fontSize="lg" color="white">
                <Icon name="common/closeLight" width="20px" height="20px" color="#24282C" />
              </Box>
            </Flex>

            <ModalBody p={0}>
              <iframe
                srcDoc={String(children)}
                sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                style={{
                  width: '100%',
                  height: '100vh',
                  border: 'none',
                  background: '#fff',
                  paddingTop: '60px',
                  overflowY: 'auto'
                }}
              />
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    );
  }

  return <code className={className}>{children}</code>;
};

export default React.memo(IframeHtmlCodeBlock);
