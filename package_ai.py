"""Package the tested userscript in the same JSON-import form as the old export."""
from pathlib import Path
import copy, hashlib, json, re, sys, uuid, zipfile
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).parent
script=root/'超星学习通小助手_AI自定义API版.user.js'
source=script.read_bytes().decode('utf-8')
old=root/'packaging-template.json'
template=json.loads(old.read_text(encoding='utf-8-sig'))
options=copy.deepcopy(template['scripts'][0]['options'])
def metadata(key):
 return [v.strip() for v in re.findall(r'^//\s+@'+re.escape(key)+r'\s+(.+)$',source,re.M)]
options['check_for_updates']=False
options['override']['orig_connects']=metadata('connect')
options['override']['orig_matches']=metadata('match')
options['override']['orig_run_at']=metadata('run-at')[0]
payload={'created_by':'Tampermonkey','version':'1','scripts':[{
 'name':metadata('name')[0], 'options':options, 'enabled':True,'position':1,
 'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'unrival-local-ai:4.1.0-ai.1')),'source':source
}]}
installer=root/'篡改猴_AI版_导入.json'
installer.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
guide=(root/'安装和API设置说明.txt').read_text(encoding='utf-8')
begin=guide.index('二、安装：')
end=guide.index('三、配置自己的 API')
steps='''二、安装：像之前一样导入 JSON 文件（推荐）

压缩包包含以下安装文件，另附 LICENSE 许可文本。只需要安装一种，不要重复导入：
· 篡改猴_AI版_导入.json：推荐用这个导入，不需要复制代码。
· 超星学习通小助手_AI自定义API版.user.js：完整脚本，供备用安装和备份。
· 安装与API设置步骤.txt：本说明。

1. 下载“超星学习通_AI版_安装包.zip”，右键选择“全部提取 / 解压”，记住解压后的位置。
   不要直接把这个整理包当作篡改猴原生 ZIP 备份导入；请先解压，再选择里面的 JSON。
2. 打开 Edge，点击右上角扩展图标 → 篡改猴 → 管理面板。
   如果另一台电脑没有篡改猴，先从它的官方网站进入对应浏览器商店安装扩展：https://www.tampermonkey.net/
3. 在“已安装脚本”中，把旧的“超星学习通小助手”关闭，保留它作备份，避免新旧两个版本同时运行。
4. 进入管理面板的“实用工具 / Utilities”。
5. 找到“文件 / File”区域，点击“选择文件 / Choose File”。
6. 选择解压出来的“篡改猴_AI版_导入.json”，在预览中确认名称是“超星学习通小助手 · 自定义 AI API版（本地修改）”，完成导入。
   若此 AI 修改版已存在，导入可能更新它；旧 v4.0 的名字不同，不会被本安装包替换。
7. 回到“已安装脚本”，确认只启用新的 AI 版。
8. 打开超星 / 学习通的课程网页，正常登录，刷新整个课程页面。

导入安装时 AI 默认关闭，密钥为空；需要继续按第三部分配置自己的 API。
倍速、题库、登录状态等不会从原电脑复制，请按需要重新设置。

如果找不到“实用工具”：在篡改猴设置中把“配置模式”改成“新手 / Beginner”或“高级 / Advanced”，再找该标签。
如果网页仍提示脚本运行权限未开启：打开 edge://extensions，进入篡改猴的详细信息；有“允许用户脚本”就开启它，否则按官方提示开启开发人员模式，然后刷新课程页。
如果当前电脑旧脚本已能正常运行，一般无需重新设置这些权限。

备用安装方式：JSON 导入失败时，任选这个手动方式即可。
1. 用记事本打开“超星学习通小助手_AI自定义API版.user.js”。
2. 按 Ctrl+A 全选，按 Ctrl+C 复制全部内容。
3. 篡改猴管理面板 → “+”（添加新脚本）。
4. 编辑器内 Ctrl+A，再 Ctrl+V 替换默认模板，Ctrl+S 保存。
5. 确认只启用一个 AI 版，再刷新课程页面。

'''
guide=guide[:begin]+steps+guide[end:]
guide+='\nJSON 文件导入官方参考：https://www.tampermonkey.net/faq.php?locale=zh&q=Q106\n运行权限官方参考：https://www.tampermonkey.net/faq.php?locale=zh&q=Q209\n'
readme=root/'安装与API设置步骤.txt'
readme.write_text(guide,encoding='utf-8-sig')
archive=root/'超星学习通_AI版_安装包.zip'
files=[installer,script,readme,root/'LICENSE']
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for file in files:z.write(file,arcname=file.name)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert len(z.namelist())==4
 parsed=json.loads(z.read(installer.name))
 assert parsed['scripts'][0]['source']==z.read(script.name).decode('utf-8')
 assert parsed['scripts'][0]['options']['override']['orig_connects']==metadata('connect')
 assert 'storage' not in parsed['scripts'][0] and 'storage' not in parsed
 assert parsed['scripts'][0]['uuid']!=template['scripts'][0]['uuid']
 print(json.dumps({'archive':str(archive),'files':z.namelist(),'bytes':archive.stat().st_size,'integrity':'passed','script_sha256':hashlib.sha256(z.read(script.name)).hexdigest()},ensure_ascii=False))
