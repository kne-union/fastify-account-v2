'use strict';

const assert = require('node:assert/strict');
const { buildApp } = require('./support/app');

describe('接口文档与问题修复回归', () => {
  let app;
  let admin;

  beforeEach(async () => {
    app = await buildApp();
    admin = await app.createAdmin();
  });

  afterEach(async () => {
    await app.fastify.close();
  });

  it('saveUserInfo 可以修改性别和出生日期', async () => {
    const user = await app.createUser();
    const token = await app.login({ email: user.email });
    const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { gender: 'F', birthday: '2000-01-02' } });
    assert.equal(response.status, 200);
    const saved = await app.models.user.findByPk(user.id);
    assert.equal(saved.gender, 'F');
    assert.equal(new Date(saved.birthday).toISOString().slice(0, 10), '2000-01-02');
  });

  it('admin/saveUser 可以修改性别，且未传字段保持原值', async () => {
    const user = await app.createUser({ phone: '13100000001', description: '原简介' });
    const response = await app.call('POST', '/admin/saveUser', { token: admin.token, payload: { id: user.id, gender: 'M' } });
    assert.equal(response.status, 200);
    const saved = await app.models.user.findByPk(user.id);
    assert.equal(saved.gender, 'M');
    assert.equal(saved.phone, '13100000001');
    assert.equal(saved.description, '原简介');
  });

  it('大写邮箱可以校验验证码并注册', async () => {
    const { code } = (await app.call('POST', '/account/sendEmailCode', { payload: { email: 'Upper@Test.com', type: 0 } })).body;
    assert.equal((await app.call('POST', '/account/validateCode', { payload: { name: 'Upper@Test.com', type: 0, code } })).status, 200);
    const response = await app.call('POST', '/account/register', { payload: { email: 'Upper@Test.com', password: 'p', code } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.email, 'upper@test.com');
    assert.ok(await app.login({ email: 'upper@test.com', password: 'p' }));
  });

  it('大写邮箱忘记密码后可以重置', async () => {
    await app.createUser({ email: 'reset@test.com' });
    const { token } = (await app.call('POST', '/account/forgetPwd', { payload: { email: 'Reset@Test.com' } })).body;
    assert.equal((await app.call('POST', '/account/parseResetToken', { payload: { token } })).body.name, 'reset@test.com');
    const response = await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'new' } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.ok(await app.login({ email: 'reset@test.com', password: 'new' }));
  });

  it('大写邮箱可以完成新用户设置密码', async () => {
    await app.createUser({ email: 'fresh@test.com', status: 10 });
    const response = await app.call('POST', '/account/modifyPassword', { payload: { email: 'Fresh@Test.com', oldPwd: 'pwd', newPwd: 'pwd2' } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  });

  it('登录缺少对应账号字段时返回业务错误而不是程序异常', async () => {
    const byEmail = await app.call('POST', '/account/login', { payload: { phone: '13800000000', password: 'x' } });
    assert.equal(byEmail.body.message, '用户名或密码错误');
    const byPhone = await app.call('POST', '/account/login', { payload: { type: 'phone', email: 'a@test.com', password: 'x' } });
    assert.equal(byPhone.body.message, '用户名或密码错误');
  });

  it('getUserList 分页参数必须从 1 开始', async () => {
    for (const query of [{ currentPage: '0' }, { perPage: '0' }]) {
      const response = await app.call('GET', '/admin/getUserList', { token: admin.token, query });
      assert.equal(response.status, 400, JSON.stringify(query));
    }
  });

  it('getUserList 的 isSuperAdmin 只接受 true / false', async () => {
    const response = await app.call('GET', '/admin/getUserList', { token: admin.token, query: { 'filter[isSuperAdmin]': 'yes' } });
    assert.equal(response.status, 400);
  });

  it('addUser 至少需要邮箱或手机号', async () => {
    const response = await app.call('POST', '/admin/addUser', { token: admin.token, payload: { nickname: '无账号' } });
    assert.equal(response.status, 400);
    const byPhone = await app.call('POST', '/admin/addUser', { token: admin.token, payload: { phone: '13600000000' } });
    assert.equal(byPhone.status, 200);
  });

  describe('业务错误返回 400', () => {
    it('密码错误、验证码错误返回 400，认证失败仍为 401', async () => {
      const user = await app.createUser();
      const wrong = await app.call('POST', '/account/login', { payload: { email: user.email, password: 'bad' } });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.message, '用户名或密码错误');
      const code = await app.call('POST', '/account/validateCode', { payload: { name: user.email, type: 0, code: '000000' } });
      assert.equal(code.status, 400);
      assert.equal((await app.call('GET', '/user/getUserInfo')).status, 401);
    });
  });

  describe('用户修改邮箱 / 手机号需要验证码', () => {
    let user;
    let token;
    const sendCode = async (field, value, type = 6) => (await app.call('POST', field === 'email' ? '/account/sendEmailCode' : '/account/sendSMSCode', { payload: { [field]: value, type } })).body.code;

    beforeEach(async () => {
      user = await app.createUser({ phone: '13300000001' });
      token = await app.login({ email: user.email });
    });

    it('没有验证码或验证码错误时不能改邮箱', async () => {
      for (const payload of [{ email: 'new@test.com' }, { email: 'new@test.com', emailCode: '000000' }]) {
        const response = await app.call('POST', '/user/saveUserInfo', { token, payload });
        assert.equal(response.status, 400);
        assert.equal(response.body.message, '验证码不正确或者已经过期');
      }
      assert.equal((await app.models.user.findByPk(user.id)).email, user.email);
    });

    it('其他用途的验证码不能用来改邮箱', async () => {
      const code = await sendCode('email', 'new@test.com', 0);
      const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { email: 'new@test.com', emailCode: code } });
      assert.equal(response.status, 400);
    });

    it('用发往新邮箱的验证码可以修改，验证码用后作废', async () => {
      const code = await sendCode('email', 'new@test.com');
      assert.equal((await app.call('POST', '/user/saveUserInfo', { token, payload: { email: 'new@test.com', emailCode: code } })).status, 200);
      assert.equal((await app.models.user.findByPk(user.id)).email, 'new@test.com');
      const reuse = await app.call('POST', '/user/saveUserInfo', { token, payload: { email: 'again@test.com', emailCode: code } });
      assert.equal(reuse.status, 400);
    });

    it('修改手机号需要 phoneCode', async () => {
      assert.equal((await app.call('POST', '/user/saveUserInfo', { token, payload: { phone: '13300000002' } })).status, 400);
      const code = await sendCode('phone', '13300000002');
      assert.equal((await app.call('POST', '/user/saveUserInfo', { token, payload: { phone: '13300000002', phoneCode: code } })).status, 200);
      assert.equal((await app.models.user.findByPk(user.id)).phone, '13300000002');
    });

    it('提交与当前相同的邮箱（大小写不同）不需要验证码', async () => {
      const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { email: user.email.toUpperCase(), phone: '13300000001', nickname: 'x' } });
      assert.equal(response.status, 200, JSON.stringify(response.body));
    });

    it('改成他人邮箱先报重复，不消耗验证码', async () => {
      const other = await app.createUser();
      const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { email: other.email } });
      assert.equal(response.body.message, '手机号或者邮箱都不能重复');
    });

    it('管理员修改邮箱不需要验证码', async () => {
      const response = await app.call('POST', '/admin/saveUser', { token: admin.token, payload: { id: user.id, email: 'byadmin@test.com' } });
      assert.equal(response.status, 200);
      assert.equal((await app.models.user.findByPk(user.id)).email, 'byadmin@test.com');
    });
  });

  describe('资料字段可以清空', () => {
    it('传空字符串或 null 清空，未传保持原值', async () => {
      const user = await app.createUser({ phone: '13400000001', description: '简介', gender: 'F', birthday: '2000-01-02' });
      const token = await app.login({ email: user.email });
      const response = await app.call('POST', '/user/saveUserInfo', { token, payload: { description: '', birthday: '', gender: null } });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const saved = await app.models.user.findByPk(user.id);
      assert.equal(saved.description, null);
      assert.equal(saved.birthday, null);
      assert.equal(saved.gender, null);
      assert.equal(saved.nickname, user.nickname);
      assert.equal(saved.phone, '13400000001');
    });

    it('有手机号时可以清空邮箱，邮箱和手机号不能同时为空', async () => {
      const user = await app.createUser({ phone: '13400000002' });
      const token = await app.login({ email: user.email });
      const both = await app.call('POST', '/user/saveUserInfo', { token, payload: { email: '', phone: '' } });
      assert.equal(both.status, 400);
      assert.equal(both.body.message, '邮箱和手机号至少保留一个');
      assert.equal((await app.call('POST', '/user/saveUserInfo', { token, payload: { email: '' } })).status, 200);
      const saved = await app.models.user.findByPk(user.id);
      assert.equal(saved.email, null);
      assert.ok(await app.login({ phone: '13400000002' }));
    });

    it('只有邮箱时不能清空邮箱', async () => {
      const user = await app.createUser();
      const response = await app.call('POST', '/admin/saveUser', { token: admin.token, payload: { id: user.id, email: '' } });
      assert.equal(response.status, 400);
      assert.equal(response.body.message, '邮箱和手机号至少保留一个');
    });

    it('出生日期格式错误返回 400', async () => {
      const user = await app.createUser();
      const response = await app.call('POST', '/admin/saveUser', { token: admin.token, payload: { id: user.id, birthday: '2000/01/02' } });
      assert.equal(response.status, 400);
    });
  });

  it('所有路由都有 tags、summary，参数都有用途说明，并声明 200 响应', async () => {
    const routes = [];
    const collect = fastify => {
      fastify.addHook('onRoute', route => route.method !== 'HEAD' && routes.push(route));
    };
    const fresh = await (async () => {
      const Fastify = require('fastify');
      const instance = Fastify({ logger: false });
      collect(instance);
      await instance.register(require('@kne/fastify-sequelize'), { db: { dialect: 'sqlite', storage: ':memory:', logging: false } });
      await instance.register(require('../index'), { isTest: true });
      await instance.ready();
      return instance;
    })();

    const missing = [];
    const checkProps = (where, schema) => {
      if (!schema) return;
      [].concat(schema.oneOf || [], schema.anyOf || [], schema).forEach(item => {
        Object.entries(item.properties || {}).forEach(([key, prop]) => {
          if (!prop.description) missing.push(`${where}.${key}`);
          if (prop.type === 'object') checkProps(`${where}.${key}`, prop);
        });
      });
    };
    routes.forEach(route => {
      const { schema = {} } = route;
      const name = `${route.method} ${route.url}`;
      if (!(schema.tags && schema.tags.length)) missing.push(`${name} tags`);
      if (!schema.summary) missing.push(`${name} summary`);
      if (!(schema.response && schema.response[200] && schema.response[200].description)) missing.push(`${name} response`);
      checkProps(`${name} body`, schema.body);
      checkProps(`${name} query`, schema.querystring || schema.query);
    });
    await fresh.close();
    assert.equal(routes.length, 21);
    assert.deepEqual(missing, []);
  });
});
