import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { getDocPath } from '@/web/common/system/doc';
import React, { useCallback, useMemo } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { fetchRemoteMarkdown } from '@fastgpt/web/components/common/Markdown/utils';
import ReadmeBox from '@fastgpt/web/components/core/plugin/tool/ToolDetail/ReadmeBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';

const UseGuideModal = ({
  children,
  title,
  iconSrc,
  text,
  link,
  readmeUrl
}: {
  children: ({ onClick }: { onClick: () => void }) => React.ReactNode;
  title?: string;
  iconSrc?: string;
  text?: string;
  link?: string;
  readmeUrl?: string;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    data: readmeContent = '',
    loading: loadingReadme,
    run: fetchReadme
  } = useRequest(fetchRemoteMarkdown, {
    manual: true,
    errorToast: ''
  });
  const courseUrl = useMemo(() => (link ? getDocPath(link) : undefined), [link]);
  const guideContent = readmeContent || text;
  const titleContent = useMemo(() => {
    if (!iconSrc) return title;

    return (
      <Flex alignItems={'center'} gap={3}>
        <Avatar src={iconSrc} w={'20px'} borderRadius={'sm'} />
        <Box>{title}</Box>
      </Flex>
    );
  }, [iconSrc, title]);

  const onClick = useCallback(() => {
    if (readmeUrl) {
      fetchReadme(readmeUrl);
      return onOpen();
    }
    if (text) {
      return onOpen();
    }
    if (courseUrl) {
      return window.open(courseUrl, '_blank');
    }
  }, [courseUrl, fetchReadme, readmeUrl, text, onOpen]);

  return (
    <>
      {children({ onClick })}
      {isOpen && (
        <MyModal
          isOpen
          isCentered
          size={'lg'}
          title={titleContent}
          onClose={onClose}
          h={['90vh', '80vh']}
          maxH={['90vh', '700px']}
          bodyStyles={{
            px: [5, 8],
            pt: [4, 6],
            pb: [5, 8],
            minH: 0
          }}
        >
          <MyBox isLoading={loadingReadme} minH={0} flex={1} display={'flex'}>
            <ReadmeBox source={guideContent || ''} courseUrl={readmeUrl ? courseUrl : undefined} />
          </MyBox>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(UseGuideModal);
