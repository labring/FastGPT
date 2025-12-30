package com.example.fastgptproject.controller;

import com.example.fastgptproject.pojo.Result;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RequestMapping("/api/conversations")
@RestController
@CrossOrigin(origins = "*")
public class ConversationControllerNew {

    // 保存用户对话
    @PostMapping
    public Result saveConversation(@RequestBody Map<String, Object> request) {
        try {
            String question = (String) request.get("question");
            String answer = (String) request.get("answer");
            
            // 模拟保存对话
            Map<String, Object> data = new HashMap<>();
            data.put("question", question);
            data.put("answer", answer);
            data.put("id", System.currentTimeMillis());
            
            return Result.success(data);
        } catch (Exception e) {
            return Result.error("保存对话失败: " + e.getMessage());
        }
    }

    // 获取对话历史
    @GetMapping
    public Result getConversations() {
        try {
            // 模拟对话历史
            List<Map<String, Object>> conversations = new ArrayList<>();
            
            Map<String, Object> conv1 = new HashMap<>();
            conv1.put("id", 1);
            conv1.put("question", "你好");
            conv1.put("answer", "你好！我是AI助手，有什么可以帮到您的吗？");
            conv1.put("createTime", "2024-01-01 10:00:00");
            conversations.add(conv1);
            
            return Result.success(conversations);
        } catch (Exception e) {
            return Result.error("获取对话历史失败: " + e.getMessage());
        }
    }

    // 删除对话
    @DeleteMapping("/{conversationId}")
    public Result deleteConversation(@PathVariable Integer conversationId) {
        try {
            // 模拟删除
            return Result.success("删除成功");
        } catch (Exception e) {
            return Result.error("删除失败: " + e.getMessage());
        }
    }
}