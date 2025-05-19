const fp = require('fastify-plugin');

const userController = fp(async (fastify, options) => {
  const { authenticate } = fastify[options.name];

  fastify.get(
    `${options.prefix}/user/getUserInfo`,
    {
      onRequest: [authenticate.user]
    },
    async request => {
      return { userInfo: request.userInfo };
    }
  );
});

module.exports = userController;
