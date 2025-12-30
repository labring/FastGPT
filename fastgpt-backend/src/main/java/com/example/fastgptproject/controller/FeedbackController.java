package com.example.fastgptproject.controller;

import com.example.fastgptproject.entity.Feedback;
import com.example.fastgptproject.service.FeedbackService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 反馈控制器
 */
@RestController
@RequestMapping("/api/feedbacks")
@CrossOrigin(origins = "*")
public class FeedbackController {
    
    @Autowired
    private FeedbackService feedbackService;
    
    /**
     * 获取所有反馈
     */
    @GetMapping("/all")
    public ResponseEntity<Map<String, Object>> getAllFeedbacks() {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Feedback> feedbacks = feedbackService.getAllFeedbacks();
            response.put("code", 200);
            response.put("message", "获取成功");
            response.put("data", feedbacks);
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "获取反馈列表时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 根据用户ID获取反馈
     */
    @GetMapping("/user/{userId}")
    public ResponseEntity<Map<String, Object>> getFeedbacksByUserId(@PathVariable Integer userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Feedback> feedbacks = feedbackService.getFeedbacksByUserId(userId);
            response.put("code", 200);
            response.put("message", "获取成功");
            response.put("data", feedbacks);
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "获取用户反馈时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 创建反馈
     */
    @PostMapping("/create")
    public ResponseEntity<Map<String, Object>> createFeedback(@RequestBody Feedback feedback) {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean success = feedbackService.createFeedback(feedback);
            if (success) {
                response.put("code", 200);
                response.put("message", "反馈提交成功");
                response.put("data", feedback);
            } else {
                response.put("code", 500);
                response.put("message", "反馈提交失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "提交反馈时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 删除反馈
     */
    @DeleteMapping("/delete/{fbId}")
    public ResponseEntity<Map<String, Object>> deleteFeedback(@PathVariable Integer fbId) {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean success = feedbackService.deleteFeedback(fbId);
            if (success) {
                response.put("code", 200);
                response.put("message", "反馈删除成功");
            } else {
                response.put("code", 404);
                response.put("message", "反馈不存在或删除失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "删除反馈时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
}
