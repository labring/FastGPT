package com.example.fastgptproject.controller;

import com.example.fastgptproject.entity.Announcement;
import com.example.fastgptproject.service.AnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 公告控制器
 */
@RestController
@RequestMapping("/api/announcements")
@CrossOrigin(origins = "*")
public class AnnouncementController {
    
    @Autowired
    private AnnouncementService announcementService;
    
    /**
     * 创建公告（管理员）
     */
    @PostMapping("/create")
    public ResponseEntity<Map<String, Object>> createAnnouncement(@RequestBody Announcement announcement) {
        Map<String, Object> response = new HashMap<>();
        try {
            // TODO: 添加管理员权限验证
            boolean success = announcementService.createAnnouncement(announcement);
            if (success) {
                response.put("code", 200);
                response.put("message", "公告创建成功");
                response.put("data", announcement);
            } else {
                response.put("code", 500);
                response.put("message", "公告创建失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "创建公告时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 更新公告（管理员）
     */
    @PutMapping("/update")
    public ResponseEntity<Map<String, Object>> updateAnnouncement(@RequestBody Announcement announcement) {
        Map<String, Object> response = new HashMap<>();
        try {
            // TODO: 添加管理员权限验证
            boolean success = announcementService.updateAnnouncement(announcement);
            if (success) {
                response.put("code", 200);
                response.put("message", "公告更新成功");
            } else {
                response.put("code", 404);
                response.put("message", "公告不存在或更新失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "更新公告时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 删除公告（管理员）
     */
    @DeleteMapping("/delete/{announcementId}")
    public ResponseEntity<Map<String, Object>> deleteAnnouncement(@PathVariable Integer announcementId) {
        Map<String, Object> response = new HashMap<>();
        try {
            // TODO: 添加管理员权限验证
            boolean success = announcementService.deleteAnnouncement(announcementId);
            if (success) {
                response.put("code", 200);
                response.put("message", "公告删除成功");
            } else {
                response.put("code", 404);
                response.put("message", "公告不存在或删除失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "删除公告时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 获取所有活跃公告
     */
    @GetMapping("/all")
    public ResponseEntity<Map<String, Object>> getAllAnnouncements() {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Announcement> announcements = announcementService.getAllActiveAnnouncements();
            response.put("code", 200);
            response.put("message", "获取成功");
            response.put("data", announcements);
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "获取公告列表时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 获取用户未读公告（核心接口）
     */
    @GetMapping("/unread/{userId}")
    public ResponseEntity<Map<String, Object>> getUnreadAnnouncements(@PathVariable Integer userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Announcement> announcements = announcementService.getUnreadAnnouncementsByUserId(userId);
            response.put("code", 200);
            response.put("message", "获取成功");
            response.put("data", announcements);
            response.put("count", announcements.size());
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "获取未读公告时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 标记公告为已读
     */
    @PostMapping("/mark-read")
    public ResponseEntity<Map<String, Object>> markAsRead(@RequestBody Map<String, Integer> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            Integer announcementId = request.get("announcementId");
            Integer userId = request.get("userId");
            
            boolean success = announcementService.markAnnouncementAsRead(announcementId, userId);
            if (success) {
                response.put("code", 200);
                response.put("message", "标记成功");
            } else {
                response.put("code", 500);
                response.put("message", "标记失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "标记已读时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
    
    /**
     * 批量标记公告为已读
     */
    @PostMapping("/mark-read-batch")
    public ResponseEntity<Map<String, Object>> markMultipleAsRead(@RequestBody Map<String, Object> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            @SuppressWarnings("unchecked")
            List<Integer> announcementIds = (List<Integer>) request.get("announcementIds");
            Integer userId = (Integer) request.get("userId");
            
            boolean success = announcementService.markMultipleAnnouncementsAsRead(announcementIds, userId);
            if (success) {
                response.put("code", 200);
                response.put("message", "批量标记成功");
            } else {
                response.put("code", 500);
                response.put("message", "批量标记失败");
            }
        } catch (Exception e) {
            response.put("code", 500);
            response.put("message", "批量标记已读时发生错误: " + e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
}
