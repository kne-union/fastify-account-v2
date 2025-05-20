const fp = require('fastify-plugin');
const path = require('node:path');
const {merge } = require('lodash');
const jwt = require('@fastify/jwt');
const namespace = require('@kne/fastify-namespace');
const httpErrors = require('http-errors');

const { Unauthorized } = httpErrors;

const user = fp(
  async function (fastify, options) {
    options = merge(
      {
        name: 'account',
        version: '1.0.0',
        dbTableNamePrefix: 't_account_',
        isTest: false,
        jwt: {
          secret: 'super-secret',
          expires: null,
          verify: {
            extractToken: request => request.headers['x-user-token']
          }
        },
        defaultPassword: 'Aa000000!',
        sendMessage: async () => {}
      },
      options
    );
    if (!options.prefix) {
      options.prefix = `/api/${options.name}/v${options.version}`;
    }
    fastify.register(jwt, options.jwt);
    fastify.register(namespace, {
      options,
      name: options.name,
      modules: [
        [
          'models',
          await fastify.sequelize.addModels(path.resolve(__dirname, './libs/models'), {
            prefix: options.dbTableNamePrefix
          })
        ],
        ['services', path.resolve(__dirname, './libs/services')],
        ['controllers', path.resolve(__dirname, './libs/controllers')],
        [
          'authenticate',
          {
            user: async request => {
              const { services } = fastify[options.name];
              let info;
              try {
                info = await request.jwtVerify();
              } catch (e) {
                throw Unauthorized('身份认证失败');
              }
              //这里判断失效时间
              if (options.jwt.expires && Date.now() - info.iat * 1000 > options.jwt.expires) {
                throw Unauthorized('身份认证超时');
              }
              request.authenticatePayload = info.payload;
              request.userInfo = await services.user.getUser(request.authenticatePayload);
              request.appName = request.headers['x-app-name'];
            },
            admin: async request => {
              const { services } = fastify[options.name];
              if (!(await services.admin.checkIsSuperAdmin(request.userInfo))) {
                throw Unauthorized('不能执行该操作，需要超级管理员权限');
              }
            }
          }
        ]
      ]
    });
  },
  {
    name: 'fastify-user'
  }
);

module.exports = user;
