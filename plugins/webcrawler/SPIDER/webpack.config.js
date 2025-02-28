// 引入path包
const path = require('path')
require('dotenv').config();
const mode = process.env.NODE_ENV || 'development'

const nodeExternals = require('webpack-node-externals');
module.exports = {
    target: 'node', // 指定构建目标为 Node.js
    externals: [nodeExternals()], // 排除 node_modules
    // 指定入口文件
    entry: "./src/index.ts",

    // 指定打包文件所在目录
    output: {
        path: path.resolve(__dirname, 'dist'),
        // 打包后文件的名称
        filename: "bundle.js"
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json'],
        fallback: {
            "zlib": require.resolve("browserify-zlib"),
            "querystring": require.resolve("querystring-es3"),
            "path": require.resolve("path-browserify"),
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "os": require.resolve("os-browserify/browser"),
            "http": require.resolve("stream-http"),
            "net": false, 
            "string_decoder": require.resolve("string_decoder/"),
            "url": require.resolve("url/"),
            "buffer": require.resolve("buffer/"),
            "util": require.resolve("util/"),
            // 新增 assert 的 fallback
            "assert": require.resolve("assert/"),
            // 处理新出现的 vm 警告
            "vm": require.resolve("vm-browserify"),
            "fs": false
        }
    },

    // 指定webpack打包的时候要使用的模块
    module: {
        // 指定要价在的规则
        rules: [
            {
                // test指定的是规则生效的文件,意思是，用ts-loader来处理以ts为结尾的文件
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    mode,
}
