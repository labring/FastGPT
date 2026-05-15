import React from 'react';
import { Box, Flex, HStack } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

export type FormInputResultFileItem = {
  name: string;
  url: string;
};

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

const FormInputResult = React.memo(function FormInputResult({
  value
}: {
  value: Record<string, unknown>;
}) {
  return (
    <Flex flexDirection={'column'} gap={3}>
      {Object.entries(value).map(([key, inputValue]) => {
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
              <Markdown source={`~~~json\n${JSON.stringify(inputValue, null, 2)}`} />
            )}
          </Box>
        );
      })}
    </Flex>
  );
});

export default FormInputResult;
