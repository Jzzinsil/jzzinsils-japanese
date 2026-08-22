/* jzzinsil's japanese
   하루치 4가지(가타카나·히라가나·단어·문장)를 한 페이지에.
   일본어는 크게, 한국 발음과 뜻은 조용하게. 진도는 localStorage에 저장. */
(function () {
  'use strict';

  var PHASE1 = 46;          // Day 1~46 · 오십음도 + 기초 문형
  var MAXDAY = 999;         // 표시상의 상한 (그 이후는 복습 순환이 계속 돌아감)
  var STRIDE = 13;          // 복습 순환 간격 (40과 서로소 → 40일 다 돌고 반복)
  var KEY = 'jzzinsil-japanese-v1';
  var OLD_KEY = 'mainichi-nihongo-v1';   // 이전 버전 진도 이어받기
  var LV = {
    1:'기본 경어', 2:'사내 커뮤니케이션', 3:'뉴스와 시사', 4:'문어와 경영'
  };

  function advLen() { return (window.ADVANCED || []).length; }
  function lastDay() { return PHASE1 + advLen(); }
  // Day 번호 → 어떤 데이터를 보여줄지
  function resolve(day) {
    if (day <= PHASE1) return { mode: 'basic', i: day - 1 };
    var last = lastDay();
    if (day <= last) return { mode: 'adv', i: day - PHASE1 - 1 };
    if (!advLen()) return { mode: 'basic', i: 0 };
    var r = day - last;                                  // 복습 순환 회차
    var i = ((r - 1) * STRIDE) % advLen();
    return { mode: 'adv', i: i, review: PHASE1 + i + 1 };
  }
  function levelText(day) {
    if (day <= PHASE1) return '기초 · 오십음도';
    var r = resolve(day);
    if (r.review) return '복습 순환 · Day ' + r.review + ' 다시 보기';
    var d = window.ADVANCED[r.i];
    return 'LEVEL ' + d.lv + ' · ' + (LV[d.lv] || '');
  }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var kr = function (kana) { return window.kanaToKr ? window.kanaToKr(kana) : ''; };

  /* ── 날짜 ── */
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return ymd(new Date()); }
  function shift(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function pretty() {
    var d = new Date(), w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + w + ')';
  }

  /* ── 상태 ── */
  var state = load();
  function load() {
    var d = { day: 1, done: [], lastDone: null, streak: 0, start: today(), theme: '' };
    var raw = null;
    try { raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); } catch (e) {}
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') for (var k in d) if (Object.prototype.hasOwnProperty.call(p, k)) d[k] = p[k];
      } catch (e) {}
    }
    d.day = Math.min(Math.max(1, parseInt(d.day, 10) || 1), MAXDAY);
    if (!Array.isArray(d.done)) d.done = [];
    d.streak = Math.max(0, parseInt(d.streak, 10) || 0);
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function isDone(n) { return state.done.indexOf(n) !== -1; }
  function seenUpTo() { return Math.max(state.day, state.done.length ? Math.max.apply(null, state.done) : 0); }

  function rollover() {
    var t = today();
    if (state.lastDone && state.lastDone !== t && state.lastDone !== shift(-1)) state.streak = 0;
    if (state.lastDone && state.lastDone !== t && isDone(state.day)) state.day = Math.min(state.day + 1, MAXDAY);
    save();
  }

  /* ── 발음 ──
     안드로이드는 utterance.voice를 지정하면 오히려 기기 기본 언어로 되돌아가
     에러 없이 무음이 된다. 그래서 안드로이드에서는 lang만 주고 voice는 비운다. */
  var SS = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  var ANDROID = /android/i.test(navigator.userAgent || '');
  var jaVoice = null;       // 데스크톱에서만 실제로 지정
  var jaSeen = false;       // ja 음성을 목록에서 본 적이 있는가
  var startedOnce = false;  // onstart가 온 적이 있는가
  var failCount = 0, told = {}, held = null, watch = null, offT = null, litBtn = null;

  var GUIDE_NOJA = '이 기기에 일본어 음성이 없어요.\n설정 → 접근성 → 텍스트 음성 변환 출력 →\n엔진 옆 톱니바퀴 → 음성 데이터 설치 → 日本語\n(갤럭시는 설정 → 접근성 → 글자 읽어주기)';
  var GUIDE_SILENT = '일본어 음성은 있는데 소리가 안 나요.\n미디어 음량과 무음 모드를 확인해 주세요.\n설정 → 텍스트 음성 변환 출력에서\n일본어를 한 번 재생해보면 원인을 알 수 있어요.';

  function lg(v) { return String((v && v.lang) || '').replace(/_/g, '-'); }

  function note(key, msg) {
    if (told[key]) return;
    told[key] = true;
    var el = $('#toast'); if (!el) return;
    el.style.whiteSpace = 'pre-line'; el.style.lineHeight = '1.75';
    el.textContent = msg; el.dataset.show = 'true';
    clearTimeout(tt);
    tt = setTimeout(function () {
      el.dataset.show = 'false'; el.style.whiteSpace = ''; el.style.lineHeight = '';
    }, 7000);
  }
  function unlit() { clearTimeout(offT); if (litBtn) { litBtn.classList.remove('on'); litBtn = null; } }

  // 목록은 비동기로 채워지고 다시 비기도 한다 → 빈 목록으로 덮어쓰지 않는다
  function pick() {
    if (!SS) return;
    var list; try { list = SS.getVoices() || []; } catch (e) { list = []; }
    if (!list.length) return;
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (/^ja(-|$)/i.test(lg(list[i]))) {          // 안드로이드는 ja_JP 표기도 쓴다
        jaSeen = true;
        if (!found) found = list[i];
        else if (list[i].localService && !found.localService) found = list[i];
      }
    }
    if (found) jaVoice = found;
  }
  if (SS) {
    pick();
    if (SS.addEventListener) SS.addEventListener('voiceschanged', pick);
    else SS.onvoiceschanged = pick;
    setTimeout(pick, 300); setTimeout(pick, 1500);
  }

  function speak(text, btn) {
    if (!SS) { note('nosupport', '이 브라우저는 발음 재생을 지원하지 않아요.\n크롬이나 삼성 인터넷에서 열어보세요.'); return; }
    pick();
    unlit();
    if (btn) { btn.classList.add('on'); litBtn = btn; offT = setTimeout(unlit, 8000); }

    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.rate = 0.8; u.pitch = 1; u.volume = 1;
    if (!ANDROID && jaVoice) { u.voice = jaVoice; u.lang = lg(jaVoice) || 'ja-JP'; }

    var began = false;
    clearTimeout(watch);
    u.onstart = function () {
      began = true; startedOnce = true; failCount = 0;
      told.noja = false; told.silent = false; told.retry = false;
      clearTimeout(watch);
    };
    u.onend = function () { clearTimeout(watch); unlit(); held = null; };
    u.onerror = function (e) {
      clearTimeout(watch); unlit(); held = null;
      var code = (e && e.error) || '';
      if (code === 'canceled' || code === 'interrupted') return;
      if (code === 'not-allowed') { note('gesture', '브라우저가 소리를 막았어요.\n버튼을 한 번 더 눌러주세요.'); return; }
      if (code === 'language-unavailable' || code === 'voice-unavailable') { note('noja', GUIDE_NOJA); return; }
      note('err', '발음 재생에 실패했어요 (' + (code || 'unknown') + ')');
    };
    held = u;   // 재생 중 GC로 이벤트가 사라지는 것 방지

    function fire() {
      try { if (SS.paused) SS.resume(); } catch (e) {}
      try { SS.speak(u); } catch (e) { unlit(); note('err', '발음 재생에 실패했어요'); return; }
      watch = setTimeout(function () {
        if (began) return;
        var live = false; try { live = SS.speaking || SS.pending; } catch (e) {}
        if (live) return;                       // 이벤트만 안 오는 기기 — 소리는 나는 중
        unlit(); failCount++;
        if (failCount === 1 && !startedOnce) { note('retry', '소리가 아직 준비되지 않았어요.\n한 번 더 눌러주세요.'); return; }
        if (!jaSeen) note('noja', GUIDE_NOJA); else note('silent', GUIDE_SILENT);
      }, startedOnce ? 900 : 1800);
    }

    // cancel()은 안드로이드에서 비동기라 직후의 speak()를 삼킨다.
    // 재생 중일 때만 cancel하고 한 박자 쉰다. 크롬의 음성 허용은 sticky activation이라
    // setTimeout을 거쳐도 제스처 권한은 유지된다.
    var busy = false; try { busy = SS.speaking || SS.pending; } catch (e) {}
    if (busy) { try { SS.cancel(); } catch (e) {} setTimeout(fire, 160); }
    else fire();
  }

  var tt = null;
  function toast(m) {
    var el = $('#toast'); el.textContent = m; el.dataset.show = 'true';
    clearTimeout(tt); tt = setTimeout(function () { el.dataset.show = 'false'; }, 2600);
  }

  /* ── 조각 ── */
  function say(text, cls) {
    return '<button class="say' + (cls ? ' ' + cls : '') + '" data-say="' + esc(text) +
      '" aria-label="' + esc(text) + ' 발음 듣기"><svg><use href="#i-sound"></use></svg></button>';
  }
  function head(idx, label, sayText) {
    return '<div class="bhead"><span class="idx">' + idx + '</span><span class="lbl">' + esc(label) + '</span>' +
      (sayText ? '<span class="sp">' + say(sayText) + '</span>' : '') + '</div>';
  }
  // 일본어 / 한국 발음 / 뜻 — 한 줄
  function row(jp, pron, mean, tag) {
    return '<div class="row' + (tag ? ' form' : '') + '">' +
      (tag ? '<span class="tag">' + esc(tag) + '</span>' : '') +
      '<div class="l"><span class="jp" lang="ja">' + esc(jp) + '</span>' +
      (pron ? '<span class="kr">' + esc(pron) + '</span>' : '') + '</div>' +
      (mean ? '<span class="ko">' + esc(mean) + '</span>' : '') +
      say(jp, 'sm') + '</div>';
  }
  function sentence(jp, pron, mean, when) {
    return '<div class="sent"><div>' +
      (when ? '<p class="when">' + esc(when) + '</p>' : '') +
      '<p class="jp" lang="ja">' + esc(jp) + '</p>' +
      '<p class="kr">' + esc(pron) + '</p>' +
      '<p class="ko">' + esc(mean) + '</p></div>' + say(jp) + '</div>';
  }
  function more(body) {
    return '<details class="more"><summary>자세히</summary><div class="body">' + body + '</div></details>';
  }

  /* ── 블록 ── */
  function kanaBlock(item, idx, label, kind) {
    var rows = (item.ex || []).map(function (e) {
      var word = e[0];
      var mean = kind === 'kata' ? e[2] : e[3];
      var kanji = kind === 'kata' ? '' : (e[1] && e[1] !== '—' ? e[1] : '');
      return row(word, kr(word) + (kanji ? ' · ' + kanji : ''), mean);
    }).join('');
    var meta = [item.r, item.s + '획', item.o + '에서 유래'];
    if (item.pair) meta.push('짝 ' + item.pair);
    return '<section class="block">' + head(idx, label, item.c) +
      '<div class="focus">' +
        '<div class="glyph" lang="ja">' + esc(item.c) + '</div>' +
        '<div class="pron">' + esc(item.k) + '</div>' +
        '<div class="meta">' + esc(meta.join(' · ')) + '</div>' +
      '</div>' +
      '<div class="rows">' + rows + '</div>' +
      more(esc(item.tip) +
        '<div class="trace" data-char="' + esc(item.c) + '">' +
          '<div class="trace-box"><canvas></canvas></div>' +
          '<div class="trace-act"><button class="mini" data-clear><svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7"><use href="#i-eraser"></use></svg>지우기</button>' +
          '<span class="hint">연한 글자 위를 따라 써보세요</span></div>' +
        '</div>') +
    '</section>';
  }

  function wordBlock(w, idx) {
    return '<section class="block">' + head(idx, '단어', w.w) +
      '<div class="focus">' +
        '<div class="word" lang="ja">' + esc(w.w) + '</div>' +
        '<div class="kana" lang="ja">' + esc(w.rd) + '</div>' +
        '<div class="pron">' + esc(kr(w.rd)) + '</div>' +
        '<div class="mean">' + esc(w.m) + '</div>' +
      '</div>' +
      sentence(w.jp, kr(w.jpr), w.ko, w.scene) +
      more('<b>' + esc(w.pos) + '</b> · ' + esc(w.mix) + ' · 사용 빈도 ' + esc(w.freq) +
        '<br>발음 — ' + esc(w.pitch) + '<br><br>' + esc(w.note)) +
    '</section>';
  }

  function grammarBlock(g, idx) {
    var forms = (g.forms || []).map(function (f) {
      var pron = kr(f[3]);
      var sub = (f[1] && f[1] !== '—' ? f[1] + ' · ' : '') + pron;
      return row(f[2], sub, f[4] || '', f[0]);
    }).join('');
    var exs = (g.ex || []).map(function (e) { return sentence(e.jp, kr(e.rd), e.ko, ''); }).join('');
    return '<section class="block">' + head(idx, '문장 만드는 법', '') +
      '<div class="focus">' +
        '<div class="pattern" lang="ja">' + esc(g.t) + '</div>' +
        '<div class="rule">' + esc(g.rule) + '</div>' +
      '</div>' +
      '<div class="rows">' + forms + '</div>' +
      exs +
      '<div class="drill"><span class="q">' + esc(g.drill.q) + '</span>' +
        '<button class="mini" data-reveal>정답</button>' +
        '<span class="a hidden" lang="ja">' + esc(g.drill.a) + '</span></div>' +
      more(esc(g.tip)) +
    '</section>';
  }

  /* ── Day 47+ 블록 ── */
  function advWordBlock(d, idx) {
    return '<section class="block">' + head(idx, 'ことば 단어', d.word.w) +
      '<div class="focus">' +
        '<div class="word" lang="ja">' + esc(d.word.w) + '</div>' +
        '<div class="kana" lang="ja">' + esc(d.word.rd) + '</div>' +
        '<div class="pron">' + esc(kr(d.word.rd)) + '</div>' +
        '<div class="mean">' + esc(d.word.m) + '</div>' +
        '<div class="meta">' + esc(d.word.pos + ' · ' + d.theme) + '</div>' +
      '</div>' +
      more(esc(d.word.note)) +
    '</section>';
  }
  function sentBlock(o, idx, label) {
    return '<section class="block">' + head(idx, label, o.jp) +
      sentence(o.jp, kr(o.rd), o.ko, o.when || '') +
      more(esc(o.note || '')) +
    '</section>';
  }
  function numBlock(n, idx) {
    var rows = (n.rows || []).map(function (r) {
      return row(r[1], r[2] + ' · ' + kr(r[2]), '', r[0]);
    }).join('');
    return '<section class="block">' + head(idx, '数 숫자', '') +
      '<div class="focus" style="padding:18px 0 16px">' +
        '<div class="pattern">' + esc(n.t) + '</div>' +
      '</div>' +
      '<div class="rows nums">' + rows + '</div>' +
      sentence(n.jp, kr(n.rd), n.ko, '') +
      more(esc(n.note)) +
    '</section>';
  }

  /* ── 그리기 ── */
  function render() {
    var r = resolve(state.day);
    $('#dayNo').textContent = 'Day ' + state.day;
    var bits = [pretty(), levelText(state.day), '완료 ' + state.done.length + '일'];
    if (state.streak > 0) bits.push('연속 ' + state.streak + '일');
    $('#dayMeta').textContent = bits.join(' · ');
    $('#prevDay').disabled = state.day <= 1;
    $('#nextDay').disabled = state.day >= MAXDAY;

    var html;
    if (r.mode === 'basic') {
      var i = r.i;
      html = kanaBlock(window.KATAKANA[i], '01', 'カタカナ 가타카나', 'kata') +
             kanaBlock(window.HIRAGANA[i], '02', 'ひらがな 히라가나', 'hira') +
             wordBlock(window.WORDS[i], '03') +
             grammarBlock(window.GRAMMAR[i], '04');
    } else {
      var d = window.ADVANCED[r.i], n = (window.NUMBERS || [])[r.i];
      html = advWordBlock(d, '01') +
             sentBlock(d.use, '02', 'この単語で 이 단어를 쓴 문장') +
             sentBlock(d.daily, '03', 'よく使う表現 자주 쓰는 표현') +
             sentBlock(d.biz, '04', 'ビジネス 비즈니스 문장') +
             (n ? numBlock(n, '05') : '');
    }
    $('#stage').innerHTML = html;

    var done = isDone(state.day);
    $('#doneLabel').textContent = done ? '완료했어요' : '오늘 다 봤어요';
    $('#doneBtn').classList.toggle('ghost', done);
    $('#doneNote').textContent = done
      ? '내일 이어서 Day ' + (state.day + 1) + (state.day >= lastDay() ? ' · 복습 순환' : '')
      : '';
    mountTrace($('#stage'));
  }

  /* ── 쓰기 연습 ── */
  function mountTrace(root) {
    $$('.trace', root).forEach(function (box) {
      var ch = box.dataset.char, canvas = $('canvas', box), ctx = canvas.getContext('2d');
      var strokes = [], cur = null, w = 0, h = 0;
      function resize() {
        var r = canvas.getBoundingClientRect();
        if (!r.width) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = r.width; h = r.height;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paint();
      }
      function paint() {
        var cs = getComputedStyle(document.documentElement);
        var ink = cs.getPropertyValue('--ink').trim() || '#222';
        ctx.clearRect(0, 0, w, h);
        var size = h * 0.7;
        ctx.save();
        ctx.fillStyle = ink;
        ctx.font = '400 ' + size + 'px ' + (cs.getPropertyValue('--jp-mincho').trim() || 'serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var k = 0; k < 3; k++) { ctx.globalAlpha = k === 0 ? 0.26 : 0.11; ctx.fillText(ch, w * (k * 2 + 1) / 6, h / 2); }
        ctx.restore();
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(3, h * 0.03); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        strokes.forEach(function (s) {
          if (s.length < 2) { ctx.beginPath(); ctx.arc(s[0].x * w, s[0].y * h, ctx.lineWidth / 2, 0, 6.284); ctx.fillStyle = ink; ctx.fill(); return; }
          ctx.beginPath(); ctx.moveTo(s[0].x * w, s[0].y * h);
          for (var i = 1; i < s.length; i++) ctx.lineTo(s[i].x * w, s[i].y * h);
          ctx.stroke();
        });
      }
      function pt(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
      canvas.addEventListener('pointerdown', function (e) {
        cur = [pt(e)]; strokes.push(cur);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        paint(); e.preventDefault();
      });
      canvas.addEventListener('pointermove', function (e) { if (cur) { cur.push(pt(e)); paint(); e.preventDefault(); } });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { canvas.addEventListener(ev, function () { cur = null; }); });
      $('[data-clear]', box).addEventListener('click', function () { strokes = []; cur = null; paint(); });
      canvas.addEventListener('repaint', paint);   // 테마 전환 시 먹색 다시 계산
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
      else window.addEventListener('resize', resize);
      resize();
      requestAnimationFrame(resize);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    });
  }

  /* ── 완료 / 이동 ── */
  function complete() {
    if (isDone(state.day)) { toast('이미 완료한 날이에요'); return; }
    var t = today();
    if (state.lastDone !== t) {
      state.streak = (state.lastDone === shift(-1)) ? state.streak + 1 : 1;
      state.lastDone = t;
    }
    state.done.push(state.day);
    save(); render();
    toast('Day ' + state.day + ' 완료 · 연속 ' + state.streak + '일');
  }
  function go(n) {
    state.day = Math.min(Math.max(1, n), MAXDAY);
    save(); render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ── 복습 서랍 ── */
  var tab = 'kana';
  function seenAdv() { return Math.max(0, Math.min(seenUpTo(), lastDay()) - PHASE1); }
  function openDrawer() {
    $('#drawer').dataset.open = 'true'; $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').dataset.open = 'true'; drawBody(); $('#drawerClose').focus();
  }
  function closeDrawer() {
    $('#drawer').dataset.open = 'false'; $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').dataset.open = 'false';
  }
  function drawBody() {
    $$('#tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    var body = $('#dbody');
    body.innerHTML = ({ kana: tKana, words: tWords, grammar: tGrammar, numbers: tNumbers, rules: tRules, settings: tSettings }[tab])();
    body.scrollTop = 0;
  }

  function tKana() {
    var lim = Math.min(seenUpTo(), PHASE1);
    function chart(list, label) {
      var out = '';
      list.forEach(function (it, i) {
        var n = i + 1, on = n <= lim;
        out += '<button class="cell" data-off="' + (!on) + '" data-now="' + (n === state.day) + '"' +
          ' data-say="' + esc(it.c) + '" data-info="' + esc(it.c + ' · ' + it.k + ' · ' + it.r + (on ? '' : ' (Day ' + n + ')')) + '"' +
          ' aria-label="' + esc(it.c + ' ' + it.k) + '">' +
          '<span class="c" lang="ja">' + esc(it.c) + '</span><span class="r">' + esc(on ? it.k : 'D' + n) + '</span></button>';
        if (n === 38 || n === 46) out += '<span class="sp"></span><span class="sp"></span>';
      });
      return '<div class="clabel">' + label + '</div><div class="chart">' + out + '</div>';
    }
    return '<p class="dnote">글자를 누르면 발음이 나와요. 점선은 아직 안 본 날.</p>' +
      chart(window.HIRAGANA, 'ひらがな 히라가나') + chart(window.KATAKANA, 'カタカナ 가타카나');
  }
  function tWords() {
    var n = Math.min(seenUpTo(), PHASE1), out = [];
    window.WORDS.slice(0, n).forEach(function (w, i) {
      out.push('<details class="item"><summary><span class="n">' + (i + 1) + '</span>' +
        '<span class="t" lang="ja">' + esc(w.w) + '</span><span class="m">' + esc(w.m) + '</span></summary>' +
        '<div class="in"><span class="kr">' + esc(w.rd) + ' · ' + esc(kr(w.rd)) + '</span><br>' +
        '<span class="jp" lang="ja">' + esc(w.jp) + '</span><span class="kr">' + esc(kr(w.jpr)) + '</span>' +
        esc(w.ko) + '</div></details>');
    });
    (window.ADVANCED || []).slice(0, seenAdv()).forEach(function (d, i) {
      out.push('<details class="item"><summary><span class="n">' + (PHASE1 + i + 1) + '</span>' +
        '<span class="t" lang="ja">' + esc(d.word.w) + '</span><span class="m">' + esc(d.word.m) + '</span></summary>' +
        '<div class="in"><span class="kr">' + esc(d.word.rd) + ' · ' + esc(kr(d.word.rd)) + '</span><br>' +
        '<span class="jp" lang="ja">' + esc(d.use.jp) + '</span><span class="kr">' + esc(kr(d.use.rd)) + '</span>' +
        esc(d.use.ko) + '</div></details>');
    });
    if (!out.length) return '<p class="dnote">아직 배운 단어가 없어요.</p>';
    return out.reverse().join('');
  }

  function tGrammar() {
    var n = Math.min(seenUpTo(), PHASE1), out = [];
    window.GRAMMAR.slice(0, n).forEach(function (g, i) {
      var rows = (g.forms || []).map(function (f) {
        return '<div style="padding:7px 0;border-bottom:1px solid var(--line)">' +
          '<span class="jp" lang="ja">' + esc(f[2]) + '</span>' +
          '<span class="kr">' + esc(kr(f[3])) + ' — ' + esc(f[4] || '') + '</span></div>';
      }).join('');
      out.push('<details class="item"><summary><span class="n">' + (i + 1) + '</span>' +
        '<span class="t" lang="ja">' + esc(g.t) + '</span></summary>' +
        '<div class="in">' + esc(g.rule) + '<div style="margin-top:10px">' + rows + '</div></div></details>');
    });
    (window.ADVANCED || []).slice(0, seenAdv()).forEach(function (d, i) {
      out.push('<details class="item"><summary><span class="n">' + (PHASE1 + i + 1) + '</span>' +
        '<span class="t" lang="ja">' + esc(d.biz.jp.slice(0, 18)) + '</span><span class="m">LV' + d.lv + '</span></summary>' +
        '<div class="in"><span class="jp" lang="ja">' + esc(d.biz.jp) + '</span>' +
        '<span class="kr">' + esc(kr(d.biz.rd)) + '</span>' + esc(d.biz.ko) +
        '<div style="margin-top:10px;color:var(--ink-3);font-size:12.5px">' + esc(d.biz.note || '') + '</div>' +
        '</div></details>');
    });
    if (!out.length) return '<p class="dnote">아직 배운 문장이 없어요.</p>';
    return out.reverse().join('');
  }
  function tNumbers() {
    var list = (window.NUMBERS || []).slice(0, seenAdv());
    if (!list.length) return '<p class="dnote">숫자 트랙은 Day ' + (PHASE1 + 1) + '부터 시작합니다.</p>';
    return list.map(function (n, i) {
      var rows = (n.rows || []).map(function (r) {
        return '<tr><td class="g">' + esc(r[0]) + '</td><td class="k" lang="ja">' + esc(r[1]) + '</td>' +
          '<td class="k" lang="ja">' + esc(r[2]) + '</td><td class="g">' + esc(kr(r[2])) + '</td></tr>';
      }).join('');
      return '<details class="item"><summary><span class="n">' + (PHASE1 + i + 1) + '</span>' +
        '<span class="t">' + esc(n.t) + '</span></summary>' +
        '<div class="in"><table class="reftbl"><tbody>' + rows + '</tbody></table>' +
        '<div style="margin-top:10px;color:var(--ink-3);font-size:12.5px">' + esc(n.note) + '</div>' +
        '</div></details>';
    }).reverse().join('');
  }

  function tRules() {
    var R = window.REFERENCE;
    return ['dakuten', 'handakuten', 'youon', 'sokuon', 'chouon'].map(function (k) {
      var r = R[k];
      var rows = r.rows.map(function (x) {
        return '<tr><td class="g">' + esc(x[0]) + '</td><td class="k" lang="ja">' + esc(x[1]) + '</td>' +
          '<td class="g">' + esc(x[2]) + '</td><td class="k" lang="ja">' + esc(x[3]) + '</td></tr>';
      }).join('');
      return '<div class="refblock"><h3>' + esc(r.title) + '</h3><p>' + esc(r.desc) + '</p>' +
        '<table class="reftbl"><tbody>' + rows + '</tbody></table>' +
        '<p class="after">' + esc(r.note) + '</p></div>';
    }).join('');
  }
  function tSettings() {
    return '<div class="srow"><div><b>테마</b><div class="sub">' +
        (state.theme === '' ? '시스템 설정 따르기' : state.theme === 'dark' ? '다크' : '라이트') +
      '</div></div><div class="r"><button class="mini" data-theme-auto>시스템</button></div></div>' +
      '<div class="srow"><div><b>Day 이동</b><div class="sub">1 ~ ' + lastDay() + ' (그 이후는 복습 순환)</div></div>' +
        '<div class="r"><input id="jump" class="num" type="number" min="1" max="' + MAXDAY + '" value="' + state.day + '">' +
        '<button class="mini" data-jump>이동</button></div></div>' +
      '<div class="srow"><div><b>진도 초기화</b><div class="sub">완료 기록과 연속 일수를 지웁니다</div></div>' +
        '<div class="r"><button class="mini" data-reset><svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7"><use href="#i-reset"></use></svg>초기화</button></div></div>' +
      '<div class="srow"><div><b>기록</b><div class="sub">시작 ' + esc(state.start || '—') +
        ' · 완료 ' + state.done.length + '일 · 연속 ' + state.streak + '일</div></div></div>';
  }

  /* ── 테마 ── */
  function eff() { return state.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); }
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme || '';
    var dark = eff() === 'dark';
    $('#themeIcon').innerHTML = '<use href="' + (dark ? '#i-sun' : '#i-moon') + '"></use>';
    $('#themeBtn').setAttribute('aria-label', dark ? '라이트 모드로' : '다크 모드로');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0d0d0c' : '#fbfaf9');
    $$('.trace canvas').forEach(function (c) { c.dispatchEvent(new Event('repaint')); });
  }

  /* ── 이벤트 ── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-say],[data-reveal],[data-tab],[data-theme-auto],[data-jump],[data-reset]');
    if (!t) return;
    if (t.hasAttribute('data-reveal')) { t.parentNode.querySelector('.a').classList.remove('hidden'); t.classList.add('hidden'); return; }
    if (t.hasAttribute('data-say')) {
      speak(t.getAttribute('data-say'), t.classList.contains('say') ? t : null);
      if (t.hasAttribute('data-info')) toast(t.getAttribute('data-info'));
      return;
    }
    if (t.hasAttribute('data-tab')) { tab = t.dataset.tab; drawBody(); return; }
    if (t.hasAttribute('data-theme-auto')) { state.theme = ''; save(); applyTheme(); drawBody(); toast('시스템 설정을 따릅니다'); return; }
    if (t.hasAttribute('data-jump')) {
      var v = parseInt($('#jump').value, 10);
      if (!v || v < 1 || v > MAXDAY) { toast('1에서 ' + MAXDAY + ' 사이 숫자를 넣어주세요'); return; }
      go(v); closeDrawer(); return;
    }
    if (t.hasAttribute('data-reset')) {
      if (!window.confirm('진도를 모두 초기화할까요?')) return;
      state = { day: 1, done: [], lastDone: null, streak: 0, start: today(), theme: state.theme };
      save(); render(); drawBody(); toast('처음부터 다시 시작해요');
    }
  });

  $('#prevDay').addEventListener('click', function () { go(state.day - 1); });
  $('#nextDay').addEventListener('click', function () { go(state.day + 1); });
  $('#doneBtn').addEventListener('click', complete);
  $('#themeBtn').addEventListener('click', function () {
    state.theme = eff() === 'dark' ? 'light' : 'dark'; save(); applyTheme();
    if ($('#drawer').dataset.open === 'true' && tab === 'settings') drawBody();
  });
  $('#drawerBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || $('#drawer').dataset.open === 'true') return;
    if (e.key === 'ArrowRight') go(state.day + 1);
    else if (e.key === 'ArrowLeft') go(state.day - 1);
  });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme:dark)');
    var onMq = function () { if (!state.theme) { applyTheme(); render(); } };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  rollover();
  applyTheme();
  render();
})();
