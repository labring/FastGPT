import { useSystemStore } from '@/web/common/system/useSystemStore';
import React, { useEffect, useState } from 'react';
import ProModal from './ProModal';
import { Box } from '@chakra-ui/react';

const ProText = ({ children, signKey }: { children: React.ReactNode; signKey: string }) => {
  const { feConfigs } = useSystemStore();

  const [isOpen, setIsOpen] = useState(false);

  const key = `proTip_${signKey}_lastShown`;

  // Check if modal should auto-open based on 6-hour interval
  useEffect(() => {
    if (feConfigs?.isPlus) return;

    const lastShown = localStorage.getItem(key);

    if (!lastShown) {
      // First time, show modal immediately
      setIsOpen(true);
    } else {
      const lastShownTime = parseInt(lastShown);
      const sixHours = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

      if (Date.now() - lastShownTime >= sixHours) {
        setIsOpen(true);
      }
    }
  }, [feConfigs?.isPlus, key, signKey]);

  const handleClose = () => {
    setIsOpen(false);
    if (!feConfigs?.isPlus) {
      localStorage.setItem(key, Date.now().toString());
    }
  };

  return feConfigs?.isPlus ? null : (
    <>
      <Box userSelect={'none'} onClick={() => setIsOpen(true)}>
        {children}
      </Box>
      <ProModal isOpen={isOpen} onClose={handleClose} />
    </>
  );
};

export default ProText;
