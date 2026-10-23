// 响应 schema 只用于 OpenAPI 文档：字段可空、对象允许额外字段，避免序列化改变实际输出
const str = description => ({ type: 'string', nullable: true, description });
const num = description => ({ type: 'number', nullable: true, description });
const bool = description => ({ type: 'boolean', nullable: true, description });
// ID（BIGINT）与日期可能是 number / string / Date，不声明类型，原样输出
const any = description => ({ description });
const obj = (description, properties) => ({ type: 'object', nullable: true, additionalProperties: true, description, properties });

const success = (description, schema) => ({ 200: Object.assign({}, schema || { type: 'object' }, { description }) });
const empty = description => success(description || '操作成功，返回空对象');

// 编辑接口的资料字段：未传保持原值，传空字符串或 null 清空
const CLEAR_HINT = '不传保持原值，传空字符串或 null 清空';
const editableProfile = {
  avatar: { type: 'string', description: `头像文件 ID；${CLEAR_HINT}` },
  nickname: { type: 'string', description: `用户昵称；${CLEAR_HINT}` },
  gender: { type: 'string', description: `性别：F 女，M 男；${CLEAR_HINT}` },
  birthday: { type: 'string', anyOf: [{ format: 'date' }, { maxLength: 0 }], description: `出生日期，YYYY-MM-DD；${CLEAR_HINT}` },
  description: { type: 'string', description: `个人简介；${CLEAR_HINT}` },
  email: { type: 'string', description: `邮箱，不区分大小写，不能与其他用户重复；${CLEAR_HINT}，但邮箱和手机号至少保留一个` },
  phone: { type: 'string', description: `手机号，不能与其他用户重复；${CLEAR_HINT}，但邮箱和手机号至少保留一个` }
};

const USER_STATUS = '用户状态：0 正常，10 初始化未激活（需先设置密码），11 已禁用，12 已关闭；只有 0、1 可以登录';

const user = obj('用户', {
  id: any('用户 ID'),
  userAccountId: any('当前生效的账号（密码）记录 ID'),
  nickname: str('用户昵称'),
  email: str('邮箱（小写）'),
  phone: str('手机号'),
  status: num(USER_STATUS),
  avatar: str('头像文件 ID'),
  gender: str('性别：F 女，M 男'),
  birthday: any('出生日期'),
  description: str('个人简介'),
  isSuperAdmin: bool('是否为平台超级管理员'),
  createdAt: any('创建时间'),
  updatedAt: any('更新时间'),
  deletedAt: any('删除时间，未删除为 null')
});

const userList = {
  type: 'object',
  properties: {
    pageData: { type: 'array', description: '当前页用户列表，按创建时间倒序', items: user },
    totalCount: num('符合条件的用户总数')
  }
};

module.exports = { str, num, bool, any, obj, success, empty, USER_STATUS, editableProfile, user, userList };
