package com.example.fastgptproject.controller;

import com.example.fastgptproject.pojo.Conversation;
import com.example.fastgptproject.pojo.Result;
import com.example.fastgptproject.pojo.Users;
import com.example.fastgptproject.service.ConversationService;
import com.example.fastgptproject.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 对话记录控制器
 * 用于分享页面的埋点数据收集和管理后台的对话记录展示
 */
@RequestMapping("/api/conversation")
@RestController
@CrossOrigin(origins = "*")
public class ConversationController {

    @Autowired
    private ConversationService conversationService;
    
    @Autowired
    private UserService userService;

    /**
     * 测试接口
     */
    @GetMapping("/test")
    public Result test() {
        return Result.success("对话接口测试成功");
    }

    /**
     * 记录对话 - 供分享页面调用
     * POST /api/conversation/log
     */
    @PostMapping("/log")
    public Result logConversation(@RequestBody Map<String, Object> request) {
        try {
            System.out.println("========== 对话埋点请求到达 ==========");
            System.out.println("请求数据: " + request);
            
            // 验证必填字段
            Object userIdObj = request.get("userId");
            if (userIdObj == null) {
                System.out.println("❌ userId 为空");
                return Result.error("userId 不能为空，用户必须登录");
            }
            
            System.out.println("✓ userId: " + userIdObj);
            
            Conversation conversation = new Conversation();
            
            // 解析用户ID
            Integer userId = null;
            if (userIdObj instanceof Integer) {
                userId = (Integer) userIdObj;
            } else if (userIdObj instanceof String) {
                try {
                    userId = Integer.parseInt((String) userIdObj);
                } catch (NumberFormatException e) {
                    System.out.println("❌ userId 格式错误: " + userIdObj);
                    return Result.error("userId 格式错误");
                }
            }
            
            if (userId == null) {
                System.out.println("❌ userId 解析失败");
                return Result.error("userId 不能为空，用户必须登录");
            }
            
            conversation.setUserId(userId);
            
            // 标题（问题摘要）
            String question = (String) request.get("question");
            String title = question != null && question.length() > 50 
                ? question.substring(0, 50) + "..." 
                : question;
            conversation.setTitle(title);
            
            System.out.println("✓ 标题: " + title);
            
            // 内容（存储问答的JSON格式）
            String answer = (String) request.get("answer");
            Map<String, String> contentMap = new HashMap<>();
            contentMap.put("question", question);
            contentMap.put("answer", answer);
            // 额外信息也可以存储
            if (request.get("shareId") != null) {
                contentMap.put("shareId", (String) request.get("shareId"));
            }
            if (request.get("appId") != null) {
                contentMap.put("appId", (String) request.get("appId"));
            }
            // 将内容转换为JSON字符串存储
            conversation.setContent(mapToJson(contentMap));
            
            System.out.println("✓ 内容: " + conversation.getContent());
            
            // 调用 Service 保存
            Conversation savedConversation = conversationService.saveConversation(conversation);
            
            System.out.println("✓ 保存成功，ID: " + savedConversation.getId());
            System.out.println("========== 对话记录保存完成 ==========");
            
            Map<String, Object> data = new HashMap<>();
            data.put("id", savedConversation.getId());
            data.put("userId", userId);
            data.put("message", "对话记录保存成功");
            return Result.success(data);
        } catch (Exception e) {
            System.out.println("❌ 异常错误: " + e.getMessage());
            e.printStackTrace();
            return Result.error("保存对话记录异常: " + e.getMessage());
        }
    }

    /**
     * 获取所有对话记录 - 供管理后台调用
     * GET /api/conversation/logs
     */
    @GetMapping("/logs")
    public Result getConversations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            @RequestParam(required = false) String keyword) {
        try {
            Map<String, Object> data;
            
            if (keyword != null && !keyword.isEmpty()) {
                data = conversationService.searchConversations(keyword, page, pageSize);
            } else {
                data = conversationService.findAllConversations(page, pageSize);
            }
            
            // 数据已经包含用户名信息（通过JOIN查询），直接返回
            return Result.success(data);
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("获取对话记录失败: " + e.getMessage());
        }
    }

    /**
     * 根据用户ID获取对话记录
     * GET /api/conversation/user/{userId}
     */
    @GetMapping("/user/{userId}")
    public Result getConversationsByUserId(@PathVariable Integer userId) {
        try {
            List<Conversation> conversations = conversationService.findByUserId(userId);
            return Result.success(conversations);
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("获取用户对话记录失败: " + e.getMessage());
        }
    }

    /**
     * 删除对话记录
     * DELETE /api/conversation/{id}
     */
    @DeleteMapping("/{id}")
    public Result deleteConversation(@PathVariable Integer id) {
        try {
            boolean success = conversationService.deleteConversation(id);
            if (success) {
                return Result.success("删除成功");
            } else {
                return Result.error("对话记录不存在");
            }
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("删除对话记录失败: " + e.getMessage());
        }
    }

    /**
     * 获取对话统计信息
     * GET /api/conversation/stats
     */
    @GetMapping("/stats")
    public Result getStats() {
        try {
            int totalConversations = conversationService.countConversations();
            
            Map<String, Object> stats = new HashMap<>();
            stats.put("totalConversations", totalConversations);
            
            return Result.success(stats);
        } catch (Exception e) {
            e.printStackTrace();
            return Result.error("获取统计信息失败: " + e.getMessage());
        }
    }

    /**
     * 简单的Map转JSON字符串方法
     */
    private String mapToJson(Map<String, String> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : map.entrySet()) {
            if (!first) {
                sb.append(",");
            }
            sb.append("\"").append(entry.getKey()).append("\":\"")
              .append(escapeJson(entry.getValue())).append("\"");
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }

    /**
     * 转义JSON特殊字符
     */
    private String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
}
