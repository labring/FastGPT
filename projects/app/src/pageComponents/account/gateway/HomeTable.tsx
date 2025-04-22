import React, { useState } from 'react';
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
  Button,
  FormControl,
  FormLabel,
  Textarea,
  Link,
  HStack,
  Center,
  useTheme,
  Wrap,
  WrapItem,
  useBreakpointValue
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const HomeTable = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  // 状态
  const [status, setStatus] = useState('enabled');

  // 可用工具
  const [tools, setTools] = useState([]);

  // slogan和提示文字
  const [slogan, setSlogan] = useState('你好👋，我是 FastGPT！请问有什么可以帮你?');
  const [placeholderText, setPlaceholderText] = useState('你可以问我任何问题');

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
            状态
          </FormLabel>
          <RadioGroup onChange={setStatus} value={status}>
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={spacing.md}>
              <Flex
                alignItems="center"
                p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                borderWidth="1px"
                borderColor={status === 'enabled' ? 'primary.500' : 'myGray.200'}
                borderRadius="7px"
                bg={status === 'enabled' ? 'blue.50' : 'white'}
              >
                <Radio value="enabled" colorScheme="blue" mr={2}>
                  <Text
                    fontSize={formStyles.fontSize}
                    lineHeight={formStyles.lineHeight}
                    fontWeight={formStyles.fontWeight}
                    letterSpacing={formStyles.letterSpacing}
                  >
                    启用
                  </Text>
                </Radio>
              </Flex>
              <Flex
                alignItems="center"
                p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                borderWidth="1px"
                borderColor={status === 'disabled' ? 'primary.500' : 'myGray.200'}
                borderRadius="7px"
                bg={status === 'disabled' ? 'blue.50' : 'white'}
              >
                <Radio value="disabled" colorScheme="blue" mr={2}>
                  <Text
                    fontSize={formStyles.fontSize}
                    lineHeight={formStyles.lineHeight}
                    fontWeight={formStyles.fontWeight}
                    letterSpacing={formStyles.letterSpacing}
                  >
                    关闭
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
              可用工具
            </FormLabel>
          </Flex>
          <CheckboxGroup
            colorScheme="blue"
            value={tools}
            onChange={(val) => setTools(val as string[])}
          >
            <Wrap spacing={toolsSpacing}>
              {[
                { value: 'webSearch', label: '联网搜索' },
                { value: 'deepThinking', label: '深度思考' },
                { value: 'fileUpload', label: '文档上传' },
                { value: 'imageUpload', label: '图片上传' },
                { value: 'voiceInput', label: '语音输入' }
              ].map((item) => (
                <WrapItem key={item.value}>
                  <Flex
                    p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                    borderWidth="1px"
                    borderColor={tools.includes(item.value) ? 'primary.500' : 'myGray.200'}
                    borderRadius="7px"
                    bg={tools.includes(item.value) ? 'blue.50' : 'white'}
                  >
                    <Checkbox
                      value={item.value}
                      colorScheme="blue"
                      isChecked={tools.includes(item.value)}
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
              slogan
            </Text>
            <Link
              color="primary.500"
              fontSize={formStyles.fontSize}
              fontWeight={formStyles.fontWeight}
              textDecoration="underline"
            >
              示意图
            </Link>
          </Flex>
          <Input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="设置AI助手的欢迎语"
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
              对话框提示文字
            </Text>
            <Link
              color="primary.500"
              fontSize={formStyles.fontSize}
              fontWeight={formStyles.fontWeight}
              textDecoration="underline"
            >
              示意图
            </Link>
          </Flex>
          <Input
            value={placeholderText}
            onChange={(e) => setPlaceholderText(e.target.value)}
            placeholder="设置对话框的提示文字"
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
