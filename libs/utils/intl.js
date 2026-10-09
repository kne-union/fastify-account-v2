const locale = require('../locale');

const FALLBACK_LOCALE = 'zh-CN';

// 其他插件的错误也可能带 messageId，只翻译本包抛出的错误
const MESSAGE_SCOPE = '@kne/fastify-account';

const format = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => (values && values[key] !== undefined ? String(values[key]) : match));

const fallbackMessage = (messageId, messageValues) => format(locale[FALLBACK_LOCALE][messageId] || messageId, messageValues);

/**
 * 创建带 messageId 的错误：message 先取内置中文，响应前由 onError 钩子按请求语言替换
 */
const createError = (ErrorClass, messageId, messageValues) => {
  const message = fallbackMessage(messageId, messageValues);
  const error = ErrorClass ? new ErrorClass(message) : new Error(message);
  return Object.assign(error, { messageScope: MESSAGE_SCOPE, messageId, messageValues });
};

/**
 * 通过 @kne/fastify-intl 按请求语言翻译；未注册 fastify-intl 或语言包缺失时回退到内置中文
 */
const createTranslator = ({ fastify, options }) => {
  const getIntl = () => {
    const intl = fastify[options.intlNamespace];
    return intl && typeof intl.createIntl === 'function' ? intl : null;
  };

  const t = async (request, messageId, messageValues) => {
    const intl = getIntl();
    if (intl) {
      for (const lang of [request && intl.getRequestLocale(request), intl.options?.defaultLocale]) {
        if (!lang) {
          continue;
        }
        const instance = await intl.createIntl(lang, options.name);
        if (instance.messages[messageId]) {
          return instance.formatMessage({ id: messageId }, messageValues);
        }
      }
    }
    return fallbackMessage(messageId, messageValues);
  };

  const translateError = async (request, error) => {
    if (error && error.messageScope === MESSAGE_SCOPE && error.messageId) {
      error.message = await t(request, error.messageId, error.messageValues);
    }
    return error;
  };

  const onError = async (request, reply, error) => {
    await translateError(request, error);
  };

  return { t, translateError, onError };
};

module.exports = { locale, createError, createTranslator };
