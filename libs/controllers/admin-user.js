const fp = require('fastify-plugin');

const adminUserController = fp(async (fastify, options) => {
    const {services, authenticate} = fastify[options.name];
    fastify.get(`${options.prefix}/admin/getUserList`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '获取用户列表', query: {
                type: 'object', properties: {
                    perPage: {type: 'number'}, currentPage: {type: 'number'}
                }
            }
        }
    }, async request => {
        const {filter, perPage, currentPage} = Object.assign({
            perPage: 20, currentPage: 1
        }, request.query);
        return await services.user.getUserList({
            filter, perPage, currentPage
        });
    });

    fastify.post(`${options.prefix}/admin/resetUserPassword`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '重置用户账号密码', body: {
                type: 'object', required: ['userId', 'password'], properties: {
                    password: {type: 'string'}, userId: {type: 'string'}
                }
            }
        }
    }, async request => {
        await services.account.resetPassword(request.body);
        return {};
    });

    fastify.post(`${options.prefix}/admin/addUser`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '添加用户', body: {}
        }
    }, async request => {
        const userInfo = request.body;
        await services.user.addUser(Object.assign({}, userInfo, {
            status: 10, password: services.account.md5(options.defaultPassword)
        }));
        return {};
    });

    fastify.post(`${options.prefix}/admin/saveUser`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '修改用户信息', body: {
                type: 'object', required: ['id'], properties: {
                    id: {type: 'string'},
                    avatar: {type: 'string'},
                    nickname: {type: 'string'},
                    phone: {type: 'string'},
                    email: {type: 'string'},
                    description: {type: 'string'}
                }
            }
        }
    }, async request => {
        const user = request.body;
        await services.user.saveUser(user);
        return {};
    });

    fastify.post(`${options.prefix}/admin/setSuperAdmin`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '设置用户为超级管理员', body: {
                type: 'object', required: ['status', 'userId'], properties: {
                    status: {type: 'boolean', description: 'true:将用户设置为超级管理员,false:取消用户超级管理员'},
                    userId: {type: 'string', description: '用户id'}
                }
            }
        }
    }, async request => {
        const {status, userId} = request.body;
        await services.user.setSuperAdmin({userId, status});
        return {};
    });

    fastify.post(`${options.prefix}/admin/setUserClose`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '关闭用户', body: {
                type: 'object', required: ['id'], properties: {
                    id: {type: 'string'}
                }
            }
        }
    }, async request => {
        const {id} = request.body;
        await services.user.setUserStatus({userId: id, status: 12});
        return {};
    });

    fastify.post(`${options.prefix}/admin/setUserNormal`, {
        onRequest: [authenticate.user, authenticate.admin], schema: {
            tags: ['管理后台'], summary: '设置用户状态为正常', body: {
                type: 'object', required: ['id'], properties: {
                    id: {type: 'string'}
                }
            }
        }
    }, async request => {
        const {id} = request.body;
        await services.user.setUserStatus({userId: id, status: 0});
        return {};
    });
});

module.exports = adminUserController;
