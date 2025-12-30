// 添加到 UsersController.java 中

/**
 * 提升用户为管理员（需要超级管理员权限）
 */
@PutMapping("/{userId}/promote-admin")
public Result promoteToAdmin(@PathVariable Integer userId, @RequestHeader("Admin-Token") String adminToken) {
    try {
        // TODO: 验证 adminToken 是否为超级管理员
        
        Users user = userService.findById(userId);
        if (user == null) {
            return Result.error("用户不存在");
        }
        
        // 更新用户角色为管理员
        user.setRole_id((byte) 2);
        userService.updateUser(user);
        
        return Result.success("用户已提升为管理员");
    } catch (Exception e) {
        return Result.error("提升失败: " + e.getMessage());
    }
}

/**
 * 创建新管理员账号
 */
@PostMapping("/create-admin")
public Result createAdmin(@RequestBody Users adminUser, @RequestHeader("Admin-Token") String adminToken) {
    try {
        // TODO: 验证 adminToken 是否为超级管理员
        
        // 设置为管理员角色
        adminUser.setRole_id((byte) 2);
        
        Users newAdmin = userService.register(
            adminUser.getUserName(),
            adminUser.getEmail(),
            adminUser.getPassword()
        );
        
        return Result.success(newAdmin);
    } catch (Exception e) {
        return Result.error("创建管理员失败: " + e.getMessage());
    }
}
