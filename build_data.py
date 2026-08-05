# -*- coding: utf-8 -*-
"""
safety_data1.xlsx  ->  dashboard_data.js

교육시설통합정보망 2026년도 여름철 안전점검 대시보드용 데이터 빌더.

표준 라이브러리만 사용한다(openpyxl/pandas 불필요).
xlsx 는 zip + XML 이므로 zipfile 로 열고 iterparse 로 스트리밍 파싱한다.

사용법:
    python build_data.py [원본xlsx경로] [출력js경로]
    (인자 생략 시 ../safety_data1.xlsx -> ./dashboard_data.js)
"""

import base64
import datetime
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "safety_data1.xlsx")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "dashboard_data.js")

# 원본 컬럼 인덱스 (0-based)
C_SIDO, C_OFFICE = 0, 1
C_KIND, C_LEVEL, C_ESTAB = 4, 5, 6
C_SCHOOL, C_SCHOOL_CD, C_OPSTAT = 7, 8, 9
C_FAC, C_FAC_CD, C_FSTAT, C_FTYPE, C_FUSE = 10, 11, 12, 13, 14
C_STRUCT, C_YEAR, C_AREA = 16, 17, 18
C_FLOOR = 20               # 층수(지상/지하) — "3/2" 형식, 지하층 파생값 계산용
C_HEIGHT = 23               # 높이 — 옹벽·절토사면 등에만 채워짐, "8.6m" 형식
C_METHOD, C_PREV, C_CUR = 27, 29, 30
C_PERIOD, C_JI, C_CREW, C_DONE = 31, 32, 33, 35

# 대시보드에 임베드할 차원 (키 -> 원본 컬럼)
# school/fac/period 은 집계용이 아니라 Raw 데이터 섹션에서 개별 레코드를
# 복원하기 위한 것 — 카디널리티가 높아 wide(16bit) 인코딩으로 자동 전환된다.
DIMS = [
    ("sido", C_SIDO), ("office", C_OFFICE), ("kind", C_KIND), ("level", C_LEVEL),
    ("estab", C_ESTAB), ("ftype", C_FTYPE), ("fuse", C_FUSE),
    ("method", C_METHOD), ("prev", C_PREV), ("cur", C_CUR),
    ("struct", C_STRUCT), ("opstat", C_OPSTAT), ("fstat", C_FSTAT),
    ("done", C_DONE),
    ("school", C_SCHOOL), ("fac", C_FAC), ("period", C_PERIOD),
]
# "base"(지하층 보유), "areab"(연면적 구간), "stu"(학생주로이용 여부)는 원본 컬럼을
# 그대로 옮기는 게 아니라 C_FLOOR/C_AREA/C_FUSE 값을 파싱·판정한 파생 차원이라
# DIMS 튜플로 표현할 수 없다. dict/cols 인코딩은 DIMS와 동일한 방식을 타야 하므로
# 아래에서 이어붙여 함께 순회한다.
ALL_DIMS = DIMS + [("base", None), ("areab", None), ("stu", None)]
AREA_LABELS = ["100㎡ 미만", "100~299㎡", "300~999㎡", "1,000~2,999㎡", "3,000㎡ 이상"]

# 학생이 주로 이용하는 시설(시설주용도 기준) — 교육시설통합정보망 건물검색 상세조건의
# "교육기본시설/지원시설"(17개 시도교육청·대학 대분류)을 참고해 사용자와 함께 확정한 목록.
# 초중고·대학 계열은 시설주용도 라벨 자체가 서로 겹치지 않으므로(예: 도서실≠도서관,
# 강당/체육관≠체육관·강당) 계열 구분 없이 라벨 하나의 집합으로 판정할 수 있다.
STUDENT_FUSE = {
    # 17개 시도교육청(초중고 등) — 교육기본/지원시설
    "교사", "도서실", "실습실/특별교실", "생활관(예절실)", "급식실/식당",
    "강당/체육관", "기숙사/합숙소",
    # 대학/전문대학/대학원 — 교육기본시설 + 기숙사·강당(지원시설이지만 포함하기로 확정)
    "강의실", "실험실습실", "도서관", "체육관", "교수연구실", "행정실",
    "학생회관", "대학본부", "정보전산원", "산학협력단", "학교기업",
    "학칙으로 정한 교육기본시설", "강당", "학생기숙사",
}


def classify_stu(fuse_raw):
    return "학생주로이용" if fuse_raw in STUDENT_FUSE else "기타"

BASE_YEAR = 2026          # 점검 연도 = 경과연수 기준
GRADE_RANK = {"A등급": 1, "B등급": 2, "C등급": 3, "D등급": 4, "E등급": 5}
BAD_OPSTAT = {"폐교(폐원)", "휴교(휴원)"}
BAD_FSTAT = {"불용", "철거", "제외"}


def col_index(ref):
    """셀 참조('AB12')에서 0-based 열 번호."""
    s = 0
    for ch in ref:
        if ch.isalpha():
            s = s * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return s - 1


def read_shared_strings(z):
    out = []
    for _, el in ET.iterparse(z.open("xl/sharedStrings.xml"), events=("end",)):
        if el.tag == NS + "si":
            out.append("".join(t.text or "" for t in el.iter(NS + "t")))
            el.clear()
    return out


def iter_rows(z, shared):
    """시트를 행 단위(36칸 고정 리스트)로 스트리밍한다."""
    for _, el in ET.iterparse(z.open("xl/worksheets/sheet1.xml"), events=("end",)):
        if el.tag != NS + "row":
            continue
        vals = [""] * 36
        for c in el.findall(NS + "c"):
            i = col_index(c.get("r") or "")
            v = c.find(NS + "v")
            if v is None or not (0 <= i < 36):
                continue
            vals[i] = shared[int(v.text)] if c.get("t") == "s" else (v.text or "")
        el.clear()
        yield vals


def b64_u8(seq):
    return base64.b64encode(bytes(seq)).decode("ascii")


def b64_u16(seq):
    buf = bytearray()
    for x in seq:
        buf += (x & 0xFFFF).to_bytes(2, "little")
    return base64.b64encode(bytes(buf)).decode("ascii")


def parse_area(s):
    m = re.match(r"([\d,\.]+)", s or "")
    return float(m.group(1).replace(",", "")) if m else 0.0


def classify_basement(s):
    """'지상/지하' 형식(예: '3/2')에서 지하층 보유 여부를 분류한다."""
    if not s or s in ("-", "-/-"):
        return "(미기재)"
    parts = s.split("/")
    if len(parts) != 2:
        return "(미기재)"
    try:
        below = int(parts[1])
    except ValueError:
        return "(미기재)"
    if below <= 0:
        return "지하없음"
    if below == 1:
        return "지하1층"
    if below == 2:
        return "지하2층"
    return "지하3층 이상"


def parse_height10(s):
    """'8.6m' 형식을 0.1m 단위 정수(x10)로. 옹벽·절토사면 등에만 값이 있다."""
    m = re.match(r"([\d,]+(?:\.\d+)?)", s or "")
    if not m:
        return 0
    try:
        v = float(m.group(1).replace(",", ""))
    except ValueError:
        return 0
    return min(65535, max(0, round(v * 10)))


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


def main():
    src = os.path.abspath(SRC)
    if not os.path.exists(src):
        sys.exit("원본 파일을 찾을 수 없습니다: %s" % src)
    print("원본 : %s (%.1f MB)" % (src, os.path.getsize(src) / 1e6))

    z = zipfile.ZipFile(src)
    shared = read_shared_strings(z)
    print("공유문자열 %d개 로드" % len(shared))

    dicts = {k: {} for k, _ in ALL_DIMS}
    cols = {k: [] for k, _ in ALL_DIMS}
    ji, yr, height10 = [], [], []
    watch = []
    schools = set()
    area_sum = 0.0
    plan_names = set()
    header = None
    n = 0

    for vals in iter_rows(z, shared):
        if header is None:
            header = vals
            continue
        n += 1

        for key, idx in DIMS:
            raw = vals[idx]
            if key == "fuse" and not raw:
                raw = "(미기재)"
            elif not raw:
                raw = "(미기재)"
            d = dicts[key]
            if raw not in d:
                d[raw] = len(d)
            cols[key].append(d[raw])

        base_label = classify_basement(vals[C_FLOOR])
        d = dicts["base"]
        if base_label not in d:
            d[base_label] = len(d)
        cols["base"].append(d[base_label])

        area_val = parse_area(vals[C_AREA])
        area_label = classify_area(area_val)
        d = dicts["areab"]
        if area_label not in d:
            d[area_label] = len(d)
        cols["areab"].append(d[area_label])

        stu_label = classify_stu(vals[C_FUSE])
        d = dicts["stu"]
        if stu_label not in d:
            d[stu_label] = len(d)
        cols["stu"].append(d[stu_label])

        try:
            ji_v = int(vals[C_JI])
        except ValueError:
            ji_v = 0
        ji.append(min(ji_v, 255))
        yr.append(int(vals[C_YEAR]) if vals[C_YEAR].isdigit() else 0)
        height10.append(parse_height10(vals[C_HEIGHT]))

        schools.add(vals[C_SCHOOL_CD] or vals[C_SCHOOL])
        area_sum += area_val
        plan_names.add(vals[25])

        # ---- 즉시조치 워치리스트 ----
        prev_g, cur_g = vals[C_PREV], vals[C_CUR]
        pr, cr = GRADE_RANK.get(prev_g, 0), GRADE_RANK.get(cur_g, 0)
        dropped = bool(pr and cr and cr > pr)
        severe = cur_g in ("D등급", "E등급")
        many = ji_v >= 5
        if dropped or severe or many:
            reasons = []
            if severe:
                reasons.append("D·E등급")
            if dropped:
                reasons.append("등급하락")
            if many:
                reasons.append("지적다발")
            # 0~11 은 표에 그리는 컬럼, 12~22 는 필터 연동 전용
            # (대시보드 전역 필터가 이 표에도 그대로 걸리게 하려면 필수 —
            #  FILTER_DEFS에 차원을 추가할 때마다 여기도 함께 늘려야 한다)
            watch.append([
                vals[C_SIDO], vals[C_OFFICE] or "(직속)", vals[C_SCHOOL],
                vals[C_FAC], vals[C_FUSE] or "(미기재)", vals[C_FTYPE],
                vals[C_YEAR], prev_g or "-", cur_g or "-", ji_v,
                # 구분자는 '|' — 사유 라벨 자체에 '·'가 들어가므로(D·E등급) 충돌 방지
                "|".join(reasons), vals[C_PERIOD],
                vals[C_ESTAB], vals[C_LEVEL], vals[C_METHOD],
                vals[C_OPSTAT], vals[C_FSTAT], vals[C_DONE],
                vals[C_STRUCT] or "(미기재)", vals[C_KIND], base_label, area_label, stu_label,
            ])

        if n % 20000 == 0:
            print("  ... %d행" % n)

    print("총 %d행 파싱 완료 / 워치리스트 %d건" % (n, len(watch)))

    # 워치리스트 정렬: 위험 등급 → 지적수 → 하락폭
    def watch_key(r):
        return (-GRADE_RANK.get(r[8], 0), -r[9],
                -(GRADE_RANK.get(r[8], 0) - GRADE_RANK.get(r[7], 0)))
    watch.sort(key=watch_key)

    payload = {
        "meta": {
            "rows": n,
            "schools": len(schools),
            "areaSum": round(area_sum),
            "plan": sorted(plan_names)[0] if plan_names else "",
            "baseYear": BASE_YEAR,
            "builtAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "source": os.path.basename(src),
        },
        "dict": {k: list(dicts[k].keys()) for k, _ in ALL_DIMS},
        "cols": {},
        "wide": [],
        "ji": b64_u8(ji),
        "yr": b64_u16(yr),
        "height10": b64_u16(height10),
        "watch": watch,
    }

    for key, _ in ALL_DIMS:
        card = len(dicts[key])
        if card > 255:
            payload["cols"][key] = b64_u16(cols[key])
            payload["wide"].append(key)
        else:
            payload["cols"][key] = b64_u8(cols[key])
        print("  차원 %-7s 고유값 %4d%s" % (key, card, "  (16bit)" if card > 255 else ""))

    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    out = os.path.abspath(OUT)
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* 자동 생성 파일 - build_data.py 로 재생성하세요. 직접 수정 금지. */\n")
        f.write("window.SAFETY_DATA = ")
        f.write(body)
        f.write(";\n")
    print("출력 : %s (%.2f MB)" % (out, os.path.getsize(out) / 1e6))


if __name__ == "__main__":
    main()
