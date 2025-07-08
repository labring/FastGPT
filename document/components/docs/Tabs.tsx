'use client';

import React, { useState } from 'react';

interface TabProps {
  title: string;
  children: React.ReactNode;
}

interface TabsProps {
  children: React.ReactNode;
}

export const Tab: React.FC<TabProps> = ({ children }) => {
  return <div>{children}</div>;
};

export const Tabs: React.FC<TabsProps> = ({ children }) => {
  const tabs = React.Children.toArray(children) as React.ReactElement<TabProps>[];
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div>
      <nav className="nav-tabs">
        {tabs.map((tab, index) => (
          <button
            key={index}
            className={`nav-link ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {tab.props.title}
          </button>
        ))}
      </nav>
      <div className="tab-content">{tabs[activeTab]}</div>
    </div>
  );
};
