import React, { useMemo, useState } from 'react';

import {
  Box,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  TextareaProps,
  useDisclosure
} from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@/components/Icon';
import MyModal from '@/components/MyModal';

type Props = TextareaProps & {
  title?: string;
  showSetModalModeIcon?: boolean;
  // variables: string[];
};

const PromptTextarea = (props: Props) => {
  const { t } = useTranslation();
  const { title = t('core.app.edit.Prompt Editor'), value, ...childProps } = props;

  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Editor {...childProps} value={value} showSetModalModeIcon onSetModalMode={onOpen} />
      {isOpen && (
        <MyModal iconSrc="/imgs/modal/edit.svg" title={title} isOpen onClose={onClose}>
          <ModalBody>
            <Editor
              {...childProps}
              value={value}
              minH={'300px'}
              maxH={'auto'}
              minW={['100%', '512px']}
              showSetModalModeIcon={false}
            />
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>{t('common.Confirm')}</Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default PromptTextarea;

const Editor = React.memo(function Editor({
  showSetModalModeIcon = true,
  onSetModalMode,
  ...props
}: Props & { onSetModalMode?: () => void }) {
  const { t } = useTranslation();

  return (
    <Box h={'100%'} w={'100%'} position={'relative'}>
      <Textarea wordBreak={'break-all'} maxW={'100%'} {...props} />
      {showSetModalModeIcon && (
        <Box
          zIndex={1}
          position={'absolute'}
          bottom={1}
          right={2}
          cursor={'pointer'}
          onClick={onSetModalMode}
        >
          <MyTooltip label={t('common.ui.textarea.Magnifying')}>
            <MyIcon name={'fullScreenLight'} w={'14px'} color={'myGray.600'} />
          </MyTooltip>
        </Box>
      )}
    </Box>
  );
});

const VariableSelectBlock = React.memo(function VariableSelectBlock({
  variables
}: {
  variables: string[];
}) {
  return <></>;
});

const Placeholder = React.memo(function Placeholder({
  placeholder = ''
}: {
  placeholder?: string;
}) {
  return (
    <Box
      zIndex={0}
      userSelect={'none'}
      color={'myGray.400'}
      px={3}
      py={2}
      position={'absolute'}
      top={0}
      right={0}
      bottom={0}
      left={0}
      fontSize={'sm'}
    >
      {placeholder}
    </Box>
  );
});
