package com.example.fastgptproject.service.impl;

import com.example.fastgptproject.mapper.FindContextMapper;
import com.example.fastgptproject.pojo.Conversation;
import com.example.fastgptproject.service.ConversationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 对话记录服务实现类
 */
@Service
public class ConversationServiceImpl implements ConversationService {

    @Autowired
    private FindContextMapper findContextMapper;

    /**
     * 保存对话记录
     */
    @Override
    public Conversation saveConversation(Conversation conversation) {
        System.out.println("[ConversationServiceImpl] saveConversation 被调用");
        System.out.println("[ConversationServiceImpl] 对话对象: userId=" + conversation.getUserId() + 
                         ", title=" + conversation.getTitle() + 
                         ", content=" + conversation.getContent());
        
        // 设置创建时间
        if (conversation.getCreateTime() == null) {
            conversation.setCreateTime(LocalDateTime.now());
        }
        
        System.out.println("[ConversationServiceImpl] 设置创建时间: " + conversation.getCreateTime());
        
        // 插入数据库
        System.out.println("[ConversationServiceImpl] 调用 mapper.insertConversation");
        int result = findContextMapper.insertConversation(conversation);
        System.out.println("[ConversationServiceImpl] 插入结果: " + result);
        
        if (result > 0) {
            System.out.println("[ConversationServiceImpl] ✓ 保存成功，返回对话对象");
            return conversation;
        }
        
        System.out.println("[ConversationServiceImpl] ❌ 保存失败");
        throw new RuntimeException("保存对话记录失败");
    }

    /**
     * 获取所有对话记录（分页）
     */
    @Override
    public Map<String, Object> findAllConversations(int page, int pageSize) {
        int offset = page * pageSize;
        
        List conversations = findContextMapper.findAllConversationsWithUser(offset, pageSize);
        int total = findContextMapper.countConversations();
        
        Map<String, Object> result = new HashMap<>();
        result.put("list", conversations);
        result.put("total", total);
        result.put("page", page);
        result.put("pageSize", pageSize);
        
        return result;
    }

    /**
     * 根据用户ID获取对话记录
     */
    @Override
    public List<Conversation> findByUserId(Integer userId) {
        return findContextMapper.findConversationsByUserId(userId);
    }

    /**
     * 根据ID获取对话记录
     */
    @Override
    public Conversation findById(Integer id) {
        return findContextMapper.findConversationById(id);
    }

    /**
     * 搜索对话记录
     */
    @Override
    public Map<String, Object> searchConversations(String keyword, int page, int pageSize) {
        int offset = page * pageSize;
        
        List<Conversation> conversations = findContextMapper.searchConversations(keyword, offset, pageSize);
        int total = findContextMapper.countConversations();
        
        Map<String, Object> result = new HashMap<>();
        result.put("list", conversations);
        result.put("total", total);
        result.put("page", page);
        result.put("pageSize", pageSize);
        result.put("keyword", keyword);
        
        return result;
    }

    /**
     * 删除对话记录
     */
    @Override
    public boolean deleteConversation(Integer id) {
        return findContextMapper.deleteConversationById(id) > 0;
    }

    /**
     * 获取对话记录总数
     */
    @Override
    public int countConversations() {
        return findContextMapper.countConversations();
    }
}
