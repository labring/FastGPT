import React from 'react';
import { Box, Flex, HStack } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

/**
 * 表单输入结果中的单个文件项。
 * 工作流 `formInputResult` 里 fileSelect 字段可能存 URL 字符串或 `{ name, url }` 对象，
 * 归一化后统一为该结构，便于 UI 展示与跨模块复用（流恢复回填、响应详情等）。
 */
export type FormInputResultFileItem = {
  name: string;
  url: string;
};

/**
 * 从文件下载 URL 中解析展示用文件名。
 *
 * FastGPT 签名下载链接通常把真实文件名放在 `filename` query 中（见
 * `/api/system/file/download/token?filename=...`），path 段往往只是 token，不可读。
 * 解析优先级：query `filename` > URL path 最后一段 > 原 URL 字符串。
 *
 * @param url - 文件下载地址；非法 URL 时直接返回入参，避免展示层抛错。
 */
export const getFilenameFromFormInputFileUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    const filename = parsedUrl.searchParams.get('filename');
    if (filename) return filename;

    const pathname = parsedUrl.pathname.split('/').pop();
    return pathname ? decodeURIComponent(pathname) : url;
  } catch {
    return url;
  }
};

/**
 * 将 `formInputResult` 中单条文件值归一化为 `{ name, url }`。
 *
 * 兼容两种历史/并存形态：
 * - `string`：仅存下载 URL，文件名由 {@link getFilenameFromFormInputFileUrl} 推导；
 * - `{ name?, url }`：显式 name 优先，缺失时同样从 URL 推导。
 *
 * 无效输入（空字符串、非对象、缺少 url）返回 `undefined`，便于调用方 `.filter(Boolean)` 过滤。
 * 该函数被流恢复（`ChatBox/utils`）、表单交互回填（`RenderUserFormInteractive`）等多处复用。
 */
export const normalizeFormInputResultFile = (
  value: unknown
): FormInputResultFileItem | undefined => {
  if (typeof value === 'string') {
    if (!value) return;
    return {
      name: getFilenameFromFormInputFileUrl(value),
      url: value
    };
  }

  if (!value || typeof value !== 'object') return;

  const file = value as Record<string, unknown>;
  const url = typeof file.url === 'string' ? file.url : undefined;
  if (!url) return;

  return {
    name:
      typeof file.name === 'string' && file.name ? file.name : getFilenameFromFormInputFileUrl(url),
    url
  };
};

/**
 * 只读展示用户提交的表单输入结果（`formInputResult`）。
 *
 * `value` 为字段 key -> 字段值的映射。每个字段按值类型分支渲染：
 * - 值为文件 URL 数组：渲染可点击的文件 chip（新窗口打开下载链接）；
 * - 其他类型：以 JSON 代码块展示，便于查看文本、数字、嵌套结构等非文件字段。
 *
 * 文件数组元素经 {@link normalizeFormInputResultFile} 归一化，跳过无法识别的项。
 */
const FormInputResult = React.memo(function FormInputResult({
  value
}: {
  value: Record<string, unknown>;
}) {
  return (
    <Flex flexDirection={'column'} gap={3}>
      {Object.entries(value).map(([key, inputValue]) => {
        // 仅当字段值为数组时尝试按文件列表解析；非数组走 JSON 展示分支
        const files = Array.isArray(inputValue)
          ? inputValue
              .map(normalizeFormInputResultFile)
              .filter((file): file is FormInputResultFileItem => Boolean(file))
          : [];

        return (
          <Box key={key}>
            <Box fontSize={'12px'} color={'myGray.900'} fontWeight={500} mb={1}>
              {key}
            </Box>
            {files.length > 0 ? (
              <Flex flexWrap={'wrap'} gap={2}>
                {files.map((file, index) => (
                  <HStack
                    key={`${file.url}-${index}`}
                    bg={'white'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    borderRadius={'sm'}
                    py={1}
                    px={2}
                    maxW={'100%'}
                    cursor={'pointer'}
                    onClick={() => window.open(file.url, '_blank')}
                  >
                    <MyIcon name={getFileIcon(file.name) as any} w={'1rem'} flexShrink={0} />
                    <Box className={'textEllipsis'}>{file.name}</Box>
                  </HStack>
                ))}
              </Flex>
            ) : (
              // 非文件字段或空数组：Markdown JSON 块，保持与聊天消息区一致的代码高亮样式
              <Markdown source={`~~~json\n${JSON.stringify(inputValue, null, 2)}`} />
            )}
          </Box>
        );
      })}
    </Flex>
  );
});

export default FormInputResult;
