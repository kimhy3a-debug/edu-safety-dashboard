/* 2026년 해빙기 교육시설 안전점검 대시보드 — index.html(여름철)과 같은 아키텍처를 그대로
   확장한다: 단일 패스 compute() → 공유 결과 R → 각 render*() 함수. dashboard_data_thaw.js 가
   컬럼형 딕셔너리 인코딩 데이터를 window.SAFETY_DATA 로 실어 온다.

   공식 발표수치(D.official.*) 와 이 스크립트가 원본 시트에서 직접 재집계한 값은 서로 다를 수
   있다("4. 지적사항" 시트의 피벗 캐시가 stale 하기 때문 — 상세 설명은 build_data_thaw.py 주석
   참고). 공식수치는 절대 재계산하지 않고 D.official 그대로 쓰며, 화면에는 항상
   "공식 발표수치" 배지를 붙여 대시보드 자체 집계와 시각적으로 구분한다. */
(function(){
"use strict";

var D = window.SAFETY_DATA;
if(!D){ document.getElementById('loading').innerHTML =
  '<div style="text-align:center;color:#ba1a1a">dashboard_data_thaw.js 를 찾을 수 없습니다.<br>'+
  '<span style="font-weight:400;font-size:13px">build_data_thaw.py 를 먼저 실행하세요.</span></div>'; return; }

var N = D.meta.facilityRows;
var BASE_YEAR = D.meta.baseYear || 2026;
var OFFICIAL = D.official;

var GRADES = ['A등급','B등급','C등급','D등급','E등급'];
var GCOLOR = {'A등급':'#0a8a5c','B등급':'#4648d4','C등급':'#e0a416','D등급':'#e0384f','E등급':'#96131a'};
var GX = '#a29fb2';
var SEQ  = ['#a5a7ef','#8385e6','#6164dc','#4648d4','#3634b8','#252399'];
var RISK = ['#ec9a85','#e07a63','#d15845','#bc3a2e','#a02620','#7d1714'];
var IMP  = ['#9dd8bd','#5cbf95','#23a06e','#0a8a5c'];
var NEUTRAL = '#e6e2f0';
var AGE_LABELS = ['5년 미만','5~9년','10~19년','20~29년','30~39년','40년 이상','미기재'];

/* 조치계획 심각도 순서(심각→경미) · 색은 기존 위험 램프를 그대로 재사용해
   CVD 검증 팔레트를 훼손하지 않는다. */
var ACTION_ORDER = ['정밀안전진단','정밀안전점검','보수보강','자체보수','지속관찰','현지시정'];
/* v1 수정 3(개정): 조치계획 램프는 RISK(붉은색, "C이하율"·위험도와 혼동된다는 피드백)도,
   그 다음 시도한 호박색(선호하지 않는다는 피드백)도 아닌 청록/스틸블루 6단계 램프를
   쓴다(--action-1..6, index_thaw_v1.html :root 참고) — 인디고 주색보다 더 청록에
   가까운 hue라 원색과 겹치지 않으면서, 붉은(위험)·초록(개선/완전해소) 어느 쪽과도
   혼동되지 않는다. 진할수록 심각(정밀안전진단), 연할수록 경미(현지시정) — 순서 유지. */
var ACTION_COLOR = ['#471f5c','#652b82','#893bb0','#a65ec9','#bf8cd9','#d9bae8'];
var RESOLVE_COLOR = {'미해소':'#e0384f','완전해소':'#0a8a5c'};

var fmt   = function(n){ return (n||0).toLocaleString('ko-KR'); };
var pct   = function(a,b,d){ return b>0 ? (a/b*100).toFixed(d===undefined?1:d) : '0.0'; };
var pctS  = function(a,b,d){ return pct(a,b,d)+'%'; };
var esc   = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
var $     = function(id){ return document.getElementById(id); };

function inkOn(hex){
  var r=parseInt(hex.substr(1,2),16), g=parseInt(hex.substr(3,2),16), b=parseInt(hex.substr(5,2),16);
  return (0.299*r+0.587*g+0.114*b) > 150 ? '#1b1b23' : '#ffffff';
}
function rampStep(v, breaks){
  for(var i=0;i<breaks.length;i++) if(v < breaks[i]) return i;
  return breaks.length;
}
function officialBadge(title){
  return '<span class="badge-official" title="'+esc(title||('출처: '+OFFICIAL.source+' · 기준일 '+OFFICIAL.baseDate))+'">공식 발표수치</span>';
}

/* ══════════════════════════════════════════════════════════════
   1. 디코딩
   ══════════════════════════════════════════════════════════════ */
function b64bytes(s){
  var bin = atob(s), len = bin.length, out = new Uint8Array(len);
  for(var i=0;i<len;i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeCol(s, wide){
  var b = b64bytes(s);
  if(!wide) return b;
  var out = new Uint16Array(b.length>>1);
  for(var i=0;i<out.length;i++) out[i] = b[i*2] | (b[i*2+1]<<8);
  return out;
}

var WIDE = {}; (D.wide||[]).forEach(function(k){ WIDE[k]=1; });
var COL = {}, DICT = D.dict;
Object.keys(D.cols).forEach(function(k){ COL[k] = decodeCol(D.cols[k], !!WIDE[k]); });
var JI = b64bytes(D.ji);
var YR = decodeCol(D.yr, true);
var FV = b64bytes(D.fv);   // 재해취약시설 동시 플래그 개수(0/1/2) — 우선관리 스코어용
var FVBITS = b64bytes(D.fvBits);   // 재해취약시설 세부유형 비트마스크(v1: 우선관리 스코어 아이콘 칩용)
                                     // bit0=구조위험 bit1=붕괴위험 bit2=화재위험 bit3=폭설위험 bit4=건설공사장

/* v1 수정 4: 우선관리 스코어 카드의 "산정 근거"를 아이콘으로 시각화한다.
   재해취약유형은 build_data_thaw.py가 내보낸 FVBITS(시설당 최대 2종까지 동시 표시
   가능)를 그대로 풀어서 보여주고, 조치계획은 그 시설의 지적사항 중 가장 심각한 것
   하나(COL.action, 이미 계산돼 있는 worst_action 롤업)를 대표로 아이콘 하나로
   보여준다 — 지적건수가 여럿이어도 시설당 조치계획은 하나로 접어 보여주는 게
   대시보드 전체(다른 조치계획 카드들도 시설/지역 단위로 접어서 보여줌)와 일관된다. */
var FV_ICON_DEFS = [
  [1,  '구조위험',   'foundation'],
  [2,  '붕괴위험',   'landslide'],
  [4,  '화재위험',   'local_fire_department'],
  [8,  '폭설위험',   'ac_unit'],
  [16, '건설공사장', 'construction']
];
/* 우선관리 스코어 카드의 좁은 칩 안에서만 쓰는 축약 라벨(요청사항: 구조위험→구조,
   폭설위험→폭설). 툴팁 등 공간이 넉넉한 곳은 FV_ICON_DEFS의 정식 라벨을 그대로 쓴다. */
var FV_SHORT_LABEL = {'구조위험':'구조', '붕괴위험':'붕괴', '화재위험':'화재', '폭설위험':'폭설', '건설공사장':'공사장'};
var ACTION_ICON = {
  '정밀안전진단':'troubleshoot', '정밀안전점검':'checklist', '보수보강':'handyman',
  '자체보수':'build', '지속관찰':'visibility', '현지시정':'task_alt'
};
function fvTypesOf(i){
  var b = FVBITS[i], out = [];
  FV_ICON_DEFS.forEach(function(d){ if(b & d[0]) out.push([d[1], d[2]]); });
  return out;
}
function fvChipHtml(label, icon){
  var short = FV_SHORT_LABEL[label] || label;
  return '<span class="score-chip-ico" style="background:rgba(224,56,79,.12);color:#a02620">'+
    '<span class="material-symbols-outlined">'+icon+'</span>'+esc(short)+'</span>';
}
function actionChipHtml(actionLabel, ji){
  var k = ACTION_ORDER.indexOf(actionLabel);
  var col = k>=0 ? ACTION_COLOR[k] : '#767586';
  var icon = ACTION_ICON[actionLabel] || 'assignment';
  return '<span class="score-chip-ico" style="background:'+col+'22;color:'+col+'">'+
    '<span class="material-symbols-outlined">'+icon+'</span>'+esc(actionLabel)+' · 지적'+ji+'건</span>';
}

function idxOf(dim, label){ var a = DICT[dim]; for(var i=0;i<a.length;i++) if(a[i]===label) return i; return -1; }

function gradeMap(dim){
  var m = new Int8Array(DICT[dim].length).fill(-1);
  DICT[dim].forEach(function(lab,i){ var p = GRADES.indexOf(lab); if(p>=0) m[i]=p; });
  return m;
}
var CURG = gradeMap('cur'), PREVG = gradeMap('prev');

var AGE = new Uint8Array(N);
for(var _i=0;_i<N;_i++){
  var _y = YR[_i];
  if(!_y){ AGE[_i]=6; }
  else { var _a = BASE_YEAR - _y;
    AGE[_i] = _a<5?0 : _a<10?1 : _a<20?2 : _a<30?3 : _a<40?4 : 5; }
}

/* 우선관리 스코어(0~100) — 연령40% · 재해취약25% · 금차등급20% · 지적건수15% 가중합.
   등급/지적건수는 이미 대시보드 다른 곳에서 두드러지는 신호이므로 가중치를 낮게 주고,
   연령·재해취약처럼 "등급만 봐서는 안 보이는" 신호에 더 큰 가중치를 준다. */
var SCORE = new Float64Array(N);
(function(){
  for(var i=0;i<N;i++){
    var y = YR[i];
    var ageScore = y ? Math.min(1, Math.max(0, (BASE_YEAR - y - 10) / 40)) : 0;
    var fvScore = Math.min(1, FV[i] / 2);
    var g = CURG[COL.cur[i]];
    var gradeScore = g===0?0 : g===1?0.25 : g===2?0.6 : g===3?0.85 : g===4?1.0 : 0.35;
    var jiScore = Math.min(1, JI[i]/5);
    SCORE[i] = Math.round(100*(0.40*ageScore + 0.25*fvScore + 0.20*gradeScore + 0.15*jiScore));
  }
})();

/* 정합성 플래그(비트마스크) — 여름철 버전 대비: 시설주용도·점검완료여부 플래그는
   이 데이터셋에 없는 차원이라 빼고, 설립구분 미기재 플래그를 새로 추가했다. */
var F_YEAR=1, F_ESTAB=2, F_STATUS=4, F_GRADE=8, F_CONFLICT=16, F_DROP=32, F_DECOMM=64;
var FLAG = new Uint8Array(N);
(function(){
  var estabMiss = idxOf('estab','(미기재)');
  var opUse = idxOf('opstat','사용');
  var curMiss1 = idxOf('cur','미지정'), curMiss2 = idxOf('cur','(미기재)');
  /* v1 수정 5: "운용상태 '사용' 외"(F_STATUS, 착공·사용예정·완공·착공예정까지 포함하는
     넓은 범주) 아래에, 시설이 사실상 폐지·배제된 "불용·철거·제외"만 골라내는 더 좁은
     하위 플래그(F_DECOMM)를 추가한다. F_DECOMM은 항상 F_STATUS의 부분집합이다. */
  var decommSet = {};
  ['불용','철거','제외'].forEach(function(l){ var k=idxOf('opstat',l); if(k>=0) decommSet[k]=1; });
  for(var i=0;i<N;i++){
    var f = 0, y = YR[i], cg = CURG[COL.cur[i]], pg = PREVG[COL.prev[i]];
    if(!y) f|=F_YEAR;
    if(COL.estab[i]===estabMiss) f|=F_ESTAB;
    if(opUse>=0 && COL.opstat[i]!==opUse) f|=F_STATUS;
    if(decommSet[COL.opstat[i]]) f|=F_DECOMM;
    if(COL.cur[i]===curMiss1 || COL.cur[i]===curMiss2) f|=F_GRADE;
    if(cg>=0 && cg<=1 && JI[i]>=3) f|=F_CONFLICT;
    if(cg>=0 && pg>=0 && cg>pg) f|=F_DROP;
    FLAG[i]=f;
  }
})();

/* ══════════════════════════════════════════════════════════════
   2. 필터 상태
   ══════════════════════════════════════════════════════════════ */
var FILTER_DEFS = [
  {key:'sido',   label:'시도교육청'},
  {key:'office', label:'교육지원청', parent:'sido'},
  {key:'region', label:'지역',       parent:'sido'},
  {key:'kind',   label:'학교/기관'},
  {key:'level',  label:'학교·기관 유형'},
  {key:'estab',  label:'설립구분'},
  {key:'opstat', label:'운용상태'},
  {key:'ftype',  label:'시설유형'},
  {key:'struct', label:'시설구조'},
  {key:'method', label:'점검방법'},
  {key:'cur',    label:'금차안전등급'},
  {key:'fatvulnType', label:'재해취약시설 유형'},
  {key:'action', label:'조치계획'},
  {key:'resolve',label:'해소상태'}
];

/* resNoObsUn: "지적사항 해소상태 — 시도별" 카드 전용 원-오프 필터(FILTER_DEFS 드롭다운에는
   넣지 않는다 — F.trans/F.cross/F.dimAge와 같은 패턴). true 이면 resolveNoObs(지속관찰
   제외 해소상태)가 "미해소"인 시설만 남긴다. */
var F = { dim:{}, age:null, flag:null, trans:null, cross:null, dimAge:null, resNoObsUn:null };
FILTER_DEFS.forEach(function(d){ F.dim[d.key] = null; });

function dimHas(key, idx){ var s=F.dim[key]; return !!s && s.has(idx); }
function dimSetSingle(key, idx){
  var s = F.dim[key];
  F.dim[key] = (s && s.size===1 && s.has(idx)) ? null : new Set([idx]);
}
function dimEquals(key, idxs){
  var s = F.dim[key]; if(!s || s.size!==idxs.length) return false;
  return idxs.every(function(i){ return s.has(i); });
}
function dimSetExact(key, idxs){
  F.dim[key] = dimEquals(key, idxs) ? null : new Set(idxs);
}
function dimSummary(key, max){
  var s = F.dim[key]; if(!s) return null;
  if(!s.size) return '0개 선택';
  max = max||3;
  var names = Array.from(s).map(function(idx){ return DICT[key][idx]; });
  return names.length<=max ? names.join(', ') : names.slice(0,max).join(', ')+' 외 '+(names.length-max)+'개';
}
function ageHas(a){ return !!F.age && F.age.has(a); }
function ageSetSingle(a){
  F.age = (F.age && F.age.size===1 && F.age.has(a)) ? null : new Set([a]);
}

var openFilterKey = null;
var MASK = new Uint8Array(N);

function setToLookup(set, card){
  var lut = new Uint8Array(card);
  set.forEach(function(v){ lut[v]=1; });
  return lut;
}

function buildMask(){
  var dimCols = [], dimLuts = [];
  FILTER_DEFS.forEach(function(d){
    var s = F.dim[d.key];
    if(s){ dimCols.push(COL[d.key]); dimLuts.push(setToLookup(s, DICT[d.key].length)); }
  });
  var nk = dimCols.length;
  var ageLut = F.age ? setToLookup(F.age, 7) : null;
  var flag = F.flag, tr = F.trans, cr = F.cross, da = F.dimAge, ru = F.resNoObsUn;
  var colLevel = COL.level, colEstab = COL.estab, colResolveNoObs = COL.resolveNoObs;
  var daCol = da ? COL[da[0]] : null;
  for(var i=0;i<N;i++){
    var ok = 1;
    for(var k=0;k<nk;k++){ if(!dimLuts[k][dimCols[k][i]]){ ok=0; break; } }
    if(ok && ageLut && !ageLut[AGE[i]]) ok=0;
    if(ok && flag!==null && !(FLAG[i]&flag)) ok=0;
    if(ok && tr && (COL.prev[i]!==tr[0] || COL.cur[i]!==tr[1])) ok=0;
    if(ok && cr && (colLevel[i]!==cr[0] || colEstab[i]!==cr[1])) ok=0;
    if(ok && da && (daCol[i]!==da[1] || AGE[i]!==da[2])) ok=0;
    if(ok && ru && colResolveNoObs[i]!==RESOLVE_NOOBS_UN) ok=0;
    MASK[i]=ok;
  }
}

/* ══════════════════════════════════════════════════════════════
   3. 집계 (마스크 1회 순회로 전 카드 동시 산출)
   ══════════════════════════════════════════════════════════════ */
var AGG_DIMS = ['sido','struct','method','fatvulnType'];
var DIMAGE_DIMS = ['struct','estab','method','fatvulnType','action'];
var DIMAGE_LABELS = {struct:'구조', estab:'설립구분', method:'점검방법', fatvulnType:'재해취약유형', action:'조치계획'};

function newBucket(card){
  return { n:new Float64Array(card), ji:new Float64Array(card),
           cde:new Float64Array(card), g:new Float64Array(card*6) };
}

var FV_NONE = idxOf('fatvulnType','해당없음');
var RESOLVE_NONE = idxOf('resolve','해당없음'), RESOLVE_UN = idxOf('resolve','미해소'), RESOLVE_DONE = idxOf('resolve','완전해소');
var nSido = DICT.sido.length, nResolve = DICT.resolve.length;

/* v1 수정사항: "지적사항 해소상태 — 시도별" 카드(⑨)의 미해소율은 resolve가 아니라
   resolveNoObs를 쓴다. resolveNoObs는 build_data_thaw.py에서 조치계획="지속관찰"인
   지적사항을 제외하고 롤업한 해소상태다 — "지속관찰"은 성격상 계속 모니터링하는
   상태라 해소상태가 거의 항상 "미해소"로 남아 있어(사용자 확인), 그대로 포함하면
   지속관찰 비중이 큰 시도가 실제보다 훨씬 나쁜 미해소율로 보이는 왜곡이 생긴다.
   KPI "미해소 지적사항" 타일, 필터바 "해소상태", 즉시조치 워치리스트 기준 등
   나머지는 전부 지속관찰 포함 기존 resolve 정의를 그대로 쓴다 — 이 카드 하나만 다르다. */
var RESOLVE_NOOBS_NONE = idxOf('resolveNoObs','해당없음'),
    RESOLVE_NOOBS_UN = idxOf('resolveNoObs','미해소'),
    RESOLVE_NOOBS_DONE = idxOf('resolveNoObs','완전해소');
var nResolveNoObs = DICT.resolveNoObs.length;

/* v1 수정사항 2: "해소상태 — 시도별" 카드 막대를 미해소/완전해소 2색이 아니라
   조치계획별 색으로 다시 칠한다(예: 대구는 미해소가 전부 "보수보강"이면 그 구간이
   단색으로 보임). actionNoObs는 resolveNoObs와 정확히 같은 지적사항 집합(조치계획=
   "지속관찰" 제외)에서 다시 뽑은 최고심각도 조치계획이다 — 일반 action 필드를 쓰면
   "지속관찰"과 "현지시정"만 있는 시설에서 지속관찰 쪽이 더 심각한 것으로 잘못
   뽑혀(순위상 지속관찰이 현지시정보다 높음) 화면과 실제 근거 지적사항이 어긋난다.
   ACTION_POS: actionNoObs dict 인덱스 -> ACTION_ORDER(정밀안전진단..현지시정) 위치.
   actionNoObs에는 정의상 "지속관찰"이 나오지 않는다(제외하고 뽑았으므로). */
var ACTION_POS = {};
DICT.actionNoObs.forEach(function(lab,di){ var p = ACTION_ORDER.indexOf(lab); if(p>=0) ACTION_POS[di]=p; });
var nActionSlots = ACTION_ORDER.length;   // 6 (지속관찰 슬롯은 이 카드에선 항상 0)

function compute(){
  buildMask();
  var R = { total:0, ji:0, cde:0, dropped:0, improved:0, watch:0, old40:0, fatvuln:0, unresolved:0, resolved:0,
            grades:new Float64Array(6), dim:{}, age:newBucket(7),
            cross:newBucket(DICT.level.length*DICT.estab.length),
            dimAge:{},
            trans:new Float64Array(DICT.prev.length*DICT.cur.length),
            flags:new Float64Array(7),
            sidoResolve:new Float64Array(nSido*nResolve),
            sidoResolveNoObs:new Float64Array(nSido*nResolveNoObs),   // v1: 지속관찰 제외 미해소율용
            sidoResolveAction:new Float64Array(nSido*2*nActionSlots), // v1: (미해소0/완전해소1) × 조치계획별 세부
            sidoFatvuln:new Float64Array(nSido) };
  AGG_DIMS.forEach(function(k){ R.dim[k] = newBucket(DICT[k].length); });
  DIMAGE_DIMS.forEach(function(k){ R.dimAge[k] = newBucket(DICT[k].length*7); });

  var nCur = DICT.cur.length, nEstab = DICT.estab.length;
  var buckets = AGG_DIMS.map(function(k){ return [COL[k], R.dim[k]]; });
  var dimAgeBuckets = DIMAGE_DIMS.map(function(k){ return [COL[k], R.dimAge[k]]; });

  var rowIdx = new Uint32Array(N), rc = 0;

  for(var i=0;i<N;i++){
    if(!MASK[i]) continue;
    rowIdx[rc++] = i;
    var g = CURG[COL.cur[i]], slot = g<0 ? 5 : g;
    var j = JI[i], bad = (g>=2) ? 1 : 0;
    R.total++; R.ji += j; R.cde += bad; R.grades[slot]++;

    var f = FLAG[i];
    if(f&F_DROP) R.dropped++;
    var pg = PREVG[COL.prev[i]];
    if(pg>=0 && g>=0 && g<pg) R.improved++;
    if((f&F_DROP) || g>=3 || j>=5) R.watch++;
    if(AGE[i]===5) R.old40++;
    if(COL.fatvulnType[i]!==FV_NONE) R.fatvuln++;
    if(COL.resolve[i]===RESOLVE_UN) R.unresolved++;
    if(COL.resolve[i]===RESOLVE_DONE) R.resolved++;

    for(var b=0;b<buckets.length;b++){
      var v = buckets[b][0][i], B = buckets[b][1];
      B.n[v]++; B.ji[v]+=j; B.cde[v]+=bad; B.g[v*6+slot]++;
    }
    var a = AGE[i];
    R.age.n[a]++; R.age.ji[a]+=j; R.age.cde[a]+=bad; R.age.g[a*6+slot]++;

    var c = COL.level[i]*nEstab + COL.estab[i];
    R.cross.n[c]++; R.cross.ji[c]+=j; R.cross.cde[c]+=bad; R.cross.g[c*6+slot]++;

    for(var dgi=0; dgi<dimAgeBuckets.length; dgi++){
      var dv = dimAgeBuckets[dgi][0][i]*7 + a, DB = dimAgeBuckets[dgi][1];
      DB.n[dv]++; DB.ji[dv]+=j; DB.cde[dv]+=bad; DB.g[dv*6+slot]++;
    }

    R.trans[COL.prev[i]*nCur + COL.cur[i]]++;

    var sIdx = COL.sido[i];
    R.sidoResolve[sIdx*nResolve + COL.resolve[i]]++;
    var rno = COL.resolveNoObs[i];
    R.sidoResolveNoObs[sIdx*nResolveNoObs + rno]++;   // v1: 지속관찰 제외
    if(rno===RESOLVE_NOOBS_UN || rno===RESOLVE_NOOBS_DONE){
      var grp = rno===RESOLVE_NOOBS_UN ? 0 : 1;
      var actPos = ACTION_POS[COL.actionNoObs[i]];
      if(actPos!==undefined) R.sidoResolveAction[(sIdx*2+grp)*nActionSlots + actPos]++;
    }
    if(COL.fatvulnType[i]!==FV_NONE) R.sidoFatvuln[sIdx]++;

    if(f&F_YEAR)     R.flags[0]++;
    if(f&F_ESTAB)     R.flags[1]++;
    if(f&F_STATUS)   R.flags[2]++;
    if(f&F_GRADE)    R.flags[3]++;
    if(f&F_CONFLICT) R.flags[4]++;
    if(f&F_DECOMM)   R.flags[5]++;
  }
  R.rowIdx = rowIdx.subarray(0, rc);
  return R;
}

/* ══════════════════════════════════════════════════════════════
   4. 툴팁
   ══════════════════════════════════════════════════════════════ */
var tipEl = $('tip'), tipOn = false;
function tipShow(html, ev){
  tipEl.innerHTML = html; tipEl.style.opacity = '1'; tipOn = true; tipMove(ev);
}
function tipMove(ev){
  if(!tipOn) return;
  var r = tipEl.getBoundingClientRect();
  var x = ev.clientX + 16, y = ev.clientY + 16;
  if(x + r.width  > window.innerWidth  - 10) x = ev.clientX - r.width  - 16;
  if(y + r.height > window.innerHeight - 10) y = ev.clientY - r.height - 16;
  tipEl.style.left = Math.max(8,x)+'px'; tipEl.style.top = Math.max(8,y)+'px';
}
function tipHide(){ tipEl.style.opacity='0'; tipOn=false; }
function bindTip(node, htmlFn){
  node.addEventListener('mouseenter', function(e){ tipShow(htmlFn(), e); });
  node.addEventListener('mousemove', tipMove);
  node.addEventListener('mouseleave', tipHide);
  node.addEventListener('focus', function(e){
    var r = node.getBoundingClientRect();
    tipShow(htmlFn(), {clientX:r.left+r.width/2, clientY:r.top});
  });
  node.addEventListener('blur', tipHide);
}
function tipRow(k,v){ return '<div class="tl"><span>'+k+'</span><span>'+v+'</span></div>'; }
function gradeTip(g, total){
  var s = '';
  for(var i=0;i<5;i++) if(g[i]) s += tipRow(GRADES[i], fmt(g[i])+' ('+pctS(g[i],total)+')');
  if(g[5]) s += tipRow('미지정/미기재', fmt(g[5]));
  return s;
}

/* ══════════════════════════════════════════════════════════════
   5. 렌더 — 필터 바
   ══════════════════════════════════════════════════════════════ */
var OPT_COUNTS = null, OPT_AGE = null;
function computeFilterCounts(){
  var keys = FILTER_DEFS.map(function(d){ return d.key; });
  var cols = keys.map(function(k){ return COL[k]; });
  var arrs = keys.map(function(k){ return new Float64Array(DICT[k].length); });
  var nd = keys.length;
  var age = new Float64Array(7);

  var aIdx = [], aCol = [], aLut = [];
  for(var j=0;j<nd;j++) if(F.dim[keys[j]]){
    aIdx.push(j); aCol.push(cols[j]); aLut.push(setToLookup(F.dim[keys[j]], DICT[keys[j]].length));
  }
  var na = aIdx.length, ageLut = F.age ? setToLookup(F.age, 7) : null;

  for(var i=0;i<N;i++){
    var fails = 0, failDim = -1;
    for(var k=0;k<na;k++){
      if(!aLut[k][aCol[k][i]]){ fails++; failDim = aIdx[k]; if(fails>1) break; }
    }
    if(fails === 0) age[AGE[i]]++;
    if(ageLut && !ageLut[AGE[i]]) continue;
    if(fails === 0){ for(var j2=0;j2<nd;j2++) arrs[j2][cols[j2][i]]++; }
    else if(fails === 1){ arrs[failDim][cols[failDim][i]]++; }
  }
  OPT_COUNTS = {}; keys.forEach(function(k,j){ OPT_COUNTS[k] = arrs[j]; });
  OPT_AGE = age;
}

function optionsFor(key){
  var counts = OPT_COUNTS[key], out = [];
  DICT[key].forEach(function(lab,i){ if(counts[i]>0) out.push([i,lab,counts[i]]); });
  out.sort(function(a,b){ return b[2]-a[2]; });
  return out;
}

function renderCheckDropdown(bar, key, label, options, getSet, setSet){
  var cur = getSet();
  var isOpen = openFilterKey === key;
  var wrap = document.createElement('div'); wrap.className = 'fsel-multi'+(isOpen?' open':'');

  var trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'fsel-trigger';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  var sum = dimSummaryFromSet(cur, options);
  trigger.textContent = sum ? label+' '+sum : label+' 전체';
  trigger.onclick = function(e){
    e.stopPropagation();
    openFilterKey = isOpen ? null : key;
    renderFilters();
  };
  wrap.appendChild(trigger);

  if(isOpen){
    var panel = document.createElement('div'); panel.className = 'fsel-panel';
    panel.onclick = function(e){ e.stopPropagation(); };

    var allChecked = !cur || (options.length>0 && options.every(function(o){ return cur.has(o[0]); }));
    var allRow = document.createElement('label'); allRow.className = 'fsel-all';
    var allCb = document.createElement('input'); allCb.type = 'checkbox';
    allCb.checked = allChecked;
    allCb.indeterminate = !allChecked && !!cur && cur.size>0;
    allCb.onchange = function(){
      setSet(allCb.checked ? null : new Set());
      F.trans=null; F.cross=null; F.dimAge=null;
      watchPage=1; rawPage=1; refresh();
    };
    allRow.appendChild(allCb); allRow.appendChild(document.createTextNode(' 전체'));
    panel.appendChild(allRow);

    if(options.length > 12){
      var search = document.createElement('input');
      search.type = 'search'; search.className = 'fsel-search'; search.placeholder = '검색';
      search.oninput = function(){
        var q = search.value.trim().toLowerCase();
        Array.prototype.forEach.call(listWrap.children, function(row){
          row.style.display = row.dataset.name.indexOf(q) < 0 ? 'none' : '';
        });
      };
      panel.appendChild(search);
    }

    var listWrap = document.createElement('div'); listWrap.className = 'fsel-list';
    options.forEach(function(o){
      var row = document.createElement('label'); row.className = 'fsel-opt';
      row.dataset.name = String(o[1]).toLowerCase();
      var cb = document.createElement('input'); cb.type = 'checkbox';
      cb.checked = !cur || cur.has(o[0]);
      cb.onchange = function(){
        var base = cur===null ? new Set(options.map(function(o2){ return o2[0]; })) : new Set(cur);
        if(cb.checked) base.add(o[0]); else base.delete(o[0]);
        setSet(base.size===options.length ? null : base);
        F.trans=null; F.cross=null; F.dimAge=null;
        watchPage=1; rawPage=1; refresh();
      };
      row.appendChild(cb);
      var txt = document.createElement('span'); txt.textContent = o[1]; row.appendChild(txt);
      if(o[2]!==undefined){
        var cnt = document.createElement('span'); cnt.className='cnt'; cnt.textContent = fmt(o[2]);
        row.appendChild(cnt);
      }
      listWrap.appendChild(row);
    });
    panel.appendChild(listWrap);
    wrap.appendChild(panel);
  }
  bar.appendChild(wrap);
}
function dimSummaryFromSet(set, options){
  if(!set) return null;
  if(!set.size) return '0개 선택';
  var byIdx = {}; options.forEach(function(o){ byIdx[o[0]]=o[1]; });
  var names = Array.from(set).map(function(idx){ return byIdx[idx]!==undefined ? byIdx[idx] : idx; });
  return names.length<=2 ? names.join(', ') : names[0]+' 외 '+(names.length-1)+'개';
}

function renderFilters(){
  var bar = $('filterBar'); bar.innerHTML = '';
  FILTER_DEFS.forEach(function(d){
    if(d.parent && !F.dim[d.parent] && !F.dim[d.key]) return;
    renderCheckDropdown(bar, d.key, d.label, optionsFor(d.key),
      function(){ return F.dim[d.key]; },
      function(v){ F.dim[d.key] = v; if(d.key==='sido' && v===null){ F.dim.office=null; F.dim.region=null; } });
  });

  var ageOpts = [];
  AGE_LABELS.forEach(function(l,i){ if(OPT_AGE[i] || ageHas(i)) ageOpts.push([i,l,OPT_AGE[i]]); });
  renderCheckDropdown(bar, 'age', '경과연수', ageOpts,
    function(){ return F.age; },
    function(v){ F.age = v; });

  var any = FILTER_DEFS.some(function(d){ return !!F.dim[d.key]; }) ||
            F.age || F.flag!==null || F.trans || F.cross || F.dimAge || F.resNoObsUn;
  if(any){
    var b = document.createElement('button');
    b.className='btn'; b.textContent='필터 초기화';
    b.onclick = resetAll;
    bar.appendChild(b);
  }
  renderChips();
}

var FLAG_LABELS = {};
FLAG_LABELS[F_YEAR]='사용승인연도 미기재'; FLAG_LABELS[F_ESTAB]='설립구분 미기재';
FLAG_LABELS[F_STATUS]='운용상태 비정상(사용 외)'; FLAG_LABELS[F_GRADE]='금차등급 누락/미지정';
FLAG_LABELS[F_CONFLICT]='등급·지적 불일치'; FLAG_LABELS[F_DROP]='등급 하락';
FLAG_LABELS[F_DECOMM]='불용·철거·제외';

function renderChips(){
  var box = $('activeChips'); box.innerHTML='';
  function chip(label, val, clear){
    var c = document.createElement('span'); c.className='chip';
    c.innerHTML = esc(label)+' <b>'+esc(val)+'</b>';
    var x = document.createElement('span'); x.className='x'; x.textContent='×';
    x.title='해제'; x.onclick=function(){ clear(); refresh(); };
    c.appendChild(x); box.appendChild(c);
  }
  FILTER_DEFS.forEach(function(d){
    var s = F.dim[d.key]; if(!s) return;
    var val;
    if(!s.size) val = '0개 선택(제외됨)';
    else {
      var names = Array.from(s).map(function(idx){ return DICT[d.key][idx]; });
      val = names.length<=3 ? names.join(', ') : names.slice(0,3).join(', ')+' 외 '+(names.length-3)+'개';
    }
    chip(d.label, val, function(){ F.dim[d.key]=null; if(d.key==='sido'){ F.dim.office=null; F.dim.region=null; } });
  });
  if(F.age){
    var an = Array.from(F.age).map(function(i){ return AGE_LABELS[i]; });
    var ageVal = !an.length ? '0개 선택(제외됨)' : (an.length<=3?an.join(', '):an.slice(0,3).join(', ')+' 외 '+(an.length-3)+'개');
    chip('경과연수', ageVal, function(){ F.age=null; });
  }
  if(F.flag!==null) chip('정합성', FLAG_LABELS[F.flag]||'—', function(){ F.flag=null; });
  if(F.trans) chip('등급 전이', DICT.prev[F.trans[0]]+' → '+DICT.cur[F.trans[1]], function(){ F.trans=null; });
  if(F.cross) chip('유형×설립', DICT.level[F.cross[0]]+' · '+DICT.estab[F.cross[1]], function(){ F.cross=null; });
  if(F.dimAge) chip(DIMAGE_LABELS[F.dimAge[0]]+'×경과연수',
    DICT[F.dimAge[0]][F.dimAge[1]]+' · '+AGE_LABELS[F.dimAge[2]], function(){ F.dimAge=null; });
  if(F.resNoObsUn) chip('해소상태(지속관찰 제외)', '미해소', function(){ F.resNoObsUn=null; });
}

function resetAll(){
  FILTER_DEFS.forEach(function(d){ F.dim[d.key]=null; });
  F.age=null; F.flag=null; F.trans=null; F.cross=null; F.dimAge=null; F.resNoObsUn=null;
  openFilterKey=null;
  watchPage=1; rawPage=1; refresh();
}

/* ══════════════════════════════════════════════════════════════
   6. 렌더 — 히어로 · KPI
   ══════════════════════════════════════════════════════════════ */
function scopeName(){
  if(F.dim.office) return dimSummary('office');
  if(F.dim.region) return dimSummary('region');
  if(F.dim.sido)  return dimSummary('sido');
  return '전국';
}

function renderHero(R){
  var scope = scopeName();
  var parts = [];
  FILTER_DEFS.forEach(function(d){
    if(d.key==='sido'||d.key==='office'||d.key==='region') return;
    var sm = dimSummary(d.key); if(sm) parts.push(sm);
  });
  if(F.age && F.age.size) parts.push(Array.from(F.age).map(function(i){ return AGE_LABELS[i]; }).join(', '));
  $('heroScope').textContent = scope + (parts.length ? ' · '+parts.join(' · ') : ' 전체');

  if(R.total===0){
    $('heroLine').innerHTML = '조건에 해당하는 시설이 없습니다.';
    $('heroDesc').textContent = '필터를 완화해 보세요.';
    $('heroSide').innerHTML = '';
    return;
  }
  $('heroLine').innerHTML = esc(scope)+' 점검 시설 '+fmt(R.total)+'개 중 <em>'+fmt(R.cde)+'개</em>가 C등급 이하입니다.';
  var worst = R.grades[3]+R.grades[4];
  $('heroDesc').textContent =
    'D·E등급 '+fmt(worst)+'개, 재해취약시설 '+fmt(R.fatvuln)+'개, 미해소 지적사항 '+fmt(R.unresolved)+'건이 확인되었습니다. '+
    '아래 카드를 클릭하면 대시보드 전체가 해당 범위로 좁혀집니다.';

  var side = [
    ['C등급 이하 비율', pctS(R.cde,R.total,2)],
    ['재해취약시설 비율', pctS(R.fatvuln,R.total,2)],
    ['40년 이상 비중', pctS(R.old40,R.total,1)]
  ];
  $('heroSide').innerHTML = side.map(function(s){
    return '<div class="hero-stat"><div class="k">'+esc(s[0])+'</div><div class="v">'+esc(s[1])+'</div></div>';
  }).join('');
}

function deltaBadge(rate, baseRate, higherIsBad){
  if(BASE === null || LAST === BASE) return null;
  var d = (rate - baseRate) * 100;
  if(Math.abs(d) < 0.05) return {text:'전국 수준', bad:false};
  var sign = d > 0 ? '+' : '−';
  return {text:'전국 대비 '+sign+Math.abs(d).toFixed(1)+'%p',
          bad: higherIsBad ? d > 0 : d < 0};
}

var CUR_C = idxOf('cur','C등급'), CUR_D = idxOf('cur','D등급'), CUR_E = idxOf('cur','E등급');
var CDE_IDXS = [CUR_C,CUR_D,CUR_E].filter(function(i){ return i>=0; });
var DE_IDXS  = [CUR_D,CUR_E].filter(function(i){ return i>=0; });

function renderKpis(R){
  var worst = R.grades[3]+R.grades[4];
  var isOld40On = !!(F.age && F.age.size===1 && F.age.has(5));
  var isFvOn = dimEquals('fatvulnType', DICT.fatvulnType.map(function(l,i){return i;}).filter(function(i){return i!==FV_NONE;}));
  var isUnresolvedOn = dimEquals('resolve', RESOLVE_UN>=0?[RESOLVE_UN]:[]);
  var deD = deltaBadge(R.total?worst/R.total:0, BASE.total?(BASE.grades[3]+BASE.grades[4])/BASE.total:0, true);
  var oldD = deltaBadge(R.total?R.old40/R.total:0, BASE.total?BASE.old40/BASE.total:0, true);

  var items = [
    {k:'점검 시설',  v:fmt(OFFICIAL.inspectedFacilities), sub:'완료 '+fmt(OFFICIAL.completedFacilities)+'개소('+OFFICIAL.completionRate.toFixed(2)+'%) · 현재 선택 '+fmt(R.total)+'개',
     ico:'domain', tint:'70,72,212', official:true, badge:'전국 기준'},
    {k:'재해취약시설', v:fmt(OFFICIAL.disasterVuln.total), sub:'대시보드 자체 집계(폭설위험 포함) '+fmt(R.fatvuln)+'개 · 현재 범위의 '+pctS(R.fatvuln,R.total,1),
     ico:'warning', tint:'224,56,79', official:true, badge:'구조'+OFFICIAL.disasterVuln.structRisk+'·붕괴'+OFFICIAL.disasterVuln.collapseRisk+'·화재'+OFFICIAL.disasterVuln.fireRisk,
     on:isFvOn, onClick:function(){
       var idxs = DICT.fatvulnType.map(function(l,i){return i;}).filter(function(i){return i!==FV_NONE;});
       dimSetExact('fatvulnType', idxs); watchPage=1; rawPage=1; refresh();
     }},
    {k:'지적사항',   v:fmt(OFFICIAL.findings.total), sub:'대시보드 자체 집계(고유 지적사항ID) 3,125건 · 조치계획별 세부는 아래 카드 참고',
     ico:'fact_check', tint:'70,72,212', official:true, badge:'보수보강 '+fmt(OFFICIAL.findings.action.보수보강)+'건'},
    {k:'40년 이상',  v:fmt(R.old40), sub:'노후 시설 비중 '+pctS(R.old40,R.total,1), ico:'foundation', tint:'70,72,212',
     badge:(oldD?oldD.text:pctS(BASE.old40,BASE.total,1)+' 전국'), bad:(oldD?oldD.bad:false),
     on:isOld40On, onClick:function(){ ageSetSingle(5); watchPage=1; rawPage=1; refresh(); }},
    {k:'D·E등급',    v:fmt(worst),  sub:'공식 133개소(D 123·E 10) 대비 현재 범위', ico:'emergency', tint:'224,56,79',
     badge:(deD?deD.text:'즉시 확인'), bad:worst>0,
     on:dimEquals('cur',DE_IDXS), onClick:function(){ dimSetExact('cur',DE_IDXS); watchPage=1; rawPage=1; refresh(); }},
    {k:'미해소 지적사항', v:fmt(R.unresolved), sub:'완전해소 '+fmt(R.resolved)+'건 대비 · 유지관리 잔여업무', ico:'pending_actions', tint:'224,164,22',
     badge:(R.unresolved?'조치 필요':'없음'), bad:R.unresolved>0,
     on:isUnresolvedOn, onClick:function(){
       dimSetExact('resolve', RESOLVE_UN>=0?[RESOLVE_UN]:[]); watchPage=1; rawPage=1; refresh();
     }}
  ];
  var host = $('kpis'); host.innerHTML='';
  items.forEach(function(it){
    var col = it.bad ? '224,56,79' : it.tint;
    var card = document.createElement('div');
    card.className = 'glass kpi'+(it.onClick?' clickable':'')+(it.on?' on':'');
    card.innerHTML =
      '<div class="kpi-top">'+
        '<div class="kpi-ico" style="background:rgba('+it.tint+',.12);color:rgb('+it.tint+')"><span class="material-symbols-outlined">'+it.ico+'</span></div>'+
        '<span class="kpi-badge" style="background:rgba('+col+',.13);color:rgb('+col+')">'+esc(it.badge)+'</span>'+
      '</div>'+
      '<div><div class="kpi-k">'+esc(it.k)+(it.official?officialBadge():'')+'</div><div class="kpi-v">'+esc(it.v)+'</div></div>'+
      '<div class="kpi-sub">'+esc(it.sub)+'</div>';
    if(it.onClick){
      card.tabIndex = 0;
      card.setAttribute('role','button');
      card.setAttribute('aria-pressed', it.on?'true':'false');
      card.onclick = it.onClick;
      card.onkeydown = function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); it.onClick(); } };
    }
    host.appendChild(card);
  });
}

/* ══════════════════════════════════════════════════════════════
   7. 렌더 — 공통 마크
   ══════════════════════════════════════════════════════════════ */
function stackEl(g, total){
  var s = document.createElement('div'); s.className='stack';
  for(var i=0;i<6;i++){
    if(!g[i]) continue;
    var seg = document.createElement('span');
    seg.style.flex = g[i]+' 0 0px';
    seg.style.background = i<5 ? GCOLOR[GRADES[i]] : GX;
    s.appendChild(seg);
  }
  if(!s.children.length){ var e=document.createElement('span');
    e.style.flex='1 0 0px'; e.style.background='rgba(70,72,212,.08)'; s.appendChild(e); }
  return s;
}
function barEl(value, max, color, avg){
  var w = document.createElement('div'); w.className='barwrap';
  var b = document.createElement('i');
  b.style.width = (max>0 ? Math.max(value/max*100, value>0?1.2:0) : 0)+'%';
  b.style.background = color;
  w.appendChild(b);
  if(avg!==undefined && max>0){
    var a=document.createElement('span'); a.className='avgline';
    a.style.left = Math.min(avg/max*100,100)+'%'; w.appendChild(a);
  }
  return w;
}
function gradeLegendHtml(extra){
  var h = GRADES.map(function(g){
    return '<span class="it"><i class="sw" style="background:'+GCOLOR[g]+'"></i>'+g+'</span>';
  }).join('');
  h += '<span class="it"><i class="sw" style="background:'+GX+'"></i>미지정/미기재</span>';
  return h + (extra||'');
}
function renderSeg(elId, list, cur, onPick){
  var box = $(elId); box.innerHTML='';
  list.forEach(function(s){
    var b=document.createElement('button');
    b.textContent=s[1]; b.setAttribute('aria-pressed', cur===s[0]?'true':'false');
    b.onclick=function(){ onPick(s[0]); };
    box.appendChild(b);
  });
}

/* ══════════════════════════════════════════════════════════════
   8. 렌더 — ③ 시도교육청
   ══════════════════════════════════════════════════════════════ */
var sidoSort = 'cde';
var SORTS = [['cde','C등급 이하율'],['ji','지적률'],['n','점검 건수']];

function renderSido(R){
  renderSeg('sidoSort', SORTS, sidoSort, function(v){ sidoSort=v; refresh(); });
  var B = R.dim.sido, rows = [];
  DICT.sido.forEach(function(lab,i){ if(B.n[i]>0) rows.push(i); });
  var key = sidoSort;
  rows.sort(function(a,b){
    if(key==='n') return B.n[b]-B.n[a];
    if(key==='ji') return (B.ji[b]/B.n[b])-(B.ji[a]/B.n[a]);
    return (B.cde[b]/B.n[b])-(B.cde[a]/B.n[a]);
  });

  var host = $('sidoChart'); host.innerHTML='';
  if(!rows.length){ host.innerHTML='<div class="empty">해당 조건의 데이터가 없습니다.</div>'; return; }

  var GRID = 'grid-template-columns:minmax(96px,1.35fr) minmax(90px,2.1fr) 62px 62px 58px';
  var head = document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  head.innerHTML = '<div>시도교육청</div><div>금차등급 구성</div>'+
    '<div style="text-align:right">건수</div><div style="text-align:right">C이하</div><div style="text-align:right">지적률</div>';
  host.appendChild(head);

  var list = document.createElement('div'); list.className='rows'; host.appendChild(list);
  var avgCde = R.total ? R.cde/R.total : 0;

  rows.forEach(function(i){
    var n=B.n[i], cde=B.cde[i], ji=B.ji[i], g=B.g.subarray(i*6,i*6+6);
    var r = document.createElement('div'); r.className='row'+(dimHas('sido',i)?' on':'');
    r.style.cssText=GRID; r.tabIndex=0;
    var nm = document.createElement('div'); nm.className='row-name'; nm.textContent=DICT.sido[i];
    var st = stackEl(g,n);
    var c1 = document.createElement('div'); c1.className='num strong'; c1.textContent=fmt(n);
    var c2 = document.createElement('div'); c2.className='num'; c2.textContent=pctS(cde,n,1);
    if(cde/n > avgCde*1.5 && n>=30) c2.style.color='var(--risk-5)', c2.style.fontWeight='800';
    var c3 = document.createElement('div'); c3.className='num'; c3.textContent=pctS(ji,n,2);
    r.appendChild(nm); r.appendChild(st); r.appendChild(c1); r.appendChild(c2); r.appendChild(c3);
    bindTip(r, function(){
      return '<b>'+esc(DICT.sido[i])+'</b><hr>'+
        tipRow('점검 시설', fmt(n)) + tipRow('C등급 이하', fmt(cde)+' ('+pctS(cde,n,2)+')') +
        tipRow('지적사항', fmt(ji)+'건') + '<hr>' + gradeTip(g,n);
    });
    r.onclick = function(){ dimSetSingle('sido',i); F.dim.office=null; F.dim.region=null; refresh(); };
    r.onkeydown = function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); r.onclick(); } };
    list.appendChild(r);
  });

  $('gradeLegend').innerHTML = gradeLegendHtml(
    '<span class="it" style="opacity:.8">클릭 → 해당 교육청으로 필터</span>');
}

/* ══════════════════════════════════════════════════════════════
   9. 렌더 — ④ 등급 전이 매트릭스
   ══════════════════════════════════════════════════════════════ */
var TRANS_ORDER = ['A등급','B등급','C등급','D등급','E등급','미지정','(미기재)'];
function orderedIdx(dim){
  var out=[]; TRANS_ORDER.forEach(function(l){ var k=idxOf(dim,l); if(k>=0) out.push([k,l]); });
  DICT[dim].forEach(function(l,i){ if(TRANS_ORDER.indexOf(l)<0) out.push([i,l]); });
  return out;
}

function renderTrans(R){
  var P = orderedIdx('prev'), C = orderedIdx('cur');
  var nCur = DICT.cur.length;
  var host = $('transChart'); host.innerHTML='';

  var grid = document.createElement('div'); grid.className='hm';
  grid.style.gridTemplateColumns = 'minmax(46px,auto) repeat('+C.length+',minmax(0,1fr))';

  var corner = document.createElement('div'); corner.className='hm-corner';
  corner.innerHTML = '전차 ↓<br>금차 →'; grid.appendChild(corner);
  C.forEach(function(c){
    var t=document.createElement('div'); t.className='hm-top';
    t.textContent = c[1].replace('등급','').replace('(미기재)','미기재'); grid.appendChild(t);
  });

  var max=0;
  P.forEach(function(p){ C.forEach(function(c){ var v=R.trans[p[0]*nCur+c[0]]; if(v>max) max=v; }); });
  var lmax = Math.log(max+1) || 1;

  P.forEach(function(p){
    var lbl=document.createElement('div'); lbl.className='hm-lbl';
    lbl.textContent = p[1].replace('등급','').replace('(미기재)','미기재'); grid.appendChild(lbl);
    var pr = GRADES.indexOf(p[1]);
    C.forEach(function(c){
      var v = R.trans[p[0]*nCur+c[0]];
      var cr = GRADES.indexOf(c[1]);
      var cell=document.createElement('div'); cell.className='hm-cell';
      var dir = (pr>=0&&cr>=0) ? (cr>pr?1:(cr<pr?-1:0)) : 0;
      var bg = NEUTRAL, ink='var(--on-surface-variant)';
      if(v>0){
        var t = Math.log(v+1)/lmax;
        if(dir>0){      bg = RISK[Math.min(RISK.length-1, Math.floor(t*RISK.length))]; ink=inkOn(bg); }
        else if(dir<0){ bg = IMP[Math.min(IMP.length-1, Math.floor(t*IMP.length))];   ink=inkOn(bg); }
        else{ var s=Math.floor(t*4); bg=['#efedf7','#e4e0ef','#d8d3e8','#cbc5e0','#bdb6d8'][Math.min(4,s)]; }
      }
      cell.style.background = bg; cell.style.color = ink;
      cell.textContent = v ? (v>=10000 ? (v/1000).toFixed(0)+'k' : fmt(v)) : '·';
      if(v===0){ cell.style.opacity='.45'; cell.style.cursor='default'; }
      if(F.trans && F.trans[0]===p[0] && F.trans[1]===c[0]) cell.className+=' on';
      cell.tabIndex = v? 0 : -1;
      bindTip(cell, function(){
        return '<b>'+esc(p[1])+' → '+esc(c[1])+'</b><hr>'+ tipRow('시설 수', fmt(v)) +
          (dir>0 ? '<div style="margin-top:5px;color:#f3a99a">▼ 등급 하락</div>' :
           dir<0 ? '<div style="margin-top:5px;color:#8fd8bb">▲ 등급 개선</div>' :
                   '<div style="margin-top:5px;opacity:.65">등급 유지</div>');
      });
      if(v) cell.onclick=function(){
        F.trans = (F.trans && F.trans[0]===p[0] && F.trans[1]===c[0]) ? null : [p[0],c[0]];
        watchPage=1; rawPage=1; refresh();
      };
      grid.appendChild(cell);
    });
  });
  host.appendChild(grid);

  var mv = document.createElement('div');
  mv.style.cssText='display:flex;gap:10px;margin-top:16px;flex-wrap:wrap';
  [['하락',R.dropped,'var(--g-d)'],['개선',R.improved,'var(--g-a)'],
   ['유지',R.total-R.dropped-R.improved,'var(--outline)']].forEach(function(m){
    mv.innerHTML += '<div style="flex:1 1 84px;padding:10px 12px;border-radius:12px;'+
      'background:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.9)">'+
      '<div style="font-family:var(--font-label);font-size:10px;font-weight:600;letter-spacing:.05em;'+
      'text-transform:uppercase;color:var(--on-surface-variant)">'+m[0]+'</div>'+
      '<div style="font-size:19px;font-weight:800;color:'+m[2]+';font-variant-numeric:tabular-nums">'+fmt(m[1])+'</div></div>';
  });
  host.appendChild(mv);

  $('transLegend').innerHTML =
    '<span class="ramp">등급 하락 <span class="steps">'+RISK.map(function(c){
      return '<i style="background:'+c+'"></i>'; }).join('')+'</span> 많음</span>'+
    '<span class="ramp">개선 <span class="steps">'+IMP.map(function(c){
      return '<i style="background:'+c+'"></i>'; }).join('')+'</span></span>'+
    '<span class="it"><i class="sw" style="background:#cbc5e0"></i>유지(중립)</span>';
}

/* ══════════════════════════════════════════════════════════════
   10. 렌더 — 공용 "임의 차원 × 경과연수" 히트맵
   ══════════════════════════════════════════════════════════════ */
var CROSS_BREAKS=[2,5,10,15,20];
function renderDimAgeHeatmap(R, dim, rows, hostId, legendId, cornerHtml, metricFn, rowLabelFn){
  var B = R.dimAge[dim], nA = 7, ages=[];
  var label = function(ri){ return rowLabelFn ? rowLabelFn(ri) : DICT[dim][ri]; };
  for(var a=0;a<nA;a++){
    var s=0; for(var r=0;r<rows.length;r++) s+=B.n[rows[r]*nA+a];
    if(s>0) ages.push(a);
  }

  var host=$(hostId); host.innerHTML='';
  if(!rows.length||!ages.length){ host.innerHTML='<div class="empty">데이터 없음</div>';
    if(legendId) $(legendId).innerHTML=''; return; }

  var grid=document.createElement('div'); grid.className='hm';
  grid.style.gridTemplateColumns='minmax(96px,auto) repeat('+(ages.length+1)+',minmax(0,1fr))';
  var corner=document.createElement('div'); corner.className='hm-corner';
  corner.innerHTML=cornerHtml; grid.appendChild(corner);
  ages.forEach(function(a){ var t=document.createElement('div'); t.className='hm-top';
    t.textContent=AGE_LABELS[a].replace('5년 미만','5미만').replace('40년 이상','40+'); grid.appendChild(t); });
  var tt=document.createElement('div'); tt.className='hm-top'; tt.textContent='소계'; grid.appendChild(tt);

  rows.forEach(function(ri){
    var lbl=document.createElement('div'); lbl.className='hm-lbl'; lbl.textContent=label(ri); grid.appendChild(lbl);
    var rowN=0,rowCde=0,rowJi=0,rowG=new Float64Array(6);
    ages.forEach(function(a){
      var c=ri*nA+a, n=B.n[c], cde=B.cde[c], ji=B.ji[c];
      rowN+=n; rowCde+=cde; rowJi+=ji;
      for(var q=0;q<6;q++) rowG[q]+=B.g[c*6+q];
      var cell=document.createElement('div'); cell.className='hm-cell';
      if(!n){ cell.style.background=NEUTRAL; cell.style.opacity='.4'; cell.textContent='·';
              cell.style.cursor='default'; grid.appendChild(cell); return; }
      var v = metricFn()==='cde' ? cde/n*100 : ji/n*100;
      var bg = RISK[Math.min(5, rampStep(v,CROSS_BREAKS))];
      cell.style.background=bg; cell.style.color=inkOn(bg);
      cell.textContent=fmt(n);
      cell.tabIndex=0;
      if(F.dimAge && F.dimAge[0]===dim && F.dimAge[1]===ri && F.dimAge[2]===a) cell.className+=' on';
      bindTip(cell, function(){
        return '<b>'+esc(label(ri))+' · '+esc(AGE_LABELS[a])+'</b><hr>'+tipRow('점검 시설',fmt(n))+
          tipRow('C등급 이하', fmt(cde)+' ('+pctS(cde,n,2)+')')+
          tipRow('지적사항', fmt(ji)+'건 ('+pctS(ji,n,2)+')')+'<hr>'+gradeTip(B.g.subarray(c*6,c*6+6),n);
      });
      cell.onclick=function(){
        F.dimAge = (F.dimAge && F.dimAge[0]===dim && F.dimAge[1]===ri && F.dimAge[2]===a) ? null : [dim,ri,a];
        watchPage=1; rawPage=1; refresh();
      };
      grid.appendChild(cell);
    });
    var sub=document.createElement('div'); sub.className='hm-cell';
    sub.style.background='rgba(70,72,212,.07)'; sub.style.color='var(--on-surface)';
    sub.style.cursor='default';
    sub.textContent = metricFn()==='cde' ? pctS(rowCde,rowN,1) : pctS(rowJi,rowN,2);
    sub.tabIndex=0;
    bindTip(sub, function(){
      return '<b>'+esc(label(ri))+' 전체</b><hr>'+tipRow('점검 시설',fmt(rowN))+
        tipRow('C등급 이하', fmt(rowCde)+' ('+pctS(rowCde,rowN,2)+')')+
        tipRow('지적사항', fmt(rowJi)+'건')+'<hr>'+gradeTip(rowG,rowN);
    });
    grid.appendChild(sub);
  });
  host.appendChild(grid);

  if(legendId){
    var lab = metricFn()==='cde' ? 'C등급 이하 비율' : '지적률';
    $(legendId).innerHTML =
      '<span class="ramp">'+lab+' 낮음 <span class="steps">'+RISK.map(function(c){
        return '<i style="background:'+c+'"></i>'; }).join('')+'</span> 높음</span>'+
      '<span class="it" style="opacity:.8">칸 안 숫자 = 점검 건수 · 소계 열 = '+lab+'</span>';
  }
}
function dimRowsByCount(dim, bucketN){
  var out=[];
  DICT[dim].forEach(function(l,i){ if(bucketN[i]>0) out.push(i); });
  out.sort(function(a,b){ return bucketN[b]-bucketN[a]; });
  return out;
}
function dimAgeTotals(R, dim){
  var B=R.dimAge[dim], nA=7, n=DICT[dim].length, out=new Float64Array(n);
  for(var i=0;i<n;i++){ var s=0; for(var a=0;a<nA;a++) s+=B.n[i*nA+a]; out[i]=s; }
  return out;
}

/* ══════════════════════════════════════════════════════════════
   11. 렌더 — ⑤ 40년 이상 노후시설 × 재해취약시설 (신규 카드 A, 최우선)
   ══════════════════════════════════════════════════════════════ */
var ageFatvulnMetric='cde';
function renderAgeFatvuln(R){
  renderSeg('ageFatvulnMetric',[['cde','C이하율'],['ji','지적률']],ageFatvulnMetric,
    function(v){ ageFatvulnMetric=v; refresh(); });
  var rows = DICT.fatvulnType.map(function(l,i){ return i; }).filter(function(i){ return i!==FV_NONE; });
  var totals = dimAgeTotals(R,'fatvulnType');
  rows.sort(function(a,b){ return totals[b]-totals[a]; });
  renderDimAgeHeatmap(R, 'fatvulnType', rows, 'ageFatvulnChart', 'ageFatvulnLegend',
    '재해취약유형 ↓<br>경과연수 →', function(){ return ageFatvulnMetric; });

  var B=R.dimAge.fatvulnType, nA=7;
  var old40n=0, old40fv=0, restN=0, restFv=0;
  for(var a=0;a<nA;a++){
    for(var ri=0;ri<rows.length;ri++){
      var n = B.n[rows[ri]*nA+a];
      if(a===5) old40fv += n; else restFv += n;
    }
  }
  old40n = R.age.n[5]; restN = R.total - old40n;
  var rateOld = old40n ? old40fv/old40n*100 : 0;
  var rateRest = restN ? restFv/restN*100 : 0;
  $('ageFatvulnNote').textContent = (old40n>0)
    ? '40년 이상 노후시설 중 재해취약시설 비중은 '+rateOld.toFixed(2)+'%로, 그 외 연령대('+rateRest.toFixed(2)+
      '%)의 '+(rateRest>0?(rateOld/rateRest).toFixed(1):'—')+'배입니다. 노후화와 재해취약 지정이 함께 나타나는 시설은 '+
      '개별 등급이 양호해도 "이중 위험" 관리 대상으로 우선 검토할 필요가 있습니다.'
    : '경과연수와 재해취약시설 지정의 교차 현황입니다.';
}

/* ══════════════════════════════════════════════════════════════
   12. 렌더 — ⑥ 학교급 × 설립구분
   ══════════════════════════════════════════════════════════════ */
var crossMetric='cde';
function renderCross(R){
  renderSeg('crossMetric',[['cde','C이하율'],['ji','지적률']],crossMetric,
    function(v){ crossMetric=v; refresh(); });

  var nE = DICT.estab.length;
  var levels=[], estabs=[];
  DICT.level.forEach(function(l,i){
    var s=0; for(var e=0;e<nE;e++) s+=R.cross.n[i*nE+e];
    if(s>0) levels.push([i,l,s]);
  });
  levels.sort(function(a,b){ return b[2]-a[2]; });
  DICT.estab.forEach(function(l,i){
    var s=0; for(var k=0;k<DICT.level.length;k++) s+=R.cross.n[k*nE+i];
    if(s>0) estabs.push([i,l]);
  });

  var host=$('crossChart'); host.innerHTML='';
  if(!levels.length||!estabs.length){ host.innerHTML='<div class="empty">데이터 없음</div>'; return; }

  var grid=document.createElement('div'); grid.className='hm';
  grid.style.gridTemplateColumns='minmax(78px,auto) repeat('+(estabs.length+1)+',minmax(0,1fr))';
  var corner=document.createElement('div'); corner.className='hm-corner';
  corner.innerHTML='유형 ↓<br>설립 →'; grid.appendChild(corner);
  estabs.forEach(function(e){ var t=document.createElement('div'); t.className='hm-top';
    t.textContent=e[1]; grid.appendChild(t); });
  var tt=document.createElement('div'); tt.className='hm-top'; tt.textContent='소계'; grid.appendChild(tt);

  levels.forEach(function(L){
    var lbl=document.createElement('div'); lbl.className='hm-lbl'; lbl.textContent=L[1]; grid.appendChild(lbl);
    var rowN=0,rowCde=0,rowJi=0,rowG=new Float64Array(6);
    estabs.forEach(function(E){
      var c=L[0]*nE+E[0], n=R.cross.n[c], cde=R.cross.cde[c], ji=R.cross.ji[c];
      rowN+=n; rowCde+=cde; rowJi+=ji;
      for(var q=0;q<6;q++) rowG[q]+=R.cross.g[c*6+q];
      var cell=document.createElement('div'); cell.className='hm-cell';
      if(!n){ cell.style.background=NEUTRAL; cell.style.opacity='.4'; cell.textContent='·';
              cell.style.cursor='default'; grid.appendChild(cell); return; }
      var v = crossMetric==='cde' ? cde/n*100 : ji/n*100;
      var bg = RISK[Math.min(5, rampStep(v,CROSS_BREAKS))];
      cell.style.background=bg; cell.style.color=inkOn(bg);
      cell.textContent=fmt(n);
      cell.tabIndex=0;
      if(F.cross && F.cross[0]===L[0] && F.cross[1]===E[0]) cell.className+=' on';
      bindTip(cell, function(){
        return '<b>'+esc(L[1])+' · '+esc(E[1])+'</b><hr>'+tipRow('점검 시설',fmt(n))+
          tipRow('C등급 이하', fmt(cde)+' ('+pctS(cde,n,2)+')')+
          tipRow('지적사항', fmt(ji)+'건 ('+pctS(ji,n,2)+')')+'<hr>'+gradeTip(R.cross.g.subarray(c*6,c*6+6),n);
      });
      cell.onclick=function(){
        F.cross = (F.cross && F.cross[0]===L[0] && F.cross[1]===E[0]) ? null : [L[0],E[0]];
        watchPage=1; rawPage=1; refresh();
      };
      grid.appendChild(cell);
    });
    var sub=document.createElement('div'); sub.className='hm-cell';
    sub.style.background='rgba(70,72,212,.07)'; sub.style.color='var(--on-surface)';
    sub.style.cursor='default';
    sub.textContent = crossMetric==='cde' ? pctS(rowCde,rowN,1) : pctS(rowJi,rowN,2);
    sub.tabIndex=0;
    bindTip(sub, function(){
      return '<b>'+esc(L[1])+' 전체</b><hr>'+tipRow('점검 시설',fmt(rowN))+
        tipRow('C등급 이하', fmt(rowCde)+' ('+pctS(rowCde,rowN,2)+')')+
        tipRow('지적사항', fmt(rowJi)+'건')+'<hr>'+gradeTip(rowG,rowN);
    });
    grid.appendChild(sub);
  });
  host.appendChild(grid);

  var lab = crossMetric==='cde' ? 'C등급 이하 비율' : '지적률';
  $('crossLegend').innerHTML =
    '<span class="ramp">'+lab+' 낮음 <span class="steps">'+RISK.map(function(c){
      return '<i style="background:'+c+'"></i>'; }).join('')+'</span> 높음</span>'+
    '<span class="it" style="opacity:.8">칸 안 숫자 = 점검 건수 · 소계 열 = '+lab+'</span>';
}

/* ══════════════════════════════════════════════════════════════
   13. 렌더 — ⑦ 재해취약시설 유형별 안전등급 (신규 카드 C)
   ══════════════════════════════════════════════════════════════ */
function renderFatvulnGrade(R){
  var B = R.dim.fatvulnType, list=[];
  DICT.fatvulnType.forEach(function(lab,i){ if(i!==FV_NONE && B.n[i]>0) list.push(i); });
  list.sort(function(a,b){ return (B.cde[b]/B.n[b])-(B.cde[a]/B.n[a]); });

  var host = $('fatvulnGradeChart'); host.innerHTML='';
  if(!list.length){ host.innerHTML='<div class="empty">데이터 없음</div>'; $('fatvulnGradeNote').textContent=''; return; }

  list.forEach(function(i){
    var lab=DICT.fatvulnType[i], n=B.n[i], cde=B.cde[i], ji=B.ji[i], p=cde/n*100;
    var g=B.g.subarray(i*6,i*6+6), small = n<50;
    var card = document.createElement('div');
    card.className='risk-card'+(dimHas('fatvulnType',i)?' on':'');
    card.tabIndex=0;
    var step = RISK[Math.min(5, rampStep(p,[2,5,10,15,20]))];
    var tag = (lab==='폭설위험')
      ? '<span class="tag" style="background:rgba(70,72,212,.12);color:var(--on-primary-fixed-variant)">보고서·공식 피벗 미포함 지표</span>'
      : small ? '<span class="tag" style="background:rgba(118,117,134,.16);color:var(--on-surface-variant)">표본 '+fmt(n)+'건 · 해석 주의</span>' : '';
    card.innerHTML =
      '<div class="rt"><span class="rname">'+esc(lab)+'</span>'+
      '<span class="rpct" style="color:'+(small?'var(--outline)':step)+'">'+p.toFixed(2)+'%</span></div>'+
      '<div class="rmeta">'+fmt(n)+'개 시설 · C이하 '+fmt(cde)+'개 · 지적 '+fmt(ji)+'건</div>'+
      '<div class="rbar"></div>'+tag;
    card.querySelector('.rbar').appendChild(stackEl(g,n));
    bindTip(card, function(){
      return '<b>'+esc(lab)+'</b><hr>'+tipRow('점검 시설',fmt(n))+
        tipRow('C등급 이하', fmt(cde)+' ('+p.toFixed(2)+'%)')+
        tipRow('지적사항', fmt(ji)+'건')+'<hr>'+gradeTip(g,n);
    });
    card.onclick=function(){ dimSetSingle('fatvulnType',i); refresh(); };
    card.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();card.onclick();} };
    host.appendChild(card);
  });

  $('fatvulnGradeLegend').innerHTML = gradeLegendHtml();
  $('fatvulnGradeNote').textContent =
    '공식 재해취약시설 통계(구조·붕괴·화재·건설공사장, 총 '+fmt(OFFICIAL.disasterVuln.total)+'개소)는 폭설위험시설을 포함하지 않습니다. '+
    '이 대시보드는 원본 데이터에 있는 폭설위험시설도 함께 집계해 별도 유형으로 보여줍니다.';
}

/* ══════════════════════════════════════════════════════════════
   14. 렌더 — ⑧ 노후시설 × 조치계획 심각도 (신규 카드 B)
   ══════════════════════════════════════════════════════════════ */
var AGE_ACTION_MIN_SAMPLE = 50;   // 이하는 고심각도 비율이 소수 건수 변화로 크게 흔들려 해석 주의
var ACTION_REAL_IDXS = ACTION_ORDER.map(function(a){ return idxOf('action',a); }).filter(function(i){ return i>=0; });
function ageActionOn(a){
  return ageHas(a) && F.age.size===1 && dimEquals('action', ACTION_REAL_IDXS);
}
function renderAgeAction(R){
  var B = R.dimAge.action, nA=7;
  var actionIdx = ACTION_ORDER.map(function(a){ return idxOf('action',a); });
  var host=$('ageActionChart'); host.innerHTML='';

  var GRID='grid-template-columns:minmax(64px,.85fr) minmax(90px,2.4fr) 58px 70px';
  var head=document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  head.innerHTML='<div>경과연수</div><div>조치계획 구성</div>'+
    '<div style="text-align:right">지적건수</div><div style="text-align:right">고심각도</div>';
  host.appendChild(head);

  var wrap=document.createElement('div'); wrap.className='rows'; host.appendChild(wrap);
  var any=false, smallRows=[];
  for(var a=0;a<7;a++){
    (function(a){
      var counts = actionIdx.map(function(ai){ return ai>=0 ? B.n[ai*nA+a] : 0; });
      var total = counts.reduce(function(s,v){ return s+v; },0);
      if(!total) return;
      any=true;
      var small = total < AGE_ACTION_MIN_SAMPLE;
      if(small) smallRows.push(AGE_LABELS[a]);
      var high = counts[0]+counts[1];   // 정밀안전진단 + 정밀안전점검
      var r=document.createElement('div'); r.className='row'+(ageActionOn(a)?' on':''); r.style.cssText=GRID; r.tabIndex=0;
      var nm=document.createElement('div');
      nm.innerHTML = '<div class="row-name">'+esc(AGE_LABELS[a])+'</div>'+
        (small ? '<span class="tag" style="background:rgba(118,117,134,.16);color:var(--on-surface-variant);margin-top:4px">표본 '+fmt(total)+'건 · 해석 주의</span>' : '');
      var stack=document.createElement('div'); stack.className='stack';
      counts.forEach(function(v,k){
        if(!v) return;
        var seg=document.createElement('span'); seg.style.flex=v+' 0 0px'; seg.style.background=ACTION_COLOR[k];
        stack.appendChild(seg);
      });
      var c1=document.createElement('div'); c1.className='num'; c1.textContent=fmt(total);
      var c2=document.createElement('div'); c2.className='num strong'; c2.textContent=pctS(high,total,1);
      if(small) c2.style.color='var(--outline)';
      else if(high) c2.style.color='var(--risk-5)';
      r.appendChild(nm); r.appendChild(stack); r.appendChild(c1); r.appendChild(c2);
      bindTip(r, function(){
        var s='<b>'+AGE_LABELS[a]+'</b><hr>';
        ACTION_ORDER.forEach(function(act,k){ if(counts[k]) s+=tipRow(act, fmt(counts[k])); });
        return s+'<hr>'+tipRow('합계', fmt(total)+'건')+
          (small?'<hr><div style="opacity:.7;font-size:11px">표본이 '+fmt(total)+'건이라 비율 변동이 큽니다.</div>':'')+
          '<hr><div style="opacity:.7;font-size:11px">클릭 → 이 연령대의 지적사항 있는 시설을 Raw 데이터·즉시조치 표에서 봅니다</div>';
      });
      /* 이 카드의 "행"은 단일 dict 차원 값이 아니라 경과연수 그 자체이므로, 기존
         dimSetExact 토글을 그대로 재사용하면(같은 값이 이미 켜진 상태에서 다른 행을
         클릭할 때 action 필터만 어긋나게 꺼져 버리는 문제) 두 필터(F.age/F.dim.action)를
         함께 명시적으로 켜고 끄는 전용 핸들러를 쓴다. */
      r.onclick = function(){
        if(ageActionOn(a)){ F.age=null; F.dim.action=null; }
        else { F.age=new Set([a]); F.dim.action=new Set(ACTION_REAL_IDXS); }
        watchPage=1; rawPage=1; refresh();
      };
      r.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();r.onclick();} };
      wrap.appendChild(r);
    })(a);
  }
  if(!any){ host.innerHTML='<div class="empty">데이터 없음</div>'; $('ageActionLegend').innerHTML=''; $('ageActionNote').textContent=''; return; }

  $('ageActionLegend').innerHTML = ACTION_ORDER.map(function(a,k){
    return '<span class="it"><i class="sw" style="background:'+ACTION_COLOR[k]+'"></i>'+a+'</span>';
  }).join('');

  var oldHigh=0, oldTotal=0, newHigh=0, newTotal=0;
  actionIdx.forEach(function(ai,k){
    if(ai<0) return;
    var vOld = B.n[ai*nA+5], vNew = B.n[ai*nA+0];
    oldTotal += vOld; newTotal += vNew;
    if(k<2){ oldHigh += vOld; newHigh += vNew; }
  });
  var noteText = (oldTotal>0 && newTotal>0)
    ? '40년 이상 시설 지적사항 중 정밀안전진단·정밀안전점검(최고 심각도) 비중은 '+pctS(oldHigh,oldTotal,1)+
      '로, 5년 미만 시설('+pctS(newHigh,newTotal,1)+')보다 높습니다. 단순히 지적 건수가 많은 것이 아니라 '+
      '요구되는 조치의 심각도 자체가 노후시설에서 커진다는 뜻입니다.'
    : '연령대별 지적사항 조치계획(정밀안전진단→현지시정 순, 진할수록 심각) 구성입니다.';
  if(smallRows.length){
    noteText += ' 표본이 '+AGE_ACTION_MIN_SAMPLE+'건 미만인 '+smallRows.join(', ')+' 구간은 지적 건수 하나만 바뀌어도 고심각도 비율이 크게 흔들릴 수 있어, '+
      '다른 연령대와 직접 비교하기보다는 참고용으로만 보는 것이 좋습니다.';
  }
  $('ageActionNote').textContent = noteText;
}

/* ══════════════════════════════════════════════════════════════
   15. 렌더 — ⑨ 지적사항 해소상태(시도별) (신규 카드 D)

   v1 수정: 미해소율은 resolve가 아니라 resolveNoObs(=조치계획 "지속관찰"인 지적사항을
   제외하고 롤업한 해소상태, build_data_thaw.py 참고)로 계산한다. "지속관찰"은 계속
   모니터링하는 상태라 해소상태가 거의 항상 "미해소"로 남아 있어서(사용자 확인),
   그대로 포함하면 지속관찰 비중이 큰 시도가 실제보다 훨씬 나쁜 미해소율로 보이는
   왜곡이 생기기 때문이다. 이 카드의 KPI·필터바 "해소상태"·즉시조치 기준은 여전히
   지속관찰을 포함하는 일반 resolve 정의를 쓰며, 이 카드 하나만 다르다.
   ══════════════════════════════════════════════════════════════ */
function renderResolveBySido(R){
  var host = $('resolveChart'); host.innerHTML='';
  var rows = [];
  DICT.sido.forEach(function(l,i){
    var un = R.sidoResolveNoObs[i*nResolveNoObs+RESOLVE_NOOBS_UN],
        done = R.sidoResolveNoObs[i*nResolveNoObs+RESOLVE_NOOBS_DONE];
    if(un+done>0) rows.push([i, un, done]);
  });
  if(!rows.length){ host.innerHTML='<div class="empty">지적사항이 있는 시설이 없습니다.</div>'; $('resolveLegend').innerHTML=''; $('resolveNote').textContent=''; return; }
  rows.sort(function(a,b){ return (b[1]/(b[1]+b[2])) - (a[1]/(a[1]+a[2])); });

  var GRID='grid-template-columns:minmax(90px,1.2fr) minmax(90px,2fr) 56px 70px';
  var head=document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  head.innerHTML='<div>시도교육청</div><div>미해소·완전해소 구성비 / 조치계획</div>'+
    '<div style="text-align:right">지적건수</div><div style="text-align:right">미해소율</div>';
  host.appendChild(head);

  /* v1 수정 2(개정): 한 막대 안에서 테두리로 미해소/완전해소를 구분하려던 첫 시도는
     (a) actionCluster 래퍼에 overflow:hidden을 빠뜨려 다른 카드와 달리 모서리가
     각지게 보였고 (b) 테두리 색이 안쪽 조치계획 색과 겹쳐 잘 안 보인다는 피드백을
     받았다. 그래서 "채움=조치계획 / 테두리=해소여부"를 한 막대에 욱여넣는 대신
     2단으로 분리한다 — 위쪽 얇은 띠(5px)는 다른 카드의 .stack과 똑같은 방식으로
     미해소=빨강·완전해소=초록만 순수하게 보여주고, 아래쪽 막대(14px)는 그 두 구간을
     그대로 이어받아 조치계획별 색으로 세분화한다. 두 신호가 서로 다른 층에 있어
     대비 문제 없이 항상 또렷하게 보인다. */
  function actionCluster(i, grp, groupTotal){
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:1px;height:100%;flex:'+groupTotal+' 0 0px;min-width:0;'+
      'border-radius:3px;overflow:hidden';
    var base = (i*2+grp)*nActionSlots;
    ACTION_ORDER.forEach(function(act,k){
      var v = R.sidoResolveAction[base+k]; if(!v) return;
      var seg=document.createElement('span');
      seg.style.cssText='display:block;flex:'+v+' 0 0px;background:'+ACTION_COLOR[k]+';height:100%';
      wrap.appendChild(seg);
    });
    return wrap;
  }
  function actionBreakdownHtml(i, grp){
    var base = (i*2+grp)*nActionSlots, s='';
    ACTION_ORDER.forEach(function(act,k){
      var v = R.sidoResolveAction[base+k]; if(v) s += tipRow(act, fmt(v));
    });
    return s;
  }

  var wrap=document.createElement('div'); wrap.className='rows'; host.appendChild(wrap);
  rows.forEach(function(row){
    var i=row[0], un=row[1], done=row[2], total=un+done, rate=un/total*100;
    var on = F.resNoObsUn && dimHas('sido', i) && F.dim.sido && F.dim.sido.size===1;
    var r=document.createElement('div'); r.className='row'+(on?' on':''); r.style.cssText=GRID; r.tabIndex=0;
    var nm=document.createElement('div'); nm.className='row-name'; nm.textContent=DICT.sido[i];

    var col=document.createElement('div'); col.style.cssText='display:flex;flex-direction:column;gap:3px;min-width:60px';
    var topStrip=document.createElement('div'); topStrip.className='stack'; topStrip.style.cssText='height:5px;min-width:60px';
    if(un){   var t1=document.createElement('span'); t1.style.flex=un+' 0 0px';   t1.style.background=RESOLVE_COLOR['미해소'];   topStrip.appendChild(t1); }
    if(done){ var t2=document.createElement('span'); t2.style.flex=done+' 0 0px'; t2.style.background=RESOLVE_COLOR['완전해소']; topStrip.appendChild(t2); }
    var bottomBar=document.createElement('div'); bottomBar.style.cssText='display:flex;gap:3px;height:14px;min-width:60px';
    if(un)   bottomBar.appendChild(actionCluster(i, 0, un));
    if(done) bottomBar.appendChild(actionCluster(i, 1, done));
    col.appendChild(topStrip); col.appendChild(bottomBar);

    var c1=document.createElement('div'); c1.className='num'; c1.textContent=fmt(total);
    var c2=document.createElement('div'); c2.className='num strong'; c2.textContent=rate.toFixed(1)+'%';
    c2.style.color = rate>=70 ? 'var(--risk-5)' : 'var(--on-surface)';
    r.appendChild(nm); r.appendChild(col); r.appendChild(c1); r.appendChild(c2);
    bindTip(r, function(){
      return '<b>'+esc(DICT.sido[i])+'</b><hr>'+
        '<div style="font-weight:800;margin-bottom:2px">미해소 '+fmt(un)+'건 — 조치계획별</div>'+
        (actionBreakdownHtml(i,0) || '<div style="opacity:.6">해당 없음</div>')+
        '<div style="font-weight:800;margin:6px 0 2px">완전해소 '+fmt(done)+'건 — 조치계획별</div>'+
        (actionBreakdownHtml(i,1) || '<div style="opacity:.6">해당 없음</div>')+
        '<hr>'+tipRow('미해소율', rate.toFixed(1)+'%')+
        '<div style="margin-top:5px;opacity:.7;font-size:11px">위 얇은 띠 = 미해소·완전해소 비율, 아래 막대 = 조치계획 세부. 조치계획 "지속관찰"인 지적사항은 제외한 수치입니다. 클릭 → Raw 데이터에서 이 시도의 미해소 시설만 봅니다.</div>';
    });
    r.onclick=function(){
      if(on){ F.dim.sido=null; F.dim.office=null; F.dim.region=null; F.resNoObsUn=null; }
      else { dimSetSingle('sido',i); F.dim.office=null; F.dim.region=null; F.resNoObsUn=true; }
      watchPage=1; rawPage=1; refresh();
    };
    r.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();r.onclick();} };
    wrap.appendChild(r);
  });

  var actionLegend = ACTION_ORDER.map(function(a,k){
    return '<span class="it"><i class="sw" style="background:'+ACTION_COLOR[k]+'"></i>'+a+'</span>';
  }).join('');
  var resolveLegendHtml =
    '<span class="it"><i class="sw" style="background:'+RESOLVE_COLOR['미해소']+'"></i>미해소(위 띠)</span>'+
    '<span class="it"><i class="sw" style="background:'+RESOLVE_COLOR['완전해소']+'"></i>완전해소(위 띠)</span>';
  $('resolveLegend').innerHTML =
    '<span style="width:100%;display:flex;flex-wrap:wrap;gap:12px">'+resolveLegendHtml+'</span>'+
    '<span style="width:100%;display:flex;flex-wrap:wrap;gap:12px;margin-top:2px">'+actionLegend+'</span>';
  var worst = rows[0];
  $('resolveNote').textContent = worst
    ? DICT.sido[worst[0]]+'의 미해소율이 '+(worst[1]/(worst[1]+worst[2])*100).toFixed(1)+
      '%로 가장 높습니다. 지적사항 자체보다 "얼마나 방치되고 있는지"가 유지관리 우선순위 판단에 더 중요할 수 있습니다. '+
      '조치계획이 "지속관찰"인 지적사항은 성격상 계속 미해소로 남는 경우가 대부분이라 이 비율 계산에서 제외했습니다.'
    : '';
}

/* ══════════════════════════════════════════════════════════════
   16. 렌더 — ⑩ 우선관리 스코어 TOP 30 (신규 카드 E)
   ══════════════════════════════════════════════════════════════ */
function scoreColor(s){
  if(s>=70) return '#7d1714';
  if(s>=50) return '#a02620';
  if(s>=30) return '#d15845';
  if(s>=15) return '#6164dc';
  return '#a5a7ef';
}
function renderPriorityScore(R){
  var idx = Array.prototype.slice.call(R.rowIdx);
  idx.sort(function(a,b){ return SCORE[b]-SCORE[a]; });
  var top = idx.slice(0,30);
  var host = $('scoreChart'); host.innerHTML='';
  if(!top.length){ host.innerHTML='<div class="empty">데이터 없음</div>'; return; }

  /* v1 수정 4: 열 순서를 시도 → 학교·기관/시설 순으로 바꾸고(요청사항), 학교명+
     시설명을 Raw 데이터 표처럼 한 줄에 이어 붙인다(구분자 " · "). */
  var GRID='grid-template-columns:26px minmax(80px,.9fr) minmax(140px,1.5fr) 1fr 52px';
  var head=document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  head.innerHTML='<div>#</div><div>시도</div><div>학교·기관 / 시설</div><div>산정 근거</div><div style="text-align:right">스코어</div>';
  host.appendChild(head);

  var wrap=document.createElement('div'); wrap.className='rows'; host.appendChild(wrap);
  top.forEach(function(i,k){
    var y=YR[i], age = y ? BASE_YEAR-y : null;
    var fv = FV[i], fvTypes = fvTypesOf(i);
    var cur = DICT.cur[COL.cur[i]];
    var ji = JI[i];
    var actionLabel = DICT.action[COL.action[i]];
    var school = DICT.school[COL.school[i]], fac = DICT.fac[COL.fac[i]];

    var chipsHtml = '';
    if(age!=null && age>=40) chipsHtml += '<span class="score-chip">40년+('+age+'년)</span>';
    else if(age!=null) chipsHtml += '<span class="score-chip">'+age+'년</span>';
    fvTypes.forEach(function(t){ chipsHtml += fvChipHtml(t[0], t[1]); });
    chipsHtml += '<span class="score-chip">'+esc(cur)+'</span>';
    if(ji>0 && actionLabel && actionLabel!=='해당없음') chipsHtml += actionChipHtml(actionLabel, ji);
    else if(ji>0) chipsHtml += '<span class="score-chip">지적 '+ji+'건</span>';

    var r=document.createElement('div'); r.className='row'; r.style.cssText=GRID; r.tabIndex=0;
    var rank=document.createElement('div'); rank.className='num'; rank.textContent=(k+1);
    var sido=document.createElement('div'); sido.style.fontSize='12px'; sido.style.color='var(--on-surface-variant)';
    sido.textContent=DICT.sido[COL.sido[i]];
    var nm=document.createElement('div');
    nm.innerHTML='<div class="row-name">'+esc(school)+' <span style="font-weight:400;color:var(--on-surface-variant)">· '+esc(fac)+'</span></div>';
    var chipsWrap=document.createElement('div'); chipsWrap.className='score-chips';
    chipsWrap.innerHTML = chipsHtml;
    var sc=document.createElement('div'); sc.style.textAlign='right';
    sc.innerHTML='<span class="score-badge" style="background:'+scoreColor(SCORE[i])+'">'+SCORE[i]+'</span>';
    r.appendChild(rank); r.appendChild(sido); r.appendChild(nm); r.appendChild(chipsWrap); r.appendChild(sc);
    bindTip(r, function(){
      var fvTipLine = fvTypes.length ? fvTypes.map(function(t){return t[0];}).join(', ') : '해당없음';
      return '<b>'+esc(school)+' · '+esc(fac)+'</b><hr>'+
        tipRow('우선관리 스코어', SCORE[i]+'/100')+
        tipRow('경과연수', age!=null?(age+'년'):'미기재')+
        tipRow('재해취약시설', fv+'종('+esc(fvTipLine)+')')+
        tipRow('금차등급', cur)+
        tipRow('지적사항', fmt(ji)+'건'+(ji>0 && actionLabel ? ' · 최고심각도 '+esc(actionLabel) : ''))+
        '<hr><div style="opacity:.7;font-size:11px">클릭 → 아래 Raw 데이터 표에서 이 시설을 검색합니다</div>';
    });
    r.onclick=function(){
      var q = school+' '+fac;
      $('rawSearch').value = q; rawQuery = q; rawPage=1; renderRaw();
      var el = $('rawTitle'); if(el && el.scrollIntoView) el.scrollIntoView({behavior:'smooth', block:'start'});
    };
    r.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();r.onclick();} };
    wrap.appendChild(r);
  });
}

/* ══════════════════════════════════════════════════════════════
   17. 렌더 — ⑪ 시도별 재해취약시설 밀도 × 지적률 (신규 카드 F)
   ══════════════════════════════════════════════════════════════ */
/* v2 수정: 계산식 문서화 + "특정 시도 클릭 시 막대가 전부 100%로 깨지는" 버그 수정.
   ─────────────────────────────────────────────────────────────────────────
   ● 재해취약시설 밀도(%) = 그 시도의 재해취약시설 지정 건수(R.sidoFatvuln[i],
     fatvulnType≠'해당없음'인 시설 수 — 대시보드 자체 실시간 집계이며 폭설위험시설도
     포함한다. PDF 공식 8,772개소와는 정의가 달라 값이 다를 수 있음, 재해취약시설
     KPI 타일 설명 참고) ÷ 그 시도의 전체 점검 시설 수(B.n[i]) × 100.
   ● 지적률(%) = 그 시도 지적사항개수 합(B.ji[i]) ÷ 그 시도 시설 수(B.n[i]) × 100
     (시설 100개당 지적 건수 — 대시보드 전체에서 "지적률"이라 부르는 값과 동일한 정의).
   ● "이중 위험" = 재해취약시설 밀도와 지적률 두 지표 모두에서 동시에 상위 25%
     (75번째 백분위수 이상) 안에 드는 시도. 단일 지표로 정렬만 해서는 안 보이는
     "두 위험이 겹치는 지역"을 찾아내는 게 이 카드의 존재 이유다.
   ─────────────────────────────────────────────────────────────────────────
   ● 버그였던 부분: 막대 폭(barEl의 max 인자)과 이중위험 임계값(fvQ/jiQ)을 전부
     "현재 화면에 보이는 rows"에서만 계산했다. 그런데 rows는 R(현재 필터가 걸린
     결과)에서 나오므로, 사용자가 특정 시도 하나를 클릭해 전국 필터를 그 시도 하나로
     좁히면 rows에 그 시도 단 하나만 남는다 — 그러면 max(1개짜리 배열) = 자기 자신이
     되어 막대 폭이 항상 값/자기값×100 = 100%로 계산되고, 백분위수도 배열 크기가
     1이라 자기 자신이 곧 75번째 백분위수가 되어 "이중 위험"이 늘 참으로 나왔다.
     고친 방법: 막대 스케일(fvMax/jiMax)과 이중위험 임계값(fvQ/jiQ)은 항상 BASE
     (필터를 하나도 걸지 않은 최초 전국 집계, 오케스트레이션 섹션의 `BASE` 참고)에서
     계산한다 — BASE는 상단 필터·카드 클릭이 걸려도 절대 바뀌지 않는 고정 기준선이라,
     지금 화면에 몇 개 시도가 보이든 막대 폭이 "전국 대비 실제 크기"를 안정적으로
     유지한다. rows(어떤 시도를 목록에 나열할지)만 여전히 R(현재 필터 반영)을 쓴다
     — 특정 시도로 좁혔을 때 그 시도만 나열되는 건 다른 시도별 카드들과 동일한
     정상 동작이므로 그대로 둔다. */
function renderFatvulnDensity(R){
  var B = R.dim.sido, rows=[];
  DICT.sido.forEach(function(l,i){ if(B.n[i]>=30) rows.push(i); });
  if(!rows.length){ $('densityChart').innerHTML='<div class="empty">데이터 없음</div>'; $('densityNote').textContent=''; return; }

  var fvRate = {}, jiRate = {};
  rows.forEach(function(i){ fvRate[i]=R.sidoFatvuln[i]/B.n[i]*100; jiRate[i]=B.ji[i]/B.n[i]*100; });
  rows.sort(function(a,b){ return fvRate[b]-fvRate[a]; });

  var baseB = BASE.dim.sido, baseRows = [];
  DICT.sido.forEach(function(l,i){ if(baseB.n[i]>=30) baseRows.push(i); });
  var baseFvRate = {}, baseJiRate = {};
  baseRows.forEach(function(i){ baseFvRate[i]=BASE.sidoFatvuln[i]/baseB.n[i]*100; baseJiRate[i]=baseB.ji[i]/baseB.n[i]*100; });
  var fvSorted = baseRows.map(function(i){ return baseFvRate[i]; }).sort(function(a,b){return a-b;});
  var jiSorted = baseRows.map(function(i){ return baseJiRate[i]; }).sort(function(a,b){return a-b;});
  var q75 = function(arr){ return arr.length ? arr[Math.floor(arr.length*0.75)] : 0; };
  var fvQ = q75(fvSorted), jiQ = q75(jiSorted);
  var fvMax = Math.max.apply(null, fvSorted.concat([1]));
  var jiMax = Math.max.apply(null, jiSorted.concat([1]));

  var GRID='grid-template-columns:minmax(90px,1fr) minmax(120px,2fr) 96px 60px';
  var host=$('densityChart'); host.innerHTML='';
  var head=document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  head.innerHTML='<div>시도교육청</div><div>재해취약 밀도 / 지적률</div><div style="text-align:right">밀도 · 지적률</div><div style="text-align:right">구분</div>';
  host.appendChild(head);
  var wrap=document.createElement('div'); wrap.className='rows'; host.appendChild(wrap);

  var dual=0;
  rows.forEach(function(i){
    var isDual = fvRate[i]>=fvQ && jiRate[i]>=jiQ;
    if(isDual) dual++;
    var r=document.createElement('div'); r.className='row'; r.style.cssText=GRID; r.tabIndex=0;
    var nm=document.createElement('div'); nm.className='row-name'; nm.textContent=DICT.sido[i];
    var db=document.createElement('div'); db.className='dualbar';
    db.appendChild(barEl(fvRate[i], fvMax, 'var(--secondary)'));
    db.appendChild(barEl(jiRate[i], jiMax, 'var(--primary)'));
    var valCell=document.createElement('div'); valCell.className='num';
    valCell.innerHTML = fvRate[i].toFixed(2)+'% <span style="opacity:.55">/</span> '+jiRate[i].toFixed(2)+'%';
    var tagCell=document.createElement('div'); tagCell.style.textAlign='right';
    tagCell.innerHTML = isDual ? '<span class="tag" style="background:rgba(224,56,79,.14);color:#a02620;margin-top:0">이중 위험</span>' : '';
    r.appendChild(nm); r.appendChild(db); r.appendChild(valCell); r.appendChild(tagCell);
    bindTip(r, function(){
      return '<b>'+esc(DICT.sido[i])+'</b><hr>'+
        tipRow('재해취약시설 밀도', fvRate[i].toFixed(2)+'%')+
        tipRow('지적률', jiRate[i].toFixed(2)+'%')+
        '<hr>'+tipRow('전국 상위 25% 기준(밀도)', fvQ.toFixed(2)+'%')+tipRow('전국 상위 25% 기준(지적률)', jiQ.toFixed(2)+'%')+
        (isDual?'<hr><div style="opacity:.7;font-size:11px">두 지표 모두 상위 25% — 이중 위험 지역</div>':'');
    });
    r.onclick=function(){ dimSetSingle('sido',i); F.dim.office=null; F.dim.region=null; refresh(); };
    wrap.appendChild(r);
  });

  $('densityNote').innerHTML =
    '<span class="it" style="display:inline-flex;gap:5px;align-items:center"><i class="sw" style="background:var(--secondary)"></i>재해취약시설 밀도</span> · '+
    '<span class="it" style="display:inline-flex;gap:5px;align-items:center"><i class="sw" style="background:var(--primary)"></i>지적률</span> — '+
    (dual>0 ? fmt(dual)+'개 시도가 두 지표 모두 상위 25%(이중 위험)에 해당합니다.' : '두 지표 모두 상위 25%에 해당하는 지역은 없습니다.')+
    ' (막대 폭·이중위험 기준선은 항상 전국 무필터 기준값을 사용합니다.)';
}

/* ══════════════════════════════════════════════════════════════
   18. 렌더 — ⑫ 경과연수
   ══════════════════════════════════════════════════════════════ */
function renderAge(R){
  var host=$('ageChart'); host.innerHTML='';
  var B=R.age, any=false;
  for(var i=0;i<7;i++) if(B.n[i]>0) any=true;
  if(!any){ host.innerHTML='<div class="empty">데이터 없음</div>'; $('ageLegend').innerHTML=''; return; }

  var GRID='grid-template-columns:minmax(64px,.85fr) minmax(90px,2.4fr) 58px 58px';
  var head=document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  head.innerHTML='<div>경과연수</div><div>금차등급 구성</div>'+
    '<div style="text-align:right">건수</div><div style="text-align:right">C이하</div>';
  host.appendChild(head);

  var wrap=document.createElement('div'); wrap.className='rows'; host.appendChild(wrap);
  for(var a=0;a<7;a++){
    (function(a){
      var n=B.n[a]; if(!n) return;
      var cde=B.cde[a], ji=B.ji[a], g=B.g.subarray(a*6,a*6+6);
      var r=document.createElement('div'); r.className='row'+(ageHas(a)?' on':'');
      r.style.cssText=GRID; r.tabIndex=0;
      var nm=document.createElement('div'); nm.className='row-name'; nm.textContent=AGE_LABELS[a];
      var c1=document.createElement('div'); c1.className='num'; c1.textContent=fmt(n);
      var c2=document.createElement('div'); c2.className='num strong'; c2.textContent=pctS(cde,n,1);
      c2.style.color = RISK[Math.min(5, rampStep(cde/n*100, CROSS_BREAKS))];
      r.appendChild(nm); r.appendChild(stackEl(g,n)); r.appendChild(c1); r.appendChild(c2);
      bindTip(r, function(){
        return '<b>'+AGE_LABELS[a]+'</b><hr>'+tipRow('점검 시설',fmt(n))+
          tipRow('C등급 이하', fmt(cde)+' ('+pctS(cde,n,2)+')')+
          tipRow('지적사항', fmt(ji)+'건')+'<hr>'+gradeTip(g,n);
      });
      r.onclick=function(){ ageSetSingle(a); refresh(); };
      r.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();r.onclick();} };
      wrap.appendChild(r);
    })(a);
  }
  var oldRate = B.n[5] ? B.cde[5]/B.n[5]*100 : 0;
  var midRate = B.n[2] ? B.cde[2]/B.n[2]*100 : 0;
  var note=document.createElement('p'); note.className='note';
  note.textContent = (B.n[5] && B.n[2] && midRate>0)
    ? '40년 이상 시설의 C등급 이하 비율은 '+oldRate.toFixed(2)+'%로 10~19년('+midRate.toFixed(2)+'%)의 '+
      (oldRate/midRate).toFixed(1)+'배입니다.'
    : '사용승인연도 기준 경과연수이며, 연도 미기재 시설은 별도 구간으로 표시합니다.';
  host.appendChild(note);
  $('ageLegend').innerHTML = gradeLegendHtml();
}

/* ══════════════════════════════════════════════════════════════
   19. 렌더 — ⑬ 시설구조별 위험도 · ⑭~⑯ 구조/설립/점검방법 × 경과연수
   ══════════════════════════════════════════════════════════════ */
var structMetric='cde';
function renderStruct(R){
  renderSeg('structMetric',[['cde','C이하율'],['ji','지적률'],['n','건수']],structMetric,
    function(v){ structMetric=v; refresh(); });

  var B=R.dim.struct, list=[];
  DICT.struct.forEach(function(l,i){ if(B.n[i]>0) list.push(i); });
  list.sort(function(a,b){
    if(structMetric==='n') return B.n[b]-B.n[a];
    if(structMetric==='ji') return (B.ji[b]/B.n[b])-(B.ji[a]/B.n[a]);
    return (B.cde[b]/B.n[b])-(B.cde[a]/B.n[a]);
  });

  var host=$('structChart'); host.innerHTML='';
  if(!list.length){ host.innerHTML='<div class="empty">데이터 없음</div>'; return; }

  var GRID='grid-template-columns:minmax(96px,1.2fr) minmax(70px,2fr) 56px 54px';
  var head=document.createElement('div'); head.className='row-h'; head.style.cssText=GRID;
  var mlab = structMetric==='cde'?'C이하율':(structMetric==='ji'?'지적률':'건수');
  head.innerHTML='<div>시설구조</div><div>'+mlab+'</div>'+
    '<div style="text-align:right">건수</div><div style="text-align:right">'+mlab+'</div>';
  host.appendChild(head);

  var vals = list.map(function(i){
    return structMetric==='n' ? B.n[i] : (structMetric==='ji' ? B.ji[i]/B.n[i]*100 : B.cde[i]/B.n[i]*100);
  });
  var max = Math.max.apply(null, vals) || 1;
  var avg = structMetric==='n' ? 0 :
            (structMetric==='ji' ? (R.total?R.ji/R.total*100:0) : (R.total?R.cde/R.total*100:0));

  var wrap=document.createElement('div'); wrap.className='rows'; host.appendChild(wrap);
  list.forEach(function(i,k){
    var n=B.n[i], cde=B.cde[i], ji=B.ji[i], v=vals[k];
    var r=document.createElement('div'); r.className='row'+(dimHas('struct',i)?' on':'');
    r.style.cssText=GRID; r.tabIndex=0;
    var nm=document.createElement('div'); nm.className='row-name'; nm.textContent=DICT.struct[i];
    var color = structMetric==='n' ? SEQ[3] : RISK[Math.min(5, rampStep(v,CROSS_BREAKS))];
    var bw = barEl(v, max, color, structMetric==='n'?undefined:avg);
    var c1=document.createElement('div'); c1.className='num'; c1.textContent=fmt(n);
    var c2=document.createElement('div'); c2.className='num strong';
    c2.textContent = structMetric==='n' ? fmt(n) : v.toFixed(structMetric==='ji'?2:1)+'%';
    r.appendChild(nm); r.appendChild(bw); r.appendChild(c1); r.appendChild(c2);
    bindTip(r, function(){
      return '<b>'+esc(DICT.struct[i])+'</b><hr>'+tipRow('점검 시설',fmt(n))+
        tipRow('C등급 이하', fmt(cde)+' ('+pctS(cde,n,2)+')')+
        tipRow('지적사항', fmt(ji)+'건 ('+pctS(ji,n,2)+')')+'<hr>'+
        gradeTip(B.g.subarray(i*6,i*6+6),n)+
        (structMetric==='n'?'':'<hr><div style="opacity:.7;font-size:11px">세로선 = 현재 범위 평균 '+avg.toFixed(2)+'%</div>');
    });
    r.onclick=function(){ dimSetSingle('struct',i); refresh(); };
    r.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();r.onclick();} };
    wrap.appendChild(r);
  });
}

var structAgeMetric='cde';
function renderStructAge(R){
  renderSeg('structAgeMetric',[['cde','C이하율'],['ji','지적률']],structAgeMetric,
    function(v){ structAgeMetric=v; refresh(); });
  var rows = dimRowsByCount('struct', dimAgeTotals(R,'struct'));
  renderDimAgeHeatmap(R, 'struct', rows, 'structAgeChart', 'structAgeLegend',
    '구조 ↓<br>경과연수 →', function(){ return structAgeMetric; });
}

var estabAgeMetric='cde';
function renderEstabAge(R){
  renderSeg('estabAgeMetric',[['cde','C이하율'],['ji','지적률']],estabAgeMetric,
    function(v){ estabAgeMetric=v; refresh(); });
  var rows = dimRowsByCount('estab', dimAgeTotals(R,'estab'));
  renderDimAgeHeatmap(R, 'estab', rows, 'estabAgeChart', 'estabAgeLegend',
    '설립 ↓<br>경과연수 →', function(){ return estabAgeMetric; });

  var B=R.dimAge.estab, nA=7, oldA=5;
  var best=null, bestRate=-1;
  DICT.estab.forEach(function(l,i){
    if(l==='(미기재)') return;
    var n=B.n[i*nA+oldA]; if(n<30) return;
    var rate=B.cde[i*nA+oldA]/n*100;
    if(rate>bestRate){ bestRate=rate; best=l; }
  });
  $('estabAgeNote').textContent = best
    ? '40년 이상 노후시설 중 C등급 이하 비율이 가장 높은 설립구분은 '+best+'('+bestRate.toFixed(1)+'%)입니다 — 설립주체별 노후시설 투자 형평성 근거로 볼 수 있습니다.'
    : '설립구분별로 노후화 취약성에 차이가 있는지 확인합니다.';
}

var METHOD_PRIORITY = {'확인점검':1, '민관합동':2, '기관위탁':3, '자체점검':4};
var methodAgeMetric='cde';
function renderMethodAge(R){
  renderSeg('methodAgeMetric',[['cde','C이하율'],['ji','지적률']],methodAgeMetric,
    function(v){ methodAgeMetric=v; refresh(); });
  var totals = dimAgeTotals(R,'method');
  var rows=[];
  DICT.method.forEach(function(l,i){ if(totals[i]>0) rows.push(i); });
  rows.sort(function(a,b){
    return (METHOD_PRIORITY[DICT.method[a]]||99) - (METHOD_PRIORITY[DICT.method[b]]||99);
  });
  renderDimAgeHeatmap(R, 'method', rows, 'methodAgeChart', 'methodAgeLegend',
    '점검방법 ↓<br>경과연수 →', function(){ return methodAgeMetric; }, function(ri){
      var rank = METHOD_PRIORITY[DICT.method[ri]];
      return (rank ? '점검우선순위 '+rank+'순위 · ' : '') + DICT.method[ri];
    });

  var B=R.dimAge.method, nA=7, oldA=5;
  var selfIdx=idxOf('method','자체점검'), chkIdx=idxOf('method','확인점검');
  var selfN=selfIdx>=0?B.n[selfIdx*nA+oldA]:0, selfC=selfIdx>=0?B.cde[selfIdx*nA+oldA]:0;
  var chkN=chkIdx>=0?B.n[chkIdx*nA+oldA]:0, chkC=chkIdx>=0?B.cde[chkIdx*nA+oldA]:0;
  $('methodAgeNote').textContent = (selfN>0 && chkN>0)
    ? '점검우선순위는 확인점검 1순위·민관합동 2순위·기관위탁 3순위·자체점검 4순위(사용자 지정)입니다. '+
      '40년 이상 노후시설 중 확인점검(1순위)을 받은 시설의 C등급 이하 비율은 '+(chkC/chkN*100).toFixed(1)+
      '%로 자체점검(4순위, '+(selfC/selfN*100).toFixed(1)+'%)과 비교됩니다.'
    : '점검방법을 점검우선순위 순(확인점검 1순위 > 민관합동 2순위 > 기관위탁 3순위 > 자체점검 4순위)으로 정렬했습니다.';
}

/* ══════════════════════════════════════════════════════════════
   20. 렌더 — ⑰ 점검 품질 · 정합성
   ══════════════════════════════════════════════════════════════ */
function renderMethod(R){
  var B=R.dim.method, list=[];
  DICT.method.forEach(function(l,i){ if(B.n[i]>0) list.push(i); });
  list.sort(function(a,b){ return (B.ji[b]/B.n[b])-(B.ji[a]/B.n[a]); });

  var host=$('methodChart'); host.innerHTML='';
  if(!list.length){ host.innerHTML='<div style="opacity:.6;font-size:12px">데이터 없음</div>';
                    $('methodNote').textContent=''; return; }
  var max = Math.max.apply(null, list.map(function(i){ return B.ji[i]/B.n[i]*100; })) || 1;

  list.forEach(function(i){
    var n=B.n[i], ji=B.ji[i], cde=B.cde[i], v=ji/n*100;
    var row=document.createElement('div'); row.className='mrow'; row.tabIndex=0;
    row.style.cursor='pointer';
    var bg = RISK[Math.min(5, rampStep(v,[1,3,6,10,15]))];
    row.innerHTML = '<div class="mn">'+esc(DICT.method[i])+'</div>'+
      '<div class="mbar"><i style="width:'+Math.max(v/max*100,1.5)+'%;background:'+bg+'"></i></div>'+
      '<div class="mv">'+v.toFixed(2)+'%</div>';
    bindTip(row, function(){
      return '<b>'+esc(DICT.method[i])+'</b><hr>'+tipRow('점검 시설',fmt(n))+
        tipRow('지적사항', fmt(ji)+'건')+tipRow('지적률', v.toFixed(2)+'%')+
        tipRow('C등급 이하', fmt(cde)+' ('+pctS(cde,n,2)+')')+
        '<hr>'+tipRow('전체 대비 비중', pctS(n,R.total,1));
    });
    row.onclick=function(){ dimSetSingle('method',i); refresh(); };
    row.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();row.onclick();} };
    if(dimHas('method',i)) row.style.background='rgba(255,255,255,.12)', row.style.borderRadius='8px';
    host.appendChild(row);
  });

  var self = idxOf('method','자체점검');
  var selfShare = (self>=0 && R.total) ? B.n[self]/R.total*100 : 0;
  var selfRate  = (self>=0 && B.n[self]) ? B.ji[self]/B.n[self]*100 : 0;
  var hi = list[0], hiRate = B.n[hi] ? B.ji[hi]/B.n[hi]*100 : 0;
  $('methodNote').textContent = (self>=0 && B.n[self] && selfRate>0)
    ? '전체 점검의 '+selfShare.toFixed(1)+'%를 차지하는 자체점검의 지적률은 '+selfRate.toFixed(2)+
      '%로, '+DICT.method[hi]+'('+hiRate.toFixed(2)+'%)와 차이가 있습니다. 실제 시설 상태 차이인지 점검 강도 차이인지 표본 재점검으로 확인할 필요가 있습니다.'
    : '점검방법에 따라 지적률이 크게 달라집니다.';
}

function renderQuality(R){
  var items = [
    {f:F_YEAR,     n:R.flags[0], t:'사용승인연도 미기재', d:'노후도 산정 불가', i:'◷', c:'224,164,22'},
    {f:F_ESTAB,    n:R.flags[1], t:'설립구분 미기재', d:'설립주체별 분석에서 누락됩니다', i:'▤', c:'224,164,22'},
    {f:F_STATUS,   n:R.flags[2], t:'운용상태 "사용" 외', d:'불용·철거·착공·사용예정 등 — 대상 목록 정비 필요', i:'⊘', c:'118,117,134'},
    /* v1 수정 5: "운용상태 '사용' 외" 바로 아래에 붙는 하위 분류 — 착공·사용예정처럼
       "곧 사용될 상태"가 아니라 불용·철거·제외처럼 사실상 폐지·배제된 시설만 골라낸다.
       indent:true 로 렌더에서 들여쓰기 + "└" 표시를 붙여 상위 항목의 하위집합임을
       시각적으로 드러낸다. */
    {f:F_DECOMM,   n:R.flags[5], t:'└ 불용·철거·제외', d:'사실상 폐지·배제된 시설 — 즉시조치/집계 대상 재검토', i:'✕', c:'224,56,79', indent:true},
    {f:F_GRADE,    n:R.flags[3], t:'금차안전등급 누락/미지정', d:'등급 판정 결과 미입력', i:'∅', c:'224,56,79'},
    {f:F_CONFLICT, n:R.flags[4], t:'등급·지적 불일치', d:'A·B등급인데 지적 3건 이상', i:'⚖', c:'224,56,79'}
  ];
  var host=$('qualityList'); host.innerHTML='';
  items.forEach(function(it){
    var el=document.createElement('div');
    el.className='warn'+(F.flag===it.f?' on':'');
    el.tabIndex=0;
    if(it.indent) el.style.cssText='margin-left:22px;padding-top:6px;padding-bottom:6px;';
    if(!it.n){ el.style.opacity='.42'; el.style.cursor='default'; }
    el.innerHTML =
      '<div class="wi" style="background:rgba('+it.c+',.22);color:rgb('+it.c+')">'+it.i+'</div>'+
      '<div class="wt"><b>'+esc(it.t)+'</b><span>'+esc(it.d)+'</span></div>'+
      '<div class="wc">'+fmt(it.n)+(it.n? ' <span style="font-size:10px;font-weight:600;opacity:.6">'+
        pctS(it.n,R.total,1)+'</span>':'')+'</div>';
    if(it.n){
      el.onclick=function(){ F.flag=(F.flag===it.f?null:it.f); watchPage=1; rawPage=1; refresh(); };
      el.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();el.onclick();} };
      bindTip(el, function(){
        return '<b>'+esc(it.t)+'</b><hr>'+tipRow('해당 레코드', fmt(it.n)+'건')+
          tipRow('현재 범위 대비', pctS(it.n,R.total,2))+
          '<hr><div style="opacity:.7;font-size:11px">클릭하면 해당 레코드만 필터링됩니다 — 아래 Raw 데이터·즉시조치 표에도 그대로 연결됩니다</div>';
      });
    }
    host.appendChild(el);
  });
}

/* ══════════════════════════════════════════════════════════════
   21. 렌더 — ⑱ 워치리스트(즉시조치 검토 대상)
   watch 행: [sido,office,school,fac,ftype,struct,year,prev,cur,ji,reason,period,
              estab,level,method,opstat,region,kind,fatvulnType,action,resolve]
   ══════════════════════════════════════════════════════════════ */
var W_SIDO=0,W_OFFICE=1,W_SCHOOL=2,W_FAC=3,W_FTYPE=4,W_STRUCT=5,W_YEAR=6,W_PREV=7,W_CUR=8,W_JI=9,W_RSN=10,
    W_PERIOD=11,W_ESTAB=12,W_LEVEL=13,W_METHOD=14,W_OPSTAT=15,W_REGION=16,W_KIND=17,W_FV=18,W_ACTION=19,W_RESOLVE=20;

var DIMAGE_WATCH_FIELD = {struct:W_STRUCT, estab:W_ESTAB, method:W_METHOD, fatvulnType:W_FV, action:W_ACTION};

function watchAgeBucket(r){
  var y = parseInt(r[W_YEAR],10);
  if(!y) return 6;
  var a = BASE_YEAR - y;
  return a<5?0:a<10?1:a<20?2:a<30?3:a<40?4:5;
}
function watchHasFlag(r, flag){
  var y = parseInt(r[W_YEAR],10) || 0;
  switch(flag){
    case F_YEAR:     return !y;
    case F_ESTAB:    return r[W_ESTAB]==='(미기재)';
    case F_STATUS:   return r[W_OPSTAT]!=='사용';
    case F_DECOMM:   return r[W_OPSTAT]==='불용' || r[W_OPSTAT]==='철거' || r[W_OPSTAT]==='제외';
    case F_GRADE:    return r[W_CUR]==='미지정' || r[W_CUR]==='(미기재)' || r[W_CUR]==='-';
    case F_CONFLICT: return (r[W_CUR]==='A등급'||r[W_CUR]==='B등급') && r[W_JI]>=3;
    case F_DROP:     return r[W_RSN].indexOf('등급하락')>=0;
    default:         return true;
  }
}
function renderLocalFilterBar(hostId, state, onchange){
  var host = $(hostId); host.innerHTML='';
  function sel(label, key, values){
    var wrap = document.createElement('div'); wrap.className='fsel';
    var s = document.createElement('select'); s.setAttribute('aria-label', label);
    var html = '<option value="">전체 '+esc(label)+'</option>';
    values.forEach(function(v){
      html += '<option value="'+esc(v)+'"'+(state[key]===v?' selected':'')+'>'+esc(v)+'</option>';
    });
    s.innerHTML = html;
    s.onchange = function(){ state[key]=this.value; onchange(); };
    wrap.appendChild(s); host.appendChild(wrap);
  }
  function triSel(label, key, yesLabel, noLabel){
    var wrap = document.createElement('div'); wrap.className='fsel';
    var s = document.createElement('select'); s.setAttribute('aria-label', label);
    s.innerHTML =
      '<option value="all">전체('+esc(label)+' 무관)</option>'+
      '<option value="yes"'+(state[key]==='yes'?' selected':'')+'>'+esc(yesLabel)+'</option>'+
      '<option value="no"'+(state[key]==='no'?' selected':'')+'>'+esc(noLabel)+'</option>';
    s.onchange = function(){ state[key]=this.value; onchange(); };
    wrap.appendChild(s); host.appendChild(wrap);
  }
  sel('지역', 'region', DICT.sido);
  sel('학교급', 'level', DICT.level);
  sel('설립구분', 'estab', DICT.estab);
  sel('금차등급', 'cur', GRADES);
  sel('해소상태', 'resolve', ['미해소','완전해소']);
  triSel('등급변경', 'dropped', '등급변경 있음', '등급변경 없음');
  triSel('지적사항', 'hasJi', '지적사항 있음', '지적사항 없음');

  var any = state.region || state.level || state.estab || state.cur || state.resolve || state.dropped!=='all' || state.hasJi!=='all';
  if(any){
    var b = document.createElement('button'); b.className='btn'; b.textContent='필터 초기화';
    b.onclick = function(){
      state.region=''; state.level=''; state.estab=''; state.cur=''; state.resolve=''; state.dropped='all'; state.hasJi='all';
      onchange();
    };
    host.appendChild(b);
  }
}

var WATCH_COLS = [
  {t:'시도교육청', k:W_SIDO,  w:'150px'},
  {t:'교육지원청', k:W_OFFICE,w:'150px'},
  {t:'학교급',     k:W_LEVEL, w:'92px'},
  {t:'설립구분',   k:W_ESTAB, w:'76px'},
  {t:'학교·기관명', k:W_SCHOOL,w:'160px'},
  {t:'시설명',     k:W_FAC,   w:'150px'},
  {t:'승인연도',   k:W_YEAR,  w:'70px',  num:true},
  {t:'전차 → 금차', k:W_CUR,  w:'110px'},
  {t:'지적',       k:W_JI,    w:'48px',  num:true},
  {t:'재해취약유형', k:W_FV,  w:'96px'},
  {t:'해소상태',   k:W_RESOLVE,w:'80px'},
  {t:'운용상태',   k:W_OPSTAT,w:'76px'},
  {t:'사유',       k:W_RSN,   w:'150px'}
];
var GRANK={'A등급':1,'B등급':2,'C등급':3,'D등급':4,'E등급':5};
var watchPage=1, watchSort={k:W_CUR,dir:-1}, watchQuery='', watchMode='all', PAGE=20;
var watchFilter = {region:'', level:'', estab:'', cur:'', resolve:'', dropped:'all', hasJi:'all'};

function watchRows(){
  var out=[];
  var dimSel={};
  FILTER_DEFS.forEach(function(d){
    var s = F.dim[d.key];
    if(s) dimSel[d.key] = new Set(Array.from(s).map(function(idx){ return DICT[d.key][idx]; }));
  });
  var ageSel = F.age ? new Set(Array.from(F.age)) : null;
  var q = watchQuery.trim().toLowerCase();

  for(var i=0;i<D.watch.length;i++){
    var r=D.watch[i];
    if(dimSel.sido   && !dimSel.sido.has(r[W_SIDO])) continue;
    if(dimSel.office && !dimSel.office.has(r[W_OFFICE])) continue;
    if(dimSel.region && !dimSel.region.has(r[W_REGION])) continue;
    if(dimSel.ftype  && !dimSel.ftype.has(r[W_FTYPE])) continue;
    if(dimSel.cur    && !dimSel.cur.has(r[W_CUR])) continue;
    if(dimSel.estab  && !dimSel.estab.has(r[W_ESTAB])) continue;
    if(dimSel.level  && !dimSel.level.has(r[W_LEVEL])) continue;
    if(dimSel.method && !dimSel.method.has(r[W_METHOD])) continue;
    if(dimSel.struct && !dimSel.struct.has(r[W_STRUCT])) continue;
    if(dimSel.kind   && !dimSel.kind.has(r[W_KIND])) continue;
    if(dimSel.opstat && !dimSel.opstat.has(r[W_OPSTAT])) continue;
    if(dimSel.fatvulnType && !dimSel.fatvulnType.has(r[W_FV])) continue;
    if(dimSel.action && !dimSel.action.has(r[W_ACTION])) continue;
    if(dimSel.resolve && !dimSel.resolve.has(r[W_RESOLVE])) continue;
    if(F.cross && (r[W_LEVEL]!==DICT.level[F.cross[0]] ||
                   r[W_ESTAB]!==DICT.estab[F.cross[1]])) continue;
    if(F.trans && (r[W_PREV]!==DICT.prev[F.trans[0]] || r[W_CUR]!==DICT.cur[F.trans[1]])) continue;
    if(F.dimAge && (r[DIMAGE_WATCH_FIELD[F.dimAge[0]]]!==DICT[F.dimAge[0]][F.dimAge[1]] ||
                    watchAgeBucket(r)!==F.dimAge[2])) continue;
    if(ageSel && !ageSel.has(watchAgeBucket(r))) continue;
    if(F.flag !== null && !watchHasFlag(r, F.flag)) continue;
    if(watchMode==='de'   && GRANK[r[W_CUR]]<4) continue;
    if(watchMode==='drop' && r[W_RSN].indexOf('등급하락')<0) continue;
    if(watchMode==='many' && r[W_JI]<5) continue;
    if(watchMode==='fv'   && r[W_RSN].indexOf('재해취약')<0) continue;
    if(watchFilter.region && r[W_SIDO]!==watchFilter.region) continue;
    if(watchFilter.level  && r[W_LEVEL]!==watchFilter.level) continue;
    if(watchFilter.estab  && r[W_ESTAB]!==watchFilter.estab) continue;
    if(watchFilter.cur    && r[W_CUR]!==watchFilter.cur) continue;
    if(watchFilter.resolve && r[W_RESOLVE]!==watchFilter.resolve) continue;
    if(watchFilter.dropped==='yes' && r[W_RSN].indexOf('등급하락')<0) continue;
    if(watchFilter.dropped==='no'  && r[W_RSN].indexOf('등급하락')>=0) continue;
    if(watchFilter.hasJi==='yes'   && r[W_JI]<1) continue;
    if(watchFilter.hasJi==='no'    && r[W_JI]>=1) continue;
    if(q && (r[W_SCHOOL]+' '+r[W_FAC]+' '+r[W_SIDO]+' '+r[W_OFFICE]).toLowerCase().indexOf(q)<0) continue;
    out.push(r);
  }
  var k=watchSort.k, dir=watchSort.dir;
  out.sort(function(a,b){
    var x,y;
    if(k===W_CUR){ x=(GRANK[a[W_CUR]]||0)*100+a[W_JI]; y=(GRANK[b[W_CUR]]||0)*100+b[W_JI]; }
    else if(k===W_JI){ x=a[W_JI]; y=b[W_JI]; }
    else if(k===W_YEAR){ x=parseInt(a[W_YEAR],10)||9999; y=parseInt(b[W_YEAR],10)||9999; }
    else { x=a[k]; y=b[k]; return dir * String(x).localeCompare(String(y),'ko'); }
    return dir*(x-y);
  });
  return out;
}

function gradeChip(g){
  var m = GRADES.indexOf(g);
  var c = m>=0 ? GCOLOR[g] : GX;
  var label = m>=0 ? g.charAt(0) : '-';
  return '<span class="gr-badge" style="background:'+c+'" title="'+esc(g||'-')+'">'+label+'</span>';
}
function resolveChip(r){
  if(r==='해당없음'||!r) return '<span style="color:var(--on-surface-variant);opacity:.6">—</span>';
  var c = r==='미해소' ? RESOLVE_COLOR['미해소'] : RESOLVE_COLOR['완전해소'];
  return '<span class="rsn" style="background:'+c+'22;color:'+c+'">'+esc(r)+'</span>';
}
/* v1 수정 6: 즉시조치·Raw데이터 표에 "운용상태" 열 — 값마다 성격이 달라 색을 차등
   부여한다: 불용=빨강(위험/폐지), 철거=회색(이미 사라진 시설, 더 이상 관리 대상
   아님), 제외=호박색(행정상 제외, 재검토 필요), 착공·착공예정=인디고(진행 중),
   사용예정=청록(곧 정상화), 완공=초록(정상 상태로 전환), (미기재)=중립회색.
   "사용"(전체의 99% 이상)은 색 없이 그대로 텍스트만 표시해 이상 상태만 눈에 띄게 한다. */
var OPSTAT_COLOR = {
  '불용':'224,56,79', '철거':'118,117,134', '제외':'224,164,22',
  '착공':'70,72,212', '착공예정':'139,140,230', '사용예정':'0,108,73',
  '완공':'10,138,92', '(미기재)':'162,159,178'
};
function opstatChip(v){
  if(!v || v==='사용') return '<span style="color:var(--on-surface-variant)">'+esc(v||'—')+'</span>';
  var c = OPSTAT_COLOR[v] || '118,117,134';
  return '<span class="rsn" style="background:rgba('+c+',.14);color:rgb('+c+')">'+esc(v)+'</span>';
}
function reasonChip(r){
  var map={'D·E등급':['224,56,79'],'등급하락':['176,116,0'],'지적다발':['70,72,212'],'재해취약·미해소':['185,5,56']};
  return r.split('|').map(function(p){
    var c=(map[p]||['118,117,134'])[0];
    return '<span class="rsn" style="background:rgba('+c+',.14);color:rgb('+c+')">'+esc(p)+'</span>';
  }).join(' ');
}

function renderWatch(){
  renderSeg('watchFilter',[['all','전체'],['de','D·E등급'],['drop','등급 하락'],['many','지적 5건+'],['fv','재해취약·미해소']],
    watchMode, function(v){ watchMode=v; watchPage=1; renderWatch(); });
  renderLocalFilterBar('watchFilterBar', watchFilter, function(){ watchPage=1; renderWatch(); });

  var rows = watchRows();
  var pages = Math.max(1, Math.ceil(rows.length/PAGE));
  if(watchPage>pages) watchPage=pages;
  var slice = rows.slice((watchPage-1)*PAGE, watchPage*PAGE);

  $('watchHead').innerHTML = WATCH_COLS.map(function(c){
    var on = watchSort.k===c.k;
    return '<th data-k="'+c.k+'" style="width:'+c.w+(c.num?';text-align:center':'')+'"'+(on?' class="sorted"':'')+'>'+
      esc(c.t)+(on ? (watchSort.dir<0?' ▾':' ▴') : '')+'</th>';
  }).join('');
  Array.prototype.forEach.call($('watchHead').children, function(th){
    th.onclick=function(){
      var k=+th.getAttribute('data-k');
      if(watchSort.k===k) watchSort.dir*=-1; else { watchSort.k=k; watchSort.dir=(k===W_CUR||k===W_JI)?-1:1; }
      watchPage=1; renderWatch();
    };
  });

  if(!slice.length){
    $('watchBody').innerHTML='<tr><td colspan="'+WATCH_COLS.length+'" class="empty">'+
      '조건에 해당하는 즉시조치 대상이 없습니다.</td></tr>';
  } else {
    $('watchBody').innerHTML = slice.map(function(r){
      return '<tr>'+
        '<td>'+esc(r[W_SIDO])+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(r[W_OFFICE])+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(r[W_LEVEL])+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(r[W_ESTAB])+'</td>'+
        '<td style="font-weight:700">'+esc(r[W_SCHOOL])+'</td>'+
        '<td>'+esc(r[W_FAC])+'</td>'+
        '<td class="n" style="text-align:center">'+esc(r[W_YEAR]||'—')+'</td>'+
        '<td>'+gradeChip(r[W_PREV])+'<span class="arrow">→</span>'+gradeChip(r[W_CUR])+'</td>'+
        '<td class="n" style="text-align:center;font-weight:800'+(r[W_JI]>=5?';color:var(--risk-5)':'')+'">'+r[W_JI]+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(r[W_FV]==='해당없음'?'—':r[W_FV])+'</td>'+
        '<td>'+resolveChip(r[W_RESOLVE])+'</td>'+
        '<td>'+opstatChip(r[W_OPSTAT])+'</td>'+
        '<td>'+reasonChip(r[W_RSN])+'</td></tr>';
    }).join('');
  }

  $('watchInfo').textContent = rows.length
    ? fmt(rows.length)+'건 중 '+fmt((watchPage-1)*PAGE+1)+'–'+fmt(Math.min(watchPage*PAGE,rows.length))+'건 표시'
    : '표시할 항목이 없습니다.';

  var pg=$('watchPager'); pg.innerHTML='';
  function pbtn(label, page, dis, on){
    var b=document.createElement('button'); b.textContent=label; b.disabled=!!dis;
    if(on) b.className='on';
    if(!dis) b.onclick=function(){ watchPage=page; renderWatch(); };
    pg.appendChild(b);
  }
  if(pages>1){
    pbtn('‹', watchPage-1, watchPage<=1);
    var start=Math.max(1,Math.min(watchPage-2,pages-4)), end=Math.min(pages,start+4);
    for(var p=start;p<=end;p++) pbtn(String(p), p, false, p===watchPage);
    pbtn('›', watchPage+1, watchPage>=pages);
  }
}

/* ══════════════════════════════════════════════════════════════
   22. 렌더 — ⑲ Raw 데이터
   ══════════════════════════════════════════════════════════════ */
var RAW_COLS = [
  {k:'sido',   t:'시도교육청',   w:'104px'},
  {k:'office', t:'교육지원청',   w:'110px'},
  {k:'level',  t:'학교급',       w:'88px'},
  {k:'estab',  t:'설립구분',     w:'70px'},
  {k:'school', t:'학교·기관명',  w:'150px'},
  {k:'fac',    t:'시설명',       w:'150px'},
  {k:'struct', t:'구조',         w:'110px'},
  {k:'year',   t:'승인연도',     w:'68px',  num:true},
  {k:'trans',  t:'전차 → 금차',  w:'110px'},
  {k:'ji',     t:'지적',         w:'44px',  num:true},
  {k:'fatvulnType', t:'재해취약유형', w:'92px'},
  {k:'resolve', t:'해소상태',    w:'80px'},
  {k:'opstat', t:'운용상태',     w:'76px'},
  {k:'flag',   t:'특이사항',     w:'140px'}
];
var rawPage=1, rawSort=null, rawQuery='';
var rawFilter = {region:'', level:'', estab:'', cur:'', resolve:'', dropped:'all', hasJi:'all'};

function rawFlagLabels(i){
  var f = FLAG[i], out=[];
  [F_YEAR,F_ESTAB].forEach(function(bit){
    if(f & bit) out.push(FLAG_LABELS[bit]);
  });
  /* v1 수정 5: "운용상태 사용 외"이면서 그게 불용/철거/제외인 경우, 뭉뚱그린 일반
     라벨 대신 실제 운용상태 값을 그대로 하나씩 보여준다("각각 나타내줘" 요청사항).
     착공·사용예정 등 나머지 "사용 외" 상태는 기존처럼 일반 라벨을 유지한다. */
  /* v1 수정 6 후속: 이제 "운용상태" 전용 열이 불용/철거/제외 값을 그대로 보여주므로,
     특이사항 열에 또 같은 값을 중복으로 넣지 않는다(요청사항). 착공·사용예정 등
     나머지 "사용 외" 상태는 기존처럼 일반 라벨을 유지한다. */
  if((f & F_STATUS) && !(f & F_DECOMM)) out.push(FLAG_LABELS[F_STATUS]);
  [F_GRADE,F_CONFLICT].forEach(function(bit){
    if(f & bit) out.push(FLAG_LABELS[bit]);
  });
  if(f & F_DROP) out.push('등급하락');
  return out;
}
function rawField(i, k){
  switch(k){
    case 'sido':   return DICT.sido[COL.sido[i]];
    case 'office': return DICT.office[COL.office[i]];
    case 'region': return DICT.region[COL.region[i]];
    case 'level':  return DICT.level[COL.level[i]];
    case 'estab':  return DICT.estab[COL.estab[i]];
    case 'school': return DICT.school[COL.school[i]];
    case 'fac':    return DICT.fac[COL.fac[i]];
    case 'struct': return DICT.struct[COL.struct[i]];
    case 'ftype':  return DICT.ftype[COL.ftype[i]];
    case 'year':   return YR[i] || 0;
    case 'method': return DICT.method[COL.method[i]];
    case 'prev':   return DICT.prev[COL.prev[i]];
    case 'cur':    return DICT.cur[COL.cur[i]];
    case 'ji':     return JI[i];
    case 'period': return DICT.period[COL.period[i]];
    case 'fatvulnType': return DICT.fatvulnType[COL.fatvulnType[i]];
    case 'action': return DICT.action[COL.action[i]];
    case 'resolve': return DICT.resolve[COL.resolve[i]];
    case 'flag':   return rawFlagLabels(i).join(' ');
    case 'opstat': return DICT.opstat[COL.opstat[i]];
  }
}
function rawFlagChips(i){
  var labels = rawFlagLabels(i);
  if(!labels.length) return '';
  var map = {'등급하락':'176,116,0', '불용':'224,56,79', '철거':'224,56,79', '제외':'224,56,79'};
  return labels.map(function(l){
    var c = map[l] || '118,117,134';
    return '<span class="rsn" style="background:rgba('+c+',.14);color:rgb('+c+')">'+esc(l)+'</span>';
  }).join(' ');
}
function rawRows(){
  var idx = LAST.rowIdx, out=[], q = rawQuery.trim().toLowerCase();
  for(var n=0;n<idx.length;n++){
    var i = idx[n];
    if(rawFilter.region && rawField(i,'sido')!==rawFilter.region) continue;
    if(rawFilter.level  && rawField(i,'level')!==rawFilter.level) continue;
    if(rawFilter.estab  && rawField(i,'estab')!==rawFilter.estab) continue;
    if(rawFilter.cur    && rawField(i,'cur')!==rawFilter.cur) continue;
    if(rawFilter.resolve && rawField(i,'resolve')!==rawFilter.resolve) continue;
    if(rawFilter.dropped==='yes' && !(FLAG[i]&F_DROP)) continue;
    if(rawFilter.dropped==='no'  && (FLAG[i]&F_DROP)) continue;
    if(rawFilter.hasJi==='yes'   && JI[i]<1) continue;
    if(rawFilter.hasJi==='no'    && JI[i]>=1) continue;
    if(q){
      var hay = (rawField(i,'school')+' '+rawField(i,'fac')+' '+rawField(i,'sido')+' '+rawField(i,'office')).toLowerCase();
      if(hay.indexOf(q)<0) continue;
    }
    out.push(i);
  }
  if(rawSort){
    var k=rawSort.k, dir=rawSort.dir;
    out.sort(function(a,b){
      if(k==='trans'){
        var xa=(GRANK[rawField(a,'cur')]||0)*100+JI[a], xb=(GRANK[rawField(b,'cur')]||0)*100+JI[b];
        return dir*(xa-xb);
      }
      if(k==='year' || k==='ji') return dir*(rawField(a,k)-rawField(b,k));
      return dir*String(rawField(a,k)).localeCompare(String(rawField(b,k)),'ko');
    });
  }
  return out;
}
function renderRaw(){
  renderLocalFilterBar('rawFilterBar', rawFilter, function(){ rawPage=1; renderRaw(); });

  var rows = rawRows();
  var pages = Math.max(1, Math.ceil(rows.length/PAGE));
  if(rawPage>pages) rawPage=pages;
  var slice = rows.slice((rawPage-1)*PAGE, rawPage*PAGE);

  $('rawHead').innerHTML = RAW_COLS.map(function(c){
    var on = rawSort && rawSort.k===c.k;
    return '<th data-k="'+c.k+'" style="width:'+c.w+(c.num?';text-align:center':'')+'"'+(on?' class="sorted"':'')+'>'+
      esc(c.t)+(on ? (rawSort.dir<0?' ▾':' ▴') : '')+'</th>';
  }).join('');
  Array.prototype.forEach.call($('rawHead').children, function(th){
    th.onclick=function(){
      var k=th.getAttribute('data-k');
      if(rawSort && rawSort.k===k) rawSort.dir*=-1;
      else rawSort={k:k, dir:(k==='trans'||k==='ji')?-1:1};
      rawPage=1; renderRaw();
    };
  });

  if(!slice.length){
    $('rawBody').innerHTML='<tr><td colspan="'+RAW_COLS.length+'" class="empty">'+
      '조건에 해당하는 시설이 없습니다.</td></tr>';
  } else {
    $('rawBody').innerHTML = slice.map(function(i){
      var fv = rawField(i,'fatvulnType');
      return '<tr>'+
        '<td>'+esc(rawField(i,'sido'))+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(rawField(i,'office'))+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(rawField(i,'level'))+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(rawField(i,'estab'))+'</td>'+
        '<td style="font-weight:700">'+esc(rawField(i,'school'))+'</td>'+
        '<td>'+esc(rawField(i,'fac'))+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(rawField(i,'struct'))+'</td>'+
        '<td class="n" style="text-align:center">'+esc(rawField(i,'year')||'—')+'</td>'+
        '<td>'+gradeChip(rawField(i,'prev'))+'<span class="arrow">→</span>'+gradeChip(rawField(i,'cur'))+'</td>'+
        '<td class="n" style="text-align:center;font-weight:800'+(JI[i]>=5?';color:var(--risk-5)':'')+'">'+JI[i]+'</td>'+
        '<td style="color:var(--on-surface-variant)">'+esc(fv==='해당없음'?'—':fv)+'</td>'+
        '<td>'+resolveChip(rawField(i,'resolve'))+'</td>'+
        '<td>'+opstatChip(rawField(i,'opstat'))+'</td>'+
        '<td>'+rawFlagChips(i)+'</td></tr>';
    }).join('');
  }

  $('rawInfo').textContent = rows.length
    ? fmt(rows.length)+'건 중 '+fmt((rawPage-1)*PAGE+1)+'–'+fmt(Math.min(rawPage*PAGE,rows.length))+'건 표시'
    : '표시할 항목이 없습니다.';

  var pg=$('rawPager'); pg.innerHTML='';
  function pbtn(label, page, dis, on){
    var b=document.createElement('button'); b.textContent=label; b.disabled=!!dis;
    if(on) b.className='on';
    if(!dis) b.onclick=function(){ rawPage=page; renderRaw(); };
    pg.appendChild(b);
  }
  if(pages>1){
    pbtn('‹', rawPage-1, rawPage<=1);
    var start=Math.max(1,Math.min(rawPage-2,pages-4)), end=Math.min(pages,start+4);
    for(var p=start;p<=end;p++) pbtn(String(p), p, false, p===rawPage);
    pbtn('›', rawPage+1, rawPage>=pages);
  }

  var scope=[];
  FILTER_DEFS.forEach(function(d){ var sm=dimSummary(d.key); if(sm) scope.push(sm); });
  if(F.age && F.age.size) scope.push(Array.from(F.age).map(function(i){ return AGE_LABELS[i]; }).join(', '));
  if(F.flag!==null) scope.push(FLAG_LABELS[F.flag]||'정합성 조건');
  if(F.trans) scope.push(DICT.prev[F.trans[0]]+'→'+DICT.cur[F.trans[1]]);
  if(F.cross) scope.push(DICT.level[F.cross[0]]+'·'+DICT.estab[F.cross[1]]);
  if(F.dimAge) scope.push(DICT[F.dimAge[0]][F.dimAge[1]]+'×'+AGE_LABELS[F.dimAge[2]]);
  if(rawQuery) scope.push('검색 "'+rawQuery+'"');
  $('rawDesc').textContent =
    (scope.length ? '현재 선택: '+scope.join(' · ')+'. ' : '현재 필터 없음(전체). ')+
    '위 카드·차트 클릭과 상단 필터가 그대로 적용됩니다. 개별 점검 레코드 '+fmt(rows.length)+'건을 조회·검색·추출합니다.';
}

/* ══════════════════════════════════════════════════════════════
   23. CSV
   ══════════════════════════════════════════════════════════════ */
function csvCell(v){
  var s=String(v==null?'':v);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function download(name, text){
  var blob = new Blob(['﻿'+text], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}
function stamp(){ var d=new Date();
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'); }

function exportWatch(){
  var rows = watchRows();
  var head = ['시도교육청','교육지원청','학교·기관명','시설명','시설유형','시설구조',
              '사용승인연도','전차안전등급','금차안전등급','지적사항수','재해취약유형','해소상태',
              '선정사유','안전점검기간','설립구분','학교·기관 유형','점검방법','운용상태','지역','학교/기관'];
  var body = rows.map(function(r){ return [
    r[W_SIDO],r[W_OFFICE],r[W_SCHOOL],r[W_FAC],r[W_FTYPE],r[W_STRUCT],r[W_YEAR],r[W_PREV],r[W_CUR],r[W_JI],
    r[W_FV],r[W_RESOLVE],r[W_RSN],r[W_PERIOD],r[W_ESTAB],r[W_LEVEL],r[W_METHOD],r[W_OPSTAT],r[W_REGION],r[W_KIND]
  ].map(csvCell).join(','); });
  download('즉시조치대상_'+scopeName()+'_'+stamp()+'.csv', [head.join(',')].concat(body).join('\r\n'));
}

function exportRaw(){
  var rows = rawRows();
  var head = ['시도교육청','교육지원청','학교·기관 유형','설립구분','학교·기관명','시설명',
              '시설유형','시설구조','사용승인연도','점검방법','전차안전등급','금차안전등급',
              '지적사항수','재해취약유형','해소상태','안전점검기간','운용상태'];
  var body = rows.map(function(i){
    return [
      rawField(i,'sido'), rawField(i,'office'), DICT.level[COL.level[i]], DICT.estab[COL.estab[i]],
      rawField(i,'school'), rawField(i,'fac'), rawField(i,'ftype'), rawField(i,'struct'),
      rawField(i,'year')||'', rawField(i,'method'),
      rawField(i,'prev'), rawField(i,'cur'), JI[i], rawField(i,'fatvulnType'), rawField(i,'resolve'),
      rawField(i,'period'), DICT.opstat[COL.opstat[i]]
    ].map(csvCell).join(',');
  });
  download('Raw데이터_'+scopeName()+'_'+stamp()+'.csv', [head.join(',')].concat(body).join('\r\n'));
}

function exportSummary(R){
  var L=[], push=function(a){ L.push(a.map(csvCell).join(',')); };
  push(['2026년 해빙기 교육시설 안전점검 요약']);
  push(['적용 범위', scopeName()]);
  push(['생성일시', new Date().toLocaleString('ko-KR')]);
  push(['원본', D.meta.source+' / '+D.meta.plan]);
  push(['공식 발표수치 출처', OFFICIAL.source+' ('+OFFICIAL.reportDate+' 결재, '+OFFICIAL.baseDate+' 기준)']);
  push([]);
  push(['구분','값','비고']);
  push(['점검 시설 수(공식)', OFFICIAL.inspectedFacilities, '완료 '+OFFICIAL.completedFacilities]);
  push(['재해취약시설(공식)', OFFICIAL.disasterVuln.total, '구조'+OFFICIAL.disasterVuln.structRisk+'·붕괴'+OFFICIAL.disasterVuln.collapseRisk+'·화재'+OFFICIAL.disasterVuln.fireRisk+'·공사장'+OFFICIAL.disasterVuln.constructionSite]);
  push(['지적사항(공식)', OFFICIAL.findings.total, '']);
  push(['현재 범위 점검 시설', R.total, '']);
  push(['현재 범위 C등급 이하', R.cde, pct(R.cde,R.total,2)+'%']);
  push(['현재 범위 재해취약시설(대시보드 자체집계)', R.fatvuln, pct(R.fatvuln,R.total,2)+'%']);
  push(['현재 범위 지적사항 합계(지적사항개수 필드)', R.ji, '']);
  push(['현재 범위 미해소 지적사항', R.unresolved, '']);
  push(['현재 범위 40년 이상 시설', R.old40, pct(R.old40,R.total,1)+'%']);
  push(['현재 범위 등급 하락', R.dropped, '']);
  push([]);
  push(['금차안전등급','건수','비율(%)']);
  GRADES.forEach(function(g,i){ push([g, R.grades[i], pct(R.grades[i],R.total,2)]); });
  push(['미지정/미기재', R.grades[5], pct(R.grades[5],R.total,2)]);

  [['sido','시도교육청'],['struct','시설구조'],['method','점검방법'],['fatvulnType','재해취약시설 유형']].forEach(function(d){
    var B=R.dim[d[0]];
    push([]); push([d[1],'점검 건수','A등급','B등급','C등급','D등급','E등급','미지정/미기재',
                    'C이하','C이하율(%)','지적사항','지적률(%)']);
    var order=[]; DICT[d[0]].forEach(function(l,i){ if(B.n[i]>0) order.push(i); });
    order.sort(function(a,b){ return B.n[b]-B.n[a]; });
    order.forEach(function(i){
      push([DICT[d[0]][i], B.n[i], B.g[i*6], B.g[i*6+1], B.g[i*6+2], B.g[i*6+3], B.g[i*6+4], B.g[i*6+5],
            B.cde[i], pct(B.cde[i],B.n[i],2), B.ji[i], pct(B.ji[i],B.n[i],2)]);
    });
  });

  push([]); push(['경과연수','점검 건수','C이하','C이하율(%)','지적사항']);
  for(var a=0;a<7;a++) if(R.age.n[a])
    push([AGE_LABELS[a], R.age.n[a], R.age.cde[a], pct(R.age.cde[a],R.age.n[a],2), R.age.ji[a]]);

  push([]); push(['시도교육청','미해소','완전해소','미해소율(%)','비고']);
  DICT.sido.forEach(function(l,i){
    var un=R.sidoResolveNoObs[i*nResolveNoObs+RESOLVE_NOOBS_UN], done=R.sidoResolveNoObs[i*nResolveNoObs+RESOLVE_NOOBS_DONE];
    if(un+done>0) push([l, un, done, pct(un,un+done,1), '조치계획 지속관찰 제외']);
  });

  push([]); push(['정합성 점검 항목','건수']);
  [['사용승인연도 미기재',0],['설립구분 미기재',1],['운용상태 "사용" 외',2],
   ['└ 불용·철거·제외',5],
   ['금차등급 누락/미지정',3],['등급·지적 불일치',4]].forEach(function(x){ push([x[0], R.flags[x[1]]]); });

  download('안전점검요약_해빙기_'+scopeName()+'_'+stamp()+'.csv', L.join('\r\n'));
}

/* ══════════════════════════════════════════════════════════════
   24. 오케스트레이션
   ══════════════════════════════════════════════════════════════ */
var LAST = null, BASE = null;
function refresh(){
  var t0 = performance.now();
  LAST = compute();
  if(BASE === null) BASE = LAST;
  computeFilterCounts();
  renderFilters();
  renderHero(LAST);
  renderKpis(LAST);
  renderSido(LAST);
  renderTrans(LAST);
  renderAgeFatvuln(LAST);
  renderCross(LAST);
  renderFatvulnGrade(LAST);
  renderAgeAction(LAST);
  renderResolveBySido(LAST);
  renderPriorityScore(LAST);
  renderFatvulnDensity(LAST);
  renderAge(LAST);
  renderStruct(LAST);
  renderStructAge(LAST);
  renderEstabAge(LAST);
  renderMethodAge(LAST);
  renderMethod(LAST);
  renderQuality(LAST);
  watchPage = Math.max(1, watchPage);
  renderWatch();
  rawPage = Math.max(1, rawPage);
  renderRaw();
  tipHide();
  if(window.console && console.debug) console.debug('재집계 '+(performance.now()-t0).toFixed(1)+'ms');
}

function init(){
  $('hdSub').textContent = '교육시설통합정보망 · '+D.meta.plan;
  $('footMeta').textContent =
    '원본 '+D.meta.source+' · 시설 '+fmt(D.meta.facilityRows)+'건(원본 '+fmt(D.meta.rawRows)+'행) · 대상 '+fmt(D.meta.schools)+
    '개 학교·기관 · 연면적 '+fmt(D.meta.areaSum)+'㎡ · 고유 지적사항 '+fmt(D.meta.findingIds)+'건 · 데이터 생성 '+D.meta.builtAt;

  $('btnCsv').onclick   = function(){ exportSummary(LAST); };
  $('btnCsvWatch').onclick = exportWatch;
  $('btnCsvRaw').onclick = exportRaw;
  $('btnPrint').onclick = function(){ window.print(); };

  var si=$('watchSearch'), timer=null;
  si.oninput = function(){
    clearTimeout(timer);
    timer = setTimeout(function(){ watchQuery=si.value; watchPage=1; renderWatch(); }, 180);
  };

  var ri=$('rawSearch'), rtimer=null;
  ri.oninput = function(){
    clearTimeout(rtimer);
    rtimer = setTimeout(function(){ rawQuery=ri.value; rawPage=1; renderRaw(); }, 180);
  };

  document.addEventListener('click', function(e){
    if(openFilterKey===null) return;
    if(e.target.closest && e.target.closest('.fsel-multi')) return;
    openFilterKey = null;
    renderFilters();
  });

  refresh();
  $('loading').style.display='none';
}

try { init(); }
catch(err){
  $('loading').innerHTML = '<div style="text-align:center;color:#ba1a1a;max-width:640px">'+
    '<b>대시보드를 그리는 중 오류가 발생했습니다.</b><br>'+
    '<span style="font-weight:400;font-size:12px;word-break:break-all">'+esc(err && err.message)+'</span></div>';
  throw err;
}
})();
