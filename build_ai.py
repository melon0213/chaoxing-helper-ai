"""Produce a separate installable userscript; never edit the user's original."""
from pathlib import Path
import json, hashlib, sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).parent
source=root/'upstream'/'超星学习通小助手_v4.0.user.js'
s=source.read_text(encoding='utf-8-sig')
original_hash=hashlib.sha256(source.read_bytes()).hexdigest()
def replace(old,new):
 global s
 if s.count(old)!=1:raise RuntimeError(('Unexpected patch target',old[:90],s.count(old)))
 s=s.replace(old,new,1)
replace('// @name         【减负社区】【超星学习通小助手】【完全免费】视频-章节测试|自动挂机|防清进度|不占资源','// @name         超星学习通小助手 · 自定义 AI API版（本地修改）')
replace('// @namespace    unrival','// @namespace    unrival-local-ai-20261006')
replace('// @version      4.0','// @version      4.1.0-ai.1')
start=s.index('// @description ');end=s.index('\n',start)
s=s[:start]+'// @description  原 v4.0 的本地扩展；支持自定义兼容 Chat Completions API；题库优先或纯 AI；AI 答案留待人工检查。'+s[end:]
replace('// @grant        GM_info','// @grant        GM_info\n// @grant        GM_registerMenuCommand')
replace('// @connect      cx.icodef.com','// @connect      cx.icodef.com\n// @connect      *\n// @modification Local AI extension, 2026-10-06; original attribution and GPL license retained.')
module=(root/'ai-module.js').read_text(encoding='utf-8')
replace('(() => {','(() => {\n'+module+'\n')
replace('randomDo = 1,','randomDo = 0,')
replace('var qu = null,\n            nowTime = -4000,','var aiParticipated = false,\n            nowTime = -4000,')
# Record image presence before the old script turns image tags into plain paths.
replace("question = handleImgs(question).replace", "const hasImages = /<img\\b/i.test(question) || !!questionElement.querySelector('img');\n            question = handleImgs(question).replace")
replace("'questionid': questionId,\n                'options': optionList", "'questionid': questionId,\n                'hasImages': hasImages,\n                'options': optionList")
replace("'data': '未找到答案'", "'data': '未找到答案',\n                    'msg': '未搜索到答案'")
replace("if (res.finalUrl.includes('getAnswer.php'))", "if (res.finalUrl && res.finalUrl.includes('getAnswer.php'))")
replace("let choiceEs = _d.getElementsByTagName('li');", """let choiceEs = _d.getElementsByTagName('li');
                    if (ctResult.ai === true) {
                        const filled = applyAIAnswer(quu, ctResult.values);
                        if (filled) questionNum -= 1;
                        _w.top.unrivalWorkInfo = unrivalAI.escape('题目：' + quu.question +
                            (filled ? '｜AI 参考答案：' + ctResult.values.join('、') : '｜AI 答案未填写：页面选项无法完整对应') +
                            '｜解析：' + (ctResult.explanation || '未提供') + '｜请自行核对');
                        return;
                    }
                    if (ctResult.aiError) {
                        _w.top.unrivalWorkInfo = unrivalAI.escape('题目：' + quu.question + '｜' + ctResult.aiError);
                        return;
                    }""")
start=s.index('        for (let i = 0, l = questionList.length; i < l; i++) {',s.index('var aiParticipated'))
end=s.index('        var workInterval = setInterval',start)
integration=(root/'answer-integration.js').read_text(encoding='utf-8')
s=s[:start]+integration+'\n'+s[end:]
replace('            clearInterval(workInterval);\n            if (Math.floor((totalQuestionNum - questionNum) / totalQuestionNum) * 100 >= accuracy',"""            clearInterval(workInterval);
            if (aiParticipated) {
                _w.top.unrivalWorkInfo = '本次测试使用了 AI 辅助，答案已留在页面供检查；请手动保存或提交。找到/填入答案的比例不等于正确率。';
                return;
            }
            if (totalQuestionNum === 0) {
                _w.top.unrivalWorkInfo = '未识别到题目，请手动检查页面';
                return;
            }
            if (Math.floor((totalQuestionNum - questionNum) / totalQuestionNum * 100) >= accuracy""")
replace("'正确率符合标准，已提交答案'", "'答案匹配比例达到设定阈值，开始提交（此比例不代表真实正确率）'")
replace("'正确率不符合标准或未设置自动提交，已自动保存答案'", "'答案匹配比例未达到阈值或未启用自动提交，开始保存答案'")
replace("'章节测试正确率(百分比)：'", "'答案匹配比例阈值(百分比)：'") if "'章节测试正确率(百分比)：'" in s else None
s=s.replace('章节测试正确率(百分比)：','答案匹配比例阈值(百分比)：')
s=s.replace('在答题正确率在规定之上并且允许自动提交时才会提交答案','答案匹配比例达到阈值且允许自动提交时才会提交；AI 参与的测试需手动检查提交')
s=s.replace('学习通小助手v1.0&ensp;','学习通小助手 · AI 自定义API版&ensp;')
s=s.replace('<p>Bug反馈邮箱 MMRQONE@Gmail.com 可以带图 建议带账号密码 方便我测试<p/>','<p>本地 AI 扩展版：请使用“自定义 AI API”设置。反馈问题只需错误提示，请勿提供账号密码或 API 密钥。<p/>')
replace("'您设置的答题正确率为：' + String(accuracy) + '%，只有在高于此正确率时才会提交测试'", "'您设置的答案匹配比例阈值为：' + String(accuracy) + '%；这不是已验证的正确率。AI 答案需人工检查提交'")
# This is status-only UI; the API key is never injected into page HTML.
panel='''                <div class="panel panel-info" id="aiConfigPanel">
                    <div class="panel-heading">自定义 AI API</div>
                    <div class="panel-body">
                        <p id="aiConfigStatus">正在读取 AI 设置…</p>
                        <button id="aiConfigureButton" class="btn btn-default" type="button">配置 AI API</button>
                        <button id="aiTestButton" class="btn btn-default" type="button">测试连接（调用一次 API）</button>
                        <p style="margin-top:12px">目前支持文字单选、多选、判断题。AI 答案仅供参考，使用 AI 的测试请检查后手动保存或提交。</p>
                    </div>
                </div>
'''
marker='                <div class="panel panel-info">\n                    <div class="panel-heading">任务列表</div>'
assert s.count(marker)==2
s=s.replace(marker,panel+marker,1)
replace("                        .getElementById('autoSubmitButton') && _d.getElementById('autoSaveButton')) {", """                        .getElementById('autoSubmitButton') && _d.getElementById('autoSaveButton')) {
                    unrivalAI.renderPanel(_d);
                    if (_d.getElementById('aiConfigureButton')) _d.getElementById('aiConfigureButton').onclick = unrivalAI.configure;
                    if (_d.getElementById('aiTestButton')) _d.getElementById('aiTestButton').onclick = unrivalAI.test;""")
target=root/'超星学习通小助手_AI自定义API版.user.js'
target.write_text(s,encoding='utf-8')
assert hashlib.sha256(source.read_bytes()).hexdigest()==original_hash
print(json.dumps({'output':str(target),'bytes':target.stat().st_size,'original_unchanged':True},ensure_ascii=False))
