const fp = require('fastify-plugin');
const { createError } = require('../utils/intl');
const { str, bool, success, empty, user } = require('../schema/response');

const TAG = '账号-登录注册';
const CODE_TYPE = '验证码用途：0 注册，2 登录，4 验证租户管理员，5 忘记密码，6 修改邮箱或手机号';
const PASSWORD = '密码（客户端 md5 后传入）';

const registerProfile = {
  avatar: { type: 'string', description: '头像文件 ID' },
  code: { type: 'string', description: '注册验证码（sendEmailCode / sendSMSCode 用途 0 获取）' },
  password: { type: 'string', description: PASSWORD },
  invitationCode: { type: 'string', description: '邀请码，供上层应用用于默认加入租户，本插件不处理' },
  nickname: { type: 'string', description: '昵称' },
  gender: { type: 'string', description: '性别：F 女，M 男' },
  birthday: { type: 'string', format: 'date', description: '出生日期，YYYY-MM-DD' },
  description: { type: 'string', description: '个人简介' }
};

const accountController = fp(async (fastify, options) => {
  const { services } = fastify[options.name];
  fastify.post(
    `${options.prefix}/account/sendEmailCode`,
    {
      schema: {
        tags: [TAG],
        summary: '发送邮箱验证码',
        description: '生成 6 位验证码（10 分钟有效，同邮箱同用途的旧验证码作废）并通过 sendMessage 发送邮件',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', description: '接收验证码的邮箱，不区分大小写' },
            type: { type: 'number', description: CODE_TYPE, default: 0 },
            options: { type: 'object', description: '透传给 sendMessage 的扩展参数，如邮件模板变量' }
          }
        },
        response: success('发送成功；测试模式（isTest）下返回验证码，正式环境返回空对象', {
          type: 'object',
          properties: { code: str('验证码，仅测试模式返回') }
        })
      }
    },
    async request => {
      const { email, type, options: otherOptions } = request.body;
      const code = await services.account.sendVerificationCode({ name: email, type, options: otherOptions });
      return options.isTest ? { code } : {};
    }
  );

  fastify.post(
    `${options.prefix}/account/sendSMSCode`,
    {
      schema: {
        tags: [TAG],
        summary: '发送短信验证码',
        description: '生成 6 位验证码（10 分钟有效，同手机号同用途的旧验证码作废）并通过 sendMessage 发送短信',
        body: {
          type: 'object',
          required: ['phone'],
          properties: {
            phone: { type: 'string', description: '接收验证码的手机号' },
            type: { type: 'number', description: CODE_TYPE, default: 0 },
            options: { type: 'object', description: '透传给 sendMessage 的扩展参数，如短信模板变量' }
          }
        },
        response: success('发送成功；测试模式（isTest）下返回验证码，正式环境返回空对象', {
          type: 'object',
          properties: { code: str('验证码，仅测试模式返回') }
        })
      }
    },
    async request => {
      const { phone, type, options: otherOptions } = request.body;
      const code = await services.account.sendVerificationCode({ name: phone, type, options: otherOptions });
      return options.isTest ? { code } : {};
    }
  );

  fastify.post(
    `${options.prefix}/account/validateCode`,
    {
      schema: {
        tags: [TAG],
        summary: '校验验证码',
        description: '预校验验证码是否正确且未过期；校验通过后验证码仍可用于注册或重置密码，错误或过期时报错',
        body: {
          type: 'object',
          required: ['name', 'type', 'code'],
          properties: {
            name: { type: 'string', description: '接收验证码的手机号或邮箱' },
            type: { type: 'number', description: CODE_TYPE },
            code: { type: 'string', description: '收到的验证码' }
          }
        },
        response: empty('验证码正确，返回空对象')
      }
    },
    async request => {
      const { name, type, code } = request.body;
      const isPass = await services.account.verificationCodeValidate({
        name,
        type,
        code
      });
      if (!isPass) {
        throw createError(null, 'verificationCodeIncorrect');
      }
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/account/accountIsExists`,
    {
      schema: {
        tags: [TAG],
        summary: '账号是否已存在',
        description: '注册前检查手机号或邮箱是否已被占用，phone 与 email 二选一',
        body: {
          oneOf: [
            {
              type: 'object',
              required: ['phone'],
              properties: {
                phone: { type: 'string', description: '要检查的手机号' }
              }
            },
            {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', description: '要检查的邮箱，不区分大小写' }
              }
            }
          ]
        },
        response: success('检查结果', {
          type: 'object',
          properties: {
            isExists: bool('true 已存在，false 不存在')
          }
        })
      }
    },
    async request => {
      const { phone, email } = request.body;
      return { isExists: await services.user.accountIsExists({ phone, email }) };
    }
  );

  fastify.post(
    `${options.prefix}/account/register`,
    {
      schema: {
        tags: [TAG],
        summary: '注册账号',
        description: '使用手机号或邮箱加注册验证码注册，phone 与 email 二选一；注册成功后验证码作废',
        body: {
          oneOf: [
            {
              type: 'object',
              required: ['phone', 'password', 'code'],
              properties: Object.assign({ phone: { type: 'string', description: '手机号，作为登录账号' } }, registerProfile)
            },
            {
              type: 'object',
              required: ['email', 'password', 'code'],
              properties: Object.assign({ email: { type: 'string', description: '邮箱，作为登录账号，不区分大小写' } }, registerProfile)
            }
          ]
        },
        response: success('注册成功，返回新建的用户', user)
      }
    },
    async request => {
      const account = request.body;
      return await services.account.register(account);
    }
  );

  fastify.post(
    `${options.prefix}/account/login`,
    {
      schema: {
        tags: [TAG],
        summary: '登录',
        description: '账号密码登录。账号可用（状态 0、1）时返回 token；账号未激活、禁用或关闭时只返回 status，不返回 token',
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            type: { type: 'string', enum: ['email', 'phone'], default: 'email', description: '登录方式：email 邮箱，phone 手机号' },
            email: { type: 'string', description: '邮箱，type 为 email 时必填，不区分大小写' },
            phone: { type: 'string', description: '手机号，type 为 phone 时必填' },
            password: { type: 'string', description: PASSWORD }
          }
        },
        response: {
          200: {
            description: '登录结果',
            type: 'object',
            properties: {
              token: { type: 'string', description: '用户 token，后续请求放在 x-user-token 请求头' },
              status: { type: 'number', description: '账号不可登录时返回的用户状态：10 未激活需设置密码，11 已禁用，12 已关闭' }
            }
          }
        }
      }
    },
    async request => {
      const appName = request.headers['x-app-name'];
      const { token, user, status } = await services.account.login(Object.assign({}, request.body, { appName }));
      return { token, status };
    }
  );

  fastify.post(
    `${options.prefix}/account/modifyPassword`,
    {
      schema: {
        tags: [TAG],
        summary: '新用户设置密码',
        description: '管理员添加的用户处于未激活状态（10），需用初始密码设置新密码后激活为正常状态；只能执行一次，phone 与 email 二选一',
        body: {
          oneOf: [
            {
              type: 'object',
              required: ['email', 'newPwd', 'oldPwd'],
              properties: {
                email: { type: 'string', description: '邮箱，不区分大小写' },
                newPwd: { type: 'string', description: '新密码（客户端 md5 后传入），不能与初始密码相同' },
                oldPwd: { type: 'string', description: '初始密码（客户端 md5 后传入）' }
              }
            },
            {
              type: 'object',
              required: ['phone', 'newPwd', 'oldPwd'],
              properties: {
                phone: { type: 'string', description: '手机号' },
                newPwd: { type: 'string', description: '新密码（客户端 md5 后传入），不能与初始密码相同' },
                oldPwd: { type: 'string', description: '初始密码（客户端 md5 后传入）' }
              }
            }
          ]
        },
        response: empty('设置成功，账号已激活')
      }
    },
    async request => {
      await services.account.modifyPassword(request.body);
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/account/resetPassword`,
    {
      schema: {
        tags: [TAG],
        summary: '通过重置 token 重置密码',
        description: '忘记密码流程第二步：使用 forgetPwd 下发的 token 设置新密码，成功后 token 作废',
        body: {
          type: 'object',
          required: ['newPwd', 'token'],
          properties: {
            newPwd: { type: 'string', description: '新密码（客户端 md5 后传入）' },
            token: { type: 'string', description: 'forgetPwd 通过邮件或短信下发的重置 token' }
          }
        },
        response: empty('重置成功')
      }
    },
    async request => {
      await services.account.resetPasswordByToken({
        password: request.body.newPwd,
        token: request.body.token
      });

      return {};
    }
  );

  fastify.post(
    `${options.prefix}/account/forgetPwd`,
    {
      schema: {
        tags: [TAG],
        summary: '忘记密码',
        description: '忘记密码流程第一步：生成重置 token 并通过 sendMessage 发送，phone 与 email 二选一',
        body: {
          oneOf: [
            {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', description: '账号邮箱，不区分大小写' },
                referer: { type: 'string', description: '发起重置的页面地址，透传给 sendMessage 用于拼接重置链接' }
              }
            },
            {
              type: 'object',
              required: ['phone'],
              properties: {
                phone: { type: 'string', description: '账号手机号' },
                referer: { type: 'string', description: '发起重置的页面地址，透传给 sendMessage 用于拼接重置链接' }
              }
            }
          ]
        },
        response: success('发送成功；测试模式（isTest）下返回重置 token，正式环境返回空对象', {
          type: 'object',
          properties: { token: str('重置 token，仅测试模式返回') }
        })
      }
    },
    async request => {
      const name = request.body.email || request.body.phone;
      const token = await services.account.sendJWTVerificationCode({
        name,
        type: 5,
        options: { referer: request.body.referer }
      });
      return options.isTest ? { token } : {};
    }
  );

  fastify.post(
    `${options.prefix}/account/parseResetToken`,
    {
      schema: {
        tags: [TAG],
        summary: '解析重置 token',
        description: '重置密码页面打开时校验 token 并取回对应账号，用于展示；token 无效或过期时报错',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: 'forgetPwd 下发的重置 token' }
          }
        },
        response: success('解析结果', {
          type: 'object',
          properties: { name: str('token 对应的手机号或邮箱') }
        })
      }
    },
    async request => {
      const { name } = await services.account.verificationJWTCodeValidate(request.body);
      return { name };
    }
  );
});

module.exports = accountController;
