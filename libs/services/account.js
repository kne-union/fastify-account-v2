const fp = require('fastify-plugin');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { createError } = require('../utils/intl');

const generateRandom6DigitNumber = () => {
  const randomNumber = Math.random() * 1000000;
  return Math.floor(randomNumber).toString().padStart(6, '0');
};

const userNameIsEmail = username => {
  return /^([a-zA-Z0-9_.-])+@(([a-zA-Z0-9-])+\.)+([a-zA-Z0-9]{2,4})+$/.test(username);
};

const md5 = value => {
  const hash = crypto.createHash('md5');
  hash.update(value);
  return hash.digest('hex');
};

const accountService = fp(async (fastify, options) => {
  const { models, services } = fastify[options.name];
  const { Op } = fastify.sequelize.Sequelize;
  const verificationCodeValidate = async ({ name, type, code }) => {
    const verificationCode = await models.verificationCode.findOne({
      where: {
        name, type, code, status: {
          [fastify.sequelize.Sequelize.Op.or]: [0, 1]
        }
      }
    });
    const isPass = !!(verificationCode && dayjs().isBefore(dayjs(verificationCode.createdAt).add(10, 'minute')));

    if (verificationCode) {
      verificationCode.status = isPass ? 1 : 2;
      await verificationCode.save();
    }

    return isPass;
  };

  // validateCode 预校验后验证码仍需可用于注册，所以只在注册 / 重置密码成功后作废
  const consumeVerificationCode = async ({ name, type, code }) => {
    await models.verificationCode.update({ status: 2 }, { where: { name, type, code } });
  };

  const generateVerificationCode = async ({ name, type }) => {
    const code = generateRandom6DigitNumber();
    await models.verificationCode.update({
      status: 2
    }, {
      where: {
        name, type, status: 0
      }
    });
    await models.verificationCode.create({
      name, type, code
    });
    return code;
  };

  const sendVerificationCode = async ({ name, type, options: otherOptions }) => {
    // messageType: 0:短信验证码，1:邮件验证码 type: 0:注册,2:登录,4:验证租户管理员,5:忘记密码
    name = name.toLowerCase();
    const code = await generateVerificationCode({ name, type });
    const isEmail = userNameIsEmail(name);
    // 这里写发送逻辑
    await options.sendMessage({ name, type, messageType: isEmail ? 1 : 0, props: { code, options: otherOptions } });
    return code;
  };

  const sendJWTVerificationCode = async ({ name, type, options: otherOptions }) => {
    const code = await generateVerificationCode({ name, type });
    const token = fastify.jwt.sign({ name, type, code });
    const isEmail = userNameIsEmail(name);
    // 这里写发送逻辑
    await options.sendMessage({ name, type, messageType: isEmail ? 1 : 0, props: { token, options: otherOptions } });
    return token;
  };

  const verificationJWTCodeValidate = async ({ token }) => {
    let payload;
    try {
      payload = fastify.jwt.verify(token);
    } catch (e) {
      throw createError(null, 'verificationCodeInvalid');
    }
    const { name, type, code } = payload;
    if (!(await verificationCodeValidate({ name, type, code }))) {
      throw createError(null, 'verificationCodeInvalid');
    }
    return { name, type, code };
  };

  const passwordEncryption = async password => {
    const salt = await bcrypt.genSalt(10);
    const combinedString = password + salt;
    const hash = await bcrypt.hash(combinedString, salt);

    return {
      password: hash, salt
    };
  };

  const passwordAuthentication = async ({ accountId, password }) => {
    const userAccount = await models.userAccount.findByPk(accountId);
    if (!userAccount) {
      throw createError(null, 'accountNotFound');
    }
    const generatedHash = await bcrypt.hash(password + userAccount.salt, userAccount.salt);
    if (userAccount.password !== generatedHash) {
      throw createError(null, 'credentialsInvalid');
    }
  };

  const register = async ({
                            avatar, nickname, gender, birthday, description, phone, email, code, password, status
                          }) => {
    const type = phone ? 0 : 1;
    const name = type === 0 ? phone : email;
    if (!(await verificationCodeValidate({ name, type: 0, code }))) {
      throw createError(null, 'verificationCodeInvalid');
    }

    const user = await services.user.addUser({
      avatar, nickname, gender, birthday, description, phone, email, password, status
    });
    await consumeVerificationCode({ name, type: 0, code });
    return user;
  };

  const verifyCredentials = async ({ type, email, phone, password }) => {
    const query = {};
    (() => {
      if (type === 'email') {
        query.email = email.toLowerCase();
        return;
      }
      if (type === 'phone') {
        query.phone = phone;
        return;
      }

      throw createError(null, 'loginTypeUnsupported');
    })();
    const user = await models.user.findOne({
      where: query
    });

    if (!user) {
      throw createError(null, 'credentialsInvalid');
    }

    await passwordAuthentication({ accountId: user.userAccountId, password });

    if (!(user.status === 0 || user.status === 1)) {
      return {
        status: user.status
      };
    }

    return {
      status: user.status,
      user: Object.assign({}, user.get({ plain: true }), { id: user.id })
    };
  };

  const login = async props => {
    const { user, status } = await verifyCredentials(props);
    if (!user) {
      return { status };
    }
    return {
      token: fastify.jwt.sign({ payload: { id: user.id } }),
      user
    };
  };

  const resetPasswordByToken = async ({ password, token }) => {
    const { name, type, code } = await verificationJWTCodeValidate({ token });
    const user = await services.user.getUserInstanceByName({ name, status: [0, 1] });
    await resetPassword({ password, userId: user.id });
    await consumeVerificationCode({ name, type, code });
  };

  const modifyPassword = async ({ email, phone, oldPwd, newPwd }) => {
    const user = await services.user.getUserInstanceByName({ name: email || phone, status: 10 }).catch(error => {
      if (error.messageId === 'userNotFound') {
        return null;
      }
      throw error;
    });
    if (!user) {
      throw createError(null, 'passwordAlreadyInitialized');
    }
    if (oldPwd === newPwd) {
      throw createError(null, 'passwordSameAsInitial');
    }
    await passwordAuthentication({ accountId: user.userAccountId, password: oldPwd });
    await resetPassword({ userId: user.id, password: newPwd });
    user.status = 0;
    await user.save();
  };

  const resetPassword = async ({ password, userId }) => {
    const user = await services.user.getUserInstance({ id: userId });
    const account = await models.userAccount.create(Object.assign({}, await passwordEncryption(password), {
      belongToUserId: user.id
    }));
    await user.update({ userAccountId: account.id });
  };

  services.account = {
    generateRandom6DigitNumber,
    sendVerificationCode,
    sendJWTVerificationCode,
    verificationCodeValidate,
    verificationJWTCodeValidate,
    passwordEncryption,
    register,
    verifyCredentials,
    login,
    userNameIsEmail,
    md5,
    resetPassword,
    resetPasswordByToken,
    modifyPassword
  };
});

module.exports = accountService;
