const fp = require('fastify-plugin');
const { empty, success, editableProfile, userList } = require('../schema/response');

const TAG = '账号管理后台-用户';

const profile = {
  avatar: { type: 'string', description: '头像文件 ID' },
  nickname: { type: 'string', description: '用户昵称' },
  phone: { type: 'string', description: '手机号，不能与其他用户重复' },
  email: { type: 'string', description: '邮箱，不区分大小写，不能与其他用户重复' },
  gender: { type: 'string', description: '性别：F 女，M 男' },
  birthday: { type: 'string', format: 'date', description: '出生日期，YYYY-MM-DD' },
  description: { type: 'string', description: '个人简介' }
};

const adminUserController = fp(async (fastify, options) => {
  const { services, authenticate } = fastify[options.name];
  fastify.get(
    `${options.prefix}/admin/getUserList`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '获取用户列表',
        description: '分页查询平台用户，按创建时间倒序；filter 以 filter[字段]=值 的形式传入',
        query: {
          type: 'object',
          properties: {
            perPage: { type: 'number', minimum: 1, description: '每页条数，默认 20' },
            currentPage: { type: 'number', minimum: 1, description: '页码，从 1 开始，默认 1' },
            filter: {
              type: 'object',
              description: '筛选条件',
              properties: {
                keyword: { type: 'string', description: '关键字，模糊匹配昵称、邮箱、手机号任一' },
                nickname: { type: 'string', description: '昵称模糊匹配' },
                phone: { type: 'string', description: '手机号模糊匹配' },
                email: { type: 'string', description: '邮箱模糊匹配' },
                status: { type: 'string', description: '用户状态精确匹配：0 正常，10 未激活，11 已禁用，12 已关闭' },
                isSuperAdmin: { type: 'string', enum: ['true', 'false'], description: 'true 只查超级管理员，false 只查非超级管理员' }
              }
            }
          }
        },
        response: success('用户分页列表', userList)
      }
    },
    async request => {
      const { filter, perPage, currentPage } = Object.assign(
        {
          perPage: 20,
          currentPage: 1
        },
        request.query
      );
      return await services.user.getUserList({
        filter,
        perPage,
        currentPage
      });
    }
  );

  fastify.post(
    `${options.prefix}/admin/resetUserPassword`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '重置用户密码',
        description: '超级管理员直接为指定用户设置新密码，不改变用户状态',
        body: {
          type: 'object',
          required: ['userId', 'password'],
          properties: {
            password: { type: 'string', description: '新密码（客户端 md5 后传入）' },
            userId: { type: 'string', description: '要重置密码的用户 ID' }
          }
        },
        response: empty('重置成功')
      }
    },
    async request => {
      await services.account.resetPassword(request.body);
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/admin/addUser`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '添加用户',
        description: '超级管理员添加用户，email 与 phone 至少传一个；新用户使用插件配置的默认密码（defaultPassword），状态为未激活（10），首次需通过 modifyPassword 设置密码',
        body: {
          type: 'object',
          anyOf: [{ required: ['email'] }, { required: ['phone'] }],
          properties: profile
        },
        response: empty('添加成功')
      }
    },
    async request => {
      const userInfo = request.body;
      await services.user.addUser(
        Object.assign({}, userInfo, {
          status: 10,
          password: services.account.md5(options.defaultPassword)
        })
      );
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/admin/saveUser`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '修改用户信息',
        description: '不传的字段保持原值，传空字符串或 null 清空；邮箱和手机号至少保留一个，且不能与其他用户重复。管理员修改邮箱、手机号不需要验证码',
        body: {
          type: 'object',
          required: ['id'],
          properties: Object.assign({ id: { type: 'string', description: '要修改的用户 ID' } }, editableProfile)
        },
        response: empty('保存成功')
      }
    },
    async request => {
      const user = request.body;
      await services.user.saveUser(user);
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/admin/setSuperAdmin`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '设置或取消超级管理员',
        body: {
          type: 'object',
          required: ['status', 'userId'],
          properties: {
            status: { type: 'boolean', description: 'true:将用户设置为超级管理员,false:取消用户超级管理员' },
            userId: { type: 'string', description: '用户id' }
          }
        },
        response: empty('设置成功')
      }
    },
    async request => {
      const { status, userId } = request.body;
      await services.user.setSuperAdmin({ userId, status });
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/admin/setUserClose`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '关闭用户',
        description: '把用户状态设为已关闭（12），该用户无法登录，已签发的 token 立即失效',
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '要关闭的用户 ID' }
          }
        },
        response: empty('关闭成功')
      }
    },
    async request => {
      const { id } = request.body;
      await services.user.setUserStatus({ userId: id, status: 12 });
      return {};
    }
  );

  fastify.post(
    `${options.prefix}/admin/setUserNormal`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '恢复用户为正常状态',
        description: '把用户状态设为正常（0），用于重新启用已关闭或禁用的用户',
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: '要恢复的用户 ID' }
          }
        },
        response: empty('设置成功')
      }
    },
    async request => {
      const { id } = request.body;
      await services.user.setUserStatus({ userId: id, status: 0 });
      return {};
    }
  );
});

module.exports = adminUserController;
