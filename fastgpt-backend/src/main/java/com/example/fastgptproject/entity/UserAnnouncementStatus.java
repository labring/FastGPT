package com.example.fastgptproject.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 用户公告阅读状态实体类
 */
@Data
public class UserAnnouncementStatus {
    private Integer statusId;
    private Integer announcementId;
    private Integer userId;
    private Boolean isRead;
    private LocalDateTime readTime;
}
