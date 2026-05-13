## ADDED Requirements

### Requirement: Search by creator name

搜索框 SHALL 支持按创建人名称搜索应用/文件夹。

#### Scenario: 按创建人名称搜索匹配

- **WHEN** 用户在搜索框中输入某个创建人的名称
- **THEN** 查询结果 MUST 包含该创建人创建的所有应用（名称/描述中可能不包含搜索词）

#### Scenario: 创建人搜索与名称描述搜索组合

- **WHEN** 用户输入的搜索词同时匹配应用名称和创建人名称
- **THEN** 查询结果 MUST 包含所有匹配项（名称匹配 + 描述匹配 + 创建人匹配），取并集

#### Scenario: 无匹配创建人时的行为

- **WHEN** 用户输入的搜索词没有匹配到任何创建人名称
- **THEN** 查询 MUST 仍按名称和描述进行搜索，不受影响

### Requirement: Search placeholder text update

搜索框提示文案 SHALL 更新为包含创建人信息。

#### Scenario: 中文文案

- **WHEN** 当前语言为简体中文
- **THEN** 搜索框 placeholder MUST 显示「名称/描述/创建人」

#### Scenario: 繁体中文文案

- **WHEN** 当前语言为繁体中文
- **THEN** 搜索框 placeholder MUST 显示「名稱/描述/創建人」

#### Scenario: 英文文案

- **WHEN** 当前语言为英文
- **THEN** 搜索框 placeholder MUST 显示「Name/Description/Creator」
