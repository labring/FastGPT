package com.example.fastgptproject.controller;

import com.example.fastgptproject.mapper.ChatLogViewMapper;
import com.example.fastgptproject.mapper.UserViewMapper;
import com.example.fastgptproject.pojo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理后台使用视图的安全 API
 * 所有查询操作使用视图，写操作仍使用原 Controller
 */
@RequestMapping("/api/admin/view")
@RestController
@CrossOrigin(origins = "*")
public class AdminViewController {

    @Autowired
    private UserViewMapper userViewMapper;

    @Autowired
    private ChatLogViewMapper chatLogViewMapper;

    /**
     * 获取所有用户（从安全视图）
     */
    @GetMapping("/users")
    public Result getAllUsers() {
        try {
            return Result.success(userViewMapper.findAllUsersFromView());
        } catch (Exception e) {
            return Result.error("查询用户失败: " + e.getMessage());
        }
    }

    /**
     * 获取所有管理员（从管理员视图）
     */
    @GetMapping("/admins")
    public Result getAllAdmins() {
        try {
            return Result.success(userViewMapper.findAllAdminsFromView());
        } catch (Exception e) {
            return Result.error("查询管理员失败: " + e.getMessage());
        }
    }

    /**
     * 根据用户ID查询用户（从安全视图）
     */
    @GetMapping("/users/{userId}")
    public Result getUserById(@PathVariable Integer userId) {
        try {
            return Result.success(userViewMapper.findByUserIdFromView(userId));
        } catch (Exception e) {
            return Result.error("查询用户失败: " + e.getMessage());
        }
    }

    /**
     * 获取所有对话记录（从视图，包含用户信息）
     */
    @GetMapping("/chat-logs")
    public Result getAllChatLogs() {
        try {
            return Result.success(chatLogViewMapper.findAllChatLogsFromView());
        } catch (Exception e) {
            return Result.error("查询对话记录失败: " + e.getMessage());
        }
    }

    /**
     * 根据用户ID查询对话记录（从视图）
     */
    @GetMapping("/chat-logs/user/{userId}")
    public Result getChatLogsByUserId(@PathVariable Integer userId) {
        try {
            return Result.success(chatLogViewMapper.findChatLogsByUserIdFromView(userId));
        } catch (Exception e) {
            return Result.error("查询对话记录失败: " + e.getMessage());
        }
    }

    /**
     * 根据分类查询对话记录（从视图）
     */
    @GetMapping("/chat-logs/category/{category}")
    public Result getChatLogsByCategory(@PathVariable String category) {
        try {
            return Result.success(chatLogViewMapper.findChatLogsByCategoryFromView(category));
        } catch (Exception e) {
            return Result.error("查询对话记录失败: " + e.getMessage());
        }
    }

    /**
     * 获取对话统计数据（按分类）
     */
    @GetMapping("/chat-stats")
    public Result getChatStats() {
        try {
            List<Map<String, Object>> stats = chatLogViewMapper.getChatStatsByCategory();
            Map<String, Object> result = new HashMap<>();
            result.put("categoryStats", stats);
            result.put("totalCategories", stats.size());
            return Result.success(result);
        } catch (Exception e) {
            return Result.error("查询统计数据失败: " + e.getMessage());
        }
    }

    /**
     * 健康检查
     */
    @GetMapping("/health")
    public Result health() {
        return Result.success("视图 API 运行正常");
    }
}
