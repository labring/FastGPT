package com.example.fastgptproject.service.impl;

import com.example.fastgptproject.entity.Announcement;
import com.example.fastgptproject.mapper.AnnouncementMapper;
import com.example.fastgptproject.service.AnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 公告服务实现类
 */
@Service
public class AnnouncementServiceImpl implements AnnouncementService {
    
    @Autowired
    private AnnouncementMapper announcementMapper;
    
    @Override
    @Transactional
    public boolean createAnnouncement(Announcement announcement) {
        if (announcement.getCreateTime() == null) {
            announcement.setCreateTime(LocalDateTime.now());
        }
        if (announcement.getIsActive() == null) {
            announcement.setIsActive(true);
        }
        if (announcement.getPriority() == null) {
            announcement.setPriority(0);
        }
        return announcementMapper.insertAnnouncement(announcement) > 0;
    }
    
    @Override
    @Transactional
    public boolean updateAnnouncement(Announcement announcement) {
        return announcementMapper.updateAnnouncement(announcement) > 0;
    }
    
    @Override
    @Transactional
    public boolean deleteAnnouncement(Integer announcementId) {
        return announcementMapper.deactivateAnnouncement(announcementId) > 0;
    }
    
    @Override
    public List<Announcement> getAllActiveAnnouncements() {
        return announcementMapper.findAllActiveAnnouncements();
    }
    
    @Override
    public List<Announcement> getUnreadAnnouncementsByUserId(Integer userId) {
        return announcementMapper.findUnreadAnnouncementsByUserId(userId);
    }
    
    @Override
    @Transactional
    public boolean markAnnouncementAsRead(Integer announcementId, Integer userId) {
        return announcementMapper.markAnnouncementAsRead(announcementId, userId) > 0;
    }
    
    @Override
    @Transactional
    public boolean markMultipleAnnouncementsAsRead(List<Integer> announcementIds, Integer userId) {
        for (Integer announcementId : announcementIds) {
            announcementMapper.markAnnouncementAsRead(announcementId, userId);
        }
        return true;
    }
}
