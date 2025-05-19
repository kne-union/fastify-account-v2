const verificationCode = ({DataTypes}) => {
    return {
        model: {
            name: {
                type: DataTypes.STRING, allowNull: false
            }, type: {
                type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '0:注册,2:登录,4:验证租户管理员,5:忘记密码'
            }, code: {
                type: DataTypes.STRING, allowNull: false
            }, status: {
                type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0, comment: '0:未验证,1:已验证,2:已过期'
            }
        }
    };
};

module.exports = verificationCode;
