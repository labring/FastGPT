# 清理历史团队成员角色

当前团队成员角色只保留 `owner` 标识，其他权限由独立权限记录维护。
此脚本仅对 `team_members` 中存在且不等于 `owner` 的 `role` 执行 `$unset`，包括历史字符串、空字符串和 null。
不删除成员，不修改权限记录，不执行自动迁移。可重复执行。

## 执行顺序

1. 确认所有应用实例已不再写入非 owner 角色；备份目标数据库。
2. 通过安全方式设置 `MONGODB_URI` 环境变量，不将凭据写进脚本或提交到仓库。
3. 在仓库根目录预览（需要已安装项目依赖），显式指定业务数据库名：

   ```sh
   node scripts/cleanup-team-member-role.mjs --db fastgpt
   ```

4. 核对数据库名称及 `before` 数量后，显式执行：

   ```sh
   node scripts/cleanup-team-member-role.mjs --db fastgpt --apply --confirm-db fastgpt
   ```

5. 确认 `remaining` 为 0；再部署移除兼容的公共服务和 Pro。分别验证 owner、普通成员及管理员登录和团队列表。

将示例中的 `fastgpt` 替换为实际业务库名。国内、国际等不同数据库分别预览和确认，不自动遍历。
默认不会写入；脚本不会输出 URI 或用户数据。执行会永久移除旧字段值，需要恢复时使用执行前备份。
执行失败时可能已有部分记录完成更新，查明原因后可以安全重跑。
