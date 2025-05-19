const user = ({ DataTypes, definePrimaryType }) => {
  return {
    model: {
      nickname: {
        type: DataTypes.STRING,
        comment: '用户昵称'
      },
      email: {
        type: DataTypes.STRING,
        comment: '用户邮箱'
      },
      phone: {
        type: DataTypes.STRING,
        comment: '用户手机号'
      },
      userAccountId: definePrimaryType('userAccountId', {
        allowNull: false,
        comment: '当前账号id'
      }),
      status: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '0:正常,10:初始化未激活，需要用户设置密码后使用,11:已禁用,12:已关闭'
      },
      avatar: {
        type: DataTypes.STRING,
        comment: '头像fileId'
      },
      gender: {
        type: DataTypes.STRING,
        comment: 'F:女,M:男'
      },
      birthday: {
        type: DataTypes.DATE,
        comment: '出生日期'
      },
      description: {
        type: DataTypes.TEXT,
        comment: '个人描述'
      },
      isSuperAdmin: {
        type: DataTypes.BOOLEAN,
        comment: '是否是平台超级管理员'
      }
    },
    options: {
      indexes: [
        {
          unique: true,
          fields: ['email', 'deleted_at']
        },
        {
          unique: true,
          fields: ['phone', 'deleted_at']
        }
      ]
    }
  };
};

module.exports = user;
