import { Box } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { getScalarOpenApiReferenceConfig } from '@fastgpt/global/openapi/reference';

// 动态加载 @scalar/api-reference-react，避免其 CSS side-effect 在 Node 端
// (next build 的 collecting page data 阶段) 被解析导致 ERR_UNKNOWN_FILE_EXTENSION。
const ApiReferenceReact = dynamic(
  () => Promise.all([import('@scalar/api-reference-react')]).then(([mod]) => mod.ApiReferenceReact),
  { ssr: false }
);

type ScalarNavigationEntry = {
  type: string;
  id?: string;
  name?: string;
  title?: string;
  isGroup?: boolean;
  isWebhooks?: boolean;
  children?: ScalarNavigationEntry[];
};

type ScalarWorkspaceStore = {
  workspace: {
    activeDocument?: {
      'x-scalar-navigation'?: {
        children?: ScalarNavigationEntry[];
      };
    };
  };
};

const transformedScalarNavigations = new WeakSet<object>();

/**
 * Scalar 的 tag group 只能包含 tag。这里在文档加载后调整导航树，支持 tag 和 tag group 的嵌套，
 * 同时保留其他需要折叠的目录。
 */
const transformScalarNavigationTags = ({
  flattenedTagNames,
  tagNameAliases,
  nestedTagNames,
  nestedTagGroups
}: {
  flattenedTagNames: string[];
  tagNameAliases: Record<string, string>;
  nestedTagNames: Record<string, string[]>;
  nestedTagGroups: Record<string, string[]>;
}) => {
  const workspaceStore = (
    window as typeof window & {
      dataDumpWorkspace?: () => ScalarWorkspaceStore;
    }
  ).dataDumpWorkspace?.();
  const navigation = workspaceStore?.workspace.activeDocument?.['x-scalar-navigation'];

  if (!navigation?.children?.length) return;
  if (transformedScalarNavigations.has(navigation)) return;
  transformedScalarNavigations.add(navigation);

  const flattenedTagNameSet = new Set(flattenedTagNames);
  const findEntry = (
    entries: ScalarNavigationEntry[],
    title: string,
    visited = new Set<ScalarNavigationEntry>()
  ): ScalarNavigationEntry | undefined => {
    for (const entry of entries) {
      if (visited.has(entry)) continue;
      visited.add(entry);
      if (entry.title === title) return entry;
      if (entry.children) {
        const nestedEntry = findEntry(entry.children, title, visited);
        if (nestedEntry) return nestedEntry;
      }
    }
  };

  const removeEntries = (
    entries: ScalarNavigationEntry[],
    targets: Set<ScalarNavigationEntry>,
    visited = new Set<ScalarNavigationEntry>()
  ): ScalarNavigationEntry[] => {
    const result: ScalarNavigationEntry[] = [];
    for (const entry of entries) {
      if (visited.has(entry)) continue;
      visited.add(entry);
      if (targets.has(entry)) continue;
      if (entry.children) {
        const children = removeEntries(entry.children, targets, visited);
        if (!children.length) continue;
        result.push({ ...entry, children });
      } else {
        result.push(entry);
      }
    }
    return result;
  };

  const transformEntries = (
    entries: ScalarNavigationEntry[],
    visited = new Set<ScalarNavigationEntry>()
  ): ScalarNavigationEntry[] => {
    const transformedEntries = entries.flatMap((entry) => {
      if (visited.has(entry)) return [];
      visited.add(entry);

      const children = entry.children ? transformEntries(entry.children, visited) : undefined;

      if (entry.type === 'tag' && !entry.isGroup && entry.title) {
        if (flattenedTagNameSet.has(entry.title)) return children ?? [];
      }

      return [children ? { ...entry, children } : entry];
    });

    for (const [parentTagName, childTagNames] of Object.entries(nestedTagNames)) {
      const parent = transformedEntries.find(
        (entry) => entry.type === 'tag' && !entry.isGroup && entry.title === parentTagName
      );
      if (!parent) continue;

      const childTagNameSet = new Set(childTagNames);
      const nestedChildren = transformedEntries.filter(
        (entry) =>
          entry.type === 'tag' &&
          !entry.isGroup &&
          !!entry.title &&
          childTagNameSet.has(entry.title)
      );
      if (!nestedChildren.length) continue;

      parent.children = [
        ...nestedChildren.map((entry) => {
          const displayName = entry.title ? tagNameAliases[entry.title] : undefined;
          return displayName ? { ...entry, title: displayName } : entry;
        }),
        ...(parent.children ?? [])
      ];
      for (let index = transformedEntries.length - 1; index >= 0; index--) {
        if (nestedChildren.includes(transformedEntries[index])) transformedEntries.splice(index, 1);
      }
    }

    return transformedEntries.map((entry) => {
      const displayName = entry.title ? tagNameAliases[entry.title] : undefined;
      return displayName ? { ...entry, title: displayName } : entry;
    });
  };

  const transformedEntries = transformEntries(navigation.children);
  if (Object.keys(nestedTagGroups).length) {
    // 跨越 Scalar 原生 tag group 组装目录，替换原分类并保留其在顶层的顺序。
    const nestedEntryTargets = new Set<ScalarNavigationEntry>();
    const building = new Set<string>();

    const buildNestedEntry = (title: string, isRoot = false): ScalarNavigationEntry | undefined => {
      if (building.has(title)) return;
      building.add(title);

      const configuredChildren = nestedTagGroups[title];
      if (configuredChildren) {
        const children = configuredChildren
          .map((childTitle) => buildNestedEntry(childTitle))
          .filter((entry): entry is ScalarNavigationEntry => Boolean(entry));
        if (children.length) {
          const existingEntry = findEntry(transformedEntries, title);
          if (existingEntry) nestedEntryTargets.add(existingEntry);

          building.delete(title);
          return {
            ...children[0],
            id: `${children[0].id?.split('/')[0] ?? 'nested'}/${
              isRoot ? 'tag-group' : 'tag'
            }/nested-${title}`,
            name: title,
            title,
            isGroup: isRoot,
            children
          };
        }
      }

      const entry = findEntry(transformedEntries, title);
      if (entry) nestedEntryTargets.add(entry);
      if (!entry) {
        building.delete(title);
        return;
      }

      // 原始文档有些分类是“同名 tag group -> 同名 tag”。复用时解开外层包装，避免目录内部重复。
      const normalizedEntry =
        entry.isGroup && entry.children?.length === 1 && entry.children[0].title === title
          ? entry.children[0]
          : entry;

      building.delete(title);
      return {
        ...normalizedEntry,
        id: normalizedEntry.id?.replace('/tag-group/', '/tag/'),
        isGroup: false
      };
    };

    const nestedRoots = Object.keys(nestedTagGroups)
      .filter(
        (title) => !Object.values(nestedTagGroups).some((children) => children.includes(title))
      )
      .map((title) => buildNestedEntry(title, true))
      .filter((entry): entry is ScalarNavigationEntry => Boolean(entry));

    if (nestedRoots.length) {
      const remainingEntries = removeEntries(transformedEntries, nestedEntryTargets);
      const firstTargetIndex = transformedEntries.findIndex((entry) =>
        nestedEntryTargets.has(entry)
      );
      const insertIndex = firstTargetIndex === -1 ? remainingEntries.length : firstTargetIndex;
      remainingEntries.splice(insertIndex, 0, ...nestedRoots);
      navigation.children = remainingEntries;
      return;
    }
  }

  navigation.children = transformedEntries;
};

export const ScalarOpenApiPage = ({
  documentUrl,
  defaultOpenAllTags,
  flattenedTagNames,
  tagNameAliases,
  nestedTagNames,
  nestedTagGroups
}: {
  documentUrl: string;
  defaultOpenAllTags?: boolean;
  flattenedTagNames?: string[];
  tagNameAliases?: Record<string, string>;
  nestedTagNames?: Record<string, string[]>;
  nestedTagGroups?: Record<string, string[]>;
}) => (
  <Box w="100vw" h="100vh" overflow="auto">
    <ApiReferenceReact
      configuration={getScalarOpenApiReferenceConfig(documentUrl, {
        defaultOpenAllTags,
        onLoaded:
          flattenedTagNames?.length || tagNameAliases || nestedTagNames || nestedTagGroups
            ? () =>
                transformScalarNavigationTags({
                  flattenedTagNames: flattenedTagNames ?? [],
                  tagNameAliases: tagNameAliases ?? {},
                  nestedTagNames: nestedTagNames ?? {},
                  nestedTagGroups: nestedTagGroups ?? {}
                })
            : undefined
      })}
    />
  </Box>
);
