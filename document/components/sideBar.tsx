'use client';

import { type FC, type ReactNode } from 'react';
import { type SidebarComponents } from 'fumadocs-ui/components/layout/sidebar';
import { type PageTree } from 'fumadocs-core/server';
import {
  SidebarItem,
  SidebarFolder,
  SidebarFolderTrigger,
  SidebarFolderContent
} from 'fumadocs-ui/components/layout/sidebar';

const CustomItem: FC<{ item: PageTree.Item }> = ({ item }) => (
  <SidebarItem href={item.url} className="rounded-md bg-blue  ">
    {item.icon}
    {item.name}
  </SidebarItem>
);

const CustomFolder: FC<{ item: PageTree.Folder; level: number; children: ReactNode }> = ({
  item,
  level,
  children
}) => (
  <SidebarFolder className="bg-blue">
    <SidebarFolderTrigger>{item.name}</SidebarFolderTrigger>
    <SidebarFolderContent>{children}</SidebarFolderContent>
  </SidebarFolder>
);

const CustomSeparator: FC<{ item: PageTree.Separator }> = ({ item }) => (
  <div className="bg-blue">{item.name}</div>
);

export const CustomSidebarComponents: SidebarComponents = {
  Item: CustomItem,
  Folder: CustomFolder,
  Separator: CustomSeparator
};
