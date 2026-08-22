import { Button, type TextareaProps } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ChatFunctionTip from './Tip';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { useTranslation } from 'next-i18next';
import AppConfigItem from './AppConfigItem';

type WelcomeTextConfigProps = TextareaProps & {
  drawerMode?: boolean;
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
  onClick?: () => void;
}) {
  return (
    <MyTooltip label={tip} shouldWrapChildren={false}>
      <Button
        aria-label={tip}
        variant={'transparentBase'}
        size={'xsSquare'}
        p={0}
        color={'myGray.600'}
        _hover={{ bg: 'transparent' }}
        onClick={onClick}
      >
        <MyIcon name={isFolded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'} w={6} />
      </Button>
    </MyTooltip>
  );
}

const WelcomeTextConfig = ({
  drawerMode = false,
  isFolded = false,
  onToggleFold,
  onChange,
  value,
  ...props
}: WelcomeTextConfigProps) => {
  const { t } = useTranslation();
  const foldButtonTip = isFolded ? t('workflow:Unfold') : t('workflow:Fold');

  if (drawerMode) {
    return (
      <>
        <AppConfigItem
          icon={'core/app/simpleMode/chat'}
          label={t('common:core.app.Welcome Text')}
          tip={<ChatFunctionTip type={'welcome'} />}
          action={<FoldIconButton isFolded={isFolded} tip={foldButtonTip} onClick={onToggleFold} />}
          h={7}
          mb={isFolded ? 0 : 2}
        />
        {!isFolded && (
          <MyTextarea
            iconSrc={'core/app/simpleMode/chat'}
            title={t('common:core.app.Welcome Text')}
            className="nowheel"
            w={'100%'}
            bg={'white'}
            borderRadius={'md'}
            border={'sm'}
            p={'13px 8px 8px 12px'}
            resize={'none'}
            autoHeight
            minH={118}
            maxH={118}
            placeholder={t('common:core.app.placeholder.welcomeText')}
            color={'myGray.900'}
            fontSize={'sm'}
            lineHeight={5}
            letterSpacing={0}
            _placeholder={{ color: 'myGray.500' }}
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
      <AppConfigItem
        icon={'core/app/simpleMode/chat'}
        label={t('common:core.app.Welcome Text')}
        tip={<ChatFunctionTip type={'welcome'} />}
        action={
          onToggleFold ? (
            <FoldIconButton isFolded={isFolded} tip={foldButtonTip} onClick={onToggleFold} />
          ) : undefined
        }
      />
      {!isFolded && (
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
