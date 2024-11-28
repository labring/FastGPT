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
  useDisclosure
} from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../hooks';
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
  iconName: IconNameType;
  onClick: () => void;
  isActive?: boolean;
  viewMode: 'source' | 'iframe';
}) => (
  <Button
    bg={
      viewMode === 'iframe'
        ? isActive
          ? 'myGray.100'
          : 'rgba(255, 255, 255, 0.9)'
        : isActive
          ? 'myGray.700'
          : 'myGray.800'
    }
    color={viewMode === 'iframe' ? 'myGray.800' : 'rgba(255, 255, 255, 0.8)'}
    px={4}
    py={2}
    borderRadius="5px"
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
    ml={2}
  >
    <Icon name={iconName} width={'15px'} height={'15px'} />
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
  const { width, Ref } = useMarkdownWidth();

  const codeBoxName = useMemo(() => {
    const input = match?.['input'] || '';
    if (!input) return match?.[1]?.toUpperCase();

    const splitInput = input.split('#');
    return splitInput[1] || match?.[1]?.toUpperCase();
  }, [match]);

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
          bg={viewMode === 'iframe' ? 'rgba(255, 255, 255, 0.8)' : 'myGray.800'}
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
            color={viewMode === 'iframe' ? 'myGray.800' : 'rgba(255, 255, 255, 0.9)'}
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
          <Box w={width} ref={Ref} h="60vh">
            <iframe
              srcDoc={String(children)}
              sandbox=""
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
            />
          </Box>
        )}

        {isOpen && (
          <Modal isOpen onClose={onClose} size="full">
            <ModalOverlay />
            <ModalContent>
              <ModalHeader
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                p={4}
                bg="white"
                borderBottom="1px solid myGray.200"
                height="60px"
              >
                <Box fontSize="18px" color="myGray.900">
                  {t('common:common.FullScreenLight')}
                </Box>
                <Box onClick={onClose} cursor="pointer" fontSize="lg" color="myGray.900">
                  <Icon name="common/closeLight" width="20px" height="20px" />
                </Box>
              </ModalHeader>

              <ModalBody p={0}>
                <Flex direction="column" h="calc(100vh - 60px)">
                  <iframe
                    srcDoc={String(children)}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    style={{
                      flex: 1,
                      width: '100%',
                      border: 'none',
                      background: 'myWhite'
                    }}
                  />
                </Flex>
              </ModalBody>
            </ModalContent>
          </Modal>
        )}
      </Box>
    );
  }

  return <code className={className}>{children}</code>;
};

export default React.memo(IframeHtmlCodeBlock);
