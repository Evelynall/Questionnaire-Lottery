# 问卷调查 + 抽奖系统

一个基于 Express.js 构建的问卷调查和抽奖系统，支持问卷信息收集和抽奖功能，并提供完整的后台管理界面。

## 功能特点

### 前台功能
- 问卷信息收集（姓名、科室、职务/职位、单位、电话号码、电子邮件）
- 基于手机号的抽奖功能
- 防重复抽奖验证
- 动态奖品概率系统

### 后台功能
- 安全的密码登录系统
- 完整的奖品管理（增删改查）
  - 支持设置奖品名称
  - 可配置奖品数量（-1 表示无限）
  - 可设置中奖概率（0-1之间）
- 中奖记录管理
  - 查看所有中奖记录
  - 删除指定中奖记录
- 问卷数据查看
  - 表格形式展示所有收集的问卷数据

## 技术栈

### 前端
- 原生 JavaScript
- Tailwind CSS 用于样式设计
- 响应式设计，支持移动端和桌面端

### 后端
- Node.js
- Express.js 框架
- express-session 用于会话管理
- 文件系统存储（JSON 和 CSV 格式）

## 系统架构

### 文件结构
```
├── admin.html          # 后台管理界面
├── data.csv           # 问卷数据存储文件
├── index.html         # 前台用户界面
├── lottery_records.json # 中奖记录存储文件
├── package.json       # 项目依赖配置
├── prizes.json        # 奖品配置存储文件
└── server.js         # 后端服务器代码
```

### 数据存储
- 问卷数据：CSV 格式存储在 data.csv
- 奖品配置：JSON 格式存储在 prizes.json
- 中奖记录：JSON 格式存储在 lottery_records.json

## 安装和运行

1. 安装依赖
```bash
npm install
```

2. 启动服务器
```bash
node server.js
```

3. 访问系统
- 前台页面：http://localhost:3000
- 后台管理：http://localhost:3000/admin

## API 接口

### 公共接口
- `POST /submit` - 提交问卷数据
- `POST /draw` - 进行抽奖
- `GET /` - 访问前台页面
- `GET /admin` - 访问后台页面

### 后台管理接口
- `POST /login` - 管理员登录
- `POST /logout` - 管理员登出
- `GET /api/auth/check` - 检查登录状态
- `GET /api/prizes` - 获取奖品列表
- `POST /api/prizes` - 添加新奖品
- `PUT /api/prizes/:id` - 更新奖品信息
- `DELETE /api/prizes/:id` - 删除奖品
- `GET /api/records` - 获取中奖记录
- `POST /api/records/delete` - 删除中奖记录
- `GET /api/questionnaire` - 获取问卷数据

## 安全特性
- 后台访问密码保护
- Session 基于的身份验证
- API 接口认证中间件保护
- 数据输入清理和验证

## 注意事项
1. 默认后台登录密码为 'jn123'，建议部署前修改
2. 所有数据存储在本地文件中，建议定期备份
3. 生产环境部署时建议启用 HTTPS
4. 确保服务器对数据文件有读写权限
5. wps等excel编辑器修改data.csv后会以asci格式保存，导致后台读取出现乱码，请将data.csv保存为utf8格式

## 开发者说明
- 抽奖算法基于概率权重实现
- 支持无限数量（-1）的奖品配置
- 使用 Set 数据结构优化中奖记录查询性能
- 文件操作使用异步 API 提高性能

## 维护和支持
- 定期检查日志文件
- 备份数据文件
- 监控服务器状态
- 及时更新依赖包版本
