'use strict';

const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { locale, createError, createTranslator } = require('../libs/utils/intl');
const { buildApp } = require('./support/app');

const badLogin = { type: 'email', email: 'nobody@test.com', password: 'x' };

// @kne/fastify-intl 依赖 ESM-only 的 @formatjs/intl，Node 18 等不支持 require(esm) 的版本无法加载
const describeWithIntl = (() => {
  try {
    require('@kne/fastify-intl');
    return describe;
  } catch (e) {
    if (e.code === 'ERR_REQUIRE_ESM') return describe.skip;
    throw e;
  }
})();

describe('国际化', () => {
  it('中英文语言包 key 与占位符一致', () => {
    const zh = locale['zh-CN'];
    const en = locale['en-US'];
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    const placeholders = text => (text.match(/\{\w+\}/g) || []).sort();
    for (const key of Object.keys(zh)) {
      assert.deepEqual(placeholders(en[key]), placeholders(zh[key]), key);
    }
  });

  it('createError 带本包作用域，message 为内置中文', () => {
    const error = createError(null, 'credentialsInvalid');
    assert.equal(error.message, '用户名或密码错误');
    assert.equal(error.messageScope, '@kne/fastify-account');
    assert.equal(error.messageId, 'credentialsInvalid');
  });

  it('未知 messageId 时 message 回退为 id 本身', () => {
    assert.equal(createError(null, 'unknownMessageId').message, 'unknownMessageId');
  });

  it('未注册 fastify-intl 时 t 返回内置中文', async () => {
    const fastify = Fastify();
    const translator = createTranslator({ fastify, options: { name: 'account', intlNamespace: 'intl' } });
    assert.equal(await translator.t({ headers: { 'accept-language': 'en-US' } }, 'userNotFound'), '用户不存在');
    await fastify.close();
  });

  describeWithIntl('注册 fastify-intl 后', () => {
    let app;

    before(async () => {
      app = await buildApp({ intl: true });
    });

    after(async () => {
      await app.fastify.close();
    });

    const loginMessage = async headers => (await app.call('POST', '/account/login', { payload: badLogin, headers })).body.message;

    it('无语言头时使用默认语言', async () => {
      assert.equal(await loginMessage({}), '用户名或密码错误');
    });

    it('按 accept-language 翻译', async () => {
      assert.equal(await loginMessage({ 'accept-language': 'en-US,en;q=0.9' }), 'Incorrect username or password');
      assert.equal(await loginMessage({ 'accept-language': 'zh-CN' }), '用户名或密码错误');
    });

    it('x-user-locale 优先于 accept-language', async () => {
      assert.equal(await loginMessage({ 'x-user-locale': 'en-US', 'accept-language': 'zh-CN' }), 'Incorrect username or password');
    });

    it('不支持的语言回退到默认语言', async () => {
      assert.equal(await loginMessage({ 'accept-language': 'ja-JP' }), '用户名或密码错误');
    });

    it('认证错误同样翻译，并保留 401 状态', async () => {
      const response = await app.call('GET', '/user/getUserInfo', { headers: { 'accept-language': 'en-US' } });
      assert.equal(response.status, 401);
      assert.equal(response.body.message, locale['en-US'].authenticationFailed);
    });

    it('只翻译本包错误，其他插件带 messageId 的错误保持原文', async () => {
      const { translator } = app.fastify.account;
      const foreign = Object.assign(new Error('其他插件的错误'), { messageScope: '@kne/fastify-tenant', messageId: 'credentialsInvalid' });
      await translator.translateError({ headers: { 'accept-language': 'en-US' }, query: {} }, foreign);
      assert.equal(foreign.message, '其他插件的错误');
    });

    it('onError 钩子覆盖其他插件注册的路由', async () => {
      const fastify = Fastify({ logger: false });
      await fastify.register(require('@kne/fastify-intl'), { defaultLocale: 'zh-CN' });
      await fastify.register(require('@kne/fastify-sequelize'), { db: { dialect: 'sqlite', storage: ':memory:', logging: false } });
      await fastify.register(require('../index'));
      fastify.get('/other', async () => {
        throw createError(null, 'userNotFound');
      });
      await fastify.ready();
      try {
        const response = await fastify.inject({ method: 'GET', url: '/other', headers: { 'accept-language': 'en-US' } });
        assert.notEqual(response.json().message, '用户不存在');
        assert.equal(response.json().message, locale['en-US'].userNotFound);
      } finally {
        await fastify.close();
      }
    });
  });
});
