import React from 'react';
import { useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import Markdown from '@/components/Markdown';

export default function MarkdownModal(props: { children: React.ReactElement; source: string }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { children, source } = props;

  return (
    <>
      {children &&
        React.cloneElement(children, {
          onClick: (e: any) => {
            e.stopPropagation();
            onOpen();
          }
        })}

      <MyModal isOpen={isOpen} onClose={onClose} title={'配置介绍'}>
        <Markdown source={source} />
      </MyModal>
    </>
  );
}
