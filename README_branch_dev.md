# FastGPT 分支开发与同步官方仓库说明

## 1. 分支管理规范

- **主分支（main）**：仅用于同步官方最新代码，不直接开发。
- **开发分支（yuto）**：所有自定义开发均在 yuto 分支进行。
- **远程仓库**：
  - `origin`：指向你自己的 GitHub 仓库（如：`https://github.com/你的用户名/FastGPT.git`）
  - `upstream`：指向官方仓库（如：`https://github.com/labring/FastGPT.git`）

## 2. 新建开发分支（首次）

```bash
git checkout main           # 切换到主分支
git pull upstream main      # 拉取官方主分支最新代码
git push origin main        # 可选：同步到你自己的远程仓库
git checkout -b yuto        # 基于主分支新建开发分支
git push origin yuto        # 推送开发分支到自己仓库
```

## 3. 日常开发流程

1. 在 `yuto` 分支开发，提交代码：
   ```bash
   git add .
   git commit -m "功能描述"
   git push origin yuto
   ```
2. 不要直接在 main 分支开发。

## 4. 同步官方最新代码并合并到开发分支

每当需要同步官方最新代码时：

```bash
git checkout main
# 拉取官方主分支最新代码
git pull upstream main
# 可选：同步到你自己的远程仓库
git push origin main

# 切回开发分支，合并主分支最新内容
git checkout yuto
git merge main
# 解决冲突（如有），完成后
git push origin yuto
```

## 5. 常用命令速查

```bash
# 同步官方主分支
git checkout main
git pull upstream main
git push origin main

# 合并到开发分支
git checkout yuto
git merge main
git push origin yuto

# 推送开发分支到自己仓库
git push origin yuto
```

## 6. 注意事项

- **main 分支只做同步，不做开发。**
- **所有开发都在 yuto 分支进行。**
- 合并时如遇冲突，优先保证主分支兼容性，必要时手动解决。
- 定期同步官方代码，减少冲突风险。
- 推送代码前请确保本地已合并最新主分支内容。
- 建议每次合并、开发新功能、修复冲突时，记录开发日志。

---

如有疑问或需自动化脚本、冲突解决技巧等，请联系项目维护者。 