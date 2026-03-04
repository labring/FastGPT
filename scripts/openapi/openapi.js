"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertPath = convertPath;
exports.convertOpenApi = convertOpenApi;
function convertPath(api) {
    var _a;
    var _b;
    var method = api.method.toLowerCase();
    var parameters = [];
    if (api.query) {
        if (Array.isArray(api.query)) {
            api.query.forEach(function (item) {
                parameters.push({
                    name: item.key,
                    description: item.comment,
                    in: 'query',
                    required: item.required,
                    schema: {
                        type: item.type
                    }
                });
            });
        }
        else {
            parameters.push({
                description: api.query.comment,
                name: api.query.key,
                in: 'query',
                required: api.query.required,
                schema: {
                    type: api.query.type
                }
            });
        }
    }
    else if (api.body) {
        if (Array.isArray(api.body)) {
            api.body.forEach(function (item) {
                parameters.push({
                    description: item.comment,
                    name: item.key,
                    in: 'body',
                    required: item.required,
                    schema: {
                        type: item.type
                    }
                });
            });
        }
    }
    var responses = (function () {
        var _a, _b, _c;
        if (api.response) {
            if (Array.isArray(api.response)) {
                var properties_1 = {};
                api.response.forEach(function (item) {
                    var _a;
                    properties_1[item.type] = {
                        type: (_a = item.key) !== null && _a !== void 0 ? _a : item.type,
                        description: item.comment
                    };
                });
                var res = {
                    '200': {
                        description: (_a = api.description) !== null && _a !== void 0 ? _a : '',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: properties_1
                                }
                            }
                        }
                    }
                };
                return res;
            }
            else {
                return {
                    '200': {
                        description: (_b = api.response.comment) !== null && _b !== void 0 ? _b : '',
                        content: {
                            'application/json': {
                                schema: {
                                    type: api.response.type
                                }
                            }
                        }
                    }
                };
            }
        }
        else {
            return {
                '200': {
                    description: (_c = api.description) !== null && _c !== void 0 ? _c : '',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object'
                            }
                        }
                    }
                }
            };
        }
    })();
    return _a = {},
        _a[method] = {
            description: (_b = api.description) !== null && _b !== void 0 ? _b : '',
            parameters: parameters,
            responses: responses
        },
        _a;
}
function convertOpenApi(_a) {
    var apis = _a.apis, rest = __rest(_a, ["apis"]);
    var paths = {};
    apis.forEach(function (api) {
        paths[api.url] = convertPath(api);
    });
    return __assign({ paths: paths }, rest);
}
