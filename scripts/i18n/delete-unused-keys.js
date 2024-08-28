const fs = require('fs').promises
const path = require('path')

// 配置项
const CONFIG = {
  i18nDirectory: path.join(__dirname, '../../packages/web/i18n'),
  sourceDirectories: ['../../packages', '../../projects/app'].map(dir => path.join(__dirname, dir)),
  fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  ignoreDirectories: ['node_modules', '.next', 'public', 'i18n']
}

// 从文件中加载 JSON
const loadJSON = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error(`读取 JSON 文件 ${filePath} 时出错:`, error)
    return null
  }
}

// 递归提取 JSON 对象的所有键
const extractKeysFromJSON = (obj, parentKey = '') => {
  let keys = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key
    if (typeof value === 'object' && value !== null) {
      keys = keys.concat(extractKeysFromJSON(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

// 递归获取文件夹中的所有 JSON 文件
const getAllJSONFiles = async (dir) => {
  let results = []
  const list = await fs.readdir(dir)
  await Promise.all(list.map(async (file) => {
    const filePath = path.join(dir, file)
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      if (!CONFIG.ignoreDirectories.includes(file)) {
        results = results.concat(await getAllJSONFiles(filePath))
      }
    } else if (filePath.endsWith('.json')) {
      results.push(filePath)
    }
  }))
  return results
}

// 提取文件夹中所有 JSON 文件的键
const extractKeysFromDirectory = async (dir) => {
  let allKeys = new Set()

  const subDirs = await fs.readdir(dir)
  await Promise.all(subDirs.map(async (subDir) => {
    const subDirPath = path.join(dir, subDir)
    const stat = await fs.stat(subDirPath)
    if (stat.isDirectory() && !CONFIG.ignoreDirectories.includes(subDir)) {
      const files = await getAllJSONFiles(subDirPath)
      await Promise.all(files.map(async (file) => {
        const jsonObject = await loadJSON(file)
        if (jsonObject) {
          const keys = extractKeysFromJSON(jsonObject)
          keys.forEach(key => allKeys.add(key))
        }
      }))
    }
  }))

  return Array.from(allKeys)
}

// 检查键是否在内容中使用
const isKeyUsedInContent = (content, key) => {
  const regex = new RegExp(`\\b${key}\\b`, 'g')
  return regex.test(content)
}

// 递归在文件夹中搜索键
const searchKeysInFiles = async (dir, keys, usedKeys) => {
  const list = await fs.readdir(dir)
  await Promise.all(list.map(async (file) => {
    const filePath = path.join(dir, file)
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      if (!CONFIG.ignoreDirectories.includes(file)) {
        await searchKeysInFiles(filePath, keys, usedKeys)
      }
    } else if (CONFIG.fileExtensions.includes(path.extname(file))) {
      const data = await fs.readFile(filePath, 'utf8')
      keys.forEach(key => {
        if (isKeyUsedInContent(data, key)) {
          usedKeys.add(key)
        }
      })
    }
  }))
}

// 从扁平键路径恢复嵌套对象
const restoreNestedStructure = (keys) => {
  const result = {}
  keys.forEach(key => {
    const parts = key.split('.')
    let current = result
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = index === parts.length - 1 ? null : {}
      }
      current = current[part]
    })
  })
  return result
}

// 递归删除未使用的键
const removeUnusedKeys = (target, unusedKeys) => {
  for (const [key, value] of Object.entries(unusedKeys)) {
    if (value === null) {
      delete target[key]
    } else if (typeof target[key] === 'object' && target[key] !== null) {
      removeUnusedKeys(target[key], value)
      if (Object.keys(target[key]).length === 0) {
        delete target[key]
      }
    }
  }
}

// 处理 JSON 文件
const processJSONFile = async (filePath, unusedKeys) => {
  try {
    const jsonObject = await loadJSON(filePath)
    if (jsonObject) {
      removeUnusedKeys(jsonObject, unusedKeys)
      await fs.writeFile(filePath, JSON.stringify(jsonObject, null, 2), 'utf8')
      console.log(`已处理文件 ${filePath}`)
    }
  } catch (error) {
    console.error(`处理文件 ${filePath} 时出错:`, error)
  }
}

// 递归处理目录中的所有 JSON 文件
const processJSONFilesInDirectory = async (dir, unusedKeys) => {
  const list = await fs.readdir(dir)
  await Promise.all(list.map(async (file) => {
    const filePath = path.join(dir, file)
    const stat = await fs.stat(filePath)
    if (stat.isDirectory() && !CONFIG.ignoreDirectories.includes(file)) {
      await processJSONFilesInDirectory(filePath, unusedKeys)
    } else if (stat.isFile() && file.endsWith('.json')) {
      await processJSONFile(filePath, unusedKeys)
    }
  }))
}

// 将 keys 写入 JSON 文件
const writeKeysToFile = async (filePath, keys) => {
  try {
    await fs.writeFile(filePath, JSON.stringify(keys, null, 2), 'utf8')
    console.log(`已将 keys 写入文件 ${filePath}`)
  } catch (error) {
    console.error(`写入文件 ${filePath} 时出错:`, error)
  }
}

// 主函数
const main = async () => {
  const allKeys = await extractKeysFromDirectory(CONFIG.i18nDirectory)
  // await writeKeysToFile(path.join(__dirname, 'allKeys.json'), allKeys)
  const usedKeys = new Set()
  await Promise.all(CONFIG.sourceDirectories.map(dir => searchKeysInFiles(dir, allKeys, usedKeys)))

  const unusedKeys = allKeys.filter(key => !usedKeys.has(key))
  // await writeKeysToFile(path.join(__dirname, 'unusedKeys.json'), unusedKeys)
  console.log(unusedKeys)

  const nestedUnusedKeys = restoreNestedStructure(unusedKeys)
  await processJSONFilesInDirectory(CONFIG.i18nDirectory, nestedUnusedKeys)
}

main().catch(err => console.error('执行过程中出错:', err))