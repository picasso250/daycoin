import { messages } from './messages.mjs';
export const locale = globalThis.document?.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
export function t(key, ...values) {
  if (Array.isArray(key)) key = key.reduce((s, part, i) => s + (i ? '${' + (i - 1) + '}' : '') + part, '');
  const text = locale === 'zh-CN' ? key : messages[key];
  if (text === undefined) throw Error('Missing translation: ' + key);
  return text.replace(/\$\{(\d+)\}/g, (_, i) => String(values[Number(i)]));
}
export function errorMessage(error) {
  if (error?.code === 4001) return t('已取消钱包请求。');
  // Provider messages are untrusted and may use any language. Never display them as our own guidance.
  return t(Object.hasOwn(messages, error?.message) ? error.message : '外部钱包或网络错误，请在钱包中查看详情后重试。');
}
