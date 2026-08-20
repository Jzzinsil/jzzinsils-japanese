/* 가나 → 한글 발음 변환기
   원칙
   · 무성음은 격음(카·타·파), 유성음은 평음(가·다·바)으로 구분 — が/か를 눈으로 구별할 수 있게
   · 장음은 '-'로 표시 (코-히-, 다이조-부) — ビル/ビール처럼 길이가 뜻을 바꾸므로
   · っ은 ㅅ받침, ん은 뒤 자음에 따라 ㄴ/ㅁ/ㅇ (셈파이, 니홍고)
   · 조사 は·へ는 실제 발음대로 와·에 */
(function () {
  var BASE = {
    'あ':'아','い':'이','う':'우','え':'에','お':'오',
    'か':'카','き':'키','く':'쿠','け':'케','こ':'코',
    'が':'가','ぎ':'기','ぐ':'구','げ':'게','ご':'고',
    'さ':'사','し':'시','す':'스','せ':'세','そ':'소',
    'ざ':'자','じ':'지','ず':'즈','ぜ':'제','ぞ':'조',
    'た':'타','ち':'치','つ':'츠','て':'테','と':'토',
    'だ':'다','ぢ':'지','づ':'즈','で':'데','ど':'도',
    'な':'나','に':'니','ぬ':'누','ね':'네','の':'노',
    'は':'하','ひ':'히','ふ':'후','へ':'헤','ほ':'호',
    'ば':'바','び':'비','ぶ':'부','べ':'베','ぼ':'보',
    'ぱ':'파','ぴ':'피','ぷ':'푸','ぺ':'페','ぽ':'포',
    'ま':'마','み':'미','む':'무','め':'메','も':'모',
    'や':'야','ゆ':'유','よ':'요',
    'ら':'라','り':'리','る':'루','れ':'레','ろ':'로',
    'わ':'와','を':'오','ゔ':'부',
    'ぁ':'아','ぃ':'이','ぅ':'우','ぇ':'에','ぉ':'오'
  };
  var COMBO = {
    'きゃ':'캬','きゅ':'큐','きょ':'쿄','ぎゃ':'갸','ぎゅ':'규','ぎょ':'교',
    'しゃ':'샤','しゅ':'슈','しょ':'쇼','じゃ':'자','じゅ':'주','じょ':'조',
    'ちゃ':'차','ちゅ':'추','ちょ':'초','にゃ':'냐','にゅ':'뉴','にょ':'뇨',
    'ひゃ':'햐','ひゅ':'휴','ひょ':'효','びゃ':'뱌','びゅ':'뷰','びょ':'뵤',
    'ぴゃ':'퍄','ぴゅ':'퓨','ぴょ':'표','みゃ':'먀','みゅ':'뮤','みょ':'묘',
    'りゃ':'랴','りゅ':'류','りょ':'료',
    'ふぁ':'파','ふぃ':'피','ふぇ':'페','ふぉ':'포','ふゅ':'퓨',
    'てぃ':'티','でぃ':'디','とぅ':'투','どぅ':'두',
    'ちぇ':'체','しぇ':'셰','じぇ':'제','つぁ':'차','つぇ':'체','つぉ':'초',
    'うぃ':'위','うぇ':'웨','うぉ':'워','ゔぁ':'바','ゔぃ':'비','ゔぇ':'베','ゔぉ':'보'
  };
  // 장음 판정용 — 각 가나의 모음
  var VOWEL = {};
  (function () {
    var g = {
      a:'あかがさざただなはばぱまやらわぁ', i:'いきぎしじちぢにひびぴみりぃ',
      u:'うくぐすずつづぬふぶぷむゆるゔぅ', e:'えけげせぜてでねへべぺめれぇ',
      o:'おこごそぞとどのほぼぽもよろをぉ'
    };
    for (var v in g) for (var i = 0; i < g[v].length; i++) VOWEL[g[v][i]] = v;
  })();
  var COMBO_VOWEL = { 'ゃ':'a', 'ゅ':'u', 'ょ':'o', 'ぁ':'a', 'ぃ':'i', 'ぅ':'u', 'ぇ':'e', 'ぉ':'o' };
  var LONG = { a:'あ', i:'い', u:'う', e:'え', o:'お' };
  var PUNC = { '。':'. ', '、':', ', '？':'? ', '！':'! ', '　':' ', '「':'"', '」':'"', '・':'·' };
  var FINAL = { g:1, n:4, m:16, s:19, ng:21 };

  function isSyl(ch) { var c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3; }
  // 마지막 한글 음절에 받침 붙이기 ('-' 같은 기호는 건너뜀)
  function addFinal(out, kind) {
    var jamo = { n:'ㄴ', m:'ㅁ', ng:'ㅇ', s:'ㅅ' }[kind];
    for (var i = out.length - 1; i >= 0; i--) {
      if (isSyl(out[i])) {
        if ((out[i].charCodeAt(0) - 0xAC00) % 28 === 0) {
          out[i] = String.fromCharCode(out[i].charCodeAt(0) + FINAL[kind]);
        } else { out.splice(i + 1, 0, jamo); }
        return;
      }
      if (out[i] !== '-') break;   // 한글이 아닌 문자를 만나면 중단
    }
    out.push(jamo);
  }
  // ん 다음 자음에 따라 받침 결정
  function nasal(next) {
    if (!next) return 'n';
    if ('まみむめもばびぶべぼぱぴぷぺぽ'.indexOf(next) >= 0) return 'm';
    if ('かきくけこがぎぐげご'.indexOf(next) >= 0) return 'ng';
    return 'n';
  }
  function toHira(s) {
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }

  window.kanaToKr = function (input) {
    if (!input) return '';
    var s = toHira(String(input));
    var out = [], i = 0;
    while (i < s.length) {
      var ch = s[i], two = s.substr(i, 2);

      if (COMBO[two]) {                                   // 요음·외래어 조합
        out.push(COMBO[two]);
        var v = COMBO_VOWEL[two[1]];
        i += 2;
        i += eatLong(s, i, v, out);
        continue;
      }
      if (ch === 'っ') { addFinal(out, 's'); i++; continue; }   // 촉음
      if (ch === 'ん') { addFinal(out, nasal(s[i + 1])); i++; continue; }
      if (ch === 'ー') { out.push('-'); i++; continue; }
      if (BASE[ch]) {
        var kr = BASE[ch];
        // 조사 は·へ는 소리대로
        if (ch === 'は' && i > 0 && isBreak(s[i + 1])) kr = '와';
        if (ch === 'へ' && i > 0 && isBreak(s[i + 1])) kr = '에';
        out.push(kr);
        i++;
        i += eatLong(s, i, VOWEL[ch], out);
        continue;
      }
      out.push(PUNC[ch] || ch);                            // 기타는 그대로
      i++;
    }
    return out.join('').replace(/\s+/g, ' ').trim();
  };
  // 뒤에 가나가 아닌 문자(공백·문장부호·…)가 오면 어절이 끝난 것으로 본다
  function isBreak(next) { return next === undefined || !/[\u3041-\u3096\u30A1-\u30F6\u30FC]/.test(next); }
  // 같은 모음이 이어지거나 お단+う면 장음
  function eatLong(s, i, v, out) {
    if (!v) return 0;
    var next = s[i];
    if (next === 'ー') { out.push('-'); return 1; }
    if (next && (next === LONG[v] || (v === 'o' && next === 'う'))) { out.push('-'); return 1; }
    return 0;
  }
})();
