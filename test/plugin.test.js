'use strict';

const assert = require('node:assert/strict');
const { buildApp } = require('./support/app');

describe('插件配置', () => {
  it('未配置 prefix 时按 name 与 version 生成', async () => {
    const app = await buildApp({ options: { prefix: undefined, name: 'member', version: '2.0.0' } });
    try {
      assert.ok(app.fastify.member.services.user);
      const response = await app.fastify.inject({ method: 'POST', url: '/api/member/v2.0.0/account/accountIsExists', payload: { email: 'a@test.com' } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().isExists, false);
    } finally {
      await app.fastify.close();
    }
  });

  it('dbTableNamePrefix 作用于表名', async () => {
    const app = await buildApp({ options: { dbTableNamePrefix: 't_member_' } });
    try {
      assert.match(String(app.models.user.getTableName()), /^t_member_/);
    } finally {
      await app.fastify.close();
    }
  });

  it('getUserAuthenticate 可替换用户认证方式', async () => {
    let currentUser = null;
    const app = await buildApp({
      options: {
        getUserAuthenticate: () => async request => {
          request.userInfo = currentUser;
          request.authenticatePayload = { id: currentUser.id };
        }
      }
    });
    try {
      currentUser = await app.createUser({ nickname: '外部认证' });
      const response = await app.call('GET', '/user/getUserInfo');
      assert.equal(response.status, 200);
      assert.equal(response.body.userInfo.nickname, '外部认证');
    } finally {
      await app.fastify.close();
    }
  });

  it('暴露 services / models / authenticate / locale / translator 模块', async () => {
    const app = await buildApp();
    try {
      const { account } = app.fastify;
      for (const key of ['services', 'models', 'authenticate', 'locale', 'translator']) {
        assert.ok(account[key], key);
      }
      assert.equal(typeof account.authenticate.tokenUser, 'function');
    } finally {
      await app.fastify.close();
    }
  });
});
