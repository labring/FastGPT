package com.example.fastgptproject.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 公告实体类
 */
@Data
public class Announcement {
    private Integer announcementId;
    private Integer adminUserId;
    private String title;
    private String content;
    private Integer priority;  // 0=普通, 1=重要, 2=紧急
    private Boolean isActive;
    private LocalDateTime createTime;
    private LocalDateTime expireTime;
    
    // 扩展字段（用于查询时携带额外信息）
    private Boolean isRead;  // 当前用户是否已读
    private LocalDateTime readTime;  // 当前用户阅读时间
}
