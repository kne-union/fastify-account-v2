const fp = require('fastify-plugin');
const { empty } = require('../schema/response');

const TAG = '账号管理后台-超级管理员';

const adminController = fp(async (fastify, options) => {
  const { services, authenticate } = fastify[options.name];
  fastify.post(
    `${options.prefix}/admin/initSuperAdmin`,
    {
      onRequest: [authenticate.user],
      schema: {
        tags: [TAG],
        summary: '初始化超级管理员',
        description: '系统初始化时把当前登录用户设为第一个超级管理员；已存在超级管理员时报错，其他管理员由超级管理员设置',
        response: empty('初始化成功')
      }
    },
    async request => {
      await services.admin.initSuperAdmin(request.userInfo);
      return {};
    }
  );

  fastify.get(
    `${options.prefix}/admin/getSuperAdminInfo`,
    {
      onRequest: [authenticate.user, authenticate.admin],
      schema: {
        tags: [TAG],
        summary: '获取超级管理员信息',
        description: '校验当前用户是超级管理员并返回其基本信息，非超级管理员报错；可用于判断是否有管理后台权限',
        response: {
          200: {
            description: '当前超级管理员信息；未填写的字段输出为空字符串',
            type: 'object',
            properties: {
              userInfo: {
                type: 'object',
                description: '当前超级管理员',
                properties: {
                  id: { type: 'string', description: '用户id' },
                  avatar: { type: 'string', description: '头像图片id' },
                  nickname: { type: 'string', description: '用户昵称' },
                  email: { type: 'string', description: '邮箱' },
                  phone: { type: 'string', description: '电话' },
                  gender: { type: 'string', description: '性别：F 女，M 男' },
                  birthday: { type: 'string', format: 'date', description: '出生日期' },
                  description: { type: 'string', description: '个人简介' },
                  currentTenantId: { type: 'string', description: '当前租户ID（由上层租户插件注入时才有值）' },
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
});

module.exports = adminController;
