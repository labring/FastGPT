import { Box, Flex, type TextareaProps } from '@chakra-ui/react';
import React, { useCallback, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ChatFunctionTip from './Tip';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { drawerTextareaStyle } from './configDrawerStyles';

type WelcomeTextConfigProps = TextareaProps & {
  showLabel?: boolean;
  drawerMode?: boolean;
  showFoldButton?: boolean;
  isFolded?: boolean;
  onToggleFold?: () => void;
};

function FoldIconButton({
  isFolded,
  tip,
  onClick
}: {
  isFolded: boolean;
  tip: string;
  onClick: () => void;
}) {
  return (
    <MyTooltip label={tip} shouldWrapChildren={false}>
      <Flex
        role={'button'}
        tabIndex={0}
        aria-label={tip}
        alignItems={'center'}
        justifyContent={'center'}
        w={'24px'}
        h={'24px'}
        minW={'24px'}
        minH={'24px'}
        p={0}
        bg={'transparent'}
        border={'none'}
        color={'#485264'}
        cursor={'pointer'}
        sx={{ userSelect: 'none' }}
        _hover={{ bg: 'transparent' }}
        _focus={{ boxShadow: 'none' }}
        _focusVisible={{ boxShadow: 'none' }}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onClick();
        }}
      >
        <MyIcon name={isFolded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'} w={'24px'} />
      </Flex>
    </MyTooltip>
  );
}

const WelcomeTextConfig = ({
  showLabel = true,
  drawerMode = false,
  showFoldButton = false,
  isFolded,
  onToggleFold,
  onChange,
  value,
  ...props
}: WelcomeTextConfigProps) => {
  const { t } = useTranslation();
  const [internalIsFolded, setInternalIsFolded] = useState(false);
  const resolvedIsFolded = isFolded ?? internalIsFolded;

  const handleToggleFold = useCallback(() => {
    if (onToggleFold) {
      onToggleFold();
      return;
    }
    setInternalIsFolded((state) => !state);
  }, [onToggleFold]);

  if (drawerMode) {
    return (
      <>
        {showLabel && (
          <Flex
            alignItems={'center'}
            justifyContent={'space-between'}
            w={'100%'}
            h={'28px'}
            mb={resolvedIsFolded ? 0 : '8px'}
          >
            <MyIcon name={'core/app/simpleMode/chat'} w={'20px'} flexShrink={0} />
            <FormLabel ml={2} flexShrink={0}>
              {t('common:core.app.Welcome Text')}
            </FormLabel>
            <ChatFunctionTip type={'welcome'} />
            <Box flex={1} />
            <FoldIconButton
              isFolded={resolvedIsFolded}
              tip={t(resolvedIsFolded ? 'workflow:Unfold' : 'workflow:Fold')}
              onClick={handleToggleFold}
            />
          </Flex>
        )}
        {!resolvedIsFolded && (
          <MyTextarea
            iconSrc={'core/app/simpleMode/chat'}
            title={t('common:core.app.Welcome Text')}
            className="nowheel"
            w={'100%'}
            bg={'white'}
            borderRadius={'8px'}
            border={'1px solid'}
            borderColor={'#E8EBF0'}
            p={'13px 8px 8px 12px'}
            resize={'none'}
            autoHeight
            minH={118}
            maxH={118}
            placeholder={t('common:core.app.placeholder.welcomeText')}
            {...drawerTextareaStyle}
            _focus={{ boxShadow: 'none' }}
            _focusVisible={{ boxShadow: 'none' }}
            value={value}
            onChange={onChange}
            {...props}
          />
        )}
      </>
    );
  }

  return (
    <>
      {showLabel && (
        <Flex alignItems={'center'}>
          <MyIcon name={'core/app/simpleMode/chat'} w={'20px'} />
          <FormLabel ml={2}>{t('common:core.app.Welcome Text')}</FormLabel>
          <ChatFunctionTip type={'welcome'} />
          {showFoldButton && (
            <>
              <Box flex={1} />
              <FoldIconButton
                isFolded={resolvedIsFolded}
                tip={t(resolvedIsFolded ? 'workflow:Unfold' : 'workflow:Fold')}
                onClick={handleToggleFold}
              />
            </>
          )}
        </Flex>
      )}
      {!resolvedIsFolded && (
        <MyTextarea
          className="nowheel"
          iconSrc={'core/app/simpleMode/chat'}
          title={t('common:core.app.Welcome Text')}
          mt={1.5}
          rows={6}
          fontSize={'sm'}
          bg={'myGray.50'}
          minW={['auto', '384px']}
          placeholder={t('common:core.app.placeholder.welcomeText')}
          autoHeight
          minH={100}
          maxH={200}
          value={value}
          onChange={onChange}
          {...props}
        />
      )}
    </>
  );
};

export default React.memo(WelcomeTextConfig);
