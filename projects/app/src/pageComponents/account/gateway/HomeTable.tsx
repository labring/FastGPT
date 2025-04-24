import React from 'react';
import {
  Box,
  Flex,
  Text,
  Radio,
  RadioGroup,
  Checkbox,
  CheckboxGroup,
  Stack,
  Input,
  FormControl,
  FormLabel,
  Link,
  useTheme,
  Wrap,
  WrapItem,
  useBreakpointValue
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { GateTool } from '@fastgpt/global/support/user/team/gate/type';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type Props = {
  tools: GateTool[];
  setTools: (tools: GateTool[]) => void;
  slogan: string;
  setSlogan: (slogan: string) => void;
  placeholderText: string;
  setPlaceholderText: (text: string) => void;
  status: boolean;
  setStatus: (status: boolean) => void;
};

const HomeTable = ({
  tools,
  setTools,
  slogan,
  setSlogan,
  placeholderText,
  setPlaceholderText,
  status,
  setStatus
}: Props) => {
  const { t } = useTranslation();
  const theme = useTheme();

  // 通用样式变量
  const spacing = {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px'
  };

  const formStyles = {
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: '500',
    letterSpacing: '0.1px'
  };

  const inputStyles = {
    padding: '10px 12px',
    height: '40px',
    fontSize: '14px',
    lineHeight: '20px',
    letterSpacing: '0.25px'
  };

  // 响应式工具布局
  const toolsSpacing = useBreakpointValue({ base: '6px', md: spacing.md });

  return (
    <Box flex="1 0 0" overflow="auto" px={spacing.sm}>
      <Flex
        flexDirection="column"
        alignItems="center"
        gap={spacing.xl}
        maxW="640px"
        mx="auto"
        pb={6}
        pt={{ base: 4, md: 6 }}
      >
        {/* 状态选择 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <FormLabel
            fontWeight={formStyles.fontWeight}
            fontSize={formStyles.fontSize}
            lineHeight={formStyles.lineHeight}
            letterSpacing={formStyles.letterSpacing}
            color="myGray.700"
            mb="0"
          >
            {t('account_gate:status')}
          </FormLabel>
          <RadioGroup
            value={status ? 'enabled' : 'disabled'}
            onChange={(val) => setStatus(val === 'enabled')}
          >
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={spacing.md}>
              <Flex
                alignItems="center"
                p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                borderWidth="1px"
                borderColor={status ? 'primary.500' : 'myGray.200'}
                borderRadius="7px"
                bg={status ? 'blue.50' : 'white'}
                transition="all 0.2s ease-in-out"
                _hover={{
                  bg: status ? 'blue.100' : 'myGray.50',
                  borderColor: status ? 'primary.600' : 'myGray.300',
                  boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
                  transform: 'translateY(-1px)'
                }}
              >
                <Radio value="enabled" colorScheme="blue" mr={2}>
                  <Text
                    fontSize={formStyles.fontSize}
                    lineHeight={formStyles.lineHeight}
                    fontWeight={formStyles.fontWeight}
                    letterSpacing={formStyles.letterSpacing}
                  >
                    {t('account_gate:enabled')}
                  </Text>
                </Radio>
              </Flex>
              <Flex
                alignItems="center"
                p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                borderWidth="1px"
                borderColor={!status ? 'primary.500' : 'myGray.200'}
                borderRadius="7px"
                bg={!status ? 'blue.50' : 'white'}
                transition="all 0.2s ease-in-out"
                _hover={{
                  bg: !status ? 'blue.100' : 'myGray.50',
                  borderColor: !status ? 'primary.600' : 'myGray.300',
                  boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
                  transform: 'translateY(-1px)'
                }}
              >
                <Radio value="disabled" colorScheme="blue" mr={2}>
                  <Text
                    fontSize={formStyles.fontSize}
                    lineHeight={formStyles.lineHeight}
                    fontWeight={formStyles.fontWeight}
                    letterSpacing={formStyles.letterSpacing}
                  >
                    {t('account_gate:disabled')}
                  </Text>
                </Radio>
              </Flex>
            </Stack>
          </RadioGroup>
        </FormControl>

        {/* 可用工具 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <Flex gap={spacing.xs}>
            <FormLabel
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
              mb="0"
            >
              {t('account_gate:available_tools')}
            </FormLabel>
            <QuestionTip />
          </Flex>
          <CheckboxGroup
            colorScheme="blue"
            value={tools}
            onChange={(val) => setTools(val as GateTool[])}
          >
            <Wrap spacing={toolsSpacing}>
              {[
                { value: 'webSearch', label: t('account_gate:web_search') },
                { value: 'deepThinking', label: t('account_gate:deep_thinking') },
                { value: 'fileUpload', label: t('account_gate:file_upload') },
                { value: 'imageUpload', label: t('account_gate:image_upload') },
                { value: 'voiceInput', label: t('account_gate:voice_input') }
              ].map((item) => (
                <WrapItem key={item.value}>
                  <Flex
                    p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                    borderWidth="1px"
                    borderColor={
                      tools.includes(item.value as GateTool) ? 'primary.500' : 'myGray.200'
                    }
                    borderRadius="7px"
                    bg={tools.includes(item.value as GateTool) ? 'blue.50' : 'white'}
                    transition="all 0.2s ease-in-out"
                    _hover={{
                      bg: tools.includes(item.value as GateTool) ? 'blue.100' : 'myGray.50',
                      borderColor: tools.includes(item.value as GateTool)
                        ? 'primary.600'
                        : 'myGray.300',
                      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
                      transform: 'translateY(-1px)'
                    }}
                  >
                    <Checkbox
                      value={item.value}
                      colorScheme="blue"
                      isChecked={tools.includes(item.value as GateTool)}
                    >
                      <Text
                        fontSize={formStyles.fontSize}
                        lineHeight={formStyles.lineHeight}
                        fontWeight={formStyles.fontWeight}
                        letterSpacing={formStyles.letterSpacing}
                      >
                        {item.label}
                      </Text>
                    </Checkbox>
                  </Flex>
                </WrapItem>
              ))}
            </Wrap>
          </CheckboxGroup>
        </FormControl>

        {/* slogan设置 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <Flex alignItems="center" gap={spacing.xs}>
            <Text
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
            >
              {t('account_gate:slogan')}
            </Text>
            <Link
              color="primary.500"
              fontSize={formStyles.fontSize}
              fontWeight={formStyles.fontWeight}
              textDecoration="underline"
            >
              {t('account_gate:example')}
            </Link>
          </Flex>
          <Input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            bg="myGray.50"
            borderWidth="1px"
            borderColor="myGray.200"
            borderRadius="8px"
            p={inputStyles.padding}
            h={inputStyles.height}
            fontSize={inputStyles.fontSize}
            lineHeight={inputStyles.lineHeight}
            letterSpacing={inputStyles.letterSpacing}
            color="gray.900"
          />
        </FormControl>

        {/* 对话提示文字 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <Flex alignItems="center" gap={spacing.xs}>
            <Text
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
            >
              {t('account_gate:dialog_prompt_text')}
            </Text>
            <Link
              color="primary.500"
              fontSize={formStyles.fontSize}
              fontWeight={formStyles.fontWeight}
              textDecoration="underline"
            >
              {t('account_gate:example')}
            </Link>
          </Flex>
          <Input
            value={placeholderText}
            onChange={(e) => setPlaceholderText(e.target.value)}
            bg="myGray.50"
            borderWidth="1px"
            borderColor="myGray.200"
            borderRadius="8px"
            p={inputStyles.padding}
            h={inputStyles.height}
            fontSize={inputStyles.fontSize}
            lineHeight={inputStyles.lineHeight}
            letterSpacing={inputStyles.letterSpacing}
            color="gray.900"
          />
        </FormControl>
      </Flex>
    </Box>
  );
};

export default HomeTable;
