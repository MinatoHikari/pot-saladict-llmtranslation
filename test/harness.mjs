// 冒烟测试：模拟沙拉翻译的插件加载方式（eval 脚本后取同名函数），
// 用 mock 的 utils.tauriFetch 验证两个插件的请求构造与结果解析。
// 运行：node test/harness.mjs 或 bun test/harness.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let passed = 0;

function check(name, cond, extra) {
    if (cond) {
        passed++;
        console.log('  ✓ ' + name);
    } else {
        failures++;
        console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
    }
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

// 1. 语法检查（new Function 只解析不执行，运行时无关）
section('语法检查');
for (const dir of ['translate', 'recognize']) {
    const script = readFileSync(path.join(root, dir, 'main.js'), 'utf8');
    try {
        new Function(script);
        check(dir + '/main.js 语法正确', true);
    } catch (e) {
        check(dir + '/main.js 语法正确', false, String(e));
    }
}

// 2. info.json 校验
section('info.json 校验');
const infos = {};
for (const [dir, type] of [['translate', 'translate'], ['recognize', 'recognize']]) {
    const info = JSON.parse(readFileSync(path.join(root, dir, 'info.json'), 'utf8'));
    infos[dir] = info;
    check(dir + ': id 以 plugin. 开头', typeof info.id === 'string' && info.id.startsWith('plugin.'), info.id);
    check(dir + ': plugin_type = ' + type, info.plugin_type === type, info.plugin_type);
    check(dir + ': 有 display / icon / homepage', !!(info.display && info.icon && info.homepage));
    const keys = (info.needs || []).map((n) => n.key);
    const expected = ['endpoint', 'customEndpoint', 'apiKey', 'model'];
    check(dir + ': needs 包含基础配置项', expected.every((k) => keys.includes(k)), keys);
    const selectsOk = (info.needs || [])
        .filter((n) => n.type === 'select')
        .every((n) => n.options && Object.keys(n.options).length > 0);
    check(dir + ': select 类型均有 options', selectsOk);
    check(dir + ': language 表含 zh_cn/en', info.language && info.language.zh_cn === 'Simplified Chinese' && info.language.en === 'English');
}

// 3. 加载插件（与应用同款：脚本 + 同名函数求值）
function loadPlugin(dir, fnName) {
    const script = readFileSync(path.join(root, dir, 'main.js'), 'utf8');
    // 应用端是 eval(script + ' translate')；此处 new Function 语义等价（函数声明被提升）
    return new Function(script + '\nreturn ' + fnName + ';')();
}

const translate = loadPlugin('translate', 'translate');
const recognize = loadPlugin('recognize', 'recognize');
check('translate / recognize 函数可加载', typeof translate === 'function' && typeof recognize === 'function');

const okRes = (data) => ({ ok: true, status: 200, data });
const errRes = (status, data) => ({ ok: false, status, data });

function makeUtils(data, capture) {
    return {
        tauriFetch: async (url, options) => {
            if (capture) capture.push({ url, options });
            return typeof data === 'function' ? data(url, options) : data;
        }
    };
}

function payloadOf(captured) {
    const body = captured[0].options.body;
    // tauriFetch 的 body 为 {type:'Json', payload}
    return body && body.type === 'Json' ? body.payload : body;
}

// 4. 翻译插件测试
section('translate 插件');
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: '你好，世界' } }] }), captured);
    const result = await translate('hello world', 'auto', 'zh_cn', { config: { endpoint: 'zai', apiKey: 'sk-zai' }, utils });
    const p = payloadOf(captured);
    check('Z.ai 端点 URL 正确', captured[0].url === 'https://api.z.ai/api/paas/v4/chat/completions', captured[0].url);
    check('默认模型 glm-4.7', p.model === 'glm-4.7', p.model);
    check('GLM 发送 thinking disabled', p.thinking && p.thinking.type === 'disabled', p.thinking);
    check('Bearer 认证头', captured[0].options.headers.Authorization === 'Bearer sk-zai');
    check('目标语言映射为英文名', p.messages[1].content.includes('Simplified Chinese'), p.messages[1].content);
    check('返回内容', result === '你好，世界', result);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'hi' } }] }), captured);
    await translate('你好', 'zh_cn', 'en', { config: { endpoint: 'deepseek', apiKey: 'sk-ds', model: 'deepseek-reasoner' }, utils });
    const p = payloadOf(captured);
    check('DeepSeek 端点 URL 正确', captured[0].url === 'https://api.deepseek.com/chat/completions', captured[0].url);
    check('自定义模型生效', p.model === 'deepseek-reasoner', p.model);
    check('非 GLM 模型不发送 thinking', !('thinking' in p));
    check('双语提示词', p.messages[1].content.startsWith('Translate from Simplified Chinese into English:'), p.messages[1].content);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: '"ok"' } }] }), captured);
    const result = await translate('x', 'auto', 'ja', { config: { endpoint: 'bigmodel_coding', apiKey: 'k', model: 'glm-4.6' }, utils });
    check('智谱中国站 Coding Plan URL', captured[0].url === 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions', captured[0].url);
    check('首尾引号被去除', result === 'ok', result);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'y' } }] }), captured);
    await translate('x', 'auto', 'zh_cn', { config: { endpoint: 'zai', apiKey: 'k', customEndpoint: 'http://127.0.0.1:8080/v1', model: 'glm-4.7' }, utils });
    check('自定义接口地址优先', captured[0].url === 'http://127.0.0.1:8080/v1/chat/completions', captured[0].url);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'y' } }] }), captured);
    await translate('x', 'auto', 'zh_cn', { config: { endpoint: 'custom', customEndpoint: 'http://a.b/v1/chat/completions', model: 'test-model' }, utils });
    check('已含完整路径不重复追加', captured[0].url === 'http://a.b/v1/chat/completions', captured[0].url);
}
{
    let threw = '';
    try {
        await translate('x', 'auto', 'zh_cn', { config: { endpoint: 'custom', customEndpoint: 'http://a.b/v1' }, utils: makeUtils(okRes({})) });
    } catch (e) {
        threw = String(e);
    }
    check('自定义接口必须填模型', threw.includes('模型名称'), threw);
}
{
    let threw = '';
    try {
        await translate('x', 'auto', 'zh_cn', { config: { endpoint: 'zai' }, utils: makeUtils(okRes({})) });
    } catch (e) {
        threw = String(e);
    }
    check('未填 API Key 报错', threw.includes('API Key'), threw);
}
{
    // 用户实际踩到的场景：下拉框只显示第一项但未点选，保存后 config 为空
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'ok' } }] }), captured);
    const result = await translate('hello', 'auto', 'zh_cn', { config: { apiKey: 'sk-ds' }, utils });
    const p = payloadOf(captured);
    check('endpoint 未写入时默认 DeepSeek', captured[0].url === 'https://api.deepseek.com/chat/completions', captured[0].url);
    check('endpoint 未写入时默认模型 deepseek-chat', p.model === 'deepseek-chat', p.model);
    check('空 endpoint 配置可正常返回', result === 'ok', result);
}
{
    // 完全空的配置（实例刚创建就调用）也不应抛"未配置接口地址"
    let threw = '';
    try {
        await translate('x', 'auto', 'zh_cn', { config: {}, utils: makeUtils(okRes({})) });
    } catch (e) {
        threw = String(e);
    }
    check('空配置只提示 API Key 而非接口地址', threw.includes('API Key') && !threw.includes('接口地址'), threw);
}
{
    let threw = '';
    try {
        await translate('x', 'auto', 'zh_cn', { config: { endpoint: 'zai', apiKey: 'k' }, utils: makeUtils(errRes(401, { error: { message: 'invalid key' } })) });
    } catch (e) {
        threw = String(e);
    }
    check('HTTP 401 抛出状态码与响应', threw.includes('401') && threw.includes('invalid key'), threw);
}
{
    const captured = [];
    const utils = makeUtils(() => errRes(400, { msg: 'bad' }), captured);
    // 无 tauriFetch 的兜底分支：直接以全局 fetch 模拟
    let fallbackThrew = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    try {
        await translate('x', 'auto', 'zh_cn', { config: { endpoint: 'zai', apiKey: 'k' }, utils: {} });
    } catch (e) {
        fallbackThrew = String(e);
    }
    globalThis.fetch = originalFetch;
    check('无 tauriFetch 时走 fetch 兜底', fallbackThrew.includes('500') && fallbackThrew.includes('boom'), fallbackThrew);
    check('兜底分支未被 tauriFetch 分支触发', captured.length === 0);
}

// 5. 识别插件测试
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_B64_BYTES = Buffer.from(PNG_B64, 'base64').length;
section('recognize 插件');
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: '识别结果文本' } }] }), captured);
    const result = await recognize(PNG_B64, 'en', { config: { endpoint: 'zai', apiKey: 'sk-zai' }, utils });
    const p = payloadOf(captured);
    check('Z.ai 端点 URL 正确', captured[0].url === 'https://api.z.ai/api/paas/v4/chat/completions', captured[0].url);
    check('默认模型 glm-4.6v', p.model === 'glm-4.6v', p.model);
    const content = p.messages[0].content;
    check('消息角色为 user（DeepSeek 要求）', p.messages[0].role === 'user');
    check('图片为 data URL base64', content[0].type === 'image_url' && content[0].image_url.url === 'data:image/png;base64,' + PNG_B64);
    check('默认使用 Free OCR 提示词', content[1].text === 'Free OCR.', content[1].text);
    check('GLM 默认关闭 thinking', p.thinking && p.thinking.type === 'disabled', p.thinking);
    check('返回识别文本', result === '识别结果文本', result);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'txt' } }] }), captured);
    await recognize(PNG_B64, 'zh_cn', { config: { endpoint: 'deepseek', apiKey: 'sk-ds' }, utils });
    const p = payloadOf(captured);
    check('DeepSeek 默认视觉模型 deepseek-flash', p.model === 'deepseek-flash', p.model);
    check('DeepSeek 不发送 thinking', !('thinking' in p));
    check('deepseek 端点同样默认 Free OCR 提示词', p.messages[0].content[1].text === 'Free OCR.');
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'txt' } }] }), captured);
    await recognize(PNG_B64, 'auto', { config: { endpoint: 'zai_coding', apiKey: 'k', model: 'glm-4.6v-flash' }, utils });
    const p = payloadOf(captured);
    check('Z.ai Coding Plan URL', captured[0].url === 'https://api.z.ai/api/coding/paas/v4/chat/completions', captured[0].url);
    check('auto 语言不加提示', !p.messages[0].content[1].text.includes('The text is in'), p.messages[0].content[1].text);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'txt' } }] }), captured);
    await recognize(PNG_B64, 'ja', { config: { endpoint: 'bigmodel', apiKey: 'k', thinking: 'enabled' }, utils });
    const p = payloadOf(captured);
    check('thinking 开启生效', p.thinking && p.thinking.type === 'enabled', p.thinking);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'txt' } }] }), captured);
    await recognize(PNG_B64, 'ja', { config: { endpoint: 'bigmodel', apiKey: 'k', thinking: 'auto' }, utils });
    const p = payloadOf(captured);
    check('thinking=auto 不发送参数', !('thinking' in p));
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'txt' } }] }), captured);
    await recognize(PNG_B64, 'en', { config: { endpoint: 'zai', apiKey: 'k', ocrPrompt: '只输出数字' }, utils });
    const p = payloadOf(captured);
    check('自定义提示词生效且不追加语言', p.messages[0].content[1].text === '只输出数字', p.messages[0].content[1].text);
}
{
    let threw = '';
    try {
        await recognize(PNG_B64, 'en', { config: { endpoint: 'custom', customEndpoint: 'http://127.0.0.1:8080/v1' }, utils: makeUtils(okRes({})) });
    } catch (e) {
        threw = String(e);
    }
    check('本地 DeepSeek-OCR 需填模型名', threw.includes('模型名称'), threw);
}
{
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: 'ocr ok' } }] }), captured);
    const result = await recognize(PNG_B64, 'en', { config: { endpoint: 'custom', customEndpoint: 'http://127.0.0.1:8080/v1', model: 'deepseek-ai/DeepSeek-OCR-GGUF' }, utils });
    check('本地 llama-server 场景 URL 正确', captured[0].url === 'http://127.0.0.1:8080/v1/chat/completions', captured[0].url);
    check('本地场景无 API Key 也可请求', !captured[0].options.headers.Authorization, captured[0].options.headers);
    check('本地场景返回结果', result === 'ocr ok', result);
}
{
    let threw = '';
    try {
        await recognize(PNG_B64, 'en', { config: { endpoint: 'zai', apiKey: 'k' }, utils: makeUtils(errRes(429, { error: 'rate limited' })) });
    } catch (e) {
        threw = String(e);
    }
    check('HTTP 429 抛出', threw.includes('429'), threw);
}
{
    // 用户实际踩到的场景：显示选了 Z.ai 但未点选写入，config 里没有 endpoint
    const captured = [];
    const utils = makeUtils(okRes({ choices: [{ message: { content: '识别文本' } }] }), captured);
    const result = await recognize(PNG_B64, 'zh_cn', { config: { apiKey: 'sk-zai' }, utils });
    const p = payloadOf(captured);
    check('endpoint 未写入时默认 Z.ai', captured[0].url === 'https://api.z.ai/api/paas/v4/chat/completions', captured[0].url);
    check('endpoint 未写入时默认模型 glm-4.6v', p.model === 'glm-4.6v', p.model);
    check('空 endpoint 配置可正常返回', result === '识别文本', result);
}
{
    // 完全空的配置也不应抛"未配置接口地址"，而是提示缺 API Key
    let threw = '';
    try {
        await recognize(PNG_B64, 'en', { config: {}, utils: makeUtils(okRes({})) });
    } catch (e) {
        threw = String(e);
    }
    check('空配置只提示 API Key 而非接口地址', threw.includes('API Key') && !threw.includes('接口地址'), threw);
}

console.log('\n结果: ' + passed + ' 通过, ' + failures + ' 失败');
process.exit(failures > 0 ? 1 : 0);