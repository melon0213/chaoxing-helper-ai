# 超星学习通小助手 · 自定义 AI API 本地修改版

在 unrival 的 v4.0 脚本基础上增加自定义 AI 接口配置，支持兼容 Chat Completions 格式的服务。
这是独立修改版，不是原作者发布的官方版本。

## 下载与安装

可从 [Releases](https://github.com/melon0213/chaoxing-helper-ai/releases) 或 [downloads](downloads) 下载安装包。解压后，在篡改猴管理面板 → 实用工具 → 从文件导入 `篡改猴_AI版_导入.json`。
也可将根目录 `.user.js` 的完整内容复制到篡改猴新增脚本页面保存。新旧版本不要同时启用。

详细步骤见 [安装与API设置步骤](安装与API设置步骤.txt)。导入文件不包含脚本存储，不复制账号状态或 API 密钥。

## AI 设置

通过脚本菜单“配置 AI API”填写接口地址、模型名称和自己的 API 密钥；默认关闭。
支持“题库找不到时使用 AI”及“只使用 AI”两种模式，支持文字单选、多选和判断题。图片题等需自行处理。

AI 答案留待人工检查和手动保存/提交；匹配或填入比例不等于真实正确率。接口调用可能产生服务商费用。
密钥保存在脚本管理器的私有存储中，不硬编码到源码。不要将含个人设置的浏览器备份提交到仓库。

## 开发与验证

没有额外 Node 依赖。运行 `node --test test-ai.cjs` 执行离线模拟测试，不调用付费 API。
运行 `python build_ai.py` 从 `upstream/` 中的原始源码生成修改版；运行 `python package_ai.py` 生成 JSON 导入文件及安装 ZIP。
完整脚本中保留原版功能和依赖；当前测试不能代替真实服务商及学习通页面上的验证。

## 来源与许可

原作者：**unrival**；原版本：4.0。按原脚本声明，沿用 **GPL-3.0-or-later**，完整许可见 [LICENSE](LICENSE)。

- 原脚本来源：https://greasyfork.org/zh-CN/scripts/453287
- 原脚本来源：https://scriptcat.org/zh-CN/script-show-page/379
- 原始源码备份：[upstream](upstream)
- 本地 AI 扩展与查题修复：2026-10-06。

原作者署名、来源与许可声明保留在脚本头部；其他内含组件的声明也保留在原文件中。
