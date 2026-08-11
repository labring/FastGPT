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
  title?: string;
  isGroup?: boolean;
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

/**
 * Scalar 的 tag group 只能包含 tag。这里在文档加载后移除指定的中间 tag，
 * 将其接口直接提升到上级标题下，同时保留其他需要折叠的目录。
 */
const transformScalarNavigationTags = ({
  flattenedTagNames,
  tagNameAliases
}: {
  flattenedTagNames: string[];
  tagNameAliases: Record<string, string>;
}) => {
  const workspaceStore = (
    window as typeof window & {
      dataDumpWorkspace?: () => ScalarWorkspaceStore;
    }
  ).dataDumpWorkspace?.();
  const navigation = workspaceStore?.workspace.activeDocument?.['x-scalar-navigation'];

  if (!navigation?.children?.length) return;

  const flattenedTagNameSet = new Set(flattenedTagNames);
  const flattenEntries = (entries: ScalarNavigationEntry[]): ScalarNavigationEntry[] =>
    entries.flatMap((entry) => {
      const children = entry.children ? flattenEntries(entry.children) : undefined;

      if (entry.type === 'tag' && !entry.isGroup && entry.title) {
        if (flattenedTagNameSet.has(entry.title)) return children ?? [];

        const displayName = tagNameAliases[entry.title];
        if (displayName) return [{ ...entry, title: displayName, children }];
      }

      return [children ? { ...entry, children } : entry];
    });

  navigation.children = flattenEntries(navigation.children);
};

export const ScalarOpenApiPage = ({
  documentUrl,
  defaultOpenAllTags,
  flattenedTagNames,
  tagNameAliases
}: {
  documentUrl: string;
  defaultOpenAllTags?: boolean;
  flattenedTagNames?: string[];
  tagNameAliases?: Record<string, string>;
}) => (
  <Box w="100vw" h="100vh" overflow="auto">
    <ApiReferenceReact
      configuration={getScalarOpenApiReferenceConfig(documentUrl, {
        defaultOpenAllTags,
        onLoaded:
          flattenedTagNames?.length || tagNameAliases
            ? () =>
                transformScalarNavigationTags({
                  flattenedTagNames: flattenedTagNames ?? [],
                  tagNameAliases: tagNameAliases ?? {}
                })
            : undefined
      })}
    />
  </Box>
);
