/**
 * @file 结构化错误展示组件
 * @description 展示训练任务的结构化错误信息（EnhancedErrorMessage）
 */
import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Box,
  Divider,
  Code,
  Alert,
  AlertIcon,
  AlertDescription
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';

interface EnhancedErrorDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  error: EnhancedErrorMessage;
}

/**
 * 结构化错误展示组件
 */
const EnhancedErrorDisplay: React.FC<EnhancedErrorDisplayProps> = ({ isOpen, onClose, error }) => {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" isCentered>
      <ModalOverlay />
      <ModalContent maxH="90vh">
        <ModalHeader>
          <HStack spacing={2}>
            <MyIcon name="common/errorFill" w="24px" h="24px" color="red.500" />
            <Text>{t('app:training_error_details')}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody overflowY="auto">
          <VStack spacing={4} align="stretch">
            {/* 错误阶段 */}
            {error.stage && (
              <Box>
                <Text fontSize="sm" color="myGray.600" fontWeight="medium" mb={2}>
                  {t('app:error_stage')}
                </Text>
                <Box
                  px={3}
                  py={2}
                  bg="blue.50"
                  borderRadius="md"
                  borderLeft="4px solid"
                  borderColor="blue.400"
                >
                  <Text fontSize="sm" color="myGray.900">
                    {t(`app:checkpoint_stage.${error.stage}`)}
                  </Text>
                </Box>
              </Box>
            )}

            {/* 错误类型 */}
            <Box>
              <Text fontSize="sm" color="myGray.600" fontWeight="medium" mb={2}>
                {t('app:error_type')}
              </Text>
              <Box
                px={3}
                py={2}
                bg="orange.50"
                borderRadius="md"
                borderLeft="4px solid"
                borderColor="orange.400"
              >
                <Text fontSize="sm" color="myGray.900" fontWeight="medium">
                  {error.type}
                </Text>
              </Box>
            </Box>

            {/* 错误信息 */}
            <Box>
              <Text fontSize="sm" color="myGray.600" fontWeight="medium" mb={2}>
                {t('app:error_message')}
              </Text>
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <AlertDescription fontSize="sm">{error.message}</AlertDescription>
              </Alert>
            </Box>

            {/* 解决建议 */}
            {error.suggestion && (
              <>
                <Divider />
                <Box>
                  <Text fontSize="sm" color="myGray.600" fontWeight="medium" mb={2}>
                    {t('app:error_suggestion')}
                  </Text>
                  <Box
                    px={3}
                    py={2}
                    bg="green.50"
                    borderRadius="md"
                    borderLeft="4px solid"
                    borderColor="green.400"
                  >
                    <Text fontSize="sm" color="myGray.900">
                      {error.suggestion}
                    </Text>
                  </Box>
                </Box>
              </>
            )}

            {/* 原始错误（仅开发环境显示） */}
            {error.originalError && process.env.NODE_ENV === 'development' && (
              <>
                <Divider />
                <Box>
                  <Text fontSize="sm" color="myGray.600" fontWeight="medium" mb={2}>
                    {t('app:error_original')} ({t('app:dev_only')})
                  </Text>
                  <Box
                    maxH="200px"
                    overflowY="auto"
                    bg="gray.50"
                    borderRadius="md"
                    p={2}
                    border="1px solid"
                    borderColor="gray.200"
                  >
                    <Code
                      fontSize="xs"
                      whiteSpace="pre-wrap"
                      wordBreak="break-word"
                      bg="transparent"
                      p={0}
                    >
                      {error.originalError}
                    </Code>
                  </Box>
                </Box>
              </>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(EnhancedErrorDisplay);
