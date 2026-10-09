const fp = require('fastify-plugin');
const path = require('node:path');
const { merge } = require('lodash');
const jwt = require('@fastify/jwt');
const namespace = require('@kne/fastify-namespace');
const httpErrors = require('http-errors');
const { locale, createError, createTranslator } = require('./libs/utils/intl');

const { Unauthorized } = httpErrors;

const user = fp(
  async function(fastify, options) {
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
            extractToken: request => request.headers['x-user-token'] || request.query?.token
          }
        },
        defaultPassword: 'Aa000000!',
        intlNamespace: 'intl',
        sendMessage: async () => {
        }
      },
      options
    );
    if (!options.prefix) {
      options.prefix = `/api/${options.name}/v${options.version}`;
    }
    const translator = createTranslator({ fastify, options });
    fastify.addHook('onError', translator.onError);
    const tokenUser = async request => {
      const { services } = fastify[options.name];
      let info;
      try {
        info = await request.jwtVerify();
      } catch (e) {
        throw createError(Unauthorized, 'authenticationFailed');
      }
      //这里判断失效时间
      if (options.jwt.expires && Date.now() - info.iat * 1000 > options.jwt.expires) {
        throw createError(Unauthorized, 'authenticationExpired');
      }
      request.authenticatePayload = info.payload;
      request.userInfo = await services.user.getUser(request.authenticatePayload);
      // 与登录一致：只有 0 / 1 状态可用，禁用或关闭后旧 token 立即失效
      if (!(request.userInfo.status === 0 || request.userInfo.status === 1)) {
        throw createError(Unauthorized, 'accountUnavailable');
      }
      request.appName = request.headers['x-app-name'];
    };
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
        ['locale', locale],
        ['translator', translator],
        [
          'authenticate',
          {
            user: async request => {
              if (typeof options.getUserAuthenticate === 'function') {
                return options.getUserAuthenticate()(request);
              }
              return tokenUser(request);
            },
            tokenUser,
            admin: async request => {
              const { services } = fastify[options.name];
              if (!(await services.admin.checkIsSuperAdmin(request.userInfo))) {
                throw createError(Unauthorized, 'superAdminRequired');
              }
              request.userInfo.isAdmin = true;
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
