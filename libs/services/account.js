const fp = require('fastify-plugin');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');

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
        name,
        type,
        code,
        status: {
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

  const generateVerificationCode = async ({ name, type }) => {
    const code = generateRandom6DigitNumber();
    await models.verificationCode.update(
      {
        status: 2
      },
      {
        where: {
          name,
          type,
          status: 0
        }
      }
    );
    await models.verificationCode.create({
      name,
      type,
      code
    });
    return code;
  };

  const sendVerificationCode = async ({ name, type }) => {
    // messageType: 0:短信验证码，1:邮件验证码 type: 0:注册,2:登录,4:验证租户管理员,5:忘记密码
    const code = await generateVerificationCode({ name, type });
    const isEmail = userNameIsEmail(name);
    // 这里写发送逻辑
    await options.sendMessage({ name, type, messageType: isEmail ? 1 : 0, props: { code } });
    return code;
  };

  const sendJWTVerificationCode = async ({ name, type }) => {
    const code = await generateVerificationCode({ name, type });
    const token = fastify.jwt.sign({ name, type, code });
    const isEmail = userNameIsEmail(name);
    // 这里写发送逻辑
    await options.sendMessage({ name, type, messageType: isEmail ? 1 : 0, props: { token } });
    return token;
  };

  const verificationJWTCodeValidate = async ({ token }) => {
    const { iat, name, type, code } = fastify.jwt.decode(token);
    if (!(await verificationCodeValidate({ name, type, code }))) {
      throw new Error('验证码不正确或者已经过期');
    }
    return { name, type, code };
  };

  const passwordEncryption = async password => {
    const salt = await bcrypt.genSalt(10);
    const combinedString = password + salt;
    const hash = await bcrypt.hash(combinedString, salt);

    return {
      password: hash,
      salt
    };
  };

  const passwordAuthentication = async ({ accountId, password }) => {
    const userAccount = await models.userAccount.findByPk(accountId);
    if (!userAccount) {
      throw new Error('账号不存在');
    }
    const generatedHash = await bcrypt.hash(password + userAccount.salt, userAccount.salt);
    if (userAccount.password !== generatedHash) {
      throw new Error('用户名或密码错误');
    }
  };

  const register = async ({ avatar, nickname, gender, birthday, description, phone, email, code, password, status }) => {
    const type = phone ? 0 : 1;
    if (!(await verificationCodeValidate({ name: type === 0 ? phone : email, type: 0, code }))) {
      throw new Error('验证码不正确或者已经过期');
    }

    return await services.user.addUser({
      avatar,
      nickname,
      gender,
      birthday,
      description,
      phone,
      email,
      password,
      status
    });
  };

  const login = async ({ type, email, phone, password }) => {
    const query = {
      status: {
        [Op.or]: [0, 1]
      }
    };
    (() => {
      if (type === 'email') {
        query.email = email;
        return;
      }
      if (type === 'phone') {
        query.phone = phone;
        return;
      }

      throw new Error('不支持的登录类型');
    })();
    const user = await models.user.findOne({
      where: query
    });

    if (!user) {
      throw new Error('用户名或密码错误');
    }

    await passwordAuthentication({ accountId: user.userAccountId, password });

    return {
      token: fastify.jwt.sign({ payload: { id: user.uuid } }),
      user: Object.assign({}, user.get({ plain: true }), { id: user.uuid })
    };
  };

  const resetPassword = async ({ password, userId }) => {
    const user = await services.user.getUserInstance({ uuid: userId });
    const account = await models.userAccount.create(
      Object.assign({}, await passwordEncryption(password), {
        belongToUserId: user.id
      })
    );
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
    login,
    userNameIsEmail,
    md5,
    resetPassword
  };
});

module.exports = accountService;
