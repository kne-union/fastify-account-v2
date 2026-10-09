const fp = require('fastify-plugin');
const { createError } = require('../utils/intl');

const adminService = fp(async (fastify, options) => {
    const {models, services, global} = fastify[options.name];

    const initSuperAdmin = async user => {
        if ((await models.user.count({
            where: {
                isSuperAdmin: true
            }
        })) > 0) {
            throw createError(null, 'systemInitialized');
        }
        const currentUser = await services.user.getUserInstance({id: user.id});
        currentUser.isSuperAdmin = true;
        await currentUser.save();
    };

    const checkIsSuperAdmin = async (user) => {
        const currentUser = await services.user.getUserInstance({id: user.id});
        return currentUser.isSuperAdmin === true;
    };

    services.admin = {initSuperAdmin, checkIsSuperAdmin};
});

module.exports = adminService;
