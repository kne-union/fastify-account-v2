'use strict';

const assert = require('node:assert/strict');
const { buildApp } = require('./support/app');
const zh = require('../libs/locale')['zh-CN'];

describe('账号流程', () => {
  let app;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.fastify.close();
  });

  const expireCode = async ({ name, type }) => {
    const model = app.models.verificationCode;
    const field = model.getAttributes().createdAt.field;
    await app.fastify.sequelize.instance.query(`UPDATE ${model.getTableName()} SET ${field} = :past WHERE name = :name AND type = :type`, {
      replacements: { past: new Date(Date.now() - 11 * 60 * 1000).toISOString(), name, type }
    });
  };

  describe('验证码', () => {
    it('发送邮箱验证码：邮箱转小写，按邮件类型发送', async () => {
      const response = await app.call('POST', '/account/sendEmailCode', { payload: { email: 'Code@Test.com', type: 0 } });
      assert.equal(response.status, 200);
      assert.match(response.body.code, /^\d{6}$/);
      const message = app.messages.at(-1);
      assert.equal(message.name, 'code@test.com');
      assert.equal(message.messageType, 1);
      assert.equal(message.props.code, response.body.code);
    });

    it('发送短信验证码按短信类型发送', async () => {
      const response = await app.call('POST', '/account/sendSMSCode', { payload: { phone: '13800000001', type: 2 } });
      assert.equal(response.status, 200);
      const message = app.messages.at(-1);
      assert.equal(message.messageType, 0);
      assert.equal(message.type, 2);
    });

    it('非测试模式不在响应中返回验证码', async () => {
      const prodApp = await buildApp({ options: { isTest: false } });
      try {
        const response = await prodApp.call('POST', '/account/sendEmailCode', { payload: { email: 'prod@test.com' } });
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, {});
        assert.match(prodApp.messages.at(-1).props.code, /^\d{6}$/);
      } finally {
        await prodApp.fastify.close();
      }
    });

    it('正确验证码通过，错误验证码报错', async () => {
      const { code } = (await app.call('POST', '/account/sendEmailCode', { payload: { email: 'validate@test.com', type: 2 } })).body;
      const wrong = await app.call('POST', '/account/validateCode', { payload: { name: 'validate@test.com', type: 2, code: code === '000000' ? '111111' : '000000' } });
      assert.equal(wrong.status, 500);
      assert.equal(wrong.body.message, zh.verificationCodeIncorrect);
      const ok = await app.call('POST', '/account/validateCode', { payload: { name: 'validate@test.com', type: 2, code } });
      assert.equal(ok.status, 200);
    });

    it('验证码类型不匹配不通过', async () => {
      const code = await app.services.account.sendVerificationCode({ name: 'type@test.com', type: 0 });
      assert.equal(await app.services.account.verificationCodeValidate({ name: 'type@test.com', type: 2, code }), false);
    });

    it('重新发送后旧验证码失效', async () => {
      const first = await app.services.account.sendVerificationCode({ name: 'resend@test.com', type: 0 });
      const second = await app.services.account.sendVerificationCode({ name: 'resend@test.com', type: 0 });
      if (first !== second) {
        assert.equal(await app.services.account.verificationCodeValidate({ name: 'resend@test.com', type: 0, code: first }), false);
      }
      assert.equal(await app.services.account.verificationCodeValidate({ name: 'resend@test.com', type: 0, code: second }), true);
    });

    it('超过 10 分钟的验证码失效，并标记为已过期', async () => {
      const code = await app.services.account.sendVerificationCode({ name: 'expire@test.com', type: 0 });
      await expireCode({ name: 'expire@test.com', type: 0 });
      assert.equal(await app.services.account.verificationCodeValidate({ name: 'expire@test.com', type: 0, code }), false);
      const record = await app.models.verificationCode.findOne({ where: { name: 'expire@test.com', code } });
      assert.equal(record.status, 2);
    });

    it('随机验证码始终为 6 位数字', () => {
      for (let i = 0; i < 50; i++) {
        assert.match(app.services.account.generateRandom6DigitNumber(), /^\d{6}$/);
      }
    });

    it('userNameIsEmail 区分邮箱与手机号', () => {
      assert.equal(app.services.account.userNameIsEmail('a.b-c@test.co'), true);
      assert.equal(app.services.account.userNameIsEmail('13800000000'), false);
    });
  });

  describe('注册', () => {
    it('验证码错误时注册失败', async () => {
      const response = await app.call('POST', '/account/register', { payload: { email: 'reg-bad@test.com', password: 'pwd', code: '000000' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, zh.verificationCodeInvalid);
    });

    it('邮箱注册成功后可登录，重复注册报账号已存在', async () => {
      const { code } = (await app.call('POST', '/account/sendEmailCode', { payload: { email: 'reg@test.com', type: 0 } })).body;
      const response = await app.call('POST', '/account/register', { payload: { email: 'reg@test.com', password: 'pwd', code, nickname: '新用户' } });
      assert.equal(response.status, 200);
      assert.ok(await app.login({ email: 'reg@test.com' }));

      const { code: code2 } = (await app.call('POST', '/account/sendEmailCode', { payload: { email: 'reg@test.com', type: 0 } })).body;
      const duplicate = await app.call('POST', '/account/register', { payload: { email: 'reg@test.com', password: 'pwd', code: code2 } });
      assert.equal(duplicate.status, 500);
      assert.equal(duplicate.body.message, '手机号或者邮箱都不能重复');
    });

    it('validateCode 预校验后仍可用同一验证码注册，注册后验证码作废', async () => {
      const { code } = (await app.call('POST', '/account/sendEmailCode', { payload: { email: 'pre@test.com', type: 0 } })).body;
      assert.equal((await app.call('POST', '/account/validateCode', { payload: { name: 'pre@test.com', type: 0, code } })).status, 200);
      assert.equal((await app.call('POST', '/account/register', { payload: { email: 'pre@test.com', password: 'pwd', code } })).status, 200);
      assert.equal(await app.services.account.verificationCodeValidate({ name: 'pre@test.com', type: 0, code }), false);
    });

    it('手机号注册成功后可用手机号登录', async () => {
      const { code } = (await app.call('POST', '/account/sendSMSCode', { payload: { phone: '13900000001', type: 0 } })).body;
      const response = await app.call('POST', '/account/register', { payload: { phone: '13900000001', password: 'pwd', code } });
      assert.equal(response.status, 200);
      assert.ok(await app.login({ phone: '13900000001' }));
    });

    it('accountIsExists 接口按邮箱 / 手机号判断', async () => {
      await app.createUser({ email: 'exists@test.com', phone: '13700000001' });
      assert.equal((await app.call('POST', '/account/accountIsExists', { payload: { email: 'EXISTS@test.com' } })).body.isExists, true);
      assert.equal((await app.call('POST', '/account/accountIsExists', { payload: { phone: '13700000001' } })).body.isExists, true);
      assert.equal((await app.call('POST', '/account/accountIsExists', { payload: { email: 'none@test.com' } })).body.isExists, false);
    });

    it('addUser 未提供密码报错', async () => {
      await assert.rejects(app.services.user.addUser({ email: 'nopwd@test.com' }), { message: '密码不能为空' });
    });
  });

  describe('登录', () => {
    before(async () => {
      await app.createUser({ email: 'login@test.com', phone: '13600000001', password: 'secret' });
    });

    it('邮箱不区分大小写，正常用户返回 token', async () => {
      const response = await app.call('POST', '/account/login', { payload: { type: 'email', email: 'LOGIN@test.com', password: 'secret' } });
      assert.equal(response.status, 200);
      assert.ok(response.body.token);
    });

    it('type 缺省为 email', async () => {
      const response = await app.call('POST', '/account/login', { payload: { email: 'login@test.com', password: 'secret' } });
      assert.equal(response.status, 200);
      assert.ok(response.body.token);
    });

    it('手机号登录', async () => {
      const response = await app.call('POST', '/account/login', { payload: { type: 'phone', phone: '13600000001', password: 'secret' } });
      assert.equal(response.status, 200);
      assert.ok(response.body.token);
    });

    it('密码错误与用户不存在返回同一提示', async () => {
      const wrong = await app.call('POST', '/account/login', { payload: { type: 'email', email: 'login@test.com', password: 'bad' } });
      const missing = await app.call('POST', '/account/login', { payload: { type: 'email', email: 'nobody@test.com', password: 'bad' } });
      assert.equal(wrong.body.message, '用户名或密码错误');
      assert.equal(missing.body.message, '用户名或密码错误');
    });

    it('不支持的登录类型报错', async () => {
      const response = await app.call('POST', '/account/login', { payload: { type: 'wechat', password: 'x' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, '不支持的登录类型');
    });

    it('非正常状态（禁用 / 待激活）只返回状态，不签发 token', async () => {
      const disabled = await app.createUser({ email: 'disabled@test.com', status: 11 });
      const inactive = await app.createUser({ email: 'inactive@test.com', status: 10 });
      for (const user of [disabled, inactive]) {
        const response = await app.call('POST', '/account/login', { payload: { type: 'email', email: user.email, password: 'pwd' } });
        assert.equal(response.status, 200);
        assert.equal(response.body.token, undefined);
        assert.equal(response.body.status, user.status);
      }
    });

    it('verifyCredentials 正常用户返回用户信息', async () => {
      const result = await app.services.account.verifyCredentials({ type: 'email', email: 'login@test.com', password: 'secret' });
      assert.equal(result.status, 0);
      assert.equal(result.user.email, 'login@test.com');
      assert.ok(result.user.id);
    });

    it('密码账号记录缺失时报账号不存在', async () => {
      const user = await app.createUser({ email: 'no-account@test.com' });
      await app.models.userAccount.destroy({ where: { id: user.userAccountId }, force: true });
      const response = await app.call('POST', '/account/login', { payload: { type: 'email', email: 'no-account@test.com', password: 'pwd' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, '账号不存在');
    });
  });

  describe('新用户初始化密码', () => {
    const md5 = value => app.services.account.md5(value);

    it('待激活用户用初始密码改密后状态变为正常，可用新密码登录', async () => {
      const { token } = await app.createAdmin();
      await app.call('POST', '/admin/addUser', { token, payload: { email: 'newbie@test.com', nickname: 'newbie' } });
      const user = await app.models.user.findOne({ where: { email: 'newbie@test.com' } });
      assert.equal(user.status, 10);

      const response = await app.call('POST', '/account/modifyPassword', { payload: { email: 'newbie@test.com', oldPwd: md5('Aa000000!'), newPwd: 'new-pwd' } });
      assert.equal(response.status, 200);
      await user.reload();
      assert.equal(user.status, 0);
      assert.ok(await app.login({ email: 'newbie@test.com', password: 'new-pwd' }));
    });

    it('新旧密码相同报错', async () => {
      await app.createUser({ email: 'same@test.com', status: 10 });
      const response = await app.call('POST', '/account/modifyPassword', { payload: { email: 'same@test.com', oldPwd: 'pwd', newPwd: 'pwd' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, zh.passwordSameAsInitial);
    });

    it('初始密码错误报错', async () => {
      await app.createUser({ email: 'wrong-init@test.com', status: 10 });
      const response = await app.call('POST', '/account/modifyPassword', { payload: { email: 'wrong-init@test.com', oldPwd: 'bad', newPwd: 'new' } });
      assert.equal(response.body.message, '用户名或密码错误');
    });

    it('已激活用户不能走初始化改密', async () => {
      await app.createUser({ email: 'active@test.com', status: 0 });
      const response = await app.call('POST', '/account/modifyPassword', { payload: { email: 'active@test.com', oldPwd: 'pwd', newPwd: 'new' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, zh.passwordAlreadyInitialized);
    });

    it('初始化改密查询用户时的其他错误原样抛出', async () => {
      const original = app.services.user.getUserInstanceByName;
      app.services.user.getUserInstanceByName = async () => {
        throw new Error('db down');
      };
      try {
        await assert.rejects(app.services.account.modifyPassword({ email: 'x@test.com', oldPwd: 'a', newPwd: 'b' }), { message: 'db down' });
      } finally {
        app.services.user.getUserInstanceByName = original;
      }
    });
  });

  describe('忘记密码', () => {
    it('token 发送给邮箱，可解析出账号并重置密码', async () => {
      await app.createUser({ email: 'forget@test.com', password: 'old' });
      const { token } = (await app.call('POST', '/account/forgetPwd', { payload: { email: 'forget@test.com', referer: '/home' } })).body;
      assert.ok(token);
      const message = app.messages.at(-1);
      assert.equal(message.type, 5);
      assert.equal(message.props.token, token);
      assert.deepEqual(message.props.options, { referer: '/home' });

      const parsed = await app.call('POST', '/account/parseResetToken', { payload: { token } });
      assert.equal(parsed.body.name, 'forget@test.com');

      const reset = await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'new' } });
      assert.equal(reset.status, 200);
      assert.ok(await app.login({ email: 'forget@test.com', password: 'new' }));
      assert.equal(await app.login({ email: 'forget@test.com', password: 'old' }), undefined);
    });

    it('重置成功后同一 token 不能再次使用', async () => {
      await app.createUser({ email: 'reuse@test.com' });
      const { token } = (await app.call('POST', '/account/forgetPwd', { payload: { email: 'reuse@test.com' } })).body;
      assert.equal((await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'first' } })).status, 200);
      const again = await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'second' } });
      assert.equal(again.status, 500);
      assert.equal(again.body.message, zh.verificationCodeInvalid);
      assert.ok(await app.login({ email: 'reuse@test.com', password: 'first' }));
    });

    it('签名无效的 token 被拒绝，即使验证码正确', async () => {
      await app.createUser({ email: 'forged@test.com', password: 'old' });
      await app.call('POST', '/account/forgetPwd', { payload: { email: 'forged@test.com' } });
      const { code } = await app.models.verificationCode.findOne({ where: { name: 'forged@test.com', type: 5 } });
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const forged = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ name: 'forged@test.com', type: 5, code })}.invalid-signature`;

      for (const url of ['/account/resetPassword', '/account/parseResetToken']) {
        const response = await app.call('POST', url, { payload: { token: forged, newPwd: 'hacked' } });
        assert.equal(response.status, 500, url);
        assert.equal(response.body.message, zh.verificationCodeInvalid, url);
      }
      assert.ok(await app.login({ email: 'forged@test.com', password: 'old' }));
    });

    it('验证码过期后 token 不能再用', async () => {
      await app.createUser({ email: 'forget-expire@test.com' });
      const { token } = (await app.call('POST', '/account/forgetPwd', { payload: { email: 'forget-expire@test.com' } })).body;
      await expireCode({ name: 'forget-expire@test.com', type: 5 });
      const response = await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'new' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, zh.verificationCodeInvalid);
    });

    it('已禁用用户不能通过忘记密码重置', async () => {
      await app.createUser({ email: 'forget-disabled@test.com', status: 11 });
      const { token } = (await app.call('POST', '/account/forgetPwd', { payload: { email: 'forget-disabled@test.com' } })).body;
      const response = await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'new' } });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, '用户不存在');
    });

    it('手机号也可以找回密码', async () => {
      await app.createUser({ email: undefined, phone: '13500000001' });
      const { token } = (await app.call('POST', '/account/forgetPwd', { payload: { phone: '13500000001' } })).body;
      assert.equal(app.messages.at(-1).messageType, 0);
      const response = await app.call('POST', '/account/resetPassword', { payload: { token, newPwd: 'new' } });
      assert.equal(response.status, 200);
      assert.ok(await app.login({ phone: '13500000001', password: 'new' }));
    });
  });
});
