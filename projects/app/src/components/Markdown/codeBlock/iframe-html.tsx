import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  Box,
  Flex,
  Tooltip,
  IconButton,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalHeader,
  useDisclosure
} from '@chakra-ui/react';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../hooks';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';
import { SmallCloseIcon } from '@chakra-ui/icons';
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
  const buttonPadding = isMobile ? 1 : 4;
  const color =
    viewMode === 'iframe'
      ? isActive
        ? 'myGray.900'
        : 'myGray.500'
      : isActive
        ? '#FFF'
        : 'rgba(255, 255, 255, 0.8)';

  return (
    <Box
      as="button"
      bg={
        viewMode === 'iframe'
          ? isActive
            ? 'myGray.100'
            : 'rgba(251, 251, 252)'
          : isActive
            ? '#333A47'
            : 'myGray.800'
      }
      color={color}
      borderRadius="5px"
      boxShadow="none"
      height={isMobile ? '22px' : '29px'}
      _hover={{
        bg:
          viewMode === 'iframe'
            ? isActive
              ? 'myGray.100'
              : 'myGray.50'
            : isActive
              ? 'myGray.600'
              : '#424957'
      }}
      onClick={onClick}
      padding="4px 8px"
    >
      {isMobile ? (
        <MyTooltip label={label} placement="bottom" hasArrow>
          <Flex alignItems="center" justifyContent="center">
            <Icon name={iconName} width="14px" height="14px" color={color} />
          </Flex>
        </MyTooltip>
      ) : (
        <Flex alignItems="center" justifyContent="flex-start">
          <Icon name={iconName} width="14px" height="14px" color={color} />
          <Box ml={2} fontSize="sm">
            {label}
          </Box>
        </Flex>
      )}
    </Box>
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
  const isMobile = width <= 410;

  const fontSize = isMobile ? 'xs' : 'sm';
  const gapping = isMobile ? '1px' : '5px';

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
              <Icon name="copy" width="14px" height="14px" />
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
              <MyTooltip label={t('common:common.Close')}>
                <IconButton
                  ml={4}
                  icon={<SmallCloseIcon fontSize={'22px'} />}
                  variant={'grayBase'}
                  size={'smSquare'}
                  aria-label={''}
                  onClick={onClose}
                  bg={'none'}
                />
              </MyTooltip>
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
