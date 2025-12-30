package com.example.fastgptproject.controller;

import com.example.fastgptproject.pojo.Result;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RequestMapping("/api/admin")
@RestController
@CrossOrigin(origins = "*")
public class AdminController {

    // 简单的管理员测试接口
    @GetMapping("/test")
    public Result test() {
        return Result.success("管理员接口测试成功");
    }

    // 获取系统状态
    @GetMapping("/status")
    public Result getSystemStatus() {
        return Result.success("系统运行正常");
    }

    // 简单的管理操作示例
    @PostMapping("/action")
    public Result adminAction(@RequestBody Map<String, Object> request) {
        String action = (String) request.get("action");
        return Result.success("执行操作: " + action);
    }
}