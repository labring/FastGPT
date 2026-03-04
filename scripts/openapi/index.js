"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./utils");
var fs = require("fs");
var path = require("path");
var openapi_1 = require("./openapi");
var rootPath = 'projects/app/src/pages/api';
var exclude = ['/admin', '/proApi'];
function getAllFiles(dir) {
    var files = [];
    var stat = fs.statSync(dir);
    if (stat.isDirectory()) {
        var list = fs.readdirSync(dir);
        list.forEach(function (item) {
            var fullPath = path.join(dir, item);
            if (!exclude.some(function (excluded) { return fullPath.includes(excluded); })) {
                files = files.concat(getAllFiles(fullPath));
            }
        });
    }
    else {
        files.push(dir);
    }
    return files;
}
var searchPath = process.env.SEARCH_PATH || '';
var files = getAllFiles(path.join(rootPath, searchPath));
// console.log(files)
var apis = files.map(function (file) {
    return (0, utils_1.parseAPI)({ path: file, rootPath: rootPath });
});
var openapi = (0, openapi_1.convertOpenApi)({
    apis: apis,
    openapi: '3.0.0',
    info: {
        title: 'FastGPT OpenAPI',
        version: '1.0.0',
        author: 'FastGPT'
    },
    servers: [
        {
            url: 'http://localhost:4000'
        }
    ]
});
var json = JSON.stringify(openapi, null, 2);
fs.writeFileSync('./scripts/openapi/openapi.json', json);
fs.writeFileSync('./scripts/openapi/openapi.out', JSON.stringify(apis, null, 2));
console.log('Total APIs:', files.length);
