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
  ModalHeader,
  useDisclosure,
  useBreakpointValue
} from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../hooks';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';
import { codeLight } from '../CodeLight';

const StyledButton = ({
  label,
  iconName,
  onClick,
  isActive,
  viewMode
}: {
  label: string;
  iconName: IconNameType;
  onClick: () => void;
  isActive?: boolean;
  viewMode: 'source' | 'iframe';
}) => {
  const Color =
    viewMode === 'iframe'
      ? isActive
        ? 'myGray.900'
        : 'myGray.500'
      : isActive
        ? '#FFF'
        : 'rgba(255, 255, 255, 0.8)';

  return (
    <Button
      bg={
        viewMode === 'iframe'
          ? isActive
            ? 'myGray.100'
            : 'rgba(251, 251, 252)'
          : isActive
            ? 'myGray.700'
            : 'myGray.800'
      }
      color={Color}
      borderRadius="5px"
      boxShadow="none"
      _hover={{
        bg:
          viewMode === 'iframe'
            ? isActive
              ? 'myGray.100'
              : 'myGray.50'
            : isActive
              ? 'myGray.600'
              : 'myGray.600'
      }}
      onClick={onClick}
      padding={4}
    >
      <Icon name={iconName} width="14px" height="14px" color={Color} />
      <Box ml={2} fontSize="sm">
        {label}
      </Box>
    </Button>
  );
};

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
  const { width, Ref } = useMarkdownWidth();

  const codeBoxName = useMemo(() => {
    const input = match?.['input'] || '';
    if (!input) return match?.[1]?.toUpperCase();

    const splitInput = input.split('#');
    return splitInput[1] || match?.[1]?.toUpperCase();
  }, [match]);
  const isMobile = width <= 768;

  const iframeHeight = isMobile ? '40vh' : '60vh';

  const fontSize = isMobile ? 'xs' : 'sm';
  const gapping = isMobile ? '2px' : '5px';
  const iconSize = isMobile ? '12px' : '14px';

  if (codeBlock) {
    return (
      <Box
        my={3}
        borderRadius={'md'}
        overflow={'hidden'}
        boxShadow={
          '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
        }
      >
        <Flex
          py={1}
          px={4}
          bg={viewMode === 'iframe' ? 'rgba(251, 251, 252)' : 'myGray.800'}
          color={'white'}
          fontSize={fontSize}
          userSelect={'none'}
          gap={gapping}
          alignItems="center"
        >
          <Box
            flex={1}
            display="flex"
            alignItems="center"
            color={viewMode === 'iframe' ? 'myGray.800' : 'rgba(255, 255, 255, 0.9)'}
          >
            {codeBoxName}
            <Flex
              cursor="pointer"
              onClick={() => copyData(String(children))}
              alignItems="center"
              ml={2}
            >
              <Icon name="copy" width={iconSize} height={iconSize} />
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
          <Box w={width} ref={Ref} h={iframeHeight}>
            <iframe
              srcDoc={String(children)}
              sandbox=""
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'myWhite'
              }}
            />
          </Box>
        )}
        <Modal isOpen={isOpen} onClose={onClose} size="full">
          <ModalOverlay />
          <ModalContent h={'100vh'} display={'flex'} flexDirection={'column'}>
            <ModalHeader
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              p={4}
              bg="white"
              borderBottom="1px solid"
              borderColor="gray.300"
              height="60px"
            >
              <Box fontSize="18px" color="myGray.900">
                {t('common:common.FullScreenLight')}
              </Box>
              <CloseIcon onClick={onClose} />
            </ModalHeader>

            <ModalBody p={0} flex="1">
              <iframe
                srcDoc={String(children)}
                sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: 'myWhite'
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
