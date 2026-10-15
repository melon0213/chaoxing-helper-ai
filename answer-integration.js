        // Match AI option IDs exactly. Never use substring matching for AI output.
        function applyAIAnswer(q, values) {
            const id = q.questionid.replace(/^(answer|check)/, '');
            const nodes = Array.from(_d.getElementsByTagName('li')).filter(el => el.getAttribute('id-param') === id);
            if (q.type === '判断题') {
                const node = nodes.find(el => el.getAttribute('val-param') === values[0]);
                if (!node) return false;
                if (!node.classList.contains('cur')) node.click();
                return true;
            }
            const options = nodes.map(el => ({ el, value: el.getElementsByTagName('em')[0]?.getAttribute('id-param') }));
            if (values.some(value => !options.some(o => o.value === value))) return false;
            if (q.type === '单选题') {
                const node = options.find(o => o.value === values[0]).el;
                if (!node.classList.contains('cur')) node.click();
            } else {
                // Clear stale selections from a previously saved multi-choice answer.
                for (const { el, value } of options) {
                    if (!value) continue;
                    const wanted = values.includes(value);
                    if (el.classList.contains('cur') !== wanted) el.click();
                }
            }
            return true;
        }
        async function finishQuestion(res, q) {
            let bank;
            try { bank = res && JSON.parse(res.responseText); } catch (_) {}
            const usable = bank && Number.isFinite(Number(bank.code)) && Number(bank.code) >= 0 &&
                typeof bank.data === 'string' && bank.data.trim() !== '' &&
                Number(res.status || 200) >= 200 && Number(res.status || 200) < 300;
            const mode = unrivalAI.config().mode;
            if (mode === 'off' || (mode === 'fallback' && usable)) {
                ctOnload(res || false, q);
                return;
            }
            aiParticipated = true;
            try {
                const result = await unrivalAI.answer(q, msg => { _w.top.unrivalWorkInfo = msg; });
                ctOnload({ responseText: JSON.stringify({ code: 0, ai: true, ...result }) }, q);
            } catch (err) {
                ctOnload({ responseText: JSON.stringify({ code: -1, aiError: err.message }) }, q);
            }
        }
        for (let i = 0, l = questionList.length; i < l; i++) {
            nowTime += parseInt(Math.random() * 3000 + 3500, 10);
            setTimeout(function () {
                // Each callback owns its question; a later request cannot replace it.
                const q = questionList[i];
                if (unrivalAI.config().mode === 'only') {
                    finishQuestion(false, q);
                    return;
                }
                let param = 'question=' + encodeURIComponent(q.question);
                if (ctUrl.includes('icodef')) param += '&type=' + { '单选题': '0', '多选题': '1', '判断题': '3' }[q.type] + '&id=' + wid;
                let done = false;
                const settle = res => {
                    if (done) return;
                    done = true;
                    clearTimeout(watchdog);
                    finishQuestion(res, q);
                };
                const watchdog = setTimeout(() => settle(false), 3500);
                try {
                    GM_xmlhttpRequest({
                        method: 'POST', headers: { 'Content-type': 'application/x-www-form-urlencoded', Authorization: token },
                        url: ctUrl, timeout: 2000, data: param,
                        onload: settle, onerror: () => settle(false), ontimeout: () => settle(false), onabort: () => settle(false)
                    });
                } catch (_) { settle(false); }
            }, nowTime);
        }
