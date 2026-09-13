#!/usr/bin/env python3
"""将插件打包为 .potext（zip 内 main.js / info.json / icon 位于压缩包根目录）"""
import os
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')

PLUGINS = [
    ('translate', 'plugin.com.saladict.llm-translate', 'icon.svg'),
    ('recognize', 'plugin.com.saladict.llm-ocr', 'icon.svg'),
]

os.makedirs(DIST, exist_ok=True)
for dir_name, plugin_id, icon in PLUGINS:
    src = os.path.join(ROOT, dir_name)
    out = os.path.join(DIST, plugin_id + '.potext')
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in ('main.js', 'info.json', icon):
            z.write(os.path.join(src, name), name)  # 第二参数=压缩包内路径（根目录）
    print('打包完成:', out)
