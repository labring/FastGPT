import React, { useEffect, useState } from 'react';
import './AnnouncementModal.css';

interface Announcement {
  announcementId: number;
  title: string;
  content: string;
  priority: number;
  createTime: string;
}

interface AnnouncementModalProps {
  userId: number;
  onClose: () => void;
}

const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ userId, onClose }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetchUnreadAnnouncements();
  }, [userId]);

  const fetchUnreadAnnouncements = async () => {
    try {
      const apiUrl = window.location.hostname === 'localhost'
        ? `http://localhost:8080/api/announcements/unread/${userId}`
        : `http://10.14.53.120:8080/api/announcements/unread/${userId}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data.code === 200 && data.data.length > 0) {
        setAnnouncements(data.data);
      } else {
        // 没有未读公告，直接关闭
        onClose();
      }
    } catch (error) {
      console.error('获取未读公告失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const currentAnnouncement = announcements[currentIndex];
    
    try {
      const apiUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:8080/api/announcements/mark-read'
        : 'http://10.14.53.120:8080/api/announcements/mark-read';
      // 标记当前公告为已读
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          announcementId: currentAnnouncement.announcementId,
          userId: userId,
        }),
      });

      // 如果还有更多公告，显示下一条
      if (currentIndex < announcements.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // 所有公告都已确认，关闭弹窗
        onClose();
      }
    } catch (error) {
      console.error('标记公告已读失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleConfirmAll = async () => {
    try {
      const announcementIds = announcements.map(a => a.announcementId);
      const apiUrl = window.location.hostname === 'localhost'
        ? 'http://localhost:8080/api/announcements/mark-read-batch'
        : 'http://10.14.53.120:8080/api/announcements/mark-read-batch';
      
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          announcementIds: announcementIds,
          userId: userId,
        }),
      });

      onClose();
    } catch (error) {
      console.error('批量标记公告已读失败:', error);
      alert('操作失败，请重试');
    }
  };

  if (loading) {
    return (
      <div className="announcement-modal-overlay">
        <div className="announcement-modal">
          <div className="loading">加载中...</div>
        </div>
      </div>
    );
  }

  if (announcements.length === 0) {
    return null;
  }

  const currentAnnouncement = announcements[currentIndex];
  const priorityLabels = ['普通', '重要', '紧急'];
  const priorityColors = ['#6c757d', '#ffc107', '#dc3545'];

  return (
    <div className="announcement-modal-overlay">
      <div className="announcement-modal">
        <div className="announcement-header">
          <span 
            className="priority-badge" 
            style={{ 
              backgroundColor: priorityColors[currentAnnouncement.priority || 0] 
            }}
          >
            {priorityLabels[currentAnnouncement.priority || 0]}
          </span>
          <h2>{currentAnnouncement.title}</h2>
          <div className="announcement-count">
            {currentIndex + 1} / {announcements.length}
          </div>
        </div>

        <div className="announcement-content">
          <p>{currentAnnouncement.content}</p>
        </div>

        <div className="announcement-footer">
          <span className="announcement-time">
            发布时间: {new Date(currentAnnouncement.createTime).toLocaleString()}
          </span>
        </div>

        <div className="announcement-actions">
          {announcements.length > 1 && (
            <button className="btn-secondary" onClick={handleConfirmAll}>
              全部确认 ({announcements.length})
            </button>
          )}
          <button className="btn-primary" onClick={handleConfirm}>
            {currentIndex < announcements.length - 1 ? '确认并查看下一条' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementModal;
