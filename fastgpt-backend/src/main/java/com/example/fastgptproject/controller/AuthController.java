package com.example.fastgptproject.controller;

import com.example.fastgptproject.pojo.Result;
import com.example.fastgptproject.pojo.Users;
import com.example.fastgptproject.service.UserService;
import com.example.fastgptproject.service.EmailService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RequestMapping("/api/auth")
@RestController
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private UserService userService;
    
    @Autowired
    private EmailService emailService;

    // 使用构造函数初始化替代 @PostConstruct
    @Autowired
    public AuthController(UserService userService) {
        this.userService = userService;
        // 应用启动时初始化管理员账号
        initAdminUser();
    }

    private void initAdminUser() {
        try {
            userService.initAdminUser();
        } catch (Exception e) {
            System.err.println("初始化管理员账号失败: " + e.getMessage());
        }
    }

    // 用户登录
    @PostMapping("/login")
    public Result login(@RequestBody Map<String, String> request) {
        try {
            String username = request.get("username");
            String password = request.get("password");

            if (username == null || username.trim().isEmpty()) {
                return Result.error("用户名不能为空");
            }
            if (password == null || password.trim().isEmpty()) {
                return Result.error("密码不能为空");
            }

            // 调用真实的登录验证
            Users user = userService.login(username, password);
            
            Map<String, Object> data = new HashMap<>();
            data.put("token", "jwt_token_" + user.getUserId()); // 简单的token，后续可改为真正的JWT
            data.put("role", user.getRole_id() == 2 ? "admin" : "user");
            data.put("username", user.getUserName());
            data.put("userId", user.getUserId());
            
            return Result.success(data);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    // 用户注册
    @PostMapping("/register")
    public Result register(@RequestBody Map<String, String> request) {
        try {
            String username = request.get("username");
            String password = request.get("password");
            String email = request.get("email");
            
            if (username == null || username.trim().isEmpty()) {
                return Result.error("用户名不能为空");
            }
            if (password == null || password.length() < 6) {
                return Result.error("密码至少6位");
            }
            
            // 调用真实的注册服务
            Users user = userService.register(username, email, password);
            
            Map<String, Object> data = new HashMap<>();
            data.put("userId", user.getUserId());
            data.put("username", user.getUserName());
            data.put("message", "注册成功");
            
            return Result.success(data);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    // 验证 token（简化版本）
    @PostMapping("/verify")
    public Result verifyToken(@RequestBody Map<String, String> request) {
        try {
            String token = request.get("token");
            
            if (token != null && token.startsWith("jwt_token_")) {
                String userIdStr = token.replace("jwt_token_", "");
                Integer userId = Integer.valueOf(userIdStr);
                
                Users user = userService.findById(userId);
                if (user != null) {
                    // 构建用户信息对象
                    Map<String, Object> userInfo = new HashMap<>();
                    userInfo.put("userId", user.getUserId());
                    userInfo.put("username", user.getUserName());
                    userInfo.put("email", user.getEmail());
                    userInfo.put("role", user.getRole_id() == 2 ? "admin" : "user");
                    userInfo.put("token", token); // 包含token信息
                    
                    Map<String, Object> data = new HashMap<>();
                    data.put("valid", true);
                    data.put("user", userInfo); // 完整的用户信息
                    return Result.success(data);
                }
            }
            
            Map<String, Object> data = new HashMap<>();
            data.put("valid", false);
            return Result.success(data);
        } catch (Exception e) {
            Map<String, Object> data = new HashMap<>();
            data.put("valid", false);
            return Result.success(data);
        }
    }
    
    // 发送验证码（忘记密码）
    @PostMapping("/send-verification-code")
    public Result sendVerificationCode(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            String code = request.get("code");
            
            if (email == null || email.trim().isEmpty()) {
                return Result.error("邮箱不能为空");
            }
            
            // 验证邮箱是否存在
            Users user = userService.findByEmail(email);
            if (user == null) {
                return Result.error("该邮箱未注册");
            }
            
            // 发送验证码邮件
            try {
                emailService.sendVerificationCode(email, code);
                System.out.println("验证码邮件已发送到: " + email);
            } catch (Exception e) {
                System.err.println("邮件发送失败: " + e.getMessage());
                // 如果邮件发送失败，返回错误但仍然可以使用（开发模式兼容）
                return Result.error("邮件发送失败，请检查邮件服务配置: " + e.getMessage());
            }
            
            Map<String, Object> data = new HashMap<>();
            data.put("message", "验证码已发送到您的邮箱");
            data.put("email", email);
            
            return Result.success(data);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }
    
    // 重置密码
    @PostMapping("/reset-password")
    public Result resetPassword(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            String newPassword = request.get("newPassword");
            
            if (email == null || email.trim().isEmpty()) {
                return Result.error("邮箱不能为空");
            }
            if (newPassword == null || newPassword.length() < 6) {
                return Result.error("新密码至少6位");
            }
            
            // 根据邮箱查找用户并更新密码
            boolean success = userService.resetPasswordByEmail(email, newPassword);
            
            if (success) {
                Map<String, Object> data = new HashMap<>();
                data.put("message", "密码重置成功");
                return Result.success(data);
            } else {
                return Result.error("密码重置失败");
            }
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }
}