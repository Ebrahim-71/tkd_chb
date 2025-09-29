// src/components/Login/competitions/CompetitionDetails.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  // مشترک
  getCompetitionDetail,
  shouldShowSelfRegister,
  shouldShowStudentRegister,
  // کیوروگی
  getCoachApprovalStatus,
  approveCompetition,
  registerSelf,
  getRegisterSelfPrefill,
  getMyEnrollment,
  // پومسه
  getMyEnrollmentPoomsae,
  getPoomsaeCoachApprovalStatus,
  approvePoomsaeCompetition,
} from "../../../api/competitions";
import "./CompetitionDetails.css";

/* ====== DatePicker (Jalali) ====== */
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

/* ---------- Helpers (digits / dates / urls …) ---------- */
function birthFaSafe(locked) {
  if (!locked) return "—";
  const fa = locked.birth_date_jalali_fa || locked.birthDateJalaliFa || locked.birth_date || locked.birthDate;
  if (fa) {
    const s = stripRtlMarks(String(fa)).replace(/-/g, "/").slice(0, 10);
    return toFa(s);
  }
  const iso = locked.birth_date_iso || findBirthISODep(locked);
  if (iso) return isoToJalaliFa(iso);
  return "—";
}

const pad2 = (n) => String(n).padStart(2, "0");

// تبدیل شماره روز ژولیانی به تاریخ جلالی
function d2j(jdn) {
  let { gy } = d2g(jdn);
  let jy = gy - 621;
  let r = jalCal(jy);
  let jdn1f = g2d(gy, 3, r.march);

  let jd, jm;
  if (jdn >= jdn1f) {
    jd = jdn - jdn1f + 1;
  } else {
    jy -= 1;
    r = jalCal(jy);
    jdn1f = g2d(gy - 1, 3, r.march);
    jd = jdn - jdn1f + 1;
  }
  if (jd <= 186) {
    jm = 1 + Math.floor((jd - 1) / 31);
    jd = jd - 31 * (jm - 1);
  } else {
    jd -= 186;
    jm = 7 + Math.floor((jd - 1) / 30);
    jd = jd - 30 * (jm - 7);
  }
  return { jy, jm, jd };
}

function gregorianToJalali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

function toStringSafe(v){ return v == null ? "" : String(v); }

function isoToJalaliFa(iso) {
  let s = toStringSafe(iso);
  s = stripRtlMarks(normalizeDigits(s)).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return toFa(s.replace(/-/g, "/").slice(0,10));
  const gy = parseInt(m[1], 10), gm = parseInt(m[2], 10), gd = parseInt(m[3], 10);
  if (gy < 1700) return toFa(`${gy}/${pad2(gm)}/${pad2(gd)}`);
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  return toFa(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}

const toFa = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const fmtDateFa = (val) => {
  if (!val) return "—";
  let s = String(val);
  const norm = stripRtlMarks(normalizeDigits(s));
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(norm)) return isoToJalaliFa(norm);
  return toFa(norm.slice(0, 10).replace(/-/g, "/"));
};

const isISODate = (s) => {
  if (typeof s !== "string") return false;
  const norm = stripRtlMarks(normalizeDigits(s));
  return /^\d{4}-\d{2}-\d{2}/.test(norm);
};
const toDateSafe = (s) => {
  if (typeof s !== "string") return null;
  const norm = stripRtlMarks(normalizeDigits(s));
  return /^\d{4}-\d{2}-\d{2}/.test(norm) ? new Date(norm) : null;
};

const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";
const absUrl = (u) => (u ? (u.startsWith?.("http") ? u : `${API_BASE}${u}`) : null);
const fileNameFromUrl = (u) => {
  try { return decodeURIComponent(String(u).split("/").pop()); } catch { return "فایل"; }
};
const pickToken = (role) =>
  localStorage.getItem("coach_token") ||
  localStorage.getItem("both_token") ||
  localStorage.getItem(`${role}_token`) ||
  localStorage.getItem("access_token") ||
  "";
const normalizeDigits = (s = "") =>
  String(s)
    .replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)])
    .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
const sanitizeWeight = (raw = "") => {
  let t = normalizeDigits(raw);
  t = t.replace(/[\/٫,،]/g, ".");
  t = t.replace(/[^0-9.]/g, "");
  t = t.replace(/(\..*)\./g, "$1");
  return t;
};

// کاراکترهای نامرئی RTL
const stripRtlMarks = (s = "") => s.replace(/[\u200e\u200f\u200c\u202a-\u202e]/g, "");

/* —— تبدیل جلالی به میلادی —— */
const div = (a, b) => Math.trunc(a / b);
const jalBreaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy) {
  let bl = jalBreaks.length, gy = jy + 621, leapJ = -14, jp = jalBreaks[0], jm, jump = 0, n, i;
  if (jy < jp || jy >= jalBreaks[bl - 1]) return { gy, march: 20, leap: false };
  for (i = 1; i < bl; i++) {
    jm = jalBreaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ += div(n, 33) * 8 + div(n % 33, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ++;
  const leapG = div(gy, 4) - div(div(gy, 100) + 1, 4) + div(gy, 400) - 70;
  const march = 20 + leapJ - leapG;
  let leap = false;
  if (n >= 0) if ([1, 5, 9, 13, 17, 22, 26, 30].includes(n % 33)) leap = true;
  return { gy, march, leap };
}
function g2d(gy, gm, gd) {
  const a = div(14 - gm, 12); let y = gy + 4800 - a; let m = gm + 12 * a - 3;
  return gd + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
}
function d2g(jdn) {
  const j = jdn + 32044; const g = div(j, 146097); const dg = j % 146097;
  const c = div((div(dg, 36524) + 1) * 3, 4); const dc = dg - c * 36524;
  const b = div(dc, 1461); const db = dc % 1461;
  const a = div((div(db, 365) + 1) * 3, 4); const da = db - a * 365;
  let y = g * 400 + c * 100 + b * 4 + a;
  let m = div(5 * da + 308, 153) - 2;
  const d = da - div(153 * (m + 2) + 2, 5) + 1;
  y = y - 4800 + div(m + 2, 12); m = (m + 2) % 12 + 1;
  return { gy: y, gm: m, gd: d };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function jalaliToGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }

// الگوی ISO برای جست‌وجوی تاریخ در آبجکت
const ISO_REGEX = /\b(19|20)\d{2}-\d{2}-\d{2}\b/;
function findBirthISODep(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "string" && ISO_REGEX.test(v)) return v.match(ISO_REGEX)[0];
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const f = findBirthISODep(v);
      if (f) return f;
    }
  }
  return "";
}

// اصلاح سالهای ناقص رایج (ایمن‌تر)
function fixJalaliYear(y) {
  if (y < 0) return y;
  if (y < 100) return y >= 60 ? 1300 + y : 1400 + y;
  if (y >= 700 && y <= 999) return y + 600;
  return y;
}

// جلالی → Date
function parseJalaliInputToDate(val) {
  if (!val) return null;
  if (typeof val === "object" && val?.isValid) {
    try { return val.toDate(); } catch {}
  }
  const mm = stripRtlMarks(normalizeDigits(String(val)))
    .trim()
    .replace(/-/g, "/")
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!mm) return null;
  const jy = parseInt(mm[1], 10), jm = parseInt(mm[2], 10), jd = parseInt(mm[3], 10);
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  const d = new Date(gy, gm - 1, gd);
  return isNaN(d.getTime()) ? null : d;
}
const toJalaliDO = (s) => {
  if (!s) return null;
  try {
    const t = stripRtlMarks(normalizeDigits(String(s))).replace(/-/g, "/");
    return new DateObject({ date: t, calendar: persian, locale: persian_fa, format: "YYYY/MM/DD" });
  } catch { return null; }
};

/* ---------- نمایش تاریخ تولد از prefill (شمسی + ارقام فارسی) ---------- */

const BIRTH_KEYS = [
  "birth_date_jalali_fa","birthDateJalaliFa",
  "birth_date_jalali","birthDateJalali",
  "birth_jalali","birthJalali",
  "birth_date","birthDate","date_of_birth","dateOfBirth","dob",
  "birth","birthday"
];

const BIRTH_KEY_HINTS = /birth|dob|date.?of.?birth|birthday|taval|tavalod|ولد/i;
function findBirthValueDeep(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (BIRTH_KEY_HINTS.test(k) && v != null && String(v).trim() !== "") return v;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = findBirthValueDeep(v);
      if (found) return found;
    }
  }
  return "";
}

/* ====== پارسر تاریخ + نمایش شمسی مطمئن برای تولد ====== */

function parseYMDFlexible(raw) {
  if (!raw) return null;
  let s = stripRtlMarks(normalizeDigits(String(raw))).trim();
  s = s.replace(/^["']+|["']+$/g, "");
  s = s.replace(/[.\-]/g, "/");
  const m = s.match(/(\d{1,4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,4})/);
  if (!m) return null;

  let a = parseInt(m[1], 10);
  let b = parseInt(m[2], 10);
  let c = parseInt(m[3], 10);

  if (a >= 1700) return { y: a, mo: b, d: c, calendar: "greg" };
  if (c >= 1700) return { y: c, mo: b, d: a, calendar: "greg" };

  const isFirstYear = String(a).length >= 3;
  return isFirstYear
    ? { y: a, mo: b, d: c, calendar: "jalali" }
    : { y: c, mo: b, d: a, calendar: "jalali" };
}

function pickBirthFa(locked) {
  if (!locked) return "—";

  const directFa =
    locked?.birth_date_jalali_fa ?? locked?.birthDateJalaliFa;
  if (directFa) {
    return toFa(stripRtlMarks(String(directFa)).replace(/-/g, "/").slice(0, 10));
  }

  const directEn =
    locked?.birth_date_jalali ?? locked?.birthDateJalali ??
    locked?.birth_jalali    ?? locked?.birthJalali;
  if (directEn) {
    const s = stripRtlMarks(normalizeDigits(String(directEn)))
      .replace(/-/g, "/")
      .slice(0, 10);
    return toFa(s);
  }

  const isoDeep = findBirthISODep(locked);
  if (isoDeep) return isoToJalaliFa(isoDeep);

  let raw = "";
  for (const k of BIRTH_KEYS) {
    const v = locked?.[k];
    if (v != null && String(v).trim() !== "") { raw = v; break; }
  }
  if (!raw) raw = findBirthValueDeep(locked);
  if (!raw) return "—";

  const ymd = parseYMDFlexible(raw);
  if (!ymd) return toFa(String(raw).slice(0, 10).replace(/-/g, "/"));

  let { y, mo, d, calendar } = ymd;
  if (calendar === "greg") {
    const { jy, jm, jd } = gregorianToJalali(y, mo, d);
    return toFa(`${jy}/${pad2(jm)}/${pad2(jd)}`);
  }
  y = fixJalaliYear(y);
  return toFa(`${y}/${pad2(mo)}/${pad2(d)}`);
}


/* ---------- Debug helpers ---------- */
const _GENDER_MAP = {
  male: "male", m: "male", man: "male", "آقا": "male", "اقا": "male", "مرد": "male",
  "آقایان": "male", "آقايان": "male", "اقایان": "male",
  female: "female", f: "female", woman: "female", "زن": "female", "خانم": "female",
  "بانو": "female", "بانوان": "female", "خانم‌ها": "female", "خانمها": "female",
};
function normGender(v) {
  if (v == null) return null;
  const t = String(v).trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, "").replace(/-/g, "");
  return _GENDER_MAP[t] || t;
}
function dumpEligibility(data) {
  console.groupCollapsed("🧪 Eligibility debug");
  console.log("style_display:", data?.style_display);
  console.log("gender_display(raw):", data?.gender_display, "→ norm:", normGender(data?.gender_display));
  console.log("can_register:", data?.can_register);
  console.log("user_eligible_self:", data?.user_eligible_self);
  if (data?.eligibility_debug) console.log("eligibility_debug:", data.eligibility_debug);
  else console.warn("eligibility_debug نبود. فیلدهای موجود:", Object.keys(data || {}));
  if (Array.isArray(data?.allowed_belts)) console.log("allowed_belts:", data.allowed_belts);
  if (data?.age_from || data?.age_to) console.log("age_from/to:", data.age_from, data.age_to);
  console.groupEnd();
}

/* ---------- Component ---------- */
export default function CompetitionDetails() {
  const { slug, role: roleFromRoute } = useParams();
  const navigate = useNavigate();

  const role = (roleFromRoute || localStorage.getItem("user_role") || "guest").toLowerCase();
  const isPlayer = role === "player" || role === "both";
  const isCoach  = role === "coach"  || role === "both";

  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // فرم ثبت‌نام خودی (کیوروگی)
  const [reg, setReg] = useState({
    open: false,
    loading: false,
    errors: {},
    can_register: false,
    need_coach_code: false,
    locked: null,
    coach_code: "",
    weight: "",
    insurance_number: "",
    insurance_issue_date: "", // شمسی YYYY/MM/DD
    confirmed: false,
  });

  // فرم ثبت‌نام خودی (پومسه)
  const [regP, setRegP] = useState({
    open: false, loading: false, errors: {},
    can_register: false, need_coach_code: false,
    locked: null,
    poomsae_type: "standard", // 'standard' | 'creative'
    coach_code: "",
    insurance_number: "",
    insurance_issue_date: "",
    confirmed: false,
  });

  // مودال کد مربی
  const [codeModal, setCodeModal] = useState({
    open: false,
    loading: true,
    code: null,
    approved: false,
    error: "",
  });

  // وضعیت کارت
  const [cardInfo, setCardInfo] = useState({
    loading: false, checked: false, enrollmentId: null, status: null, canShow: false,
  });

  // لایت‌باکس تصاویر
  const [lightbox, setLightbox] = useState(null);

  // مودال نتایج (رزرو برای آینده)
  const [resultsModal] = useState({ open: false, loading: false, error: "", has: false, rows: [] });

  // لاگ کمکی برای تاریخ تولد
  useEffect(() => {
    if (!reg?.locked) return;
    console.log("locked.birth (kyorugi):", {
      isoDeep: findBirthISODep(reg.locked),
      raw:
        reg.locked?.birth_date ??
        reg.locked?.birthDate ??
        reg.locked?.dob ??
        findBirthValueDeep(reg.locked),
      locked: reg.locked,
    });
  }, [reg.locked]);

  useEffect(() => {
    if (!regP?.locked) return;
    console.log("locked.birth (poomsae):", {
      isoDeep: findBirthISODep(regP.locked),
      raw:
        regP.locked?.birth_date ??
        regP.locked?.birthDate ??
        regP.locked?.dob ??
        findBirthValueDeep(regP.locked),
      locked: regP.locked,
    });
  }, [regP.locked]);
  useEffect(() => {
    if (!regP?.locked) return;
    console.log("BIRTH (rendered):", pickBirthFa(regP.locked));
  }, [regP.locked]);

  /* --- لود جزئیات مسابقه --- */
  useEffect(() => {
    let mounted = true;
    setLoading(true); setErr("");
    getCompetitionDetail(slug, { debug: true })
      .then((data) => {
        if (!mounted) return;
        setCompetition(data);
        window.__lastCompetition = data;
        dumpEligibility(data);
        if (typeof data?.user_eligible_self === "boolean") {
          console.log(`✅ Eligibility = ${data.user_eligible_self ? "TRUE" : "FALSE"}`, data.eligibility_debug || {});
        }
      })
      .catch((e) => { if (mounted) setErr(e?.message || "خطا در دریافت اطلاعات مسابقه"); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [slug]);

  /* --- تشخیص سبک --- */
  const styleRaw = useMemo(() => String(competition?.style_display || competition?.style || "").trim(), [competition]);
  const isKyorugi = styleRaw === "کیوروگی" || /kyorugi|kyŏrugi|sparring/i.test(styleRaw);
  const isPoomsae = styleRaw === "پومسه"   || /poomsae|poom-se|forms/i.test(styleRaw);

  /* --- بررسی ثبت‌نام کاربر برای کارت --- */
  useEffect(() => {
    let mounted = true;

    if (!isPlayer || !competition) {
      setCardInfo((s) => ({ ...s, checked: true, enrollmentId: null, status: null }));
      return () => { mounted = false; };
    }

    setCardInfo({ loading: true, checked: false, enrollmentId: null, status: null, canShow: false });

    const fn = (String(competition?.style_display || competition?.style || "") === "پومسه")
      ? getMyEnrollmentPoomsae
      : getMyEnrollment;

    fn(slug)
      .then((res) => {
        if (!mounted) return;
        setCardInfo({
          loading: false,
          checked: true,
          enrollmentId: res?.enrollment_id || null,
          status: res?.status || null,
          canShow: !!res?.can_show_card,
        });
      })
      .catch(() => {
        if (!mounted) return;
        setCardInfo({ loading: false, checked: true, enrollmentId: null, status: null, canShow: false });
      });

    return () => { mounted = false; };
  }, [slug, isPlayer, competition]);

  // تاریخ‌ها
  const registrationStart = useMemo(() => toDateSafe(competition?.registration_start), [competition]);
  const registrationEnd   = useMemo(() => toDateSafe(competition?.registration_end), [competition]);
  const competitionDate   = useMemo(() => toDateSafe(competition?.competition_date), [competition]);

  const { can_register, user_eligible_self } = competition || {};
  const today = stripTime(new Date());

  const inRegWindow = useMemo(() => {
    if (registrationStart && registrationEnd) {
      const s = stripTime(registrationStart);
      const e = stripTime(registrationEnd);
      return today >= s && today <= e;
    }
    return !!competition?.registration_open;
  }, [registrationStart, registrationEnd, competition?.registration_open, today]);

  const registrationOpen = useMemo(() => {
    if (typeof can_register === "boolean" && typeof user_eligible_self === "boolean") return can_register && user_eligible_self;
    if (typeof can_register === "boolean") return can_register;
    return inRegWindow;
  }, [can_register, user_eligible_self, inRegWindow]);

  const canRegisterOthers = useMemo(() => (typeof can_register === "boolean" ? can_register : inRegWindow), [can_register, inRegWindow]);

  const isPastCompetition = useMemo(() => {
    if (competitionDate) return today > stripTime(competitionDate);
    return false;
  }, [competitionDate, today]);

  const canSeeCard = useMemo(() => {
    if (!isPlayer || !cardInfo.enrollmentId) return false;
    if (typeof cardInfo.canShow === "boolean") return cardInfo.canShow;
    const st = String(cardInfo.status || "");
    return ["paid", "confirmed", "approved", "accepted", "completed"].includes(st);
  }, [isPlayer, cardInfo.enrollmentId, cardInfo.status, cardInfo.canShow]);

  const disableReason =
    typeof can_register === "boolean" && !can_register
      ? "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است"
      : typeof user_eligible_self === "boolean" && !user_eligible_self
      ? "صلاحیت شما (جنسیت/کمربند) با شرایط مسابقه هم‌خوانی ندارد"
      : "ثبت‌نام برای شما مجاز نیست";

  const beltGroupsDisplay = useMemo(() => {
    const groups = competition?.belt_groups || competition?.belt_groups_display || [];
    if (Array.isArray(groups)) {
      return groups.map((g) => (typeof g === "string" ? g : g?.label || g?.name)).filter(Boolean).join("، ");
    }
    return groups || "—";
  }, [competition]);

  const beltHeaderText = useMemo(
    () => (isPoomsae ? beltGroupsDisplay || "—" : competition?.belt_level_display || "—"),
    [isPoomsae, beltGroupsDisplay, competition]
  );

  const ageGroupsDisplay = useMemo(() => {
    if (competition?.age_groups_display) return competition.age_groups_display;
    const arr = Array.isArray(competition?.age_groups) ? competition.age_groups : [];
    return arr.filter(Boolean).join("، ") || "—";
  }, [competition]);

  const matAssignments = useMemo(() => (Array.isArray(competition?.mat_assignments) ? competition.mat_assignments : []), [competition]);

  const posterSrc = useMemo(() => absUrl(competition?.poster?.url || competition?.poster) || "/placeholder.jpg", [competition]);

  const addressFull = useMemo(() => {
    if (competition?.address_full) return competition.address_full;
    const city = competition?.city || "";
    const addr = competition?.address || "";
    if (city && addr) return `${city}، ${addr}`;
    return city || addr || "—";
  }, [competition]);

  const beltGroupsRowValue = useMemo(() => beltGroupsDisplay || "—", [beltGroupsDisplay]);

  const poomsaeAgeRowValue = useMemo(() => {
    const txt = ageGroupsDisplay || "—";
    return (<>{txt}{isPoomsae && (<span className="cd-hint" style={{ fontSize: 12, opacity: 0.8 }}> </span>)}</>);
  }, [ageGroupsDisplay, isPoomsae]);

  /* ---------- Coach code modal actions ---------- */
  const onOpenCoachCode = async () => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("both_token");
    if (!token) {
      alert("برای مشاهده کد باید با حساب مربی وارد شوید.");
      navigate(`/dashboard/${encodeURIComponent(role)}`);
      return;
    }
    setCodeModal({ open: true, loading: true, code: null, approved: false, error: "" });
    try {
      const data = isPoomsae ? await getPoomsaeCoachApprovalStatus(slug) : await getCoachApprovalStatus(slug);
      setCodeModal({ open: true, loading: false, code: data?.code || null, approved: !!data?.approved, error: "" });
    } catch (e) {
      setCodeModal({ open: true, loading: false, code: null, approved: false, error: e.message || "خطا" });
    }
  };

  const approveAndGetCode = async () => {
    try {
      setCodeModal((m) => ({ ...m, loading: true, error: "" }));
      const res = isPoomsae ? await approvePoomsaeCompetition(slug) : await approveCompetition(slug);
      setCodeModal({ open: true, loading: false, code: res?.code || null, approved: true, error: "" });
    } catch (e) {
      setCodeModal((m) => ({ ...m, loading: false, error: e.message || "خطا در دریافت کد" }));
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(String(codeModal.code || ""));
      alert("کد کپی شد.");
    } catch {
      window.prompt("برای کپی، کد را انتخاب و کپی کنید:", String(codeModal.code || ""));
    }
  };

  /* ---------- Register self (فرم کیوروگی) ---------- */
  const openRegisterForm = async () => {
    if (!registrationOpen || !isPlayer || !shouldShowSelfRegister(role)) return;
    setReg((r) => ({ ...r, open: true, loading: true, errors: {} }));
    try {
      const data = await getRegisterSelfPrefill(slug);
      setReg((r) => ({
        ...r,
        loading: false,
        can_register: !!data?.can_register,
        need_coach_code: !!data?.need_coach_code,
        locked: data?.locked || null,
        weight: data?.suggested?.weight ?? "",
        insurance_number: data?.suggested?.insurance_number ?? "",
        insurance_issue_date: data?.suggested?.insurance_issue_date ?? "",
      }));
    } catch (e) {
      setReg((r) => ({ ...r, loading: false, errors: { __all__: e.message || "خطا در دریافت اطلاعات" } }));
    }
  };

  /* ---------- Register self (فرم پومسه) ---------- */
  const openRegisterFormPoomsae = async () => {
    if (!registrationOpen || !isPlayer || !shouldShowSelfRegister(role)) return;
    setRegP((r) => ({ ...r, open: true, loading: true, errors: {} }));

    const token = pickToken(role);
    const shortUrl = `${API_BASE}/api/competitions/auth/poomsae/${encodeURIComponent(slug)}/prefill/`;
    const longUrl  = `${API_BASE}/api/competitions/competitions/auth/poomsae/${encodeURIComponent(slug)}/prefill/`;

    async function doGet(url) {
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    }

    try {
      let { res, data } = await doGet(shortUrl);
      if (res.status === 404) ({ res, data } = await doGet(longUrl));

      if (res.status === 401) {
        setRegP((r) => ({
          ...r,
          open: true,
          loading: false,
          can_register: true,
          need_coach_code: !!competition?.coach_approval_required,
          locked: null,
          insurance_number: "",
          insurance_issue_date: "",
          confirmed: false,
          errors: { __all__: "برای دیدن مشخصات باید لاگین کنید." },
        }));
        return;
      }

      if (res.ok) {
        setRegP((r) => ({
          ...r,
          open: true,
          loading: false,
          can_register: data?.can_register ?? true,
          need_coach_code: data?.need_coach_code ?? !!competition?.coach_approval_required,
          locked: data?.locked || null,
          coach_code: "",
          insurance_number: data?.suggested?.insurance_number ?? "",
          insurance_issue_date: data?.suggested?.insurance_issue_date ?? "",
          confirmed: false,
          errors: {},
        }));
      } else {
        setRegP((r) => ({
          ...r,
          open: true,
          loading: false,
          can_register: true,
          need_coach_code: !!competition?.coach_approval_required,
          locked: null,
          coach_code: "",
          insurance_number: "",
          insurance_issue_date: "",
          confirmed: false,
        }));
      }
    } catch {
      setRegP((r) => ({
        ...r,
        open: true,
        loading: false,
        can_register: true,
        need_coach_code: !!competition?.coach_approval_required,
        locked: null,
        coach_code: "",
        insurance_number: "",
        insurance_issue_date: "",
        confirmed: false,
      }));
    }
  };

  // حداکثر تاریخ مجاز صدور = ۳ روز قبل از مسابقه
  const maxIssueDO = useMemo(() => {
    if (!competitionDate) return null;
    const d = new DateObject({ date: competitionDate, calendar: persian, locale: persian_fa });
    return d.subtract(3, "days");
  }, [competitionDate]);

  // حداقل تاریخ مجاز صدور = ۱ سال قبل از مسابقه
  const minIssueDO = useMemo(() => {
    if (!competitionDate) return null;
    const d = new DateObject({ date: competitionDate, calendar: persian, locale: persian_fa });
    return d.subtract(1, "year");
  }, [competitionDate]);

  /* ---------- Validation ---------- */
  const validateForm = () => {
    const errors = {};
    const w = sanitizeWeight(reg.weight);
    if (!w || isNaN(Number(w))) errors.weight = "وزن نامعتبر است.";

    if (competitionDate) {
      const issueDate = parseJalaliInputToDate(reg.insurance_issue_date);
      if (!issueDate || isNaN(issueDate.getTime())) {
        errors.insurance_issue_date = "تاریخ صدور نامعتبر است (الگوی ۱۴۰۳/۰۵/۲۰).";
      } else {
        const comp = stripTime(competitionDate);
        const minOk72h = new Date(comp); minOk72h.setDate(minOk72h.getDate() - 3);
        const oldest1y = new Date(comp); oldest1y.setFullYear(oldest1y.getFullYear() - 1);

        if (issueDate > minOk72h) errors.insurance_issue_date = "تاریخ صدور باید حداقل ۷۲ ساعت قبل از تاریخ مسابقه باشد.";
        else if (issueDate < oldest1y) errors.insurance_issue_date = "اعتبار کارت بیمه منقضی است (بیش از یک سال قبل از مسابقه).";
      }
    }

    if (reg.need_coach_code && !String(reg.coach_code).trim()) errors.coach_code = "کد تأیید مربی الزامی است.";
    if (!reg.confirmed) errors.confirmed = "لطفاً صحت اطلاعات را تأیید کنید.";
    if (!String(reg.insurance_number).trim()) errors.insurance_number = "شماره بیمه الزامی است.";
    return errors;
  };

 const validateFormPoomsae = () => {
  const errors = {};

  // نوع مسابقه
  if (!["standard", "creative"].includes(String(regP.poomsae_type))) {
    errors.poomsae_type = "نوع مسابقه را انتخاب کنید.";
  }

  // تاریخ صدور بیمه
  if (competitionDate) {
    const issueDate = parseJalaliInputToDate(regP.insurance_issue_date);
    if (!issueDate || isNaN(issueDate.getTime())) {
      errors.insurance_issue_date = "تاریخ صدور نامعتبر است (الگوی ۱۴۰۳/۰۵/۲۰).";
    } else {
      const comp = stripTime(competitionDate);
      const minOk72h = new Date(comp); minOk72h.setDate(minOk72h.getDate() - 3);
      const oldest1y = new Date(comp); oldest1y.setFullYear(oldest1y.getFullYear() - 1);
      if (issueDate > minOk72h) {
        errors.insurance_issue_date = "تاریخ صدور باید حداقل ۷۲ ساعت قبل از تاریخ مسابقه باشد.";
      } else if (issueDate < oldest1y) {
        errors.insurance_issue_date = "اعتبار کارت بیمه منقضی است (بیش از یک سال قبل از مسابقه).";
      }
    }
  }

  // شماره بیمه
  if (!String(regP.insurance_number).trim()) {
    errors.insurance_number = "شماره بیمه الزامی است.";
  }

  // کد مربی — اجباری و فقط عدد ۵ تا ۸ رقمی
  const coachCode = normalizeDigits(regP.coach_code || "").trim();
  if (!coachCode) {
    errors.coach_code = "کد تأیید مربی الزامی است.";
  } else if (!/^\d{5,8}$/.test(coachCode)) {
    errors.coach_code = "کد تأیید مربی باید عددی ۵ تا ۸ رقمی باشد.";
  }

  // تایید نهایی
  if (!regP.confirmed) {
    errors.confirmed = "لطفاً صحت اطلاعات را تأیید کنید.";
  }

  return errors;
};


  /* ---------- Submit: Kyorugi ---------- */
  const submitRegister = async (e) => {
    e.preventDefault();
    const errs = validateForm();
    if (Object.keys(errs).length) { setReg((r) => ({ ...r, errors: errs })); return; }

    setReg((r) => ({ ...r, loading: true, errors: {} }));
    try {
      const issueDateObj = parseJalaliInputToDate(reg.insurance_issue_date);
      const issueISO = issueDateObj && !isNaN(issueDateObj.getTime()) ? issueDateObj.toISOString().slice(0, 10) : "";
      if (!issueISO) { setReg((r) => ({ ...r, loading: false, errors: { insurance_issue_date: "تاریخ نامعتبر است." } })); return; }

      const payload = {
        coach_code: normalizeDigits(reg.coach_code || "").trim() || undefined,
        declared_weight: sanitizeWeight(reg.weight || ""),
        insurance_number: normalizeDigits(reg.insurance_number || "").trim(),
        insurance_issue_date: issueISO,
      };

      const res = await registerSelf(slug, payload);
      const eid = res?.enrollment_id ?? res?.data?.id ?? null;
      const st  = res?.status ?? res?.data?.status ?? "pending_payment";

      setReg((r) => ({ ...r, loading: false, open: false }));

      if (st === "pending_payment") {
        alert("✅ ثبت‌نام انجام شد. لطفاً پرداخت را تکمیل کنید. پس از پرداخت، آیدی کارت فعال می‌شود.");
        setCardInfo((s) => ({ ...s, enrollmentId: eid || s.enrollmentId, status: st, checked: true }));
      } else if (["paid", "confirmed"].includes(String(st))) {
        navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/${eid}/card`);
      } else {
        alert(`ثبت‌نام انجام شد. وضعیت: ${st}`);
      }
    } catch (e2) {
      const p = e2?.payload || {};
      const mapped = {};
      if (p.coach_code) mapped.coach_code = Array.isArray(p.coach_code) ? p.coach_code.join(" ") : String(p.coach_code);
      if (p.declared_weight) mapped.weight = Array.isArray(p.declared_weight) ? p.declared_weight.join(" ") : String(p.declared_weight);
      if (p.insurance_number) mapped.insurance_number = Array.isArray(p.insurance_number) ? p.insurance_number.join(" ") : String(p.insurance_number);
      if (p.insurance_issue_date) mapped.insurance_issue_date = Array.isArray(p.insurance_issue_date) ? p.insurance_issue_date.join(" ") : String(p.insurance_issue_date);
      if (Array.isArray(p.non_field_errors) && p.non_field_errors.length) mapped.__all__ = p.non_field_errors.join(" ");
      const fallback = p.detail || e2.message || "خطای نامشخص در ثبت‌نام";
      if (!Object.keys(mapped).length) mapped.__all__ = fallback;
      setReg((r) => ({ ...r, loading: false, errors: mapped }));
    }
  };

  /* ---------- Submit: Poomsae ---------- */
  const submitRegisterPoomsae = async (e) => {
    e.preventDefault();
    const errs = validateFormPoomsae();
    if (Object.keys(errs).length) { setRegP((r) => ({ ...r, errors: errs })); return; }

    setRegP((r) => ({ ...r, loading: true, errors: {} }));
    try {
      const token = pickToken(role);
      const url = `${API_BASE}/api/competitions/auth/poomsae/${encodeURIComponent(slug)}/register/self/`;

      const issueDateObj = parseJalaliInputToDate(regP.insurance_issue_date);
      const issueISO = issueDateObj && !isNaN(issueDateObj.getTime()) ? issueDateObj.toISOString().slice(0, 10) : "";
      if (!issueISO) { setRegP((r) => ({ ...r, loading: false, errors: { insurance_issue_date: "تاریخ نامعتبر است." } })); return; }

      const payload = {
        poomsae_type: regP.poomsae_type,
        insurance_number: normalizeDigits(regP.insurance_number || "").trim(),
        insurance_issue_date: issueISO,
      };
      const coachCode = normalizeDigits(regP.coach_code || "").trim();
      if (coachCode) payload.coach_code = coachCode;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      let data = {};
      try { data = await res.json(); } catch { data = {}; }

      if (!res.ok) {
        const p = data || {};
        const mapped = {};
        if (p.coach_code) mapped.coach_code = Array.isArray(p.coach_code) ? p.coach_code.join(" ") : String(p.coach_code);
        if (p.insurance_number) mapped.insurance_number = Array.isArray(p.insurance_number) ? p.insurance_number.join(" ") : String(p.insurance_number);
        if (p.insurance_issue_date) mapped.insurance_issue_date = Array.isArray(p.insurance_issue_date) ? p.insurance_issue_date.join(" ") : String(p.insurance_issue_date);
        if (Array.isArray(p.non_field_errors) && p.non_field_errors.length) mapped.__all__ = p.non_field_errors.join(" ");
        const fallback = p.detail || (res.status === 500 ? "خطای داخلی سرور" : `خطای ${res.status}`);
        if (!Object.keys(mapped).length) mapped.__all__ = fallback;
        setRegP((r) => ({ ...r, loading: false, errors: mapped }));
        return;
      }

      const eid = data?.enrollment_id ?? null;
      const st  = data?.status ?? "pending_payment";
      setRegP((r) => ({ ...r, loading: false, open: false }));

      if (st === "pending_payment") {
        alert("✅ ثبت‌نام انجام شد. لطفاً پرداخت را تکمیل کنید.");
        setCardInfo((s) => ({ ...s, enrollmentId: eid || s.enrollmentId, status: st, checked: true }));
      } else if (["paid", "confirmed"].includes(String(st))) {
        navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/${eid}/card`);
      } else {
        alert(`ثبت‌نام انجام شد. وضعیت: ${st}`);
      }
    } catch (e2) {
      setRegP((r) => ({ ...r, loading: false, errors: { __all__: e2.message || "خطای نامشخص در ثبت‌نام" } }));
    }
  };

  // مسیرها
  const goBackToDashboardList = () => navigate(`/dashboard/${encodeURIComponent(role)}`);
  const goRegisterAthlete      = () => navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/register/athlete`);
  const goRegisterTeam         = () => navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/register/team`);
  const goBracket              = () => navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/bracket`);
  const goResults              = () => navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/results`);

  if (loading) return (<div className="cd-container"><div className="cd-skeleton">در حال بارگذاری…</div></div>);
  if (err)     return (<div className="cd-container"><div className="cd-error">{err}</div></div>);
  if (!competition) return (<div className="cd-container"><div className="cd-error">مسابقه یافت نشد.</div></div>);

  const showSelfRegBtn    = isPlayer && shouldShowSelfRegister(role);
  const showStudentRegBtn = isCoach && shouldShowStudentRegister(role);
  const studentBtnLabel   = isCoach ? "ثبت‌ نام بازیکن" : "ثبت‌نام شاگرد";

  return (
    <div className="cd-container" dir="rtl">
      {/* هدر */}
      <div className="cd-hero">
        <img className="cd-poster" src={posterSrc} alt={competition.title} onError={(e) => (e.currentTarget.src = "/placeholder.jpg")} />
        <div className="cd-hero-body">
          <h1 className="cd-title">{competition.title}</h1>

          <div className="cd-chips">
            <span className="cd-chip">سبک مسابقه: <strong>{competition.style_display || "—"}</strong></span>

            {isKyorugi && (
              <span className="cd-chip">رده سنی: <strong>{competition.age_category_name || "—"}</strong></span>
            )}

            <span className="cd-chip">رده کمربندی: <strong>{beltHeaderText}</strong></span>
            <span className="cd-chip">جنسیت: <strong>{competition.gender_display || "—"}</strong></span>

            <span className={`cd-chip ${competition?.can_register ? "ok" : "nok"}`}>
              ثبت‌نام: <strong>{competition?.can_register ? "بله" : "خیر"}</strong>
            </span>

            {typeof competition?.user_eligible_self === "boolean" && (
              <span className={`cd-chip ${competition?.user_eligible_self ? "ok" : "nok"}`}>
                صلاحیت: <strong>{competition?.user_eligible_self ? "بله" : "خیر"}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* جزئیات */}
      <section className="cd-section">
        <h2 className="cd-section-title">جزئیات مسابقه</h2>
        <div className="cd-grid">
          <InfoRow label="مبلغ ورودی" value={competition.entry_fee ? `${toFa(Number(competition.entry_fee).toLocaleString())} تومان` : "رایگان"} />
          <InfoRow label="گروه‌های کمربندی انتخاب‌شده" value={beltGroupsRowValue} />

          <InfoRow label="شروع ثبت‌نام" value={fmtDateFa(competition.registration_start_jalali ?? competition.registration_start)} />
          <InfoRow label="پایان ثبت‌نام" value={fmtDateFa(competition.registration_end_jalali ?? competition.registration_end)} />

          {/* تاریخ قرعه‌کشی برای هر دو سبک */}
          <InfoRow label="تاریخ قرعه‌کشی" value={fmtDateFa(competition.draw_date_jalali ?? competition.draw_date)} />

          {/* کیوروگی: وزن‌کشی */}
          {isKyorugi && (
            <InfoRow label="تاریخ وزن‌کشی" value={fmtDateFa(competition.weigh_date_jalali ?? competition.weigh_date)} />
          )}

          <InfoRow label="تاریخ برگزاری" value={fmtDateFa(competition.competition_date_jalali ?? competition.competition_date)} />

          {/* نشانی یکپارچه برای هر دو سبک */}
          <InfoRow label="نشانی محل برگزاری" value={addressFull} multiline />

          {isKyorugi && <InfoRow label="تعداد زمین‌ها" value={toFa(competition.mat_count ?? "—")} />}

          {isPoomsae && <InfoRow label="گروه‌های سنی" value={poomsaeAgeRowValue} multiline />}
          {isPoomsae && (
            <div id="sabt">
              <div className="cd-hintbox"><span>ثبت‌نام پومسه تیمی بر عهده مربی می‌باشد</span></div>
            </div>
          )}
        </div>
      </section>

      {/* تخصیص وزن‌ها به زمین‌ها (فقط کیوروگی) */}
      {isKyorugi && (
        <section className="cd-section">
          <h2 className="cd-section-title">تخصیص وزن‌ها به زمین‌ها</h2>
          {Array.isArray(matAssignments) && matAssignments.length > 0 ? (
            <div className="cd-mats">
              {matAssignments.map((m) => (
                <div className="cd-mat-card" key={m.id || m.mat_number}>
                  <div className="cd-mat-header">زمین {toFa(m.mat_number)}</div>
                  {Array.isArray(m.weights) && m.weights.length > 0 ? (
                    <ul className="cd-weight-list">
                      {m.weights.map((w) => (
                        <li key={w.id}>
                          <span className="cd-weight-name">{w.name}</span>
                          <span className="cd-weight-range">
                            {toFa(w.min_weight)}–{toFa(w.max_weight)} kg{" "}
                            <em>({w.gender === "male" ? "مرد" : w.gender === "female" ? "زن" : "—"})</em>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (<div className="cd-muted">وزنی ثبت نشده.</div>)}
                </div>
              ))}
            </div>
          ) : (<div className="cd-muted">هنوز اطلاعات زمین‌ها وارد نشده است.</div>)}
        </section>
      )}

      {/* پیوست‌ها */}
      <section className="cd-section">
        <h2 className="cd-section-title">پیوست‌ها</h2>
        {(() => {
          const imgsRaw =
            (Array.isArray(competition.images) && competition.images.map((i) => i.image || i.url || i.file)) ||
            (Array.isArray(competition.gallery) && competition.gallery.map((i) => i.image || i.url)) || [];
          const filesRaw =
            (Array.isArray(competition.files) && competition.files.map((f) => f.file || f.url)) ||
            (Array.isArray(competition.documents) && competition.documents.map((f) => f.file || f.url)) || [];

          const images = imgsRaw.map(absUrl).filter(Boolean);
          const files = filesRaw.map(absUrl).filter(Boolean);

          return (
            <div className="cd-attachments-wrap">
              {/* تصاویر */}
              <div className="cd-attachments-block">
                <div className="cd-block-head"><span>تصاویر</span><span className="cd-count">{toFa(images.length)}</span></div>
                {images.length === 0 ? (
                  <div className="cd-muted cd-empty">عکسی آپلود نشده است.</div>
                ) : (
                  <div className="cd-attachments">
                    {images.map((src, idx) => (
                      <button key={`img-${idx}`} type="button" className="cd-attachment img" onClick={() => setLightbox({ type: "img", url: src })} title="نمایش تصویر">
                        <img className="cd-thumb" src={src} alt={`image-${idx}`} />
                        <span>مشاهده</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* فایل‌ها */}
              <div className="cd-attachments-block">
                <div className="cd-block-head"><span>فایل‌ها</span><span className="cd-count">{toFa(files.length)}</span></div>
                {files.length === 0 ? (
                  <div className="cd-muted cd-empty">فایلی آپلود نشده است.</div>
                ) : (
                  <div className="cd-attachments">
                    {files.map((url, idx) => (
                      <div key={`file-${idx}`} className="cd-attachment file">
                        <div className="cd-file-body">
                          <div className="cd-file-icon">📎</div>
                          <div className="cd-file-name" title={fileNameFromUrl(url)}>{fileNameFromUrl(url)}</div>
                        </div>
                        <div className="cd-file-actions">
                          <a className="btn btn-outline" style={{ width: "70px", height: "22px" }} href={url} target="_blank" rel="noreferrer" download>دانلود</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </section>

      {/* اکشن‌ها */}
      <div className="cd-actions">
        <button className="btn btn-light" onClick={goBackToDashboardList}>بازگشت</button>

        <div className="cd-actions-right">
          {/* مربی: کد مربی */}
          {isCoach && (<button className="btn btn-outline" onClick={onOpenCoachCode}>کد مربی</button>)}

          {/* ثبت‌نام تیم (مربی) */}
          {isCoach && (
            <button className="btn btn-secondary" disabled={!canRegisterOthers} title={!canRegisterOthers ? "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است" : ""} onClick={goRegisterTeam}>
              ثبت‌نام تیم
            </button>
          )}

          {/* ثبت‌نام دیگران (مربی) */}
          {showStudentRegBtn && (
            <button className="btn btn-primary" disabled={!canRegisterOthers} title={!canRegisterOthers ? "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است" : ""} onClick={goRegisterAthlete}>
              {studentBtnLabel}
            </button>
          )}

          {/* بازیکن: ثبت‌نام خودم — هر دو سبک */}
          {showSelfRegBtn && (isKyorugi ? (
            <button className="btn btn-primary" disabled={!registrationOpen} title={!registrationOpen ? disableReason || "ثبت‌نام برای شما مجاز نیست" : ""} onClick={openRegisterForm}>
              ثبت‌نام خودم
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!registrationOpen} title={!registrationOpen ? disableReason || "ثبت‌نام برای شما مجاز نیست" : ""} onClick={openRegisterFormPoomsae}>
              ثبت‌نام خودم
            </button>
          ))}

          {/* کارت من */}
          {isPlayer && (
            <button
              className="btn btn-secondary"
              onClick={() => cardInfo.enrollmentId && navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/${cardInfo.enrollmentId}/card`)}
              disabled={!canSeeCard || cardInfo.loading}
              title={
                cardInfo.loading ? "در حال بررسی وضعیت ثبت‌نام…" :
                !cardInfo.checked ? "" :
                !cardInfo.enrollmentId ? "هنوز ثبت‌نامی برای شما ثبت نشده است." :
                cardInfo.status === "pending_payment" ? "ثبت‌نام شما انجام شده ولی پرداخت تکمیل نشده است." :
                "پس از پرداخت موفق فعال می‌شود."
              }
            >
              {cardInfo.loading ? "در حال بررسی…" : "مشاهده آیدی کارت"}
            </button>
          )}

          {/* جدول (فقط کیوروگی) */}
          {isKyorugi && (<button className="btn btn-ghost" onClick={goBracket}>مشاهده جدول</button>)}

          {/* نتایج (هر دو سبک) */}
          <button className="btn btn-secondary" disabled={!isPastCompetition} title={!isPastCompetition ? "هنوز مسابقه برگزار نشده" : ""} onClick={goResults}>
            نتایج مسابقه
          </button>
        </div>
      </div>

      {/* فرم ثبت‌نام خودی (کیوروگی) */}
      {reg.open && isKyorugi && (
        <section className="cd-section">
          <h2 className="cd-section-title">فرم ثبت‌نام</h2>

          {reg.errors.__all__ && <div className="cd-error" style={{ marginBottom: 12 }}>{reg.errors.__all__}</div>}

          <form className="cd-form" onSubmit={submitRegister}>
            {/* فیلدهای قفل‌شده */}
            {reg.locked ? (
              <div className="cd-grid">
                <InfoRow label="नाम"            value={reg.locked.first_name || "—"} />
                <InfoRow label="نام خانوادگی"   value={reg.locked.last_name  || "—"} />
                <InfoRow label="کد ملی"         value={toFa(reg.locked.national_id) || "—"} />
                <InfoRow label="تاریخ تولد"     value={pickBirthFa(reg.locked)} />
                <InfoRow label="کمربند"         value={reg.locked.belt || "—"} />
                <InfoRow label="باشگاه"         value={reg.locked.club || "—"} />
                <InfoRow label="مربی"           value={reg.locked.coach || "—"} />
              </div>
            ) : (<div className="cd-muted" style={{ marginBottom: 12 }}>در حال بارگذاری اطلاعات پروفایل…</div>)}

            {/* اطلاعات تکمیلی */}
            <h3 className="cd-section-title">اطلاعات تکمیلی</h3>
            <div className="cd-grid">
              {/* وزن اعلامی */}
              <div className="cd-row" title="برای ممیز از علامت «.» استفاده کنید. تا ۲۰۰ گرم ارفاق لحاظ می‌شود.">
                <label className="cd-label" htmlFor="weight">وزن (کیلوگرم)</label>
                <div className="cd-value">
                  <input
                    id="weight"
                    className="cd-input"
                    type="text"
                    dir="ltr"
                    inputMode="decimal"
                    placeholder="مثلاً ۶۲.۵ یا ۶۲/۵"
                    title="برای ممیز از علامت «.» استفاده کنید. تا ۲۰۰ گرم ارفاق لحاظ می‌شود."
                    value={reg.weight}
                    onChange={(e) => setReg((r) => ({ ...r, weight: sanitizeWeight(e.target.value) }))}
                    aria-invalid={!!reg.errors.weight}
                    required
                  />
                  {reg.errors.weight && <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.weight}</div>}
                </div>
              </div>

              {/* شماره بیمه */}
              <div className="cd-row" title="شماره درج‌شده روی کارت بیمه ورزشی.">
                <label className="cd-label" htmlFor="ins-num">شماره بیمه</label>
                <div className="cd-value">
                  <input
                    id="ins-num"
                    className="cd-input"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    pattern="\d*"
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                    title="شماره درج‌شده روی کارت بیمه ورزشی."
                    value={reg.insurance_number}
                    onChange={(e) => setReg((r) => ({ ...r, insurance_number: normalizeDigits(e.target.value) }))}
                    required
                  />
                  {reg.errors.insurance_number && (<div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.insurance_number}</div>)}
                </div>
              </div>

              {/* تاریخ صدور بیمه‌نامه (شمسی) */}
              <div className="cd-row" title="تاریخ صدور کارت بیمه باید حداقل ۷۲ ساعت قبل و حداکثر یک‌سال قبل از تاریخ برگزاری مسابقه باشد.">
                <label className="cd-label" htmlFor="ins-date">تاریخ صدور بیمه‌نامه</label>
                <div className="cd-value">
                  <DatePicker
                    id="ins-date"
                    inputClass="cd-input"
                    containerClassName="cd-date"
                    calendar={persian}
                    locale={persian_fa}
                    format="YYYY/MM/DD"
                    value={toJalaliDO(reg.insurance_issue_date)}
                    onChange={(v) => setReg((r) => ({ ...r, insurance_issue_date: v ? normalizeDigits(v.format("YYYY/MM/DD")) : "" }))}
                    calendarPosition="bottom-right"
                    editable={false}
                    maxDate={maxIssueDO}
                    minDate={minIssueDO}
                  />
                  {reg.errors.insurance_issue_date && (<div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.insurance_issue_date}</div>)}
                </div>
              </div>

              {/* کد تأیید مربی */}
              {reg.need_coach_code && (
                <div className="cd-row" title="این کد را مربی‌تان در داشبورد خودش می‌بیند.">
                  <label className="cd-label" htmlFor="coach_code">کد تأیید مربی</label>
                  <div className="cd-value">
                    <input
                      id="coach_code"
                      name="coach_code"
                      dir="ltr"
                      inputMode="numeric"
                      pattern="\d*"
                      className="cd-input"
                      placeholder="مثلاً ۴۵۸۲۷۱"
                      title="این کد را مربی‌تان در داشبورد خودش می‌بیند."
                      value={reg.coach_code}
                      onChange={(e) => setReg((r) => ({ ...r, coach_code: e.target.value }))}
                      aria-invalid={!!reg.errors.coach_code}
                      required={reg.need_coach_code}
                    />
                    {reg.errors.coach_code && (<div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.coach_code}</div>)}
                  </div>
                </div>
              )}
            </div>

            {/* تأیید صحت اطلاعات */}
            <div className="cd-row cd-row-multi" title="با تأیید این گزینه مسئولیت صحت اطلاعات را می‌پذیرید.">
              <label className="cd-checkbox">
                <input type="checkbox" checked={reg.confirmed} onChange={(e) => setReg((r) => ({ ...r, confirmed: e.target.checked }))} />
                <span>تمام اطلاعات واردشده را صحیح می‌دانم و مسئولیت آن را می‌پذیرم.</span>
              </label>
              {reg.errors.confirmed && <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.confirmed}</div>}
            </div>

            <div className="cd-actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={reg.loading || !reg.can_register} title={!reg.can_register ? "خارج از بازه ثبت‌نام یا ثبت‌نام غیرفعال است" : ""}>
                {reg.loading ? "در حال ثبت…" : "تأیید و  پرداخت"}
              </button>
              <button type="button" className="btn btn-light" onClick={() => setReg((r) => ({ ...r, open: false }))} disabled={reg.loading}>
                انصراف
              </button>
            </div>
          </form>
        </section>
      )}

      {/* فرم ثبت‌نام خودی (پومسه) */}
      {regP.open && isPoomsae && (
        <section className="cd-section">
          <h2 className="cd-section-title">فرم ثبت‌نام</h2>

          {regP.errors.__all__ && <div className="cd-error" style={{ marginBottom: 12 }}>{regP.errors.__all__}</div>}

          <form className="cd-form" onSubmit={submitRegisterPoomsae}>
            {/* فیلدهای قفل‌شده (در صورت نیاز) */}
            {regP.locked ? (
              <div className="cd-grid">
                <InfoRow label="نام"            value={regP.locked.first_name || "—"} />
                <InfoRow label="نام خانوادگی"   value={regP.locked.last_name  || "—"} />
                <InfoRow label="کد ملی"         value={toFa(regP.locked.national_id) || "—"} />
                <InfoRow label="تاریخ تولد"     value={birthFaSafe(regP.locked)} />
                <InfoRow label="کمربند"         value={regP.locked.belt || "—"} />
                <InfoRow label="باشگاه"         value={regP.locked.club || "—"} />
                <InfoRow label="مربی"           value={regP.locked.coach || "—"} />
              </div>
            ) : (
              <div className="cd-muted" style={{ marginBottom: 12 }}>در حال بارگذاری اطلاعات پروفایل…</div>
            )}

            {/* اطلاعات تکمیلی */}
            <h3 className="cd-section-title">اطلاعات تکمیلی</h3>
            <div className="cd-grid">

              {/* نوع مسابقه: استاندارد / ابداعی */}
              <div className="cd-row">
                <label className="cd-label">نوع مسابقه</label>
                <div className="cd-value">
                  <label className="cd-radio">
                    <input
                      type="radio"
                      name="poomsae_type"
                      value="standard"
                      checked={regP.poomsae_type === "standard"}
                      onChange={(e) => setRegP(r => ({ ...r, poomsae_type: e.target.value }))}
                    />
                    <span>استاندارد</span>
                  </label>
                  <label className="cd-radio" style={{ marginInlineStart: 16 }}>
                    <input
                      type="radio"
                      name="poomsae_type"
                      value="creative"
                      checked={regP.poomsae_type === "creative"}
                      onChange={(e) => setRegP(r => ({ ...r, poomsae_type: e.target.value }))}
                    />
                    <span>ابداعی</span>
                  </label>
                  {regP.errors.poomsae_type && (
                    <div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.poomsae_type}</div>
                  )}
                </div>
              </div>

              {/* شماره بیمه */}
              <div className="cd-row" title="شماره درج‌شده روی کارت بیمه ورزشی.">
                <label className="cd-label" htmlFor="ins-num-p">شماره بیمه</label>
                <div className="cd-value">
                  <input
                    id="ins-num-p"
                    className="cd-input"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    pattern="\d*"
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                    title="شماره درج‌شده روی کارت بیمه ورزشی."
                    value={regP.insurance_number}
                    onChange={(e) => setRegP((r) => ({ ...r, insurance_number: normalizeDigits(e.target.value) }))}
                    required
                  />
                  {regP.errors.insurance_number && (<div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.insurance_number}</div>)}
                </div>
              </div>

              {/* تاریخ صدور بیمه‌نامه (شمسی) */}
              <div className="cd-row" title="دو شرط: حداقل ۷۲ ساعت قبل از مسابقه و حداکثر یک‌سال قبل از مسابقه.">
                <label className="cd-label" htmlFor="ins-date-p">تاریخ صدور بیمه‌نامه</label>
                <div className="cd-value">
                  <DatePicker
                    id="ins-date-p"
                    inputClass="cd-input"
                    containerClassName="cd-date"
                    calendar={persian}
                    locale={persian_fa}
                    format="YYYY/MM/DD"
                    value={toJalaliDO(regP.insurance_issue_date)}
                    onChange={(v) => setRegP((r) => ({ ...r, insurance_issue_date: v ? normalizeDigits(v.format("YYYY/MM/DD")) : "" }))}
                    calendarPosition="bottom-right"
                    editable={false}
                    maxDate={maxIssueDO}
                    minDate={minIssueDO}
                  />
                  {regP.errors.insurance_issue_date && (<div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.insurance_issue_date}</div>)}
                </div>
              </div>

                <div className="cd-row" title="این کد باید مربوط به مربیِ خودِ شما باشد.">
                  <label className="cd-label" htmlFor="coach_code_p">کد تأیید مربی</label>
                  <div className="cd-value">
                    <input
                      id="coach_code_p"
                      name="coach_code_p"
                      dir="ltr"
                      inputMode="numeric"
                      pattern="\d*"
                      className="cd-input"
                      placeholder="مثلاً ۴۵۸۲۷۱"
                      value={regP.coach_code}
                      onChange={(e) => setRegP((r) => ({ ...r, coach_code: e.target.value }))}
                      aria-invalid={!!regP.errors.coach_code}
                      required
                    />
                    {regP.errors.coach_code && <div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.coach_code}</div>}
                  </div>
                </div>


            </div>

            {/* تأیید صحت اطلاعات */}
            <div className="cd-row cd-row-multi" title="با تأیید این گزینه مسئولیت صحت اطلاعات را می‌پذیرید.">
              <label className="cd-checkbox">
                <input type="checkbox" checked={regP.confirmed} onChange={(e) => setRegP((r) => ({ ...r, confirmed: e.target.checked }))} />
                <span>تمام اطلاعات واردشده را صحیح می‌دانم و مسئولیت آن را می‌پذیرم.</span>
              </label>
              {regP.errors.confirmed && <div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.confirmed}</div>}
            </div>

            <div className="cd-actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={regP.loading || !regP.can_register} title={!regP.can_register ? "خارج از بازه ثبت‌نام یا ثبت‌نام غیرفعال است" : ""}>
                {regP.loading ? "در حال ثبت…" : "تأیید و  پرداخت"}
              </button>
              <button type="button" className="btn btn-light" onClick={() => setRegP((r) => ({ ...r, open: false }))} disabled={regP.loading}>
                انصراف
              </button>
            </div>
          </form>
        </section>
      )}

      {/* لایت‌باکس (فقط تصویر) */}
      {lightbox && (
        <div className="cd-modal" onClick={() => setLightbox(null)}>
          <div className="cd-modal-inner" onClick={(e) => e.stopPropagation()}>
            <button className="cd-modal-close" onClick={() => setLightbox(null)}>✕</button>
            {lightbox.type === "img" ? <img className="cd-modal-media" src={lightbox.url} alt="preview" /> : null}
          </div>
        </div>
      )}

      {/* مودال کد مربی */}
      {codeModal.open && (
        <div className="cd-modal" onClick={() => setCodeModal((m) => ({ ...m, open: false }))}>
          <div className="cd-modal-inner cd-modal-inner--tiny cd-modal-inner--white" onClick={(e) => e.stopPropagation()}>
            <button className="cd-modal-close" onClick={() => setCodeModal((m) => ({ ...m, open: false }))}>✕</button>
            <h3 className="cd-section-title" style={{ marginTop: 0, textAlign: "center" }}>کد تأیید مربی</h3>

            {codeModal.loading ? (
              <div className="cd-muted" style={{ textAlign: "center" }}>در حال دریافت…</div>
            ) : codeModal.error ? (
              <div className="cd-error" style={{ textAlign: "center" }}>{codeModal.error}</div>
            ) : codeModal.approved && codeModal.code ? (
              <>
                <div className="cd-code-box cd-code-box--small">
                  {String(codeModal.code).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])}
                </div>
                <div className="cd-code-actions"><button className="btn btn-outline" onClick={copyCode}>کپی</button></div>
              </>
            ) : (
              <>
                <div className="cd-muted" style={{ marginBottom: 12, textAlign: "center" }}>برای این مسابقه هنوز کدی ساخته نشده.</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button className="btn btn-primary" onClick={approveAndGetCode}>دریافت کد</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, multiline = false }) {
  return (
    <div className={`cd-row ${multiline ? "cd-row-multi" : ""}`}>
      <div className="cd-label">{label}</div>
      <div className="cd-value">{value ?? "—"}</div>
    </div>
  );
}
