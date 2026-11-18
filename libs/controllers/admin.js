const fp = require('fastify-plugin');
const { empty, success, obj, user } = require('../schema/response');

const TAG = '账号管理后台-超级管理员';

const resolveAdminSetting = async ({ fastify, options, request }) => {
  if (typeof options.getAdminSetting === 'function') {
    const setting = await options.getAdminSetting({ fastify, request, userInfo: request.userInfo });
    return setting && typeof setting === 'object' && !Array.isArray(setting) ? setting : {};
  }
  if (options.adminSetting && typeof options.adminSetting === 'object' && !Array.isArray(options.adminSetting)) {
    return options.adminSetting;
  }
  return {};
};

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
        description:
          '校验当前用户是超级管理员并返回其基本信息与宿主注入的 setting；非超级管理员报错。setting 由插件参数 getAdminSetting / adminSetting 提供，缺省为空对象',
        response: success('当前超级管理员信息与 setting', {
          type: 'object',
          additionalProperties: true,
          properties: {
            userInfo: user,
            setting: obj('宿主注入的管理端公开配置（如 appOpsEnabled）；未配置时为 {}')
          }
        })
      }
    },
    async request => {
      const setting = await resolveAdminSetting({ fastify, options, request });
      return { userInfo: request.userInfo, setting };
    }
  );
});

module.exports = adminController;
