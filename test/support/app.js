'use strict';

const Fastify = require('fastify');
const qs = require('qs');
const account = require('../../index');

const PREFIX = '/api/v1';

/**
 * 内存 SQLite + 完整注册 fastify-account，sendMessage 记录到 messages 便于断言
 */
const buildApp = async ({ intl = false, options = {} } = {}) => {
  const fastify = Fastify({ logger: false, routerOptions: { querystringParser: str => qs.parse(str) } });
  const messages = [];
  if (intl) {
    await fastify.register(require('@kne/fastify-intl'), { defaultLocale: 'zh-CN' });
  }
  await fastify.register(require('@kne/fastify-sequelize'), { db: { dialect: 'sqlite', storage: ':memory:', logging: false } });
  await fastify.register(
    account,
    Object.assign(
      {
        isTest: true,
        prefix: PREFIX,
        sendMessage: async message => {
          messages.push(message);
        }
      },
      options
    )
  );
  await fastify.ready();
  await fastify.sequelize.sync();

  const name = options.name || 'account';
  const { services, models } = fastify[name];

  const call = async (method, url, { payload, token, headers = {}, query } = {}) => {
    const response = await fastify.inject({
      method,
      url: `${options.prefix || PREFIX}${url}`,
      payload,
      query,
      headers: Object.assign({}, headers, token ? { 'x-user-token': token } : {})
    });
    const body = response.body ? response.json() : null;
    return { status: response.statusCode, body };
  };

  let seq = 0;
  const createUser = async (props = {}) => {
    seq += 1;
    return services.user.addUser(Object.assign({ email: `user${seq}@test.com`, password: 'pwd', nickname: `user${seq}`, status: 0 }, props));
  };

  const login = async ({ email, phone, password = 'pwd' }) => {
    const response = await call('POST', '/account/login', { payload: email ? { type: 'email', email, password } : { type: 'phone', phone, password } });
    return response.body.token;
  };

  const createAdmin = async () => {
    const user = await createUser();
    await services.user.setSuperAdmin({ userId: user.id, status: true });
    return { user, token: await login({ email: user.email }) };
  };

  return { fastify, services, models, messages, call, createUser, login, createAdmin, PREFIX };
};

module.exports = { buildApp, PREFIX };
