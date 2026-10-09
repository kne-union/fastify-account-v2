#### 账号管理

| 路径 | 方法 | 描述 | 参数 |
|------|------|------|------|
| `/api/account/v1.0.0/account/sendEmailCode` | POST | 发送登录邮箱验证码 | `email` (string), `type` (number), `options` (object) |
| `/api/account/v1.0.0/account/sendSMSCode` | POST | 发送登录短信验证码 | `phone` (string), `type` (number), `options` (object) |
| `/api/account/v1.0.0/account/validateCode` | POST | 验证码验证 | `name` (string), `type` (number), `code` (string) |
| `/api/account/v1.0.0/account/accountIsExists` | POST | 账号是否已存在 | `phone` (string) 或 `email` (string) |
| `/api/account/v1.0.0/account/register` | POST | 注册账号。`validateCode` 预校验过的验证码仍可使用，注册成功后作废 | `phone` (string) 或 `email` (string), `password` (string), `code` (string), 其他可选字段 |
| `/api/account/v1.0.0/account/login` | POST | 登录 | `type` (string), `email` (string) 或 `phone` (string), `password` (string) |
| `/api/account/v1.0.0/account/modifyPassword` | POST | 待激活（状态 10）用户用初始密码设置新密码，其它状态报"新用户密码只能初始化一次" | `email` (string) 或 `phone` (string), `newPwd` (string), `oldPwd` (string) |
| `/api/account/v1.0.0/account/resetPassword` | POST | 重置密码。token 须为本插件签发（校验签名），重置成功后作废 | `newPwd` (string), `token` (string) |
| `/api/account/v1.0.0/account/forgetPwd` | POST | 忘记密码 | `email` (string) 或 `phone` (string) |
| `/api/account/v1.0.0/account/parseResetToken` | POST | 通过token获取name | `token` (string) |

#### 用户信息管理

| 路径 | 方法 | 描述 | 参数 |
|------|------|------|------|
| `/api/account/v1.0.0/user/getUserInfo` | GET | 获取用户信息 | 无 |
| `/api/account/v1.0.0/user/saveUserInfo` | POST | 更新用户信息 | `avatar` (string), `nickname` (string), `email` (string), `phone` (string), `gender` (string), `birthday` (string), `description` (string) |

#### 账号服务方法

通过 `fastify.account.services.account` 调用。

| 方法 | 描述 | 参数 | 返回值 |
|------|------|------|------|
| `verifyCredentials` | 校验账号密码，不签发 token（供 OIDC 等外部认证流程使用） | `type` ('email' \| 'phone'), `email` 或 `phone`, `password` (md5) | 状态为 0/1 时返回 `{ status, user }`；其它状态只返回 `{ status }`；账号不存在或密码错误抛出"用户名或密码错误" |
| `login` | 校验账号密码并签发本地 JWT | 同 `verifyCredentials` | `{ token, user }`，状态异常时返回 `{ status }` |
#### 认证中间件

通过 `fastify.account.authenticate` 调用。

| 方法 | 描述 |
|------|------|
| `user` | 用户认证。配置了 `options.getUserAuthenticate` 时委托给其返回的中间件（如 `() => fastify.oidc.authenticate.user`），否则等同 `tokenUser` |
| `tokenUser` | 校验本插件签发的 `x-user-token` JWT，挂载 `request.authenticatePayload`、`request.userInfo`；用户状态不是 0/1（已禁用、已关闭等）时返回 401，旧 token 随之失效 |
| `admin` | 校验当前用户是否为超级管理员 |

#### 国际化

插件抛出的错误文案通过 [@kne/fastify-intl](https://www.npmjs.com/package/@kne/fastify-intl) 按请求语言返回，内置 `zh-CN` / `en-US` 语言包。

| 配置项 | 类型 | 默认值 | 说明 |
|------|------|------|------|
| `intlNamespace` | string | `intl` | @kne/fastify-intl 的命名空间；未注册时固定返回内置中文 |

- 语言来源由 @kne/fastify-intl 决定：query `lang` / `language` → cookie / 请求头 `x-user-locale`、`x-client-language` → `accept-language` → `defaultLocale`
- 查找顺序：请求语言 → fastify-intl 的 `defaultLocale` → 内置中文
- 翻译在 `onError` 钩子中完成，其它插件的路由调用本插件 service 抛出的错误同样会被翻译
- 语言包可通过 `fastify.account.locale` 读取，`fastify.account.translator.t(request, messageId, values)` 可按请求语言获取文案

```js
fastify.register(require('@kne/fastify-intl'), { defaultLocale: 'zh-CN' });
fastify.register(require('@kne/fastify-account'));
```
