# 沙拉翻译 DeepSeek / GLM 插件

为 [Saladict（沙拉翻译，pot-desktop fork）](https://github.com/allentown521/saladict) 编写的两个外部插件（`.potext`），使用你自己的 API Key 调用 **DeepSeek** 与 **智谱 GLM（Z.ai / open.bigmodel.cn）** 的 OpenAI 兼容接口：

| 插件 | 文件 | 说明 |
|---|---|---|
| DeepSeek / GLM 翻译 | `dist/plugin.com.saladict.llm-translate.potext` | 文本翻译，支持任意模型 |
| DeepSeek / GLM 识别 | `dist/plugin.com.saladict.llm-ocr.potext` | 截图/图片文字识别（OCR），走视觉模型 |

特性：

- **DeepSeek 官方**：翻译用 `deepseek-chat`，识别用视觉模型 `deepseek-flash`（图片以 base64 data URL 传入，符合官方"图片仅限 user 消息"的要求）
- **Z.ai 国际站**：按量付费 `https://api.z.ai/api/paas/v4` 与 **GLM Coding Plan** `https://api.z.ai/api/coding/paas/v4` 均已内置
- **智谱中国站**：按量付费 `https://open.bigmodel.cn/api/paas/v4` 与 **Coding Plan** `https://open.bigmodel.cn/api/coding/paas/v4` 均已内置
- **自定义接口**：任意 OpenAI 兼容端点（自动补全 `/chat/completions`），可直连本地部署的 DeepSeek-OCR、llama-server、vLLM 等服务
- **模型可自由填写**，默认值按所选接口自动匹配（翻译 `deepseek-chat` / `glm-4.7`，识别 `deepseek-flash` / `glm-4.6v`）
- GLM 模型自动关闭深度思考（`thinking: disabled`）提升速度；识别插件可手动改为"开启"或"不发送"
- 应用支持服务多实例：同一插件可添加两个实例（例如一个 DeepSeek、一个 GLM）**并行翻译对比**

## 安装

1. 从 [Releases](../../releases) 下载 `.potext` 文件
2. 打开沙拉翻译：**偏好设置 → 服务设置 → 文字识别/翻译 → 添加外部插件 → 安装外部插件**，选择对应的 `.potext`
3. 在服务列表里点击插件进行配置：选接口、填 API Key（模型可留空用默认），保存即可启用

## 接口对照表

| 设置项「接口」 | 实际地址 | 适用 Key |
|---|---|---|
| DeepSeek 官方 | `https://api.deepseek.com/chat/completions` | [platform.deepseek.com](https://platform.deepseek.com) 的 API Key |
| Z.ai 国际站 · 按量付费 | `https://api.z.ai/api/paas/v4/chat/completions` | [z.ai](https://z.ai) 开放平台 API Key |
| Z.ai 国际站 · Coding Plan | `https://api.z.ai/api/coding/paas/v4/chat/completions` | GLM Coding Plan（国际版）订阅页生成的 Key |
| 智谱中国站 · 按量付费 | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | [open.bigmodel.cn](https://open.bigmodel.cn) 的 API Key |
| 智谱中国站 · Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions` | GLM Coding Plan（中国版）订阅页生成的 Key |
| 自定义 (OpenAI 兼容) | 填在「自定义接口地址」，如 `http://127.0.0.1:8080/v1` | 本地模型 / 第三方中转，Key 可留空 |

自定义接口地址会自动补全 `/chat/completions`；如果填的已是完整路径则原样使用。

> **注意**：沙拉翻译的配置界面里，下拉框默认只是"显示"第一项，需要**点选一次**才会真正写入配置。不过即使不点选，插件也会按代码内置默认值工作（翻译默认 DeepSeek 官方 + `deepseek-chat`，识别默认 Z.ai 按量付费 + `glm-4.6v`），只需填好 API Key 即可。

## 并行使用 DeepSeek + GLM

沙拉翻译支持同一服务添加多个实例：在服务列表中再次「添加服务实例」选择同一个插件，起个名字（如 "DeepSeek"、"GLM"），分别配置不同的接口与 Key，然后都启用——翻译结果窗口即可同时对比两家输出。

## 连接本地模型（识别插件）

识别插件选「自定义」接口即可直连任何 OpenAI 兼容的本地 OCR 服务，例如：

- **DeepSeek-OCR**：`vllm serve deepseek-ai/DeepSeek-OCR`（需 NVIDIA 显卡 ≥8GB），或用 llama.cpp（`llama-server -m deepseek-ocr-q8_0.gguf --mmproj mmproj-....gguf`，CPU 也可跑）+ 社区 [GGUF](https://huggingface.co/sabafallah/DeepSeek-OCR-GGUF)
- 插件配置：自定义接口地址 `http://127.0.0.1:8080/v1`，API Key 留空，模型填服务端对应的模型名

## 常见问题

- **提示 API Key 未配置 / 401**：检查 Key 是否填对、是否选对了站点（国内站与国际站 Key 不通用）。
- **Coding Plan 端点报模型不存在 / 无权限**：Coding Plan 可用模型以官方为准（以编程模型为主）。若该端点不支持视觉模型（如 `glm-4.6v`），请改用按量付费端点，或在模型框填订阅内可用的模型名。
- **识别失败 / 超时**：本地服务先确认已启动；云端确认图片未超出限制（DeepSeek 单图 base64 ≤32MB）。
- **GLM 输出带了思考过程**：识别插件把「深度思考」设为关闭。

## 开发

```
translate/       翻译插件源码（main.js + info.json + icon.svg）
recognize/       识别插件源码
test/            冒烟测试（bun test/harness.mjs 或 node test/harness.mjs）
build.py         打包脚本（python build.py，跨平台）
dist/            打包产物 *.potext
```

插件运行契约（由沙拉翻译源码确认）：`main.js` 为普通脚本，应用以 `eval` 加载并取与 `plugin_type` 同名的函数；请求经 `utils.tauriFetch` / `utils.http.fetch`（Tauri 原生 HTTP，无 CORS），响应读 `res.ok / res.data`。测试 harness 用同样的方式加载插件并 mock 网络层。

打包脚本核心就是 zip 三件套（文件必须在压缩包根目录）：

```python
with zipfile.ZipFile('dist/plugin.com.saladict.llm-translate.potext', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('translate/main.js', 'main.js')
    z.write('translate/info.json', 'info.json')
    z.write('translate/icon.svg', 'icon.svg')
```

推送代码后 GitHub Actions（`.github/workflows/build.yml`）自动打包上传 artifact，打 `v*` 标签时自动发布到 Release。
