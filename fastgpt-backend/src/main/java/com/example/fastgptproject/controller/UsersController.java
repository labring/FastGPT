package com.example.fastgptproject.controller;

import com.example.fastgptproject.pojo.Result;
import com.example.fastgptproject.pojo.Users;
import com.example.fastgptproject.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequestMapping("/api/users")
@RestController
@CrossOrigin(origins = "*")
public class UsersController {

    @Autowired
    private UserService userService;

    @GetMapping("/test")
    public Result test() {
        return Result.success("用户接口测试成功");
    }

    // 获取所有用户（管理员功能）
    @GetMapping
    public Result findAllUsers() {
        try {
            List<Users> usersList = userService.findAllUsers();
            return Result.success(usersList);
        } catch (Exception e) {
            return Result.error("获取用户列表失败: " + e.getMessage());
        }
    }

    // 根据ID获取用户信息
    @GetMapping("/{userId}")
    public Result getUserById(@PathVariable Integer userId) {
        try {
            Users user = userService.findById(userId);
            if (user != null) {
                return Result.success(user);
            } else {
                return Result.error("用户不存在");
            }
        } catch (Exception e) {
            return Result.error("获取用户信息失败: " + e.getMessage());
        }
    }

    // 删除用户（管理员功能）
    @DeleteMapping("/{userId}")
    public Result deleteUser(@PathVariable Integer userId) {
        try {
            boolean success = userService.deleteUser(userId);
            if (success) {
                return Result.success("删除用户成功");
            } else {
                return Result.error("删除用户失败");
            }
        } catch (Exception e) {
            return Result.error("删除用户失败: " + e.getMessage());
        }
    }

    // 提升用户为管理员（仅超级管理员）
    @PutMapping("/{userId}/promote")
    public Result promoteToAdmin(@PathVariable Integer userId) {
        try {
            boolean success = userService.promoteToAdmin(userId);
            if (success) {
                return Result.success("提升为管理员成功");
            } else {
                return Result.error("提升失败，用户不存在");
            }
        } catch (Exception e) {
            return Result.error("提升失败: " + e.getMessage());
        }
    }

    // 降级管理员为普通用户（仅超级管理员）
    @PutMapping("/{userId}/demote")
    public Result demoteAdmin(@PathVariable Integer userId) {
        try {
            boolean success = userService.demoteAdmin(userId);
            if (success) {
                return Result.success("降级为普通用户成功");
            } else {
                return Result.error("降级失败，用户不存在");
            }
        } catch (Exception e) {
            return Result.error("降级失败: " + e.getMessage());
        }
    }

    // 创建管理员账号（仅超级管理员）
    @PostMapping("/create-admin")
    public Result createAdmin(@RequestBody CreateAdminRequest request) {
        try {
            Users newAdmin = userService.createAdmin(request.getUsername(), request.getEmail(), request.getPassword());
            return Result.success(newAdmin);
        } catch (Exception e) {
            return Result.error("创建管理员失败: " + e.getMessage());
        }
    }

    // 修改密码
    @PutMapping("/{userId}/change-password")
    public Result changePassword(@PathVariable Integer userId, @RequestBody PasswordChangeRequest request) {
        try {
            boolean success = userService.changePassword(userId, request.getOldPassword(), request.getNewPassword());
            if (success) {
                return Result.success("密码修改成功");
            } else {
                return Result.error("密码修改失败，旧密码不正确");
            }
        } catch (Exception e) {
            return Result.error("密码修改失败: " + e.getMessage());
        }
    }

    // 重置密码（管理员功能）
    @PutMapping("/{userId}/reset-password")
    public Result resetPassword(@PathVariable Integer userId, @RequestBody PasswordResetRequest request) {
        try {
            boolean success = userService.resetPassword(userId, request.getNewPassword());
            if (success) {
                return Result.success("密码重置成功");
            } else {
                return Result.error("密码重置失败，用户不存在");
            }
        } catch (Exception e) {
            return Result.error("密码重置失败: " + e.getMessage());
        }
    }

    // 内部类：创建管理员请求
    public static class CreateAdminRequest {
        private String username;
        private String email;
        private String password;

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }

    // 内部类：密码修改请求
    public static class PasswordChangeRequest {
        private String oldPassword;
        private String newPassword;

        public String getOldPassword() {
            return oldPassword;
        }

        public void setOldPassword(String oldPassword) {
            this.oldPassword = oldPassword;
        }

        public String getNewPassword() {
            return newPassword;
        }

        public void setNewPassword(String newPassword) {
            this.newPassword = newPassword;
        }
    }

    // 内部类：密码重置请求
    public static class PasswordResetRequest {
        private String newPassword;

        public String getNewPassword() {
            return newPassword;
        }

        public void setNewPassword(String newPassword) {
            this.newPassword = newPassword;
        }
    }
}
