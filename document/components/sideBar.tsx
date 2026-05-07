'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  type FC,
  type ReactNode
} from 'react';
import {
  SidebarItem,
  SidebarFolder,
  SidebarFolderTrigger,
  SidebarFolderContent
} from 'fumadocs-ui/components/layout/sidebar';
import { type SidebarComponents } from 'fumadocs-ui/components/layout/sidebar';
import { type PageTree } from 'fumadocs-core/server';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';

const VIRTUAL_SECTION_ID_SUFFIX = '#virtual-section';

const NestingLevelContext = createContext(0);

type TaggedPageTreeItem = PageTree.Item & {
  sidebarTag?: string;
};

const getSidebarItemTag = (item: PageTree.Item) => (item as TaggedPageTreeItem).sidebarTag;

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
  const level = useContext(NestingLevelContext);
  const isActive = pathname === item.url;
  const tag = getSidebarItemTag(item);

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
      className={cn(
        'group/sidebar-item min-h-8 w-full min-w-0 max-w-full rounded-lg px-2 text-sm hover:cursor-pointer',
        !isActive && 'text-fd-muted-foreground hover:text-fd-accent-foreground',
        level === 0 && 'font-medium',
        isActive &&
          'bg-blue-50 font-bold text-[#3370FF] hover:bg-blue-50 hover:text-[#3370FF] dark:bg-[rgba(104,143,232,0.1)] dark:text-blue-400 dark:hover:bg-[rgba(104,143,232,0.1)] dark:hover:text-blue-400'
      )}
    >
      {item.icon}
      <span className="inline-flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <span className="min-w-0 break-words leading-5">{item.name}</span>
        {tag && (
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none',
              isActive
                ? 'bg-[#3370FF] text-white dark:bg-blue-400 dark:text-slate-950'
                : 'bg-blue-50 text-[#3370FF] dark:bg-blue-400/10 dark:text-blue-300'
            )}
          >
            {tag}
          </span>
        )}
        {item.external && (
          <ExternalLink
            aria-label="外部链接"
            className="!size-2.5 shrink-0 text-fd-muted-foreground/60 opacity-0 transition-opacity group-hover/sidebar-item:opacity-100 group-focus-visible/sidebar-item:opacity-100"
          />
        )}
      </span>
    </SidebarItem>
  );
};

const CustomFolder: FC<{ item: PageTree.Folder; level: number; children: ReactNode }> = ({
  item,
  children
}) => {
  const pathname = usePathname();
  const level = useContext(NestingLevelContext);
  const isSectionFolder = level === 0;
  const isVirtualSection = item.$id?.endsWith(VIRTUAL_SECTION_ID_SUFFIX);
  const shouldExpand = isInFolder(item, pathname);

  return (
    <NestingLevelContext.Provider value={level + 1}>
      <SidebarFolder
        defaultOpen={isSectionFolder || item.defaultOpen || shouldExpand}
        className={cn(isSectionFolder && 'mt-5 first:mt-1')}
      >
        {isSectionFolder ? (
          <div
            className={cn(
              'px-2 pb-1 text-sm font-semibold text-fd-foreground',
              isVirtualSection && 'text-fd-card-foreground'
            )}
          >
            {item.name}
          </div>
        ) : (
          <SidebarFolderTrigger
            className="min-h-8 min-w-0 max-w-full rounded-lg px-2 text-sm text-fd-muted-foreground hover:cursor-pointer hover:text-fd-accent-foreground data-[state=open]:text-fd-foreground [&>svg[data-icon]]:shrink-0"
          >
            <span className="min-w-0 flex-1 break-words text-left leading-5">{item.name}</span>
          </SidebarFolderTrigger>
        )}
        <SidebarFolderContent>{children}</SidebarFolderContent>
      </SidebarFolder>
    </NestingLevelContext.Provider>
  );
};

const CustomSeparator: FC<{ item: PageTree.Separator }> = ({ item }) => {
  const level = useContext(NestingLevelContext);
  return (
    <div
      className={cn(
        'text-sm font-semibold',
        level > 0 ? 'pl-6' : 'px-2',
        'pr-2 pb-2 pt-5 first:pt-1'
      )}
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
