import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useTranslation } from 'next-i18next';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const menuItemStyles = {
  px: '4px',
  py: '6px'
};

const menuIconStyles = {
  w: '16px',
  h: '16px'
};

const DownloadButton = ({
  canAccessRawData,
  onDownload,
  onRead,
  onRouteToDataset
}: {
  canAccessRawData: boolean;
  onDownload: () => void;
  onRead: () => void;
  onRouteToDataset?: () => void;
}) => {
  const { t } = useTranslation();
  const datasetMenuItem = onRouteToDataset
    ? {
        icon: 'core/dataset/datasetLightSmall',
        label: t('chat:go_to_dataset'),
        type: 'grayBg' as const,
        menuItemStyles,
        iconStyles: menuIconStyles,
        onClick: onRouteToDataset
      }
    : undefined;

  if (canAccessRawData) {
    return (
      <MyMenu
        size={'xs'}
        Button={
          <MyIconButton
            icon="core/chat/dotsHorizontal"
            size={'1rem'}
            color={'myGray.600'}
            hoverBg={'myGray.100'}
          />
        }
        menuList={[
          {
            children: [
              {
                icon: 'core/chat/fileDownload',
                label: t('chat:download_chunks'),
                type: 'grayBg',
                menuItemStyles,
                iconStyles: menuIconStyles,
                onClick: onDownload
              },
              {
                icon: 'common/link',
                label: t('chat:read_raw_source'),
                type: 'grayBg',
                menuItemStyles,
                iconStyles: menuIconStyles,
                onClick: onRead
              },
              ...(datasetMenuItem ? [datasetMenuItem] : [])
            ]
          }
        ]}
      />
    );
  }

  return (
    <MyIconButton
      icon="core/chat/dotsHorizontal"
      size={'1rem'}
      color={'myGray.600'}
      hoverBg={'myGray.100'}
      onClick={onRouteToDataset || onDownload}
    />
  );
};

export default DownloadButton;
