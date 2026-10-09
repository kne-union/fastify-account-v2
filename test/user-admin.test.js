'use strict';

const assert = require('node:assert/strict');
const { buildApp } = require('./support/app');
const zh = require('../libs/locale')['zh-CN'];

describe('认证与用户、管理接口', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.fastify.close();
  });

  describe('认证', () => {
    it('未带 token 返回 401', async () => {
      const response = await app.call('GET', '/user/getUserInfo');
      assert.equal(response.status, 401);
      assert.equal(response.body.message, zh.authenticationFailed);
    });

    it('伪造 token 返回 401', async () => {
      const response = await app.call('GET', '/user/getUserInfo', { token: 'not-a-jwt' });
      assert.equal(response.status, 401);
    });

    it('用其他密钥签发的 token 返回 401', async () => {
      const other = await buildApp({ options: { jwt: { secret: 'another-secret' } } });
      try {
        const user = await other.createUser();
        const token = await other.login({ email: user.email });
        assert.equal((await app.call('GET', '/user/getUserInfo', { token })).status, 401);
      } finally {
        await other.fastify.close();
      }
    });

    it('token 可通过 query 传递', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      const response = await app.call('GET', '/user/getUserInfo', { query: { token } });
      assert.equal(response.status, 200);
      assert.equal(response.body.userInfo.id, user.id);
    });

    it('用户被删除后 token 失效', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      await app.models.user.destroy({ where: { id: user.id } });
      assert.equal((await app.call('GET', '/user/getUserInfo', { token })).status, 401);
    });

    it('用户被禁用或关闭后旧 token 返回 401，恢复后可继续使用', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      for (const status of [11, 12, 10]) {
        await app.services.user.setUserStatus({ userId: user.id, status });
        const response = await app.call('GET', '/user/getUserInfo', { token });
        assert.equal(response.status, 401, String(status));
        assert.equal(response.body.message, zh.accountUnavailable);
      }
      await app.services.user.setUserStatus({ userId: user.id, status: 1 });
      assert.equal((await app.call('GET', '/user/getUserInfo', { token })).status, 200);
    });

    it('token 内无用户 id 返回 401', async () => {
      const token = app.fastify.jwt.sign({ payload: {} });
      assert.equal((await app.call('GET', '/user/getUserInfo', { token })).status, 401);
    });

    it('配置 expires 后过期 token 返回 401', async () => {
      const expiring = await buildApp({ options: { jwt: { expires: 60 * 1000 } } });
      try {
        const user = await expiring.createUser();
        const fresh = expiring.fastify.jwt.sign({ payload: { id: user.id } });
        assert.equal((await expiring.call('GET', '/user/getUserInfo', { token: fresh })).status, 200);
        const stale = expiring.fastify.jwt.sign({ payload: { id: user.id }, iat: Math.floor(Date.now() / 1000) - 120 });
        const response = await expiring.call('GET', '/user/getUserInfo', { token: stale });
        assert.equal(response.status, 401);
        assert.equal(response.body.message, zh.authenticationExpired);
      } finally {
        await expiring.fastify.close();
      }
    });

    it('x-app-name 写入 request.appName', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      const { authenticate } = app.fastify.account;
      const request = { headers: { 'x-user-token': token, 'x-app-name': 'crm' }, query: {}, jwtVerify: () => app.fastify.jwt.verify(token) };
      await authenticate.user(request);
      assert.equal(request.appName, 'crm');
      assert.equal(request.userInfo.id, user.id);
    });
  });

  describe('用户信息', () => {
    it('获取当前用户信息，不返回密码等敏感字段', async () => {
      const user = await app.createUser({ nickname: '张三', phone: '13100000001' });
      const token = await app.login({ email: user.email });
      const response = await app.call('GET', '/user/getUserInfo', { token });
      assert.equal(response.status, 200);
      assert.equal(response.body.userInfo.nickname, '张三');
      assert.equal(response.body.userInfo.phone, '13100000001');
      assert.equal(response.body.userInfo.userAccountId, undefined);
      assert.equal(response.body.userInfo.isSuperAdmin, undefined);
    });

    it('修改自己的信息', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { nickname: '新昵称', description: '简介' } });
      assert.equal(response.status, 200);
      const info = (await app.call('GET', '/user/getUserInfo', { token })).body.userInfo;
      assert.equal(info.nickname, '新昵称');
      assert.equal(info.description, '简介');
    });

    it('保留原邮箱不算重复，改成他人邮箱报重复', async () => {
      const other = await app.createUser();
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      assert.equal((await app.call('POST', '/user/saveUserInfo', { token, payload: { email: user.email, nickname: 'x' } })).status, 200);
      const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { email: other.email } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, '手机号或者邮箱都不能重复');
    });

    it('修改邮箱后统一转小写', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      await app.call('POST', '/user/saveUserInfo', { token, payload: { email: 'Changed@Test.com' } });
      const info = (await app.call('GET', '/user/getUserInfo', { token })).body.userInfo;
      assert.equal(info.email, 'changed@test.com');
    });

    it('getUserInstance 不存在的用户报错', async () => {
      await assert.rejects(app.services.user.getUserInstance({ id: 'missing' }), { message: '用户不存在' });
    });
  });

  describe('超级管理员初始化', () => {
    it('首个用户可初始化为超管，之后不能再次初始化', async () => {
      const fresh = await buildApp();
      try {
        const first = await fresh.createUser();
        const second = await fresh.createUser();
        const firstToken = await fresh.login({ email: first.email });
        const secondToken = await fresh.login({ email: second.email });

        assert.equal((await fresh.call('GET', '/admin/getSuperAdminInfo', { token: firstToken })).status, 401);
        assert.equal((await fresh.call('POST', '/admin/initSuperAdmin', { token: firstToken })).status, 200);

        const info = await fresh.call('GET', '/admin/getSuperAdminInfo', { token: firstToken });
        assert.equal(info.status, 200);
        assert.equal(info.body.userInfo.id, first.id);

        const again = await fresh.call('POST', '/admin/initSuperAdmin', { token: secondToken });
        assert.equal(again.status, 500);
        assert.equal(again.body.message, '系统已经初始化完成，不能执行该操作');
      } finally {
        await fresh.fastify.close();
      }
    });
  });

  describe('管理接口', () => {
    let admin;

    before(async () => {
      admin = await app.createAdmin();
    });

    it('非超管访问返回 401', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      const endpoints = [
        ['GET', '/admin/getUserList'],
        ['POST', '/admin/addUser', {}],
        ['POST', '/admin/resetUserPassword', { userId: user.id, password: 'x' }],
        ['POST', '/admin/saveUser', { id: user.id }],
        ['POST', '/admin/setSuperAdmin', { userId: user.id, status: true }],
        ['POST', '/admin/setUserClose', { id: user.id }],
        ['POST', '/admin/setUserNormal', { id: user.id }]
      ];
      for (const [method, url, payload] of endpoints) {
        const response = await app.call(method, url, { token, payload });
        assert.equal(response.status, 401, url);
        assert.equal(response.body.message, zh.superAdminRequired, url);
      }
      assert.equal(await app.services.admin.checkIsSuperAdmin(user), false);
    });

    it('添加用户：默认待激活状态，使用默认密码', async () => {
      const response = await app.call('POST', '/admin/addUser', { token: admin.token, payload: { email: 'added@test.com', nickname: 'added' } });
      assert.equal(response.status, 200);
      const user = await app.models.user.findOne({ where: { email: 'added@test.com' } });
      assert.equal(user.status, 10);
      const result = await app.services.account.verifyCredentials({ type: 'email', email: 'added@test.com', password: app.services.account.md5('Aa000000!') });
      assert.equal(result.status, 10);
    });

    it('添加重复邮箱报错', async () => {
      const response = await app.call('POST', '/admin/addUser', { token: admin.token, payload: { email: 'added@test.com' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, '手机号或者邮箱都不能重复');
    });

    it('自定义 defaultPassword 生效', async () => {
      const custom = await buildApp({ options: { defaultPassword: 'Custom#1' } });
      try {
        const { token } = await custom.createAdmin();
        await custom.call('POST', '/admin/addUser', { token, payload: { email: 'custom@test.com' } });
        const result = await custom.services.account.verifyCredentials({ type: 'email', email: 'custom@test.com', password: custom.services.account.md5('Custom#1') });
        assert.equal(result.status, 10);
      } finally {
        await custom.fastify.close();
      }
    });

    it('用户列表：分页、按昵称模糊搜索、按超管筛选', async () => {
      await app.createUser({ nickname: 'list-alpha' });
      await app.createUser({ nickname: 'list-beta' });

      const page = await app.call('GET', '/admin/getUserList', { token: admin.token, query: { perPage: '2', currentPage: '1' } });
      assert.equal(page.status, 200);
      assert.equal(page.body.pageData.length, 2);
      assert.ok(page.body.totalCount > 2);

      const filtered = await app.call('GET', '/admin/getUserList', { token: admin.token, query: { 'filter[nickname]': 'list-' } });
      assert.deepEqual(filtered.body.pageData.map(item => item.nickname).sort(), ['list-alpha', 'list-beta']);

      const admins = await app.call('GET', '/admin/getUserList', { token: admin.token, query: { 'filter[isSuperAdmin]': 'true' } });
      assert.ok(admins.body.pageData.length >= 1);
      assert.ok(admins.body.pageData.every(item => item.isSuperAdmin === true));

      const normal = await app.call('GET', '/admin/getUserList', { token: admin.token, query: { 'filter[isSuperAdmin]': 'false' } });
      assert.ok(normal.body.pageData.every(item => item.isSuperAdmin !== true));
    });

    it('用户列表按状态筛选', async () => {
      await app.createUser({ nickname: 'closed-one', status: 12 });
      const response = await app.call('GET', '/admin/getUserList', { token: admin.token, query: { 'filter[status]': '12' } });
      assert.ok(response.body.pageData.length >= 1);
      assert.ok(response.body.pageData.every(item => item.status === 12));
    });

    it('修改用户信息', async () => {
      const user = await app.createUser();
      const response = await app.call('POST', '/admin/saveUser', { token: admin.token, payload: { id: user.id, nickname: 'renamed', phone: '13200000001' } });
      assert.equal(response.status, 200);
      const saved = await app.models.user.findByPk(user.id);
      assert.equal(saved.nickname, 'renamed');
      assert.equal(saved.phone, '13200000001');
      assert.equal(saved.email, user.email);
    });

    it('重置用户密码后旧密码失效', async () => {
      const user = await app.createUser({ password: 'old' });
      const response = await app.call('POST', '/admin/resetUserPassword', { token: admin.token, payload: { userId: user.id, password: 'reset' } });
      assert.equal(response.status, 200);
      assert.ok(await app.login({ email: user.email, password: 'reset' }));
      assert.equal(await app.login({ email: user.email, password: 'old' }), undefined);
    });

    it('关闭用户后不能登录且旧 token 失效，恢复正常后可以登录', async () => {
      const user = await app.createUser();
      const userToken = await app.login({ email: user.email });
      await app.call('POST', '/admin/setUserClose', { token: admin.token, payload: { id: user.id } });
      assert.equal((await app.call('GET', '/user/getUserInfo', { token: userToken })).status, 401);
      const closed = await app.call('POST', '/account/login', { payload: { type: 'email', email: user.email, password: 'pwd' } });
      assert.equal(closed.body.status, 12);
      assert.equal(closed.body.token, undefined);

      await app.call('POST', '/admin/setUserNormal', { token: admin.token, payload: { id: user.id } });
      assert.ok(await app.login({ email: user.email }));
    });

    it('设置与取消超级管理员', async () => {
      const user = await app.createUser();
      const token = await app.login({ email: user.email });
      await app.call('POST', '/admin/setSuperAdmin', { token: admin.token, payload: { userId: user.id, status: true } });
      assert.equal((await app.call('GET', '/admin/getSuperAdminInfo', { token })).status, 200);
      await app.call('POST', '/admin/setSuperAdmin', { token: admin.token, payload: { userId: user.id, status: false } });
      assert.equal((await app.call('GET', '/admin/getSuperAdminInfo', { token })).status, 401);
    });

    it('操作不存在的用户报用户不存在', async () => {
      const response = await app.call('POST', '/admin/setUserClose', { token: admin.token, payload: { id: 'missing' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, '用户不存在');
    });
  });
});
