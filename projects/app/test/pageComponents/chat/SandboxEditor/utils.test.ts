import { describe, expect, it } from 'vitest';
import {
  buildSandboxMoveOperations,
  getSafeSandboxCommandPath,
  getSafeSandboxPathSegment,
  getTopLevelSandboxPaths,
  moveTreeNodeInTree,
  renameTreeNodeInTree
} from '@/pageComponents/chat/SandboxEditor/utils';

describe('SandboxEditor path and tree utilities', () => {
  it('validates command paths and single path segments', () => {
    expect(getSafeSandboxCommandPath('.')).toBe('.');
    expect(getSafeSandboxCommandPath('src/index.ts')).toBe('./src/index.ts');
    expect(() => getSafeSandboxCommandPath('../secret')).toThrow('Invalid sandbox path');
    expect(() => getSafeSandboxCommandPath('/etc/passwd')).toThrow('Invalid sandbox path');

    expect(getSafeSandboxPathSegment('main.ts')).toBe('main.ts');
    expect(() => getSafeSandboxPathSegment('..')).toThrow('Invalid sandbox path');
    expect(() => getSafeSandboxPathSegment('a/b')).toThrow('Invalid sandbox path');
  });

  it('deduplicates nested paths and builds move operations', () => {
    expect(getTopLevelSandboxPaths(['src/a/b.ts', 'src', 'README.md'])).toEqual([
      'README.md',
      'src'
    ]);
    expect(buildSandboxMoveOperations(['src/a.ts', 'lib/b.ts'], 'src')).toEqual([
      {
        sourcePath: 'lib/b.ts',
        currentParentPath: 'lib',
        targetDirPath: 'src',
        newPath: 'src/b.ts'
      }
    ]);
  });

  it('recursively updates descendant paths and levels on moveTreeNodeInTree and renameTreeNodeInTree', () => {
    const initialTree = [
      {
        type: 'directory' as const,
        name: 'src',
        path: 'src',
        level: 0,
        loaded: true,
        children: [
          {
            type: 'directory' as const,
            name: 'utils',
            path: 'src/utils',
            level: 1,
            loaded: true,
            children: [
              { type: 'file' as const, name: 'math.ts', path: 'src/utils/math.ts', level: 2 }
            ]
          }
        ]
      },
      {
        type: 'directory' as const,
        name: 'packages',
        path: 'packages',
        level: 0,
        loaded: true,
        children: []
      }
    ];

    const moved = moveTreeNodeInTree(initialTree, 'src', 'packages');
    expect(moved).toEqual([
      {
        type: 'directory',
        name: 'packages',
        path: 'packages',
        level: 0,
        loaded: true,
        children: [
          {
            type: 'directory',
            name: 'src',
            path: 'packages/src',
            level: 1,
            loaded: true,
            children: [
              {
                type: 'directory',
                name: 'utils',
                path: 'packages/src/utils',
                level: 2,
                loaded: true,
                children: [
                  {
                    type: 'file',
                    name: 'math.ts',
                    path: 'packages/src/utils/math.ts',
                    level: 3
                  }
                ]
              }
            ]
          }
        ]
      }
    ]);

    const renamed = renameTreeNodeInTree(moved, 'packages', 'libs', 'libs');
    expect(renamed[0]?.path).toBe('libs');
    expect(renamed[0]?.children?.[0]?.children?.[0]?.children?.[0]?.path).toBe(
      'libs/src/utils/math.ts'
    );
  });
});
