package com.example.fastgptproject.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;

/**
 * 邮件服务
 */
@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:noreply@fastgpt.com}")
    private String fromEmail;

    /**
     * 发送简单文本邮件
     */
    public void sendSimpleEmail(String to, String subject, String text) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(text);
            mailSender.send(message);
            System.out.println("邮件发送成功: " + to);
        } catch (Exception e) {
            System.err.println("邮件发送失败: " + e.getMessage());
            throw new RuntimeException("邮件发送失败: " + e.getMessage());
        }
    }

    /**
     * 发送HTML格式邮件
     */
    public void sendHtmlEmail(String to, String subject, String htmlContent) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlContent, true); // true表示是HTML格式
            
            mailSender.send(message);
            System.out.println("HTML邮件发送成功: " + to);
        } catch (Exception e) {
            System.err.println("HTML邮件发送失败: " + e.getMessage());
            throw new RuntimeException("邮件发送失败: " + e.getMessage());
        }
    }

    /**
     * 发送验证码邮件（忘记密码）
     */
    public void sendVerificationCode(String to, String code) {
        String subject = "FastGPT 密码重置验证码";
        
        // 构建HTML邮件内容
        String htmlContent = buildVerificationCodeHtml(code);
        
        sendHtmlEmail(to, subject, htmlContent);
    }

    /**
     * 构建验证码邮件的HTML内容
     */
    private String buildVerificationCodeHtml(String code) {
        return "<!DOCTYPE html>" +
                "<html>" +
                "<head>" +
                "    <meta charset='UTF-8'>" +
                "    <style>" +
                "        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }" +
                "        .container { max-width: 600px; margin: 0 auto; padding: 20px; }" +
                "        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }" +
                "        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }" +
                "        .code-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }" +
                "        .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }" +
                "        .warning { color: #dc2626; font-size: 14px; margin-top: 20px; }" +
                "        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }" +
                "    </style>" +
                "</head>" +
                "<body>" +
                "    <div class='container'>" +
                "        <div class='header'>" +
                "            <h1>FastGPT 密码重置</h1>" +
                "        </div>" +
                "        <div class='content'>" +
                "            <p>您好，</p>" +
                "            <p>您正在进行密码重置操作，您的验证码是：</p>" +
                "            <div class='code-box'>" +
                "                <div class='code'>" + code + "</div>" +
                "            </div>" +
                "            <p><strong>验证码有效期：5分钟</strong></p>" +
                "            <div class='warning'>" +
                "                <p>⚠️ 重要提示：</p>" +
                "                <ul style='text-align: left;'>" +
                "                    <li>请勿将验证码透露给任何人</li>" +
                "                    <li>如果这不是您的操作，请忽略此邮件</li>" +
                "                    <li>验证码5分钟后将自动失效</li>" +
                "                </ul>" +
                "            </div>" +
                "        </div>" +
                "        <div class='footer'>" +
                "            <p>© 2025 FastGPT 认证系统. All rights reserved.</p>" +
                "            <p>这是一封自动发送的邮件，请勿回复。</p>" +
                "        </div>" +
                "    </div>" +
                "</body>" +
                "</html>";
    }

    /**
     * 发送欢迎邮件（注册成功）
     */
    public void sendWelcomeEmail(String to, String username) {
        String subject = "欢迎加入 FastGPT";
        String content = "<!DOCTYPE html>" +
                "<html>" +
                "<head><meta charset='UTF-8'></head>" +
                "<body style='font-family: Arial, sans-serif;'>" +
                "    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>" +
                "        <div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;'>" +
                "            <h1>欢迎加入 FastGPT！</h1>" +
                "        </div>" +
                "        <div style='padding: 30px; background: #f9f9f9;'>" +
                "            <p>亲爱的 " + username + "，</p>" +
                "            <p>感谢您注册 FastGPT 账号！</p>" +
                "            <p>您现在可以使用以下功能：</p>" +
                "            <ul>" +
                "                <li>智能对话交互</li>" +
                "                <li>知识库管理</li>" +
                "                <li>个性化设置</li>" +
                "            </ul>" +
                "            <p>如有任何问题，请随时联系我们。</p>" +
                "        </div>" +
                "        <div style='text-align: center; color: #999; font-size: 12px; margin-top: 20px;'>" +
                "            <p>© 2025 FastGPT. All rights reserved.</p>" +
                "        </div>" +
                "    </div>" +
                "</body>" +
                "</html>";
        
        sendHtmlEmail(to, subject, content);
    }
}
