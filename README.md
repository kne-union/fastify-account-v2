
# fastify-account


### 描述

用于用户注册登录认证.


### 安装

```shell
npm i --save @kne/fastify-account
```


### 概述

#### 功能模块
- **账号管理**：提供用户注册、登录、密码修改、忘记密码等功能。
- **用户信息管理**：支持用户信息的获取和更新。
- **验证码服务**：支持邮箱和短信验证码的发送与验证。

#### 技术栈
- **后端框架**：Fastify
- **数据库**：Sequelize（支持多种数据库）
- **认证**：JWT（JSON Web Token）
- **密码加密**：bcryptjs
- **工具库**：Lodash、Day.js

#### 核心模块
- **models**：定义数据模型（用户、账号、验证码等）。
- **services**：业务逻辑层，处理核心功能。
- **controllers**：API接口层，定义路由和请求处理。

#### 项目特点
- 模块化设计，易于扩展和维护。
- 支持多租户功能。
- 提供详细的错误处理和日志记录。

### 示例

#### 示例代码



### API

#### 账号管理

| 路径 | 方法 | 描述 | 参数 |
|------|------|------|------|
| `/api/account/v1.0.0/account/sendEmailCode` | POST | 发送登录邮箱验证码 | `email` (string), `type` (number), `options` (object) |
| `/api/account/v1.0.0/account/sendSMSCode` | POST | 发送登录短信验证码 | `phone` (string), `type` (number), `options` (object) |
| `/api/account/v1.0.0/account/validateCode` | POST | 验证码验证 | `name` (string), `type` (number), `code` (string) |
| `/api/account/v1.0.0/account/accountIsExists` | POST | 账号是否已存在 | `phone` (string) 或 `email` (string) |
| `/api/account/v1.0.0/account/register` | POST | 注册账号 | `phone` (string) 或 `email` (string), `password` (string), `code` (string), 其他可选字段 |
| `/api/account/v1.0.0/account/login` | POST | 登录 | `type` (string), `email` (string) 或 `phone` (string), `password` (string) |
| `/api/account/v1.0.0/account/modifyPassword` | POST | 修改密码 | `email` (string) 或 `phone` (string), `newPwd` (string), `oldPwd` (string) |
| `/api/account/v1.0.0/account/resetPassword` | POST | 重置密码 | `newPwd` (string), `token` (string) |
| `/api/account/v1.0.0/account/forgetPwd` | POST | 忘记密码 | `email` (string) 或 `phone` (string) |
| `/api/account/v1.0.0/account/parseResetToken` | POST | 通过token获取name | `token` (string) |

#### 用户信息管理

| 路径 | 方法 | 描述 | 参数 |
|------|------|------|------|
| `/api/account/v1.0.0/user/getUserInfo` | GET | 获取用户信息 | 无 |
| `/api/account/v1.0.0/user/saveUserInfo` | POST | 更新用户信息 | `avatar` (string), `nickname` (string), `email` (string), `phone` (string), `gender` (string), `birthday` (string), `description` (string) |
