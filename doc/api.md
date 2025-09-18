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