const fp = require('fastify-plugin');

const userController = fp(async (fastify, options) => {
  const { authenticate, services } = fastify[options.name];

  fastify.get(
    `${options.prefix}/user/getUserInfo`,
    {
      onRequest: [authenticate.user],
      schema: {
        tags: ['用户'],
        summary: '获取用户信息',
        response: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userInfo: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', description: '用户id' },
                        avatar: { type: 'string', description: '头像图片id' },
                        nickname: { type: 'string', description: '用户昵称' },
                        email: { type: 'string', description: '邮箱' },
                        phone: { type: 'string', description: '电话' },
                        gender: { type: 'string', description: '性别' },
                        birthday: { type: 'string', format: 'date', description: '出生日期' },
                        description: { type: 'string', description: '个人简介' },
                        status: { type: 'number', description: '状态' }
                      }
                    }
                  }
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
        tags: ['用户'],
        summary: '更新用户信息',
        body: {
          type: 'object',
          properties: {
            avatar: { type: 'string', description: '头像图片id' },
            nickname: { type: 'string', description: '用户昵称' },
            email: { type: 'string', description: '邮箱' },
            phone: { type: 'string', description: '电话' },
            gender: { type: 'string', description: '性别' },
            birthday: { type: 'string', format: 'date', description: '出生日期' },
            description: { type: 'string', description: '个人简介' }
          }
        }
      }
    },
    async request => {
      const { id } = request.authenticatePayload;
      await services.user.saveUser(Object.assign({}, request.body, { id }));
      return {};
    }
  );
});

module.exports = userController;
