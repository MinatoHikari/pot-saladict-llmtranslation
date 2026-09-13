// DeepSeek / GLM 翻译插件 for Saladict (pot-desktop fork)
// main.js 为普通脚本（应用以 eval 方式加载），必须定义与 plugin_type 同名的 translate 函数
// 配置项由 info.json 的 needs 声明：endpoint / customEndpoint / apiKey / model

var ENDPOINTS = {
    deepseek: 'https://api.deepseek.com',
    zai: 'https://api.z.ai/api/paas/v4',
    zai_coding: 'https://api.z.ai/api/coding/paas/v4',
    bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
    bigmodel_coding: 'https://open.bigmodel.cn/api/coding/paas/v4'
};

// pot 语言代码 -> 提示词用语言名（与 info.json 的 language 表保持一致）
var LANGUAGE = {
    auto: 'auto',
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    yue: 'Cantonese',
    ja: 'Japanese',
    en: 'English',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    ru: 'Russian',
    de: 'German',
    it: 'Italian',
    tr: 'Turkish',
    pt_pt: 'Portuguese',
    pt_br: 'Brazilian Portuguese',
    vi: 'Vietnamese',
    id: 'Indonesian',
    th: 'Thai',
    ms: 'Malay',
    ar: 'Arabic',
    hi: 'Hindi',
    mn_mo: 'Mongolian',
    mn_cy: 'Mongolian (Cyrillic)',
    km: 'Khmer',
    nb_no: 'Norwegian Bokmål',
    nn_no: 'Norwegian Nynorsk',
    fa: 'Persian',
    sv: 'Swedish',
    pl: 'Polish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    he: 'Hebrew'
};

function isCustomEndpoint(config) {
    return (config.customEndpoint || '').trim().length > 0 || config.endpoint === 'custom';
}

// 配置界面的下拉框默认只"显示"第一项，用户不点选就不会写入配置，
// 因此所有配置项都必须在代码里兜底默认值
var DEFAULT_ENDPOINT = 'deepseek';

function resolveEndpoint(config) {
    return config.endpoint || DEFAULT_ENDPOINT;
}

function resolveBaseUrl(config) {
    var custom = (config.customEndpoint || '').trim();
    if (custom) return custom;
    var endpoint = resolveEndpoint(config);
    if (ENDPOINTS[endpoint]) return ENDPOINTS[endpoint];
    throw '接口地址配置无效（' + endpoint + '）：请在服务设置中重新选择接口';
}

function buildChatUrl(baseUrl) {
    var base = String(baseUrl).trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(base)) return base;
    return base + '/chat/completions';
}

function resolveModel(config, defaults) {
    var model = (config.model || '').trim();
    if (model) return model;
    if (isCustomEndpoint(config)) throw '使用自定义接口时请填写模型名称';
    if (resolveEndpoint(config) === 'deepseek') return defaults.deepseek;
    return defaults.glm;
}

function formatHttpError(res) {
    var status = res && res.status ? res.status : '未知';
    var detail = '';
    try {
        detail = JSON.stringify(res ? res.data : res);
    } catch (e) {
        detail = String(res && res.data);
    }
    if (detail === 'undefined' || detail === 'null') detail = '';
    return 'Http Request Error\nHttp Status: ' + status + '\n' + detail.slice(0, 800);
}

async function chatCompletion(options, body) {
    var config = (options && options.config) || {};
    var utils = (options && options.utils) || {};
    var apiKey = (config.apiKey || '').trim();
    if (!apiKey && !isCustomEndpoint(config)) {
        throw 'API Key 未配置：请在 偏好设置→服务设置 中填写 API Key';
    }
    var headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

    var url = buildChatUrl(resolveBaseUrl(config));

    if (typeof utils.tauriFetch === 'function') {
        var res = await utils.tauriFetch(url, {
            method: 'POST',
            headers: headers,
            body: { type: 'Json', payload: body }
        });
        if (!res || !res.ok) throw formatHttpError(res);
        return res.data;
    }

    // 兜底：旧版运行环境可能直接暴露 fetch API（body 需为字符串）
    if (typeof fetch !== 'function') {
        throw '插件运行环境缺少网络接口（tauriFetch / fetch）';
    }
    var res2 = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    var data = null;
    try {
        data = await res2.json();
    } catch (e) {
        data = null;
    }
    if (!res2.ok) throw formatHttpError({ status: res2.status, data: data });
    return data;
}

function extractContent(data) {
    var choice = data && data.choices && data.choices[0];
    var message = choice && choice.message;
    var content = '';
    if (message && typeof message.content === 'string') {
        content = message.content;
    } else if (message && Array.isArray(message.content)) {
        content = message.content
            .map(function (p) {
                return p && typeof p.text === 'string' ? p.text : '';
            })
            .join('');
    }
    content = (content || '').trim();
    if (!content && message && message.reasoning_content) {
        content = String(message.reasoning_content).trim();
    }
    if (!content) {
        throw '接口未返回内容：' + String(JSON.stringify(data)).slice(0, 500);
    }
    return content.replace(/^"+|"+$/g, '').trim();
}

async function translate(text, from, to, options) {
    options = options || {};
    var config = options.config || {};
    text = text == null ? '' : String(text);
    if (!text.trim()) return '';

    var model = resolveModel(config, { deepseek: 'deepseek-chat', glm: 'glm-4.7' });
    var target = LANGUAGE[to] || to;
    var source = LANGUAGE[from] || from;

    var instruction =
        'You are a professional translation engine. Translate the text naturally, accurately and fluently, ' +
        'like a professional human translator. Output ONLY the translation, without any explanation or extra content.';
    var userContent;
    if (from && from !== 'auto' && source && source !== 'auto') {
        userContent = 'Translate from ' + source + ' into ' + target + ':\n' + text;
    } else {
        userContent = 'Translate into ' + target + ':\n' + text;
    }

    var body = {
        model: model,
        stream: false,
        messages: [
            { role: 'system', content: instruction },
            { role: 'user', content: userContent }
        ]
    };
    // GLM 系列关闭深度思考，翻译更快；DeepSeek 等其他模型不发送该参数
    if (/^glm/i.test(model)) body.thinking = { type: 'disabled' };

    var data = await chatCompletion(options, body);
    return extractContent(data);
}
