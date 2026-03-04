"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAPI = parseAPI;
var parser_1 = require("@babel/parser");
var traverse_1 = require("@babel/traverse");
var fs = require("fs");
function getMetadata(path) {
    var _a, _b, _c;
    var metadata = {
        name: '',
        author: '',
        version: '',
        method: ''
    };
    if (path.isExportNamedDeclaration() && // get metadata
        ((_a = path.node.declaration) === null || _a === void 0 ? void 0 : _a.type) === 'VariableDeclaration' &&
        ((_b = path.node.declaration.declarations[0]) === null || _b === void 0 ? void 0 : _b.id.type) === 'Identifier' &&
        path.node.declaration.declarations[0].id.name === 'ApiMetadata' &&
        ((_c = path.node.declaration.declarations[0].init) === null || _c === void 0 ? void 0 : _c.type) === 'ObjectExpression') {
        path.node.declaration.declarations[0].init.properties.forEach(function (item) {
            if (item.type === 'ObjectProperty') {
                var key = item.key.type === 'Identifier' ? item.key.name : item.key.type;
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
                }
                else if (key === 'method') {
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
function getDescription(path) {
    var _a, _b;
    if (path.isFunctionDeclaration() && ((_a = path.node.id) === null || _a === void 0 ? void 0 : _a.name) === 'handler') {
        var comments = (_b = path.node.leadingComments) === null || _b === void 0 ? void 0 : _b.map(function (item) { return item.value.trim(); }).join('\n');
        return comments;
    }
}
function parseType(type) {
    if (!type) {
        return '';
    }
    if (type.type === 'TSTypeReference') {
        return type.typeName.type === 'Identifier' ? type.typeName.name : type.typeName.type;
    }
    else if (type.type === 'TSArrayType') {
        return "".concat(parseType(type.elementType), "[]");
    }
    else if (type.type === 'TSUnionType') {
        return type.types.map(function (item) { return parseType(item); }).join(' | ');
    }
    else if (type.type === 'TSIntersectionType') {
        return type.types.map(function (item) { return parseType(item); }).join(' & ');
    }
    else if (type.type === 'TSLiteralType') {
        return type.literal.type === 'StringLiteral' ? type.literal.value : type.literal.type;
        // } else if (type.type === 'TSTypeLiteral') {
        //   return parseTypeLiteral(type);
    }
    else if (type.type === 'TSStringKeyword') {
        return 'string';
    }
    else if (type.type === 'TSNumberKeyword') {
        return 'number';
    }
    else if (type.type === 'TSBooleanKeyword') {
        return 'boolean';
    }
    else {
        return type.type;
    }
}
function parseTypeLiteral(type) {
    var items = [];
    type.members.forEach(function (item) {
        var _a, _b, _c;
        if (item.type === 'TSPropertySignature') {
            var key = item.key.type === 'Identifier' ? item.key.name : item.key.type;
            var value = parseType((_a = item.typeAnnotation) === null || _a === void 0 ? void 0 : _a.typeAnnotation);
            var comments = [
                (_b = item.leadingComments) === null || _b === void 0 ? void 0 : _b.map(function (item) { return item.value.trim(); }).join('\n'),
                (_c = item.trailingComments) === null || _c === void 0 ? void 0 : _c.map(function (item) { return item.value.trim(); }).join('\n')
            ].join('\n');
            var required = item.optional ? false : true;
            items.push({
                type: value,
                comment: comments,
                key: key,
                required: required
            });
        }
    });
    return items;
}
function getData(path) {
    var _a, _b, _c;
    var type = {};
    if (path.isExportNamedDeclaration()) {
        var comments = [
            (_a = path.node.leadingComments) === null || _a === void 0 ? void 0 : _a.map(function (item) { return item.value.trim(); }).join('\n'),
            (_b = path.node.trailingComments) === null || _b === void 0 ? void 0 : _b.map(function (item) { return item.value.trim(); }).join('\n')
        ].join('\n');
        if (comments) {
            type.comment = comments;
        }
        if (((_c = path.node.declaration) === null || _c === void 0 ? void 0 : _c.type) === 'TSTypeAliasDeclaration') {
            if (path.node.declaration.id.type === 'Identifier') {
                if (path.node.declaration.id.name.endsWith('Query')) {
                    type.type = 'query';
                    var queryType = path.node.declaration.typeAnnotation;
                    if (queryType) {
                        if (queryType.type === 'TSTypeLiteral') {
                            type.items = parseTypeLiteral(queryType);
                        }
                        else {
                            type.dataType = parseType(queryType);
                        }
                    }
                }
                else if (path.node.declaration.id.name.endsWith('Body')) {
                    type.type = 'body';
                    if (path.node.declaration.typeAnnotation) {
                        if (path.node.declaration.typeAnnotation.type === 'TSTypeLiteral') {
                            type.items = parseTypeLiteral(path.node.declaration.typeAnnotation);
                        }
                        else {
                            type.dataType = parseType(path.node.declaration.typeAnnotation);
                        }
                    }
                }
                else if (path.node.declaration.id.name.endsWith('Response')) {
                    type.type = 'response';
                    if (path.node.declaration.typeAnnotation) {
                        if (path.node.declaration.typeAnnotation.type === 'TSTypeLiteral') {
                            type.items = parseTypeLiteral(path.node.declaration.typeAnnotation);
                        }
                        else {
                            type.dataType = parseType(path.node.declaration.typeAnnotation);
                        }
                    }
                }
                else {
                    return;
                }
            }
        }
    }
    return type;
}
function parseCode(code) {
    var ast = (0, parser_1.parse)(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx']
    });
    var api = {};
    (0, traverse_1.default)(ast, {
        enter: function (path) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            var metadata = getMetadata(path);
            var description = getDescription(path);
            var data = getData(path);
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
                    api.query = (_a = data.items) !== null && _a !== void 0 ? _a : {
                        type: (_b = data.dataType) !== null && _b !== void 0 ? _b : '',
                        comment: (_c = data.comment) !== null && _c !== void 0 ? _c : ''
                    };
                }
                else if (data.type === 'body') {
                    api.body = (_d = data.items) !== null && _d !== void 0 ? _d : {
                        type: (_e = data.dataType) !== null && _e !== void 0 ? _e : '',
                        comment: (_f = data.comment) !== null && _f !== void 0 ? _f : ''
                    };
                }
                else if (data.type === 'response') {
                    api.response = (_g = data.items) !== null && _g !== void 0 ? _g : {
                        type: (_h = data.dataType) !== null && _h !== void 0 ? _h : '',
                        comment: (_j = data.comment) !== null && _j !== void 0 ? _j : ''
                    };
                }
            }
        }
    });
    return api;
}
function getMethod(api) {
    if (api.query && !(Array.isArray(api.query) && api.query.length === 0)) {
        return 'GET';
    }
    else if (api.body && !(Array.isArray(api.body) && api.body.length === 0)) {
        return 'POST';
    }
    else {
        return 'GET';
    }
}
function parseAPI(_a) {
    var path = _a.path, rootPath = _a.rootPath;
    var code = fs.readFileSync(path, 'utf-8');
    var api = parseCode(code);
    api.url = path.replace('.ts', '').replace(rootPath, '');
    api.path = path;
    if (api.method === undefined) {
        api.method = getMethod(api);
    }
    return api;
}
