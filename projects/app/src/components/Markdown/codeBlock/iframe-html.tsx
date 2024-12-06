import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  Box,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalHeader,
  useDisclosure,
  ModalCloseButton
} from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../hooks';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';
import { codeLight } from '../CodeLight';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const StyledButton = ({
  label,
  iconName,
  onClick,
  isActive,
  viewMode,
  isMobile
}: {
  label: string;
  iconName: IconNameType;
  onClick: () => void;
  isActive?: boolean;
  viewMode: 'source' | 'iframe';
  isMobile?: boolean;
}) => {
  const isPreview = viewMode === 'iframe';

  const textColor = isPreview
    ? isActive
      ? 'myGray.900'
      : 'myGray.500'
    : isActive
      ? '#FFF'
      : 'rgba(255, 255, 255, 0.8)';
  const bg = isPreview ? (isActive ? 'myGray.150' : '') : isActive ? '#333A47' : '';
  const hoverBg = isPreview ? 'myGray.150' : '#333A47';

  return (
    <Flex
      bg={bg}
      color={textColor}
      borderRadius="5px"
      boxShadow="none"
      fontWeight={isActive ? 500 : 400}
      _hover={{
        bg: hoverBg
      }}
      alignItems="center"
      justifyContent="center"
      onClick={onClick}
      cursor="pointer"
      px={isMobile ? '6px' : '8px'}
      h={isMobile ? '24px' : '28px'}
    >
      {isMobile ? (
        <MyTooltip label={label} placement="bottom" hasArrow>
          <Flex alignItems="center" justifyContent="center">
            <Icon name={iconName} width="14px" height="14px" />
          </Flex>
        </MyTooltip>
      ) : (
        <Flex alignItems="center" justifyContent="flex-start">
          <Icon name={iconName} width="14px" height="14px" />
          <Box ml={2} fontSize="sm">
            {label}
          </Box>
        </Flex>
      )}
    </Flex>
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
  const isPreview = viewMode === 'iframe';

  const { isOpen, onOpen, onClose } = useDisclosure();

  const { width, Ref } = useMarkdownWidth();
  const isMobile = width <= 420;

  const codeBoxName = useMemo(() => {
    const input = match?.['input'] || '';
    if (!input) return match?.[1]?.toUpperCase();

    const splitInput = input.split('#');
    return splitInput[1] || match?.[1]?.toUpperCase();
  }, [match]);

  const Iframe = useMemo(
    () => (
      <iframe
        srcDoc={String(children)}
        sandbox=""
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'white'
        }}
      />
    ),
    [children]
  );

  if (codeBlock) {
    return (
      <Box
        ref={Ref}
        my={3}
        borderRadius={'md'}
        overflow={'hidden'}
        boxShadow={
          '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
        }
      >
        <Flex
          py={2}
          px={4}
          color={'white'}
          userSelect={'none'}
          alignItems="center"
          fontSize={'sm'}
          gap={1.5}
          {...(isPreview
            ? {
                borderBottom: '1px solid',
                borderColor: 'gray.150',
                bg: 'myGray.25'
              }
            : {
                bg: 'myGray.800'
              })}
        >
          <Box
            flex={1}
            display="flex"
            alignItems="center"
            color={isPreview ? 'myGray.800' : 'rgba(255, 255, 255, 0.9)'}
          >
            {codeBoxName}
            <Flex
              cursor="pointer"
              onClick={() => copyData(String(children))}
              alignItems="center"
              ml={2}
            >
              <Icon name="copy" width="14px" />
            </Flex>
          </Box>
          <StyledButton
            label={t('common:common.Code')}
            iconName="code"
            onClick={() => setViewMode('source')}
            isActive={viewMode === 'source'}
            viewMode={viewMode}
            isMobile={isMobile}
          />
          <StyledButton
            label={t('common:common.Preview')}
            iconName="preview"
            onClick={() => setViewMode('iframe')}
            isActive={viewMode === 'iframe'}
            viewMode={viewMode}
            isMobile={isMobile}
          />
          <StyledButton
            label={t('common:common.FullScreen')}
            iconName="fullScreen"
            onClick={onOpen}
            viewMode={viewMode}
            isMobile={isMobile}
          />
        </Flex>
        {isPreview ? (
          <Box w={width} h="60vh">
            {Iframe}
          </Box>
        ) : (
          <SyntaxHighlighter style={codeLight as any} language={match?.[1]} PreTag="pre">
            {String(children).replace(/&nbsp;/g, ' ')}
          </SyntaxHighlighter>
        )}

        {isOpen && (
          <Modal onClose={onClose} isOpen size={'full'}>
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
                <Box fontSize="lg" color="myGray.900">
                  {t('common:common.FullScreenLight')}
                </Box>
                <ModalCloseButton zIndex={1} position={'relative'} top={0} right={0} />
              </ModalHeader>

              <ModalBody p={0} flex="1">
                {Iframe}
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
