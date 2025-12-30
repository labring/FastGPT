package com.example.fastgptproject.service;

import com.example.fastgptproject.entity.Announcement;
import java.util.List;

/**
 * 公告服务接口
 */
public interface AnnouncementService {
    
    /**
     * 创建新公告（仅管理员）
     */
    boolean createAnnouncement(Announcement announcement);
    
    /**
     * 更新公告（仅管理员）
     */
    boolean updateAnnouncement(Announcement announcement);
    
    /**
     * 删除公告（仅管理员）
     */
    boolean deleteAnnouncement(Integer announcementId);
    
    /**
     * 获取所有活跃公告
     */
    List<Announcement> getAllActiveAnnouncements();
    
    /**
     * 获取用户未读公告列表
     */
    List<Announcement> getUnreadAnnouncementsByUserId(Integer userId);
    
    /**
     * 标记公告为已读
     */
    boolean markAnnouncementAsRead(Integer announcementId, Integer userId);
    
    /**
     * 批量标记公告为已读
     */
    boolean markMultipleAnnouncementsAsRead(List<Integer> announcementIds, Integer userId);
}
