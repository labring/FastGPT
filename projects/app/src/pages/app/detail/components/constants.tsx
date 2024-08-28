import { BoxProps, FlexProps } from '@chakra-ui/react';
import { i18nT } from '@fastgpt/web/i18n/utils';
export const cardStyles: BoxProps = {
  borderRadius: 'lg',
  // overflow: 'hidden',
  bg: 'white'
};

export const workflowBoxStyles: FlexProps = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  flexDirection: 'column',
  zIndex: 200,
  bg: 'myGray.100'
};

export const publishStatusStyle = {
  unPublish: {
    colorSchema: 'adora' as any,
    text: i18nT('common:core.app.not_saved')
  },
  published: {
    colorSchema: 'green' as any,
    text: i18nT('common:core.app.have_saved')
  }
};

export default function Dom() {
  return <></>;
}
