package com.example.fastgptproject.mapper;

import com.example.fastgptproject.entity.Announcement;
import com.example.fastgptproject.entity.UserAnnouncementStatus;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 公告 Mapper 接口
 */
@Mapper
public interface AnnouncementMapper {
    
    /**
     * 创建新公告
     */
    int insertAnnouncement(Announcement announcement);
    
    /**
     * 更新公告
     */
    int updateAnnouncement(Announcement announcement);
    
    /**
     * 删除公告（软删除，设置 is_active = false）
     */
    int deactivateAnnouncement(@Param("announcementId") Integer announcementId);
    
    /**
     * 查询所有活跃公告
     */
    List<Announcement> findAllActiveAnnouncements();
    
    /**
     * 查询用户未读公告（联合查询）
     */
    List<Announcement> findUnreadAnnouncementsByUserId(@Param("userId") Integer userId);
    
    /**
     * 标记公告为已读
     */
    int markAnnouncementAsRead(@Param("announcementId") Integer announcementId, 
                               @Param("userId") Integer userId);
    
    /**
     * 查询用户对某公告的阅读状态
     */
    UserAnnouncementStatus findUserAnnouncementStatus(@Param("announcementId") Integer announcementId,
                                                      @Param("userId") Integer userId);
    
    /**
     * 获取公告的阅读统计
     */
    AnnouncementReadStats getAnnouncementReadStats(@Param("announcementId") Integer announcementId);
}

/**
 * 公告阅读统计
 */
class AnnouncementReadStats {
    private Integer announcementId;
    private String title;
    private Integer totalUsers;
    private Integer readUsers;
    private Double readPercentage;
    
    // Getters and Setters
    public Integer getAnnouncementId() { return announcementId; }
    public void setAnnouncementId(Integer announcementId) { this.announcementId = announcementId; }
    
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    
    public Integer getTotalUsers() { return totalUsers; }
    public void setTotalUsers(Integer totalUsers) { this.totalUsers = totalUsers; }
    
    public Integer getReadUsers() { return readUsers; }
    public void setReadUsers(Integer readUsers) { this.readUsers = readUsers; }
    
    public Double getReadPercentage() { return readPercentage; }
    public void setReadPercentage(Double readPercentage) { this.readPercentage = readPercentage; }
}
