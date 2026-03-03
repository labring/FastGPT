'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, type FC, type ReactNode } from 'react';
import {
  SidebarItem,
  SidebarFolder,
  SidebarFolderTrigger,
  SidebarFolderContent
} from 'fumadocs-ui/components/layout/sidebar';
import { type SidebarComponents } from 'fumadocs-ui/components/layout/sidebar';
import { type PageTree } from 'fumadocs-core/server';

const NestingLevelContext = createContext(0);

const isInFolder = (folder: PageTree.Folder, pathname: string): boolean => {
  const check = (item: PageTree.Item | PageTree.Folder): boolean => {
    if ('children' in item) {
      return item.children
        .filter(
          (child): child is PageTree.Item | PageTree.Folder => 'url' in child || 'children' in child
        )
        .some(check);
    }
    return 'url' in item && item.url === pathname;
  };
  return check(folder);
};

const CustomItem: FC<{ item: PageTree.Item }> = ({ item }) => {
  const pathname = usePathname();
  const isActive = pathname === item.url;

  useEffect(() => {
    if (isActive) {
      const anchor = document.querySelector(`a[href='${item.url}']`);
      if (anchor) {
        setTimeout(() => {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [isActive, item.url]);

  return (
    <SidebarItem
      href={item.url}
      className={`rounded-lg hover:cursor-pointer ${isActive && 'bg-blue-50 font-bold text-[#3370FF] dark:bg-[rgba(104,143,232,0.1)] dark:text-blue-400'} 
      `}
    >
      {item.icon}
      {item.name}
    </SidebarItem>
  );
};

const CustomFolder: FC<{ item: PageTree.Folder; level: number; children: ReactNode }> = ({
  item,
  level,
  children
}) => {
  const pathname = usePathname();
  const shouldExpand = isInFolder(item, pathname);

  return (
    <NestingLevelContext.Provider value={level + 1}>
      <SidebarFolder defaultOpen={shouldExpand} className="bg-blue hover:cursor-pointer">
        <SidebarFolderTrigger className="hover:cursor-pointer">{item.name}</SidebarFolderTrigger>
        <SidebarFolderContent className="bg-blue hover:cursor-pointer">
          {children}
        </SidebarFolderContent>
      </SidebarFolder>
    </NestingLevelContext.Provider>
  );
};

const CustomSeparator: FC<{ item: PageTree.Separator }> = ({ item }) => {
  const level = useContext(NestingLevelContext);
  return (
    <div
      className={`text-sm font-semibold ${level > 0 ? 'pl-6' : 'px-2'} pr-2 py-1.5 mt-1 mb-1 first:mt-0`}
    >
      {item.name}
    </div>
  );
};

export const CustomSidebarComponents: SidebarComponents = {
  Item: CustomItem,
  Folder: CustomFolder,
  Separator: CustomSeparator
};
