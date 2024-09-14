import type { TSType, TSTypeLiteral } from '@babel/types';
import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as fs from 'fs';
import type { ApiMetaData, ApiType, itemType } from './type';

function getMetadata(path: NodePath): ApiMetaData | undefined {
  const metadata = {
    name: '',
    author: '',
    version: '',
    method: ''
  };
  if (
    path.isExportNamedDeclaration() && // get metadata
    path.node.declaration?.type === 'VariableDeclaration' &&
    path.node.declaration.declarations[0]?.id.type === 'Identifier' &&
    path.node.declaration.declarations[0].id.name === 'ApiMetadata' &&
    path.node.declaration.declarations[0].init?.type === 'ObjectExpression'
  ) {
    path.node.declaration.declarations[0].init.properties.forEach((item) => {
      if (item.type === 'ObjectProperty') {
        const key = item.key.type === 'Identifier' ? item.key.name : item.key.type;
        if (key === 'name') {
          metadata.name = item.value.type === 'StringLiteral' ? item.value.value : item.value.type;
        }
        if (key === 'author') {
          metadata.author =
            item.value.type === 'StringLiteral' ? item.value.value : item.value.type;
        }
        if (key === 'version') {
          metadata.version =
            item.value.type === 'StringLiteral' ? item.value.value : item.value.type;
        } else if (key === 'method') {
          metadata.method =
            item.value.type === 'StringLiteral' ? item.value.value : item.value.type;
          metadata.method = metadata.method.toUpperCase();
        }
      }
    });
    if (metadata.name && metadata.author && metadata.version) {
      return metadata;
    }
  }
}

function getDescription(path: NodePath) {
  if (path.isFunctionDeclaration() && path.node.id?.name === 'handler') {
    const comments = path.node.leadingComments?.map((item) => item.value.trim()).join('\n');
    return comments;
  }
}

type ApiDataType = {
  type?: 'query' | 'body' | 'response';
  comment?: string;
  items?: itemType[];
  dataType?: string;
};

function parseType(type?: TSType): string {
  if (!type) {
    return '';
  }
  if (type.type === 'TSTypeReference') {
    return type.typeName.type === 'Identifier' ? type.typeName.name : type.typeName.type;
  } else if (type.type === 'TSArrayType') {
    return `${parseType(type.elementType)}[]`;
  } else if (type.type === 'TSUnionType') {
    return type.types.map((item) => parseType(item)).join(' | ');
  } else if (type.type === 'TSIntersectionType') {
    return type.types.map((item) => parseType(item)).join(' & ');
  } else if (type.type === 'TSLiteralType') {
    return type.literal.type === 'StringLiteral' ? type.literal.value : type.literal.type;
    // } else if (type.type === 'TSTypeLiteral') {
    //   return parseTypeLiteral(type);
  } else if (type.type === 'TSStringKeyword') {
    return 'string';
  } else if (type.type === 'TSNumberKeyword') {
    return 'number';
  } else if (type.type === 'TSBooleanKeyword') {
    return 'boolean';
  } else {
    return type.type;
  }
}

function parseTypeLiteral(type: TSTypeLiteral): itemType[] {
  const items: itemType[] = [];
  type.members.forEach((item) => {
    if (item.type === 'TSPropertySignature') {
      const key = item.key.type === 'Identifier' ? item.key.name : item.key.type;
      const value = parseType(item.typeAnnotation?.typeAnnotation);
      const comments = [
        item.leadingComments?.map((item) => item.value.trim()).join('\n'),
        item.trailingComments?.map((item) => item.value.trim()).join('\n')
      ].join('\n');
      const required = item.optional ? false : true;
      items.push({
        type: value,
        comment: comments,
        key,
        required
      });
    }
  });
  return items;
}

function getData(path: NodePath): ApiDataType | undefined {
  const type: ApiDataType = {};
  if (path.isExportNamedDeclaration()) {
    const comments = [
      path.node.leadingComments?.map((item) => item.value.trim()).join('\n'),
      path.node.trailingComments?.map((item) => item.value.trim()).join('\n')
    ].join('\n');
    if (comments) {
      type.comment = comments;
    }
    if (path.node.declaration?.type === 'TSTypeAliasDeclaration') {
      if (path.node.declaration.id.type === 'Identifier') {
        if (path.node.declaration.id.name.endsWith('Query')) {
          type.type = 'query';
          const queryType = path.node.declaration.typeAnnotation;
          if (queryType) {
            if (queryType.type === 'TSTypeLiteral') {
              type.items = parseTypeLiteral(queryType);
            } else {
              type.dataType = parseType(queryType);
            }
          }
        } else if (path.node.declaration.id.name.endsWith('Body')) {
          type.type = 'body';
          if (path.node.declaration.typeAnnotation) {
            if (path.node.declaration.typeAnnotation.type === 'TSTypeLiteral') {
              type.items = parseTypeLiteral(path.node.declaration.typeAnnotation);
            } else {
              type.dataType = parseType(path.node.declaration.typeAnnotation);
            }
          }
        } else if (path.node.declaration.id.name.endsWith('Response')) {
          type.type = 'response';
          if (path.node.declaration.typeAnnotation) {
            if (path.node.declaration.typeAnnotation.type === 'TSTypeLiteral') {
              type.items = parseTypeLiteral(path.node.declaration.typeAnnotation);
            } else {
              type.dataType = parseType(path.node.declaration.typeAnnotation);
            }
          }
        } else {
          return;
        }
      }
    }
  }
  return type;
}

function parseCode(code: string): ApiType {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  });

  const api = <ApiType>{};

  traverse(ast, {
    enter(path) {
      const metadata = getMetadata(path);
      const description = getDescription(path);
      const data = getData(path);
      if (metadata) {
        api.name = metadata.name;
        api.author = metadata.author;
        api.version = metadata.version;
      }
      if (description) {
        api.description = description;
      }
      if (data) {
        if (data.type === 'query') {
          api.query = data.items ?? {
            type: data.dataType ?? '',
            comment: data.comment ?? ''
          };
        } else if (data.type === 'body') {
          api.body = data.items ?? {
            type: data.dataType ?? '',
            comment: data.comment ?? ''
          };
        } else if (data.type === 'response') {
          api.response = data.items ?? {
            type: data.dataType ?? '',
            comment: data.comment ?? ''
          };
        }
      }
    }
  });

  return api;
}

function getMethod(api: ApiType): 'GET' | 'POST' {
  if (api.query && !(Array.isArray(api.query) && api.query.length === 0)) {
    return 'GET';
  } else if (api.body && !(Array.isArray(api.body) && api.body.length === 0)) {
    return 'POST';
  } else {
    return 'GET';
  }
}

export function parseAPI({ path, rootPath }: { path: string; rootPath: string }): ApiType {
  const code = fs.readFileSync(path, 'utf-8');
  const authApiKey = code.includes('authApiKey: true');
  const authToken = code.includes('authToken: true');
  const api = parseCode(code);
  api.authorization = authApiKey ? 'apikey' : authToken ? 'token' : undefined;
  api.url = path.replace('.ts', '').replace(rootPath, '');
  api.path = path;
  if (api.method === undefined) {
    api.method = getMethod(api);
  }
  return api;
}
