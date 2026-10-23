const fp = require('fastify-plugin');
const { empty, editableProfile } = require('../schema/response');

const TAG = '账号-当前用户';

const userController = fp(async (fastify, options) => {
  const { authenticate, services } = fastify[options.name];

  fastify.get(
    `${options.prefix}/user/getUserInfo`,
    {
      onRequest: [authenticate.user],
      schema: {
        tags: [TAG],
        summary: '获取当前用户信息',
        description: '根据 x-user-token 返回当前登录用户的基本信息',
        response: {
          200: {
            description: '当前用户信息；未填写的字段输出为空字符串',
            type: 'object',
            properties: {
              userInfo: {
                type: 'object',
                description: '当前用户',
                properties: {
                  id: { type: 'string', description: '用户id' },
                  avatar: { type: 'string', description: '头像图片id' },
                  nickname: { type: 'string', description: '用户昵称' },
                  email: { type: 'string', description: '邮箱' },
                  phone: { type: 'string', description: '电话' },
                  gender: { type: 'string', description: '性别：F 女，M 男' },
                  birthday: { type: 'string', format: 'date', description: '出生日期' },
                  description: { type: 'string', description: '个人简介' },
                  status: { type: 'number', description: '状态：0 正常' }
                }
              }
            }
          }
        }
      }
    },
    async request => {
      return { userInfo: request.userInfo };
    }
  );

  fastify.post(
    `${options.prefix}/user/saveUserInfo`,
    {
      onRequest: [authenticate.user],
      schema: {
        tags: [TAG],
        summary: '更新当前用户信息',
        description: '不传的字段保持原值，传空字符串或 null 清空；邮箱和手机号至少保留一个。改成新的邮箱或手机号时，需先用 sendEmailCode / sendSMSCode（用途 6）向新号码发送验证码，并随请求传入',
        body: {
          type: 'object',
          properties: Object.assign({}, editableProfile, {
            emailCode: { type: 'string', description: '新邮箱收到的验证码（用途 6），修改为新邮箱时必填' },
            phoneCode: { type: 'string', description: '新手机号收到的验证码（用途 6），修改为新手机号时必填' }
          })
        },
        response: empty('保存成功')
      }
    },
    async request => {
      const { id } = request.authenticatePayload;
      await services.user.saveCurrentUser(Object.assign({}, request.body, { id }));
      return {};
    }
  );
});

module.exports = userController;
