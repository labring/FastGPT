import React, { useState, useCallback, useRef } from 'react';

export const useTabs = ({
  tabs = []
}: {
  tabs: {
    id: string;
    label: string;
  }[];
}) => {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return {
    tabs,
    activeTab,
    setActiveTab
  };
};
