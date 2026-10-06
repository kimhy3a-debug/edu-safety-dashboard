# -*- coding: utf-8 -*-
"""
26_1_safetydata_1.xlsx  ->  dashboard_data_thaw.js

교육시설통합정보망 2026년 해빙기 안전점검 대시보드용 데이터 빌더.
build_data.py(여름철, stdlib 전용)와 달리 pandas + openpyxl 을 사용한다.

원본 워크북에는 여러 시트가 있지만, 이 스크립트는 "4. 지적사항" 시트만 읽는다.
"0. 데이터" 시트는 임베디드 피벗테이블 캐시일 뿐 실제 행 데이터가 전혀 없으므로
(피벗은 엑셀에서 "모두 새로 고침"을 누르지 않으면 갱신되지 않아 값도 stale하다)
읽어도 얻을 게 없다 — 재해취약시설 8,772개소 · 지적사항 2,998건 같은 공식 수치는
"2026_1_finalreport.pdf"(한국교육시설안전원 통합정보처, 2026.06.26 결재)에서 그대로
전사해 OFFICIAL 상수로만 사용한다(아래 참고).

사용법:
    python build_data_thaw.py [원본xlsx경로] [출력js경로]
    (인자 생략 시 ./26_1_safetydata_1.xlsx -> ./dashboard_data_thaw.js)
"""

import base64
import datetime
import json
import os
import sys

import pandas as pd

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "26_1_safetydata_1.xlsx")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "dashboard_data_thaw.js")
SHEET = "4. 지적사항"

BASE_YEAR = 2026
GRADE_RANK = {"A등급": 1, "B등급": 2, "C등급": 3, "D등급": 4, "E등급": 5}
AGE_LABELS = ["5년 미만", "5~9년", "10~19년", "20~29년", "30~39년", "40년 이상", "미기재"]
ACTION_ORDER = ["정밀안전진단", "정밀안전점검", "보수보강", "자체보수", "지속관찰", "현지시정"]
ACTION_RANK = {a: i for i, a in enumerate(ACTION_ORDER)}   # 낮을수록 심각
NONE_LABEL = "해당없음"

# 재해취약시설 "주 유형" 타이브레이크 우선순위(한 시설이 동시에 2개 플래그를 가진 경우,
# 8,772개소 중 5건뿐이라 단일 라벨로 접어도 정보 손실이 미미하다 — 정밀 카운트가 필요한
# 카드는 fv(0/1/2 동시개수)를 별도로 함께 내보낸다) — 구조안전위험시설이 가장 심각하다는
# PDF의 프레이밍을 그대로 따른다.
FV_PRIORITY = ["구조위험시설", "붕괴위험시설", "화재위험시설", "폭설위험시설", "건설공사장"]
FV_LABEL = {
    "구조위험시설": "구조위험", "붕괴위험시설": "붕괴위험", "화재위험시설": "화재위험",
    "폭설위험시설": "폭설위험", "건설공사장": "건설공사장",
}

# v4 추가: "시설주용도별 위험도 TOP20" / "교육기본지원시설 위험도 비교" / "연면적×경과연수"
# 카드용 파생 필드. 다른 라운드(여름철, build_data.py)의 동일 카드 정의를 그대로 이식한다.
#
# 학생이 주로 이용하는 시설(=교육기본지원시설, 시설주용도 기준) — build_data.py의
# STUDENT_FUSE 집합을 그대로 가져왔다. 원본 목록의 21개 라벨이 이번 원본의 "시설주용도"
# 52종 고유값에 전부 글자 그대로 존재함을 직접 확인했다(별도 매핑/추정 불필요).
STUDENT_FUSE = {
    # 17개 시도교육청(초중고 등) — "교육기본/지원시설" 그룹 전체(공식 건물검색
    # 상세조건 기준, 기본+지원이 이미 한 그룹으로 묶여 있다).
    "교사", "도서실", "실습실/특별교실", "생활관(예절실)", "급식실/식당",
    "강당/체육관", "기숙사/합숙소",
    # 대학/전문대학/대학원 — "교육기본시설" 그룹만(공식 기준에서 "지원시설"은
    # 별도 그룹이라 제외한다 — 강당·학생기숙사는 지원시설 그룹 소속이라 여기
    # 포함하지 않는다. 사용자 확인).
    "강의실", "실험실습실", "도서관", "체육관", "교수연구실", "행정실",
    "학생회관", "대학본부", "정보전산원", "산학협력단", "학교기업",
    "학칙으로 정한 교육기본시설",
}


def classify_stu(fuse_raw):
    return "교육기본지원시설" if fuse_raw in STUDENT_FUSE else "기타"


AREA_LABELS = ["100㎡ 미만", "100~299㎡", "300~999㎡", "1,000~2,999㎡", "3,000㎡ 이상"]


def classify_area(area_m2):
    """연면적(㎡)을 5개 구간으로. 규모×경과연수 교차분석용."""
    if area_m2 < 100:
        return AREA_LABELS[0]
    if area_m2 < 300:
        return AREA_LABELS[1]
    if area_m2 < 1000:
        return AREA_LABELS[2]
    if area_m2 < 3000:
        return AREA_LABELS[3]
    return AREA_LABELS[4]


def parse_height10(s, ftype):
    """옹벽·절토사면(용지시설)에만 값이 있는 "층수_높이"를 0.1m 단위 정수(x10)로.
    건물 등 다른 시설유형은 같은 컬럼이 순수 층수(정수)라 의미가 달라 0을 반환한다."""
    if ftype not in ("용지시설(옹벽)", "용지시설(절토사면)"):
        return 0
    try:
        v = float(str(s).replace(",", ""))
    except (ValueError, TypeError):
        return 0
    return min(65535, max(0, round(v * 10)))


def col_index_encode(dicts, cols, key, series):
    """라벨 Series -> (dict 갱신, cols[key]에 인덱스 append)를 한 번에."""
    d = dicts.setdefault(key, {})
    out = cols.setdefault(key, [])
    for raw in series:
        raw = raw if (raw is not None and raw != "" and not (isinstance(raw, float) and pd.isna(raw))) else "(미기재)"
        raw = str(raw)
        if raw not in d:
            d[raw] = len(d)
        out.append(d[raw])


def b64_u8(seq):
    return base64.b64encode(bytes(int(min(255, max(0, x))) for x in seq)).decode("ascii")


def b64_u16(seq):
    buf = bytearray()
    for x in seq:
        buf += (int(x) & 0xFFFF).to_bytes(2, "little")
    return base64.b64encode(bytes(buf)).decode("ascii")


def parse_year(s):
    try:
        y = int(str(s).strip())
    except (ValueError, TypeError):
        return 0
    if y < 1900 or y > BASE_YEAR:
        return 0
    return y


def age_bucket(y):
    if not y:
        return 6
    a = BASE_YEAR - y
    if a < 5:
        return 0
    if a < 10:
        return 1
    if a < 20:
        return 2
    if a < 30:
        return 3
    if a < 40:
        return 4
    return 5


def main():
    src = os.path.abspath(SRC)
    if not os.path.exists(src):
        sys.exit("원본 파일을 찾을 수 없습니다: %s" % src)
    print("원본 : %s (%.1f MB)" % (src, os.path.getsize(src) / 1e6))

    # 텍스트로 저장된 숫자 컬럼(준공연도/건축면적_길이/층수_높이 등)이 섞여 있어
    # 전부 문자열로 읽은 뒤 이 스크립트에서 직접, 통제된 방식으로 캐스팅한다.
    df = pd.read_excel(src, sheet_name=SHEET, dtype=str, engine="openpyxl")
    print("원본 시트 '%s' : %d행 × %d열" % (SHEET, len(df), len(df.columns)))

    # ---- 빌드 타임 불변조건: 원본 스키마가 조사 당시와 달라지면 즉시 중단한다 ----
    assert len(df) == 112929, "행수가 112,929가 아닙니다(원본 갱신됨?): %d" % len(df)
    # 주의: RN 컬럼은 "시설코드당 중복 사본"을 뜻하는 게 아니라 한 시설에 딸린
    # 지적사항 개수(행 반복)와 뒤섞여 있어, RN==1 로 필터링해도 시설코드당 1행이
    # 되지 않는다(직접 검증: RN==1인데도 시설코드당 최대 6행까지 중복 존재).
    # 시설 단위로 접으려면 시설코드 자체로 drop_duplicates 해야 하며, 그렇게 하면
    # 시설-고정 컬럼(준공연도·시설구조·재해취약시설 플래그 등)은 사본 간 사실상
    # 동일하므로(직접 검증, 예외 0.2% 미만은 등급 재산정 시점 차이로 추정) 정보
    # 손실이 없다.
    dedup = df.drop_duplicates(subset="시설코드", keep="first")
    assert len(dedup) == 105835, "고유 시설코드 수가 105,835가 아닙니다: %d" % len(dedup)
    finding_ids = df["지적사항ID"].dropna()
    finding_ids = finding_ids[finding_ids != ""]
    assert finding_ids.nunique() == 3125, "고유 지적사항ID 수가 3,125가 아닙니다: %d" % finding_ids.nunique()
    assert len(finding_ids) == 4162, "지적사항 행수가 4,162가 아닙니다: %d" % len(finding_ids)
    print("불변조건 통과 : 총 112,929행 / 고유 시설 %d개 / 고유 지적사항 3,125건" % len(dedup))

    # ================================================================
    # 1) 지적사항(finding) 단위 롤업 -> 시설(시설코드) 단위로 접기
    #    RN 중복행이 아니라 지적사항ID 자체로 중복을 제거해야 실제 지적사항을
    #    누락하지 않는다(RN 사본 간 지적사항 데이터가 다른 경우가 134건 존재).
    # ================================================================
    fdf = df[df["지적사항ID"].notna() & (df["지적사항ID"] != "")].drop_duplicates(subset="지적사항ID")
    print("고유 지적사항(중복 제거 후) : %d건 / 영향 시설 %d개" % (len(fdf), fdf["시설코드"].nunique()))

    def worst_action(actions):
        best = None
        for a in actions:
            if a in ACTION_RANK and (best is None or ACTION_RANK[a] < ACTION_RANK[best]):
                best = a
        return best or NONE_LABEL

    def resolve_status(states):
        states = list(states)
        if any(s == "미해소" for s in states):
            return "미해소"
        if any(s == "완전해소" for s in states):
            return "완전해소"
        return NONE_LABEL

    grp = fdf.groupby("시설코드")
    facility_action = grp["조치계획"].agg(worst_action)
    facility_resolve = grp["해소상태"].agg(resolve_status)
    facility_ji_actual = grp.size()   # 시설당 실제 고유 지적사항 건수(지적사항ID 기준 groupby)

    # "지적사항 해소상태 — 시도별" 카드 전용: 조치계획="지속관찰"인 지적사항은 해소상태
    # 롤업에서 제외한다. "지속관찰"은 성격상 계속 모니터링하는 상태라 해소상태가 거의
    # 항상 "미해소"로 남아 있어(사용자 확인 스크린샷 참고), 그대로 포함하면 지속관찰
    # 비중이 큰 시도가 실제보다 훨씬 나쁜 미해소율로 보이는 왜곡이 생긴다. 일반
    # resolve 필드(필터바 "해소상태", KPI "미해소 지적사항", 즉시조치 기준 등)는
    # 지속관찰을 포함한 기존 정의를 그대로 유지하고, 이 파생 필드만 별도로 둔다.
    fdf_noObs = fdf[fdf["조치계획"] != "지속관찰"]
    facility_resolve_noObs = fdf_noObs.groupby("시설코드")["해소상태"].agg(resolve_status)

    # "해소상태 — 시도별" 카드에서 미해소/완전해소를 조치계획별로 다시 색칠해 보여주려면
    # (예: 대구는 미해소 지적사항이 전부 "보수보강") 일반 action 필드를 그대로 쓰면 안
    # 된다 — action은 지속관찰 포함 전체 지적사항 중 최고심각도를 고르는데, 만약 한
    # 시설에 "지속관찰"과 "현지시정"만 있으면(더 심각한 유형이 없으면) 지속관찰 쪽이
    # 순위가 더 높아 action="지속관찰"이 되어 버린다. 그 시설은 resolveNoObs 계산에서는
    # 지속관찰 지적사항이 빠지고 "현지시정" 지적사항만 남는데, action 필드는 여전히
    # "지속관찰"을 가리켜 화면과 실제 근거 지적사항이 어긋난다. 그래서 resolveNoObs와
    # 완전히 같은 지적사항 집합(fdf_noObs)에서 별도로 최고심각도를 다시 뽑는다.
    facility_action_noObs = fdf_noObs.groupby("시설코드")["조치계획"].agg(worst_action)

    # ================================================================
    # 2) 시설(facility) 단위 프레임 = 시설코드 기준 첫 행 (105,835개, 시설코드당 1행)
    # ================================================================
    fac = dedup.copy()
    fac["action"] = fac["시설코드"].map(facility_action).fillna(NONE_LABEL)
    fac["resolve"] = fac["시설코드"].map(facility_resolve).fillna(NONE_LABEL)
    fac["resolveNoObs"] = fac["시설코드"].map(facility_resolve_noObs).fillna(NONE_LABEL)
    fac["actionNoObs"] = fac["시설코드"].map(facility_action_noObs).fillna(NONE_LABEL)

    fac["yr"] = fac["준공연도"].map(parse_year)
    fac["age"] = fac["yr"].map(age_bucket)

    # v5 수정: "지적사항개수" 원본 필드가 실제 고유 지적사항ID 개수와 188개 시설에서
    # 어긋남을 확인했다(전체 합계 2,899 vs 실제 3,125건 — 원본 필드가 stale함). 대시보드
    # 전체의 "지적"·"지적률" 수치가 이 필드 하나에서 나오므로, 원본 필드 대신 실제
    # 고유 지적사항ID 개수(facility_ji_actual)로 정의를 바꾼다(사용자 확인).
    fac["ji_i"] = fac["시설코드"].map(facility_ji_actual).fillna(0).astype(int).clip(0, 255)

    # 이 다섯 컬럼은 숫자가 아니라 "0" 또는 라벨 문자열(예: "구조")이 들어 있는
    # 혼합 타입 컬럼이라, 숫자로 캐스팅하면(문자열 라벨이 NaN이 되어) 전부 0으로
    # 무너진다 — "0"이 아닌지 여부로 판정해야 한다.
    for c in ["구조위험시설", "붕괴위험시설", "폭설위험시설", "화재위험시설", "건설공사장"]:
        fac[c + "_b"] = (fac[c].fillna("0") != "0").astype(int)
    fac["fv_count"] = fac[[c + "_b" for c in FV_PRIORITY]].sum(axis=1).clip(upper=2)

    def fv_type(row):
        for c in FV_PRIORITY:
            if row[c + "_b"]:
                return FV_LABEL[c]
        return NONE_LABEL
    fac["fatvulnType"] = fac.apply(fv_type, axis=1)

    # "우선관리 스코어" 카드에서 재해취약시설 2종이 동시에 걸린 시설(전국 17개소뿐)의
    # 실제 두 유형을 전부 보여 달라는 요청 — fatvulnType은 우선순위로 접은 "대표 유형"
    # 하나뿐이라 부족하다. 5개 유형을 비트마스크 하나(0~31)로 담아 별도로 내보낸다:
    # bit0=구조위험 bit1=붕괴위험 bit2=화재위험 bit3=폭설위험 bit4=건설공사장.
    FV_BIT = {"구조위험시설": 1, "붕괴위험시설": 2, "화재위험시설": 4,
              "폭설위험시설": 8, "건설공사장": 16}
    fac["fv_bits"] = 0
    for c, bit in FV_BIT.items():
        fac["fv_bits"] = fac["fv_bits"] | (fac[c + "_b"] * bit)

    fac["estab_f"] = fac["설립"].fillna("(미기재)")
    fac["area_f"] = pd.to_numeric(fac["연면적_물량"], errors="coerce").fillna(0.0)
    fac.loc[fac["area_f"] > 500000, "area_f"] = 0.0   # 645,750,000㎡ 급 이상치 제외(경고만, 결측 처리)

    n_area_outlier = int((pd.to_numeric(fac["연면적_물량"], errors="coerce").fillna(0.0) > 500000).sum())
    if n_area_outlier:
        print("경고 : 연면적_물량 이상치 %d건을 집계에서 제외했습니다." % n_area_outlier)

    # v4 추가: 시설주용도(fuse) / 교육기본지원시설 여부(stu) / 연면적구간(areab).
    # "시설주용도"는 이번 원본에도 그대로 존재하는 컬럼이라 fillna만 하면 되고,
    # stu/areab은 각각 시설주용도·연면적_물량에서 파생한다(원본 컬럼 아님).
    fac["fuse_f"] = fac["시설주용도"].fillna("(미기재)")
    fac["stu"] = fac["fuse_f"].map(classify_stu)
    fac["areab"] = fac["area_f"].map(classify_area)
    assert fac["fuse_f"].notna().all() and fac["areab"].notna().all(), \
        "시설주용도/연면적구간 파생에 결측이 남아있습니다"

    # v4 추가: 옹벽·절토사면 높이(0.1m 단위 정수). "층수_높이" 컬럼은 시설유형에 따라
    # 의미가 다르다(건물=층수, 옹벽/절토사면=미터 단위 높이) — parse_height10이
    # 시설유형을 같이 봐서 옹벽/절토사면이 아니면 0을 반환한다.
    fac["height10"] = [parse_height10(h, ft) for h, ft in zip(fac["층수_높이"], fac["시설유형"])]
    # 옹벽·절토사면 실측 최댓값은 160m대인데 "4,200.00"(=4.2km) 1건이 섞여 있다 —
    # 원본 입력 오류로 판단해(단위/자릿수 오기로 추정) 200m 초과는 이상치로 캡한다
    # (연면적_물량 이상치 처리와 동일한 방식).
    n_height_outlier = int((fac["height10"] > 2000).sum())
    if n_height_outlier:
        fac.loc[fac["height10"] > 2000, "height10"] = 0
        print("경고 : 옹벽·절토사면 높이 이상치(200m 초과) %d건을 집계에서 제외했습니다." % n_height_outlier)
    n_height = int((fac["height10"] > 0).sum())
    print("옹벽·절토사면 높이 데이터 : %d개소" % n_height)

    N = len(fac)
    print("시설 단위 데이터 : %d개" % N)

    # ================================================================
    # 3) 딕셔너리 인코딩(기존 여름철 dashboard_data.js 와 동일한 방식)
    # ================================================================
    dicts, cols = {}, {}
    DIM_SERIES = [
        ("sido", fac["시도_2"]), ("region", fac["지역"]), ("office", fac["교육지원청"]),
        ("kind", fac["학교기관구분"]), ("level", fac["학교기관종류"]), ("estab", fac["estab_f"]),
        ("ftype", fac["시설유형"]), ("struct", fac["시설구조"]), ("opstat", fac["운용상태"]),
        ("method", fac["점검방법"]), ("cur", fac["금차등급"]), ("prev", fac["전차등급"]),
        ("fatvulnType", fac["fatvulnType"]), ("action", fac["action"]), ("resolve", fac["resolve"]),
        ("resolveNoObs", fac["resolveNoObs"]), ("actionNoObs", fac["actionNoObs"]),
        ("fuse", fac["fuse_f"]), ("stu", fac["stu"]), ("areab", fac["areab"]),
        ("school", fac["학교기관명칭"]), ("fac", fac["시설명칭"]), ("period", fac["점검기간"]),
    ]
    for key, series in DIM_SERIES:
        col_index_encode(dicts, cols, key, series)
        print("  차원 %-12s 고유값 %4d" % (key, len(dicts[key])))

    # "설립"원본 값이 "01_국립"/"02_공립"/"03_사립"처럼 코드 접두어를 달고 있어
    # col_index_encode의 최초 등장 순서(시트 내 행 순서)로는 뒤죽박죽으로 섞인다.
    # 화면(필터·히트맵·Raw데이터·CSV)에 항상 국립→공립→사립 순으로 보이도록
    # 딕셔너리 순서 자체를 여기서 고정한다(라벨 접두어는 다른 코드형 차원(시도 등)과
    # 동일하게 그대로 유지 — 접두어 제거는 이번 요청 범위 밖).
    ESTAB_ORDER = ["01_국립", "02_공립", "03_사립"]
    old_estab = dicts["estab"]
    new_estab_order = [k for k in ESTAB_ORDER if k in old_estab] + \
        [k for k in old_estab if k not in ESTAB_ORDER]
    estab_remap = {old_estab[k]: i for i, k in enumerate(new_estab_order)}
    dicts["estab"] = {k: i for i, k in enumerate(new_estab_order)}
    cols["estab"] = [estab_remap[v] for v in cols["estab"]]

    payload_cols = {}
    wide = []
    for key, _ in DIM_SERIES:
        card = len(dicts[key])
        if card > 255:
            payload_cols[key] = b64_u16(cols[key])
            wide.append(key)
        else:
            payload_cols[key] = b64_u8(cols[key])

    # ================================================================
    # 4) 지적사항(finding) 상세 목록 — "지적사항 확인" 표용
    #    지금까지는 시설 단위로 접은 요약(worst_action/resolve_status)만
    #    내보내서, 시설 하나에 지적사항이 여러 건(예: 8건) 있어도 그 실제
    #    내용(지적사항내용)을 화면에서 확인할 방법이 없었다("Raw 데이터"의
    #    지적 열은 건수만 표시). fdf(3,125건, 고유 지적사항ID 기준 dedup)를
    #    시설 인덱스별로 묶어 CSR(compressed-sparse-row) 형태로 내보낸다 —
    #    시설 i의 지적사항은 findStart[i] .. findStart[i]+findCount[i]-1
    #    구간의 finding* 배열이다(지적사항이 없는 시설은 findCount=0).
    # ================================================================
    code_to_idx = {code: i for i, code in enumerate(fac["시설코드"].tolist())}
    fdf2 = fdf.copy()
    fdf2["_facIdx"] = fdf2["시설코드"].map(code_to_idx)
    assert fdf2["_facIdx"].notna().all(), "지적사항의 시설코드가 시설 목록에 없습니다"
    fdf2["_facIdx"] = fdf2["_facIdx"].astype(int)
    fdf2 = fdf2.sort_values("_facIdx", kind="stable").reset_index(drop=True)

    findStart = [0] * N
    findCount = [0] * N
    for facIdx, sub in fdf2.groupby("_facIdx", sort=True):
        findStart[facIdx] = int(sub.index[0])
        findCount[facIdx] = len(sub)
    assert sum(findCount) == len(fdf2) == 3125, "지적사항 상세 목록 건수 불일치: %d" % len(fdf2)

    find_dicts, find_cols = {}, {}
    FIND_DIM_SERIES = [
        ("findAction", fdf2["조치계획"]),
        ("findResolve", fdf2["해소상태"]),
        ("findWritten", fdf2["작성상태"]),
        ("findInspType", fdf2["안전점검구분"].fillna("(미기재)")),
        ("findCat1", fdf2["구분1"].fillna("(미기재)")),
        ("findDate", fdf2["최종수정일시"].fillna("(미기재)")),
    ]
    for key, series in FIND_DIM_SERIES:
        col_index_encode(find_dicts, find_cols, key, series)

    finding = {"start": b64_u16(findStart), "count": b64_u8(findCount),
               "content": fdf2["지적사항내용"].fillna("").tolist(),
               "detail": fdf2["불량내역_조치내역"].fillna("").tolist(),
               "dict": {k: list(find_dicts[k].keys()) for k, _ in FIND_DIM_SERIES}}
    for key, _ in FIND_DIM_SERIES:
        finding[key] = b64_u8(find_cols[key])

    # ================================================================
    # 5) 워치리스트(즉시조치 검토 대상)
    #    기존 기준(D·E등급 / 등급하락 / 지적≥5건)에 이번 라운드의 신규 고신호
    #    필드를 반영해 "재해취약시설이면서 해소상태=미해소"를 추가한다.
    # ================================================================
    watch = []
    for row in fac.itertuples(index=False):
        prev_g, cur_g = row.전차등급 or "", row.금차등급 or ""
        pr, cr = GRADE_RANK.get(prev_g, 0), GRADE_RANK.get(cur_g, 0)
        dropped = bool(pr and cr and cr > pr)
        severe = cur_g in ("D등급", "E등급")
        many = row.ji_i >= 5
        fv_unresolved = (row.fatvulnType != NONE_LABEL) and (row.resolve == "미해소")
        if not (dropped or severe or many or fv_unresolved):
            continue
        reasons = []
        if severe:
            reasons.append("D·E등급")
        if dropped:
            reasons.append("등급하락")
        if many:
            reasons.append("지적다발")
        if fv_unresolved:
            reasons.append("재해취약·미해소")
        watch.append([
            row.시도_2, row.교육지원청 or "(직속)", row.학교기관명칭, row.시설명칭,
            row.시설유형, row.시설구조 or "(미기재)", str(row.yr) if row.yr else "",
            prev_g or "-", cur_g or "-", int(row.ji_i),
            "|".join(reasons), row.점검기간,
            row.estab_f, row.학교기관종류, row.점검방법, row.운용상태,
            row.지역, row.학교기관구분, row.fatvulnType, row.action, row.resolve,
            row.fuse_f, row.areab, row.stu, row.resolveNoObs, int(row.fv_bits),
            row.시설코드,
        ])

    def watch_key(r):
        return (-GRADE_RANK.get(r[8], 0), -r[9], -(GRADE_RANK.get(r[8], 0) - GRADE_RANK.get(r[7], 0)))
    watch.sort(key=watch_key)
    print("워치리스트 : %d건" % len(watch))

    # ================================================================
    # 5) 공식 발표수치(OFFICIAL) — 2026_1_finalreport.pdf 에서 그대로 전사.
    #    이 블록의 수치는 위 데이터프레임에서 절대 재계산하지 않는다.
    # ================================================================
    official = {
        "reportDate": "2026-06-26", "baseDate": "2026-04-24",
        "source": "한국교육시설안전원 통합정보처, 2026년 해빙기 교육시설 정기 안전점검 조사결과보고",
        "inspectedSchools": 16660, "inspectedFacilities": 95934,
        "completedSchools": 16659, "completedFacilities": 95932, "completionRate": 100.00,
        "grades": {"A": 36423, "B": 53122, "C": 6254, "D": 123, "E": 10, "total": 95932},
        "structRisk": {"total": 105, "prevWinter": 118, "new": 2, "resolved": 15, "underReview": 4},
        "findings": {
            "total": 2998,
            "action": {"정밀안전진단": 25, "정밀안전점검": 31, "보수보강": 793, "자체보수": 542,
                       "지속관찰": 1177, "현지시정": 430},
            "byOrg": {"시도교육청": 1596, "교육부등": 1402},
            "changeVsPrev": -2.8, "changeVsYear": -16.7,
            "byGrade": {"A": 758, "B": 1823, "C": 345, "D": 66, "E": 6},
            "buildingLinked": {"total": 2630, "건축물": 2054, "소방": 322, "전기": 209, "승강기": 14, "가스": 31},
        },
        "disasterVuln": {
            "total": 8772, "structRisk": 105, "collapseRisk": 1844, "fireRisk": 6634,
            "constructionSite": 193, "dupExcluded": 4,
            "byGrade": {"A": 2003, "B": 2703, "C": 285, "D": 96, "E": 9, "unspecified": 3676},
        },
        "bySido": {
            "서울": {"n": 7968, "abRate": 80.1}, "부산": {"n": 4099, "abRate": 97.5},
            "대구": {"n": 2854, "abRate": 99.3}, "인천": {"n": 3483, "abRate": 99.9},
            "광주": {"n": 1954, "abRate": 94.3}, "대전": {"n": 3219, "abRate": 97.5},
            "울산": {"n": 1353, "abRate": 98.8}, "세종": {"n": 442, "abRate": 100.0},
            "경기": {"n": 11792, "abRate": 98.6}, "강원": {"n": 5326, "abRate": 97.6},
            "충북": {"n": 3926, "abRate": 89.9}, "충남": {"n": 5585, "abRate": 97.2},
            "전북": {"n": 5495, "abRate": 78.5}, "전남": {"n": 9172, "abRate": 90.0},
            "경북": {"n": 6412, "abRate": 98.3}, "경남": {"n": 6758, "abRate": 96.0},
            "제주": {"n": 1559, "abRate": 99.2}, "교육부": {"n": 13528, "abRate": 92.1},
            "타부처": {"n": 924, "abRate": 93.7}, "자치체": {"n": 83, "abRate": 95.2},
        },
    }

    payload = {
        "meta": {
            "facilityRows": N, "rawRows": 112929, "findingRows": 4162, "findingIds": 3125,
            "schools": int(fac["학교기관코드"].nunique()),
            "areaSum": round(float(fac["area_f"].sum())),
            "plan": "2026년도 정기점검(해빙기)",
            "baseYear": BASE_YEAR,
            "builtAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "source": os.path.basename(src),
        },
        "dict": {k: list(dicts[k].keys()) for k, _ in DIM_SERIES},
        "cols": payload_cols,
        "wide": wide,
        "ji": b64_u8(fac["ji_i"].tolist()),
        "yr": b64_u16(fac["yr"].tolist()),
        "fv": b64_u8(fac["fv_count"].tolist()),
        "fvBits": b64_u8(fac["fv_bits"].tolist()),
        "height10": b64_u16(fac["height10"].tolist()),
        "facCode": fac["시설코드"].tolist(),
        "watch": watch,
        "official": official,
        "finding": finding,
    }

    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    out = os.path.abspath(OUT)
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* 자동 생성 파일 - build_data_thaw.py 로 재생성하세요. 직접 수정 금지. */\n")
        f.write("window.SAFETY_DATA = ")
        f.write(body)
        f.write(";\n")
    print("출력 : %s (%.2f MB)" % (out, os.path.getsize(out) / 1e6))


if __name__ == "__main__":
    main()
