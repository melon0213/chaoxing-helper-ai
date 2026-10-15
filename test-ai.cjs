// Offline tests use Node's built-in runner; they send no requests and require no API key.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const moduleText = fs.readFileSync(path.join(__dirname, 'ai-module.js'), 'utf8');
const integrationText = fs.readFileSync(path.join(__dirname, 'answer-integration.js'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '超星学习通小助手_AI自定义API版.user.js'), 'utf8');
const question = (type = '单选题', value = '测试题') => ({ question: value, questionid: 'answer42', type,
    options: { '选项一': { value: 'A' }, '选项二': { value: 'B' }, '选项三': { value: 'C' }, length: 3 } });
function runtime(overrides = {}) {
    const store = { unrivalAIConfigV1: { mode: 'only', endpoint: 'https://api.example.test/v1', model: 'test-model', key: 'private-test-key', limit: 25, timeout: 90 } };
    const calls = [], menus = [], notices = [];
    const timers = new Set();
    const context = {
        URL, console, Promise,
        GM_getValue: (k, fallback) => store[k] ?? fallback,
        GM_setValue: (k, v) => { store[k] = v; },
        GM_registerMenuCommand: (name, callback) => { menus.push([name, callback]); },
        GM_xmlhttpRequest: req => { calls.push(req); return { abort() {} }; },
        setTimeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; },
        clearTimeout(id) { timers.delete(id); clearTimeout(id); },
        prompt: () => null, alert: s => notices.push(s), confirm: () => false,
        document: { getElementById: () => null }, ...overrides
    };
    vm.createContext(context); vm.runInContext(moduleText + '\nglobalThis.ai = unrivalAI;', context);
    return { context, ai: context.ai, store, calls, menus, notices, cleanup() { for (const id of timers) clearTimeout(id); } };
}
function apiReply(req, data, status = 200, reason = 'stop') {
    req.onload({ status, finalUrl: req.url, responseText: JSON.stringify({ choices: [{ finish_reason: reason, message: { content: typeof data === 'string' ? data : JSON.stringify(data) } }] }) });
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('endpoint normalization; HTTPS and localhost only; no credentials or query strings', () => {
    const r = runtime();
    for (const input of ['https://api.example.test/v1', 'https://api.example.test/v1/', 'https://api.example.test/v1/chat/completions'])
        assert.equal(r.ai.endpoint(input), 'https://api.example.test/v1/chat/completions');
    assert.equal(r.ai.endpoint('http://localhost:8080/v1'), 'http://localhost:8080/v1/chat/completions');
    for (const input of ['not-url', 'http://remote.test/v1', 'https://user:pass@remote.test/v1', 'https://remote.test/v1?key=x', 'https://remote.test/v1#x']) assert.throws(() => r.ai.endpoint(input));
});
test('parses single, multiple, and true/false answers, including JSON fences and thinking prefix', () => {
    const r = runtime();
    assert.deepEqual(Array.from(r.ai.parse('{"answer":["b"],"explanation":"理由"}', question()).values), ['B']);
    assert.deepEqual(Array.from(r.ai.parse('```json\n{"answer":["A","C"]}\n```', question('多选题')).values), ['A', 'C']);
    assert.deepEqual(Array.from(r.ai.parse('<think>thinking</think>{"answer":[false]}', question('判断题')).values), ['false']);
    assert.deepEqual(Array.from(r.ai.parse('{"answer":["对"]}', question('判断题')).values), ['true']);
});
test('rejects nonexistent, repeated, empty, malformed and ambiguous answers', () => {
    const r = runtime();
    for (const answer of [[], ['D'], ['A', 'B'], ['A', 'A'], ['AB'], [1], [{ dangerous: true }]]) assert.throws(() => r.ai.parse(JSON.stringify({ answer }), question()));
    assert.throws(() => r.ai.parse('B because...', question()));
    assert.throws(() => r.ai.parse('{"answer":"B"}', question()));
    assert.throws(() => r.ai.parse('{"answer":["yes"]}', question('判断题')));
});
test('key is in Authorization only; question, type, options are the only user data sent', async () => {
    const r = runtime();
    try {
        const promise = r.ai.answer(question()); await flush();
        assert.equal(r.calls.length, 1);
        const req = r.calls[0], body = JSON.parse(req.data);
        assert.equal(req.headers.Authorization, 'Bearer private-test-key');
        assert.equal(req.anonymous, true); assert.equal(req.redirect, 'error');
        assert.equal(body.stream, false); assert.equal(body.model, 'test-model');
        assert.equal(req.data.includes('private-test-key'), false);
        assert.deepEqual(Object.keys(JSON.parse(body.messages[1].content)).sort(), ['options', 'question', 'type']);
        apiReply(req, { answer: ['B'], explanation: '<img onerror=alert(1)>' });
        const answer = await promise; assert.equal(answer.values[0], 'B');
        assert.equal(r.ai.escape(answer.explanation).includes('<img'), false);
    } finally { r.cleanup(); }
});
test('queues calls serially and memoizes identical successful questions', async () => {
    const r = runtime();
    try {
        const first = r.ai.answer(question()), second = r.ai.answer(question('单选题', '另一题'));
        await flush(); assert.equal(r.calls.length, 1);
        apiReply(r.calls[0], { answer: ['A'] }); await first; await flush();
        assert.equal(r.calls.length, 2);
        apiReply(r.calls[1], { answer: ['C'] }); await second;
        assert.equal((await r.ai.answer(question())).values[0], 'A');
        assert.equal(r.calls.length, 2);
    } finally { r.cleanup(); }
});
test('disabled mode, missing credentials, and image questions cause zero network calls', async () => {
    const r = runtime();
    r.store.unrivalAIConfigV1.mode = 'off'; await assert.rejects(r.ai.answer(question()), /未开启/);
    r.store.unrivalAIConfigV1.mode = 'only'; r.store.unrivalAIConfigV1.key = '';
    await assert.rejects(r.ai.answer(question()), /密钥/);
    r.store.unrivalAIConfigV1.key = 'test';
    await assert.rejects(r.ai.answer({ ...question(), hasImages: true }), /图片/);
    assert.equal(r.calls.length, 0);
});
test('limit counts actual API attempts, and cached answers work after limit is reached', async () => {
    const r = runtime(); r.store.unrivalAIConfigV1.limit = 1;
    try {
        const p = r.ai.answer(question()); await flush(); apiReply(r.calls[0], { answer: ['B'] }); await p;
        assert.equal((await r.ai.answer(question())).values[0], 'B');
        await assert.rejects(r.ai.answer(question('单选题', 'new')), /上限/); assert.equal(r.calls.length, 1);
    } finally { r.cleanup(); }
});
test('401 and 429 stop subsequent requests; provider bodies never appear in errors', async () => {
    for (const status of [401, 429]) {
        const r = runtime();
        try {
            const p = r.ai.answer(question()); await flush();
            r.calls[0].onload({ status, finalUrl: r.calls[0].url, responseText: 'private-test-key raw-echo' });
            await assert.rejects(p, err => !err.message.includes('private-test-key'));
            await assert.rejects(r.ai.answer(question('单选题', 'new')), /暂停/);
            assert.equal(r.calls.length, 1);
        } finally { r.cleanup(); }
    }
});
test('timeout callbacks release the queue; duplicate transport callbacks settle only once', async () => {
    const r = runtime();
    try {
        const p = r.ai.answer(question()); await flush(); r.calls[0].ontimeout();
        apiReply(r.calls[0], { answer: ['B'] }); await assert.rejects(p, /超时/);
        const next = r.ai.answer(question('单选题', 'next')); await flush();
        apiReply(r.calls[1], { answer: ['A'] }); assert.equal((await next).values[0], 'A');
    } finally { r.cleanup(); }
});
test('independent watchdog ends a request if manager never fires callbacks', async () => {
    let watchdog;
    const r = runtime({ setTimeout: fn => { watchdog = fn; return 123; }, clearTimeout() {} });
    const p = r.ai.answer(question()); await flush(); watchdog(); await assert.rejects(p, /超时/);
});
test('truncated output, redirected URLs and invalid outer JSON are rejected', async () => {
    for (const kind of ['truncated', 'redirect', 'invalid']) {
        const r = runtime();
        try {
            const p = r.ai.answer(question()); await flush();
            if (kind === 'truncated') apiReply(r.calls[0], { answer: ['B'] }, 200, 'length');
            else r.calls[0].onload({ status: 200, finalUrl: kind === 'redirect' ? 'https://other.test/' : r.calls[0].url, responseText: 'not-json' });
            await assert.rejects(p);
        } finally { r.cleanup(); }
    }
});
test('supports text content parts; does not treat reasoning_content as the answer', async () => {
    const r = runtime();
    try {
        const p = r.ai.answer(question()); await flush();
        r.calls[0].onload({ status: 200, finalUrl: r.calls[0].url, responseText: JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: '{"answer":["B"]}' }], reasoning_content: 'secret reasoning' } }] }) });
        assert.equal((await p).values[0], 'B');
    } finally { r.cleanup(); }
});
function fakeOption(label, selected = false, id = '42', judgment = null) {
    const el = { selected, clicks: 0,
        getAttribute: key => key === 'id-param' ? id : key === 'val-param' ? judgment : null,
        getElementsByTagName: tag => tag === 'em' ? [{ getAttribute: key => key === 'id-param' ? label : null }] : [],
        click() { this.selected = !this.selected; this.clicks++; }
    };
    el.classList = { contains: () => el.selected }; return el;
}
function integrationRuntime(nodes = [], mode = 'fallback') {
    let callback;
    const processed = [], requests = [], aiQuestions = [], top = {};
    const context = { _d: { getElementsByTagName: () => nodes }, _w: { top }, aiParticipated: false,
        questionList: [], nowTime: 0, ctUrl: 'https://bank.test/', wid: 'work', token: 'bank-token',
        ctOnload: (res, q) => processed.push([res && JSON.parse(res.responseText), q]),
        unrivalAI: { config: () => ({ mode }), escape: s => s,
            answer: async q => { aiQuestions.push(q); return { values: ['B'], explanation: '理由' }; } },
        setTimeout: () => 0, clearTimeout() {}, GM_xmlhttpRequest: req => requests.push(req)
    };
    vm.createContext(context); vm.runInContext(integrationText, context);
    return { context, processed, requests, aiQuestions, top };
}
test('AI fills exactly specified options and clears stale multiple-choice selections', () => {
    const nodes = [fakeOption('A', true), fakeOption('B'), fakeOption('C')];
    const r = integrationRuntime(nodes);
    assert.equal(r.context.applyAIAnswer(question('多选题'), ['B', 'C']), true);
    assert.deepEqual(nodes.map(n => n.selected), [false, true, true]);
    assert.equal(r.context.applyAIAnswer(question('多选题'), ['D']), false);
    assert.deepEqual(nodes.map(n => n.selected), [false, true, true]);
});
test('judgment is located by question id; unrelated questions are not clicked', () => {
    const nodes = [fakeOption('A', false, '99', 'true'), fakeOption('A', false, '42', 'true')];
    const r = integrationRuntime(nodes);
    assert.equal(r.context.applyAIAnswer(question('判断题'), ['true']), true);
    assert.equal(nodes[0].clicks, 0); assert.equal(nodes[1].clicks, 1);
});
test('fallback uses a successful bank answer, otherwise AI; off never calls AI', async () => {
    const q = question(), valid = { status: 200, responseText: '{"code":0,"data":"选项二"}' };
    const found = integrationRuntime(); await found.context.finishQuestion(valid, q);
    assert.equal(found.aiQuestions.length, 0); assert.equal(found.processed.length, 1);
    const missing = integrationRuntime(); await missing.context.finishQuestion({ status: 200, responseText: '{"code":-1}' }, q);
    assert.equal(missing.aiQuestions[0], q); assert.equal(missing.context.aiParticipated, true);
    assert.equal(missing.processed[0][0].ai, true);
    const off = integrationRuntime([], 'off'); await off.context.finishQuestion(false, q);
    assert.equal(off.aiQuestions.length, 0); assert.equal(off.processed.length, 1);
});
test('script contains the submit guard before any automated submit and keeps distinct question bindings', () => {
    const guard = script.indexOf('if (aiParticipated) {');
    const submit = script.indexOf('submitAction()', guard);
    assert.ok(guard > 0 && submit > guard);
    assert.ok(script.slice(guard, submit).includes('return;'));
    assert.ok(integrationText.includes('const q = questionList[i]'));
    assert.equal(script.includes('ctOnload(res, qu);'), false);
    assert.ok(script.includes('randomDo = 0,'));
    assert.equal(script.includes('private-test-key'), false);
});
test('menus exist without exposing the saved key in page status', () => {
    let status = '';
    const r = runtime({ document: { getElementById: () => ({ set textContent(v) { status = v; } }) } });
    r.ai.renderPanel(r.context.document);
    assert.equal(r.menus.length, 3); assert.ok(status.includes('已设置')); assert.equal(status.includes('private-test-key'), false);
});
test('bank callbacks returning out of order stay attached to their own question and do not settle twice', async () => {
    const a = question('单选题', 'first'), b = { ...question('单选题', 'second'), questionid: 'answer43' };
    const pending = [], processed = [], requests = [];
    const context = { _d: { getElementsByTagName: () => [] }, _w: { top: {} }, aiParticipated: false,
        questionList: [a, b], nowTime: 0, ctUrl: 'https://bank.test/', wid: 'work', token: 'bank-token',
        ctOnload: (res, q) => processed.push(q.questionid),
        unrivalAI: { config: () => ({ mode: 'off' }) },
        setTimeout(fn) { pending.push(fn); return pending.length; }, clearTimeout() {},
        GM_xmlhttpRequest: req => requests.push(req)
    };
    vm.createContext(context); vm.runInContext(integrationText, context);
    const outer = pending.slice(); outer.forEach(fn => fn());
    requests[1].onload({ status: 200, responseText: '{"code":0,"data":"选项二"}' });
    requests[0].onload({ status: 200, responseText: '{"code":0,"data":"选项一"}' });
    requests[0].onerror(); await flush();
    assert.deepEqual(processed, ['answer43', 'answer42']);
});
test('full generated homework branch fills AI output, drains its counter and never auto-saves/submits', async () => {
    const nodes = [fakeOption('A'), fakeOption('B'), fakeOption('C')];
    for (const [i, el] of nodes.entries()) el.innerHTML = `<em>${'ABC'[i]}</em>选项${['一', '二', '三'][i]}`;
    const inputs = [
        { id: 'answer42', value: '', getAttribute: key => key === 'name' ? 'answer42' : null },
        { id: 'answertype42', value: '0', getAttribute: key => key === 'name' ? 'answertype42' : null }
    ];
    const qEl = { querySelector: () => null,
        getElementsByTagName: () => inputs,
        getElementsByClassName: cls => cls === 'Py-m1-title fs16' ? [{ innerHTML: '测试题' }] : [{ getElementsByTagName: () => nodes }]
    };
    const pending = [], intervals = [], requests = [];
    let submits = 0, saves = 0;
    const r = runtime({
        _d: { getElementById: () => ({ value: 'work42' }), getElementsByClassName: () => [qEl], getElementsByTagName: () => nodes },
        _w: { top: { unrivalDoneWorkId: null, unrivalAutoSubmit: '1', unrivalAutoSave: '1' }, alert() {}, noSubmit() { saves++; } },
        getQueryVariable: () => 'work42', handleImgs: s => s,
        trim: s => String(s).replace(/<[^>]*>/g, '').trim(),
        setTimeout(fn) { pending.push(fn); return pending.length; }, clearTimeout() {},
        setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {},
        submitCheckTimes() {}, escapeBlank() {}, submitAction() { submits++; },
        GM_xmlhttpRequest: req => { requests.push(req); return { abort() {} }; }
    });
    const marker = '} else if (_l.href.indexOf("work/phone/doHomeWork") > 0) {';
    const start = script.indexOf(marker) + marker.length;
    const end = script.indexOf("    } else if (_l.href.includes('work/phone/selectWorkQuestionYiPiYue'))", start);
    assert.ok(start > marker.length && end > start);
    vm.runInContext('(function(){' + script.slice(start, end) + '\nglobalThis.homeworkState=()=>({busyThread,questionNum});})();', r.context);
    pending[0](); await flush();
    assert.equal(requests.length, 1); apiReply(requests[0], { answer: ['B'], explanation: '参考解释' });
    await flush(); assert.equal(r.context.homeworkState().busyThread, 0); assert.equal(r.context.homeworkState().questionNum, 0);
    assert.equal(nodes[1].clicks, 1); assert.equal(nodes[0].clicks, 0);
    intervals[0](); assert.equal(submits, 0); assert.equal(saves, 0);
    assert.ok(r.context._w.top.unrivalWorkInfo.includes('手动保存或提交'));
});
