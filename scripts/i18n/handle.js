const fs = require('fs')
const path = require('path')

const directoryPath = path.join(__dirname, '../../packages/web') // 指定要搜索的文件夹

// 递归读取目录中的文件
const readDirectoryAndReplace = (dirPath) => {
  fs.readdir(dirPath, (err, files) => {
    if (err) {
      return console.log('Unable to scan directory: ' + err)
    }

    files.forEach((file) => {
      const filePath = path.join(dirPath, file)
      fs.stat(filePath, (err, stats) => {
        if (err) {
          return console.log(err)
        }

        if (stats.isDirectory()) {
          // 如果是目录，则递归调用
          readDirectoryAndReplace(filePath)
        } else if (stats.isFile() && (path.extname(file) === '.js' || path.extname(file) === '.ts' || path.extname(file) === '.tsx')) {
          // 如果是 .js, .ts 或 .tsx 文件，则读取和处理
          fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
              return console.log(err)
            }
            // 使用正则表达式匹配 t('xxxx')，其中 xxxx 可以是任意字符，且确保仅匹配 t 函数
            const result = data.replace(/\bt\('([^']+)'\)/g, (match, p1) => {
              const newKey = 'common:' + p1
              console.log(`Replacing '${p1}' with '${newKey}'`)
              return `t('${newKey}')`
            })
            // 将修改后的内容写回文件
            // fs.writeFile(filePath, result, 'utf8', (err) => {
            //   if (err) return console.log(err)
            //   console.log(`Replaced in ${filePath}`)
            // })
          })
        }
      })
    })
  })
}

// 开始读取目录并替换
readDirectoryAndReplace(directoryPath)