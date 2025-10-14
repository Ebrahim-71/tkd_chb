// src/components/Login/competitions/CompetitionDetails.jsx
// ✅ هم‌راستا با urls و api جدید: by-public، پومسه register/self، مودال کد مربی،
// باز/بسته بودن ثبت‌نام براساس registration_open_effective/Manual/Window و …
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  // مشترک
  getCompetitionDetail,
  // کیوروگی
  getCoachApprovalStatus,
  approveCompetition,
  registerSelf,
  getRegisterSelfPrefill,
  getMyEnrollment,
  // پومسه
  getPoomsaeCoachApprovalStatus,
  approvePoomsaeCompetition,
  // نسخه‌ی جدید: prefill پومسه را از دیتیل می‌سازد
  buildPoomsaePrefill,
  registerSelfPoomsae,
  // برای یکنواختی URLها
  API_BASE,
} from "../../../api/competitions";
import "./CompetitionDetails.css";

/* ====== DatePicker (Jalali) ====== */
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

/* ---------- Helpers (digits / dates / urls …) ---------- */

// --- نرمال‌سازی پروفایل قفل‌شده از هر ساختاری ---
function pickFrom(o, keys) {
  if (!o) return "";
  for (const k of keys) {
    if (o[k] != null && o[k] !== "") return String(o[k]);
  }
  return "";
}
function normalizeLockedProfile(src) {
  if (!src || typeof src !== "object") return null;
  const sources = [
    src,
    src.profile, src.user, src.player, src.data,
    src.me, src.me_locked, src.my_locked, src.locked_profile, src.my_profile,
  ].filter(Boolean);

  const get = (...keys) => {
    for (const s of sources) {
      const v = pickFrom(s, keys);
      if (v) return v;
    }
    return "";
  };

  const locked = {
    first_name:  get("first_name","firstName","firstNameFa","fname","given_name","name"),
    last_name:   get("last_name","lastName","lastNameFa","family","family_name","surname"),
    national_id:
      get(
        "national_id","nationalId","nationalID","national_code","nationalCode",
        "code_melli","melli_code","melliCode","codeMelli","nid","ssn"
      ) || findNationalIdDeep(src),
    birth_date:  get("birth_date_jalali_fa","birth_date_jalali","birthDateJalaliFa","birthDateJalali","birth_date","birthDate","dob"),
    belt:        get("belt","beltName","belt_name","belt_display"),
    club:        get("club","club_name","clubName","academy","academy_name"),
    coach:       get("coach","coach_name","coachName","coach_full_name"),
  };

  const hasAny = Object.values(locked).some(x => x && String(x).trim() !== "");
  return hasAny ? locked : null;
}

function toStringSafe(v) { return v == null ? "" : String(v); }
const toFa = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const normalizeDigits = (s = "") =>
  String(s)
    .replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)])
    .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
const stripRtlMarks = (s = "") => s.replace(/[\u200e\u200f\u200c\u202a-\u202e]/g, "");
const absUrl = (u) => (u ? (u.startsWith?.("http") ? u : `${API_BASE}${u}`) : null);
const fileNameFromUrl = (u) => { try { return decodeURIComponent(String(u).split("/").pop()); } catch { return "فایل"; } };
const sanitizeWeight = (raw = "") => {
  let t = normalizeDigits(raw);
  t = t.replace(/[\/٫,،]/g, ".");
  t = t.replace(/[^0-9.]/g, "");
  t = t.replace(/(\..*)\./g, "$1");
  return t;
};
const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(stripRtlMarks(normalizeDigits(s)));
const toDateSafe = (s) => (isISODate(s) ? new Date(stripRtlMarks(normalizeDigits(s))) : null);

/* —— تبدیل تاریخ میلادی/جلالی برای نمایش —— */
const pad2 = (n) => String(n).padStart(2, "0");
const div = (a, b) => Math.trunc(a / b);
const jalBreaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy) { let bl = jalBreaks.length, gy = jy + 621, leapJ = -14, jp = jalBreaks[0], jm, jump = 0, n, i; if (jy < jp || jy >= jalBreaks[bl - 1]) return { gy, march: 20, leap: false }; for (i = 1; i < bl; i++) { jm = jalBreaks[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(jump % 33, 4); jp = jm } n = jy - jp; leapJ += div(n, 33) * 8 + div(n % 33, 4); if (jump % 33 === 4 && jump - n === 4) leapJ++; const leapG = div(gy, 4) - div(div(gy, 100) + 1, 4) + div(gy, 400) - 70; const march = 20 + leapJ - leapG; let leap = false; if (n >= 0) if ([1, 5, 9, 13, 17, 22, 26, 30].includes(n % 33)) leap = true; return { gy, march, leap } }
function g2d(gy, gm, gd) { const a = div(14 - gm, 12); let y = gy + 4800 - a; let m = gm + 12 * a - 3; return gd + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045 }
function d2g(jdn) {
  const j = jdn + 32044;
  const g = div(j, 146097);
  const dg = j % 146097;
  const c = div((div(dg, 36524) + 1) * 3, 4);
  const dc = dg - c * 36524;
  const b = div(dc, 1461);
  const db = dc % 1461;
  const a = div((div(db, 365) + 1) * 3, 4);
  const da = db - a * 365;
  let y = g * 400 + c * 100 + b * 4 + a;
  let m = div(5 * da + 308, 153) - 2;
  const d = da - div(153 * (m + 2) + 2, 5) + 1;
  y = y - 4800 + div(m + 2, 12);
  m = (m + 2) % 12 + 1;
  return { gy: y, gm: m, gd: d };
}
function j2d(jy, jm, jd) { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1 }
function d2j(jdn) { let { gy } = d2g(jdn); let jy = gy - 621; let r = jalCal(jy); let jdn1f = g2d(gy, 3, r.march); let jd, jm; if (jdn >= jdn1f) { jd = jdn - jdn1f + 1 } else { jy -= 1; r = jalCal(jy); jdn1f = g2d(gy - 1, 3, r.march); jd = jdn - jdn1f + 1 } if (jd <= 186) { jm = 1 + Math.floor((jd - 1) / 31); jd = jd - 31 * (jm - 1) } else { jd -= 186; jm = 7 + Math.floor((jd - 1) / 30); jd = jd - 30 * (jm - 7) } return { jy, jm, jd }}
function gregorianToJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)) }
function isoToJalaliFa(iso) { let s = toStringSafe(iso); s = stripRtlMarks(normalizeDigits(s)).trim(); const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (!m) return toFa(s.replace(/-/g, "/").slice(0, 10)); const gy = parseInt(m[1], 10), gm = parseInt(m[2], 10), gd = parseInt(m[3], 10); if (gy < 1700) return toFa(`${gy}/${pad2(gm)}/${pad2(gd)}`); const { jy, jm, jd } = gregorianToJalali(gy, gm, gd); return toFa(`${jy}/${pad2(jm)}/${pad2(jd)}`) }

/* ====== جنسیت/کمربند و صلاحیت ====== */
const _GENDER_MAP = {
  male: "male", m: "male", man: "male", "آقا": "male", "اقا": "male", "مرد": "male", "آقایان": "male", "آقايان": "male", "اقایان": "male",
  female: "female", f: "female", woman: "female", "زن": "female", "خانم": "female", "بانو": "female", "بانوان": "female", "خانم‌ها": "female", "خانمها": "female",
  both: "both", "مختلط": "both", "mix": "both", "mixed": "both"
};
function normGender(v) {
  if (v == null) return null;
  const t = String(v).trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, "").replace(/-/g, "");
  return _GENDER_MAP[t] || t;
}

// پاک‌سازی متن رده/گروه سنی
function cleanAgeText(s) {
  if (!s) return "—";
  let t = stripRtlMarks(String(s))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
  t = t.replace(/(?:^|\s)(?:رده|گروه)[\س\u200c]*سنی\s*[:：٫،\-]?\s*/gi, "");
  t = t.replace(/^[\s:：٫،\-]+/, "");
  t = t.replace(/\s*،\s*/g, "، ").replace(/\s{2,}/g, " ").trim();
  return t || "—";
}

// استخراج کمربندهای مجاز
function allowedBeltsFromCompetition(c) {
  if (!c) return null;
  if (Array.isArray(c.allowed_belts) && c.allowed_belts.length) return new Set(c.allowed_belts.map(String));
  if (Array.isArray(c.belt_names) && c.belt_names.length) return new Set(c.belt_names.map(String));
  if (Array.isArray(c.belts) && c.belts.length) return new Set(c.belts.map(String));
  if (Array.isArray(c.belt_groups)) {
    const s = new Set();
    c.belt_groups.forEach(g => {
      const arr = Array.isArray(g?.belts) ? g.belts : [];
      arr.forEach(b => b?.name && s.add(String(b.name)));
    });
    if (s.size) return s;
  }
  return null;
}

function beltHeaderTextFromComp(c) {
  const direct =
    c?.belt_level_display ||
    c?.belt_category_display ||
    c?.belt_level_name ||
    c?.belt_category_name ||
    c?.belt_level_text ||
    c?.belt_range_display;
  if (direct) return direct;

  const enumMap = {
    yellow_blue: "زرد تا آبی",
    red_black: "قرمز تا مشکی",
    all: "همهٔ کمربندها",
    any: "همهٔ کمربندها",
  };
  const lvl = String(c?.belt_level || c?.belt_category || "").trim().toLowerCase();
  if (enumMap[lvl]) return enumMap[lvl];

  if (Array.isArray(c?.belt_names) && c.belt_names.length) return c.belt_names.join("، ");
  if (Array.isArray(c?.belts) && c.belts.length) return c.belts.join("، ");
  return "—";
}

// پیدا کردن کدملی در عمق‌های مختلف
function findNationalIdDeep(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase().replace(/[\u200c\s\-]/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک");
    const isNatKey =
      key.includes("nationalid") ||
      key.includes("nationalcode") ||
      key.includes("nationalidnumber") ||
      key.includes("mellicode") ||
      key.includes("codemelli") ||
      (key.includes("melli") && key.includes("code")) ||
      key === "nid" || key === "ssn" ||
      key.includes("کدملی") || key.includes("كدملی") ||
      (key.includes("کد") && key.includes("ملی"));
    if (isNatKey && v != null && String(v).trim() !== "") return String(v);
    if (v && typeof v === "object") {
      const inner = findNationalIdDeep(v);
      if (inner) return inner;
    }
  }
  return "";
}

// فقط گروه سنی
function ageGroupsTextFromComp(c) {
  if (!c) return "—";
  const direct = c?.age_groups_display ?? c?.ageGroupsDisplay;
  if (direct) return direct;
  const arr = c?.age_categories ?? c?.ageCategories ?? [];
  if (Array.isArray(arr) && arr.length) {
    const list = arr
      .map(a => a?.name || `${fmtDateFa(a?.from_date || a?.fromDate)}–${fmtDateFa(a?.to_date || a?.toDate)}`)
      .filter(Boolean);
    if (list.length) return list.join("، ");
  }
  return "—";
}

function genderFaLabel(g) {
  const n = normGender(g);
  if (n === "male") return "آقایان";
  if (n === "female") return "بانوان";
  if (n === "both") return "مختلط";
  return (typeof g === "string" && /[آ-ی]/.test(g)) ? g : "—";
}

function fmtDateFa(val) {
  if (!val) return "—";
  const norm = stripRtlMarks(normalizeDigits(String(val)));
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(norm)) return isoToJalaliFa(norm);
  return toFa(norm.slice(0, 10).replace(/-/g, "/"));
}

// سعی می‌کنیم جنسیت/کمربند کاربر را از منابع مختلف بخوانیم
function extractPlayerFromCompOrForm(comp, lockedFromForm) {
  const candidates = [
    lockedFromForm,
    comp?.me_locked, comp?.my_locked, comp?.locked,
    comp?.my_profile, comp?.me, comp?.user, comp?.player
  ];
  for (const obj of candidates) {
    if (obj && (obj.belt || obj.beltName || obj.gender || obj.gender_display)) {
      const belt = obj.belt || obj.beltName || obj.belt_name || "";
      const gender = normGender(obj.gender || obj.gender_display);
      return { belt: String(belt || ""), gender: gender || null };
    }
  }
  return { belt: "", gender: null };
}

/* ====== Jalali helpers for inputs ====== */
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
function mergeLockedProfiles(oldL, newL) {
  if (!oldL) return newL || null;
  if (!newL) return oldL;
  const keys = ["first_name","last_name","national_id","birth_date","belt","club","coach"];
  const out = { ...oldL };
  for (const k of keys) {
    const v = newL[k];
    if (v != null && String(v).trim() !== "") out[k] = String(v);
  }
  return out;
}

function toJalaliDO(s) {
  if (!s) return null;
  try {
    const t = stripRtlMarks(normalizeDigits(String(s))).replace(/-/g, "/");
    return new DateObject({ date: t, calendar: persian, locale: persian_fa, format: "YYYY/MM/DD" });
  } catch { return null; }
}
function pickBirthFa(locked) {
  if (!locked) return "—";
  const dfa = locked?.birth_date_jalali_fa ?? locked?.birthDateJalaliFa;
  if (dfa) return toFa(stripRtlMarks(String(dfa)).replace(/-/g, "/").slice(0, 10));
  if (locked?.birth_date && !ISO_REGEX.test(String(locked.birth_date))) {
    return toFa(stripRtlMarks(String(locked.birth_date)).replace(/-/g, "/").slice(0, 10));
  }
  const iso = findBirthISODep(locked);
  return iso ? isoToJalaliFa(iso) : "—";
}

/* ====== تشخیص دیسیپلین ====== */
function inferDiscipline(comp) {
  const k = String(comp?.kind || "").trim().toLowerCase();
  if (k === "poomsae") return "poomsae";
  if (k === "kyorugi") return "kyorugi";
  const s = String(comp?.style_display || comp?.style || comp?.type || "").trim().toLowerCase();
  if (s.includes("پومسه") || s.includes("poom")) return "poomsae";
  if (s.includes("کیوروگی") || s.includes("kyor")) return "kyorugi";
  return "kyorugi";
}

/* ====== Fallback قفل‌شده از خودِ competition ====== */
function lockedFromCompetition(comp) {
  if (!comp) return null;
  const me =
    comp.locked ||
    comp.my_locked ||
    comp.me_locked ||
    comp.my_profile ||
    comp.me ||
    comp.user ||
    comp.player ||
    null;
  return normalizeLockedProfile(me);
}

export default function CompetitionDetails() {
  const { slug, role: roleFromRoute } = useParams();
  const navigate = useNavigate();

  const role = (roleFromRoute || localStorage.getItem("user_role") || "guest").toLowerCase();
  const isPlayer = role === "player" || role === "both";
  const isCoach = role === "coach" || role === "both";
  const isRef = role === "referee";

  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // فرم ثبت‌نام خودی کیوروگی
  const [reg, setReg] = useState({
    open: false, loading: false, errors: {},
    can_register: false, need_coach_code: true, locked: null,
    coach_code: "", weight: "", insurance_number: "", insurance_issue_date: "", confirmed: false,
  });

  // فرم ثبت‌نام خودی پومسه
  const [regP, setRegP] = useState({
    open: false, loading: false, errors: {},
    can_register: false, need_coach_code: true, locked: null,
    coach_code: "",
    poomsae_type: "", // 'standard' | 'creative'
    insurance_number: "", insurance_issue_date: "",
    confirmed: false,
  });

  // مودال کد مربی
  const [codeModal, setCodeModal] = useState({ open: false, loading: true, code: null, approved: false, error: "" });

  // وضعیت کارت (فقط کیوروگی)
  const [cardInfo, setCardInfo] = useState({ loading: false, checked: false, enrollmentId: null, status: null, canShow: false });

  // لایت‌باکس
  const [lightbox, setLightbox] = useState(null);

  /* --- لود جزئیات مسابقه --- */
  useEffect(() => {
    let mounted = true;
    setLoading(true); setErr("");
    getCompetitionDetail(slug)
      .then((data) => { if (mounted) { setCompetition(data); window.__lastCompetition = data; } })
      .catch((e) => { if (mounted) setErr(e?.message || "خطا در دریافت اطلاعات مسابقه"); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [slug]);

  const discipline = useMemo(() => inferDiscipline(competition), [competition]);
  const isKyorugi = discipline === "kyorugi";
  const isPoomsae = discipline === "poomsae";

  //* --- بررسی ثبت‌نام کاربر برای کارت --- */
  useEffect(() => {
    let mounted = true;
    if (!isPlayer || !competition) {
      setCardInfo((s) => ({ ...s, checked: true, enrollmentId: null, status: null }));
      return () => { mounted = false; };
    }
    if (!isKyorugi) {
      setCardInfo({ loading: false, checked: true, enrollmentId: null, status: null, canShow: false });
      return () => { mounted = false; };
    }

    setCardInfo({ loading: true, checked: false, enrollmentId: null, status: null, canShow: false });
    getMyEnrollment(slug)
      .then((res) => { if (mounted) setCardInfo({ loading: false, checked: true, enrollmentId: res?.enrollment_id || null, status: res?.status || null, canShow: !!res?.can_show_card }); })
      .catch(() => { if (mounted) setCardInfo({ loading: false, checked: true, enrollmentId: null, status: null, canShow: false }); });
    return () => { mounted = false; };
  }, [slug, isPlayer, competition, isKyorugi]);

  // تاریخ‌ها
  const registrationStart = useMemo(() => toDateSafe(competition?.registration_start), [competition]);
  const registrationEnd = useMemo(() => toDateSafe(competition?.registration_end), [competition]);
  const competitionDate = useMemo(
    () => (isKyorugi ? toDateSafe(competition?.competition_date) : (toDateSafe(competition?.start_date) || toDateSafe(competition?.competition_date))),
    [competition, isKyorugi]
  );

  const today = stripTime(new Date());
  const inRegWindow = useMemo(() => {
    if (registrationStart && registrationEnd) {
      const s = stripTime(registrationStart);
      const e = stripTime(registrationEnd);
      return today >= s && today <= e;
    }
    if (typeof competition?.registration_open === "boolean") return competition.registration_open;
    return !!competition?.registration_open;
  }, [registrationStart, registrationEnd, competition?.registration_open, today]);

  const statusSaysOpen = useMemo(() => {
    const st = String(competition?.status || "").toLowerCase();
    return ["open", "registration_open", "reg_open", "opened"].includes(st);
  }, [competition?.status]);

  const regOpenEff = competition?.registration_open_effective ?? competition?.registration_open;
  const regManual = (competition?.registration_manual ?? competition?.registration_manual_open);
  const can_register_flag = competition?.can_register;

  // ✅ آیا ثبت‌نام مسابقه باز است؟
  const registrationOpenBase = useMemo(() => {
    if (typeof regOpenEff === "boolean") return regOpenEff;
    if (regManual === true) return true;
    if (regManual === false) return false;
    if (typeof can_register_flag === "boolean") return can_register_flag;
    if (statusSaysOpen) return true;
    return inRegWindow;
  }, [regOpenEff, regManual, can_register_flag, statusSaysOpen, inRegWindow]);

  // ✅ محاسبه صلاحیت
  const eligibility = useMemo(() => {
    if (typeof competition?.user_eligible_self === "boolean") {
      return { ok: !!competition.user_eligible_self };
    }
    const compGender = normGender(competition?.gender || competition?.gender_display) || "both";
    const allowedBelts = allowedBeltsFromCompetition(competition);
    const player = extractPlayerFromCompOrForm(competition, reg.locked || regP.locked);
    if (!player.gender && !player.belt) return { ok: null };
    const genderOK = compGender === "both" || (player.gender && compGender === player.gender);
    let beltOK = true;
    if (allowedBelts instanceof Set) {
      beltOK = player.belt ? allowedBelts.has(String(player.belt)) : false;
    }
    return { ok: !!genderOK && !!beltOK };
  }, [competition, reg.locked, regP.locked]);

  // ✅ دکمه‌ها
  const canClickSelf = (registrationOpenBase === true) && (eligibility.ok === true);
  const canClickCoachRegister = registrationOpenBase === true;

  const isPastCompetition = useMemo(() => (competitionDate ? today > stripTime(competitionDate) : false), [competitionDate, today]);

  const canSeeCard = useMemo(() => {
    if (!isPlayer || !cardInfo.enrollmentId) return false;
    if (typeof cardInfo.canShow === "boolean") return cardInfo.canShow;
    const st = String(cardInfo.status || "");
    return ["paid", "confirmed", "approved", "accepted", "completed"].includes(st);
  }, [isPlayer, cardInfo.enrollmentId, cardInfo.status, cardInfo.canShow]);

  const coachDisableReason = useMemo(() => {
    if (regManual === false) return "ثبت‌نام توسط ادمین بسته شده است";
    if (!registrationOpenBase) return inRegWindow ? "ثبت‌نام این مسابقه فعال نیست" : "خارج از بازه ثبت‌نام";
    return "";
  }, [regManual, registrationOpenBase, inRegWindow]);

  const beltGroupsDisplay = useMemo(() => {
    const groups = competition?.belt_groups || competition?.belt_groups_display || [];
    if (Array.isArray(groups)) {
      return groups.map((g) => (typeof g === "string" ? g : g?.label || g?.name)).filter(Boolean).join("، ");
    }
    return groups || "—";
  }, [competition]);

  const beltHeaderText = useMemo(() => beltHeaderTextFromComp(competition), [competition]);

  const ageHeaderText = useMemo(() => {
    const raw =
      competition?.age_category_name ??
      competition?.ageCategoryName ??
      competition?.age_category_display ??
      competition?.ageCategoryDisplay ??
      "";
    return cleanAgeText(raw) || "—";
  }, [competition]);

  const ageGroupsValue = useMemo(() => {
    const raw =
      competition?.age_groups_display ??
      competition?.ageGroupsDisplay ??
      ageGroupsTextFromComp(competition);
    return cleanAgeText(raw);
  }, [competition]);

  const genderLabel = useMemo(() => competition?.gender_display || competition?.gender || "—", [competition]);

  // مسیرها
  const navigateRole = (p) => navigate(`/dashboard/${encodeURIComponent(role)}${p}`);
  const goBackToDashboardList = () => navigate(`/dashboard/${encodeURIComponent(role)}`);
  const goRegisterAthlete = () => navigateRole(`/competitions/${encodeURIComponent(slug)}/register/athlete`);
  const goRegisterTeam = () => navigateRole(`/competitions/${encodeURIComponent(slug)}/register/team`);
  const goBracket = () => navigateRole(`/competitions/${encodeURIComponent(slug)}/bracket`);
  const goResults = () => navigateRole(`/competitions/${encodeURIComponent(slug)}/results`);

  /* ---------- Coach code modal actions ---------- */
  const onOpenCoachCode = async () => {
    const token = localStorage.getItem("coach_token") || localStorage.getItem("both_token");
    if (!token) { alert("برای مشاهده کد باید با حساب مربی وارد شوید."); navigate(`/dashboard/${encodeURIComponent(role)}`); return; }
    setCodeModal({ open: true, loading: true, code: null, approved: false, error: "" });
    try {
      const data = isKyorugi ? await getCoachApprovalStatus(slug) : await getPoomsaeCoachApprovalStatus(slug);
      setCodeModal({ open: true, loading: false, code: data?.code || null, approved: !!data?.approved, error: "" });
    } catch (e) {
      setCodeModal({ open: true, loading: false, code: null, approved: false, error: e.message || "خطا" });
    }
  };

  const approveAndGetCode = async () => {
    try {
      setCodeModal((m) => ({ ...m, loading: true, error: "" }));
      const res = isKyorugi ? await approveCompetition(slug) : await approvePoomsaeCompetition(slug);
      setCodeModal({ open: true, loading: false, code: res?.code || null, approved: true, error: "" });
    } catch (e) {
      setCodeModal((m) => ({ ...m, loading: false, error: e.message || "خطا در دریافت کد" }));
    }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(String(codeModal.code || "")); alert("کد کپی شد."); }
    catch { window.prompt("برای کپی، کد را انتخاب و کپی کنید:", String(codeModal.code || "")); }
  };

  /* ---------- Register self (KY) ---------- */
  const openRegisterForm = async () => {
    if (!isKyorugi || !registrationOpenBase || eligibility.ok !== true) return;
    setReg((r) => ({ ...r, open: true, loading: true, errors: {} }));
    try {
      const data = await getRegisterSelfPrefill(slug);
      setReg((r) => ({
        ...r,
        loading: false,
        can_register: !!data?.can_register,
        // کد مربی برای بازیکن‌ها اجباری
        need_coach_code: !(isCoach || isRef),
        locked: mergeLockedProfiles(r.locked, normalizeLockedProfile(data?.locked)),
        weight: data?.suggested?.weight ?? "",
        insurance_number: data?.suggested?.insurance_number ?? "",
        insurance_issue_date: data?.suggested?.insurance_issue_date ?? "",
      }));
    } catch (e) {
      setReg((r) => ({ ...r, loading: false, errors: { __all__: e.message || "خطا در دریافت اطلاعات" } }));
    }
  };

  /* ---------- Register self (POOMSAE) ---------- */
  const openRegisterFormPoomsae = async () => {
    if (!isPoomsae || !registrationOpenBase || eligibility.ok !== true) return;
    setRegP((r) => ({ ...r, open: true, loading: true, errors: {} }));
    try {
      const data = await buildPoomsaePrefill(slug);
      setRegP((r) => ({
        ...r,
        loading: false,
        can_register: !!data?.can_register,
        // کد مربی برای بازیکن‌ها اجباری
        need_coach_code: !(isCoach || isRef),
        locked: mergeLockedProfiles(r.locked, normalizeLockedProfile(data?.locked)),
        poomsae_type: data?.suggested?.poomsae_type || r.poomsae_type || "",
        insurance_number: data?.suggested?.insurance_number ?? "",
        insurance_issue_date: data?.suggested?.insurance_issue_date ?? "",
      }));
    } catch {
      const fallbackLocked = lockedFromCompetition(competition);
      setRegP((r) => ({
        ...r,
        loading: false,
        can_register: competition?.registration_open_effective ?? competition?.registration_open ?? true,
        need_coach_code: !(isCoach || isRef),
        locked: mergeLockedProfiles(r.locked, fallbackLocked),
      }));
    }
  };

  // محدودیت تاریخ بیمه (هر دو سبک)
  const maxIssueDO = useMemo(() => {
    if (!competitionDate) return null;
    const d = new DateObject({ date: competitionDate, calendar: persian, locale: persian_fa });
    return d.subtract(3, "days");
  }, [competitionDate]);

  const minIssueDO = useMemo(() => {
    if (!competitionDate) return null;
    const d = new DateObject({ date: competitionDate, calendar: persian, locale: persian_fa });
    return d.subtract(1, "year");
  }, [competitionDate]);

  /* ---------- Validation shared ---------- */
  const parseJalaliInputToDate = (val) => {
    if (!val) return null;
    if (typeof val === "object" && val?.isValid) { try { return val.toDate(); } catch {} }
    const mm = stripRtlMarks(normalizeDigits(String(val))).trim().replace(/-/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!mm) return null;
    const jy = parseInt(mm[1], 10), jm = parseInt(mm[2], 10), jd = parseInt(mm[3], 10);
    const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
    const d = new Date(gy, gm - 1, gd);
    return isNaN(d.getTime()) ? null : d;
  };

  const validateKY = () => {
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

  const validatePO = () => {
    const errors = {};
    if (!regP.poomsae_type) errors.poomsae_type = "نوع مسابقه را انتخاب کنید.";

    if (competitionDate) {
      const issueDate = parseJalaliInputToDate(regP.insurance_issue_date);
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

    if (regP.need_coach_code && !String(regP.coach_code).trim()) errors.coach_code = "کد تأیید مربی الزامی است.";
    if (!regP.confirmed) errors.confirmed = "لطفاً صحت اطلاعات را تأیید کنید.";
    if (!String(regP.insurance_number).trim()) errors.insurance_number = "شماره بیمه الزامی است.";
    return errors;
  };

  /* ---------- Submit: Kyorugi ---------- */
  const submitRegister = async (e) => {
    e.preventDefault();
    const errs = validateKY();
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
      const st = res?.status ?? res?.data?.status ?? "pending_payment";

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
    const errs = validatePO();
    if (Object.keys(errs).length) { setRegP((r) => ({ ...r, errors: errs })); return; }

    setRegP((r) => ({ ...r, loading: true, errors: {} }));
    try {
      const issueDateObj = parseJalaliInputToDate(regP.insurance_issue_date);
      const issueISO = issueDateObj && !isNaN(issueDateObj.getTime()) ? issueDateObj.toISOString().slice(0, 10) : "";
      if (!issueISO) { setRegP((r) => ({ ...r, loading: false, errors: { insurance_issue_date: "تاریخ نامعتبر است." } })); return; }

      const payload = {
        coach_code: normalizeDigits(regP.coach_code || "").trim() || undefined,
        poomsae_type: regP.poomsae_type, // lowercase در API هندل می‌شود
        insurance_number: normalizeDigits(regP.insurance_number || "").trim(),
        insurance_issue_date: issueISO,
      };

      const res = await registerSelfPoomsae(slug, payload);
      const eid = res?.enrollment_id ?? res?.data?.enrollment_id ?? null;
      const st = res?.status ?? res?.data?.status ?? "paid";
      setRegP((r) => ({ ...r, loading: false, open: false }));
      if (eid && (st === "paid" || st === "confirmed")) {
        navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/${eid}/card`);
      } else {
        alert(`ثبت‌نام انجام شد. وضعیت: ${st}`);
      }
    } catch (e2) {
      const p = e2?.payload || {};
      const mapped = {};
      if (p.coach_code) mapped.coach_code = Array.isArray(p.coach_code) ? p.coach_code.join(" ") : String(p.coach_code);
      if (p.poomsae_type) mapped.poomsae_type = Array.isArray(p.poomsae_type) ? p.poomsae_type.join(" ") : String(p.poomsae_type);
      if (p.insurance_number) mapped.insurance_number = Array.isArray(p.insurance_number) ? p.insurance_number.join(" ") : String(p.insurance_number);
      if (p.insurance_issue_date) mapped.insurance_issue_date = Array.isArray(p.insurance_issue_date) ? p.insurance_issue_date.join(" ") : String(p.insurance_issue_date);
      if (Array.isArray(p.non_field_errors) && p.non_field_errors.length) mapped.__all__ = p.non_field_errors.join(" ");
      const fallback = p.detail || e2.message || "خطای نامشخص در ثبت‌نام";
      if (!Object.keys(mapped).length) mapped.__all__ = fallback;
      setRegP((r) => ({ ...r, loading: false, errors: mapped }));
    }
  };

  if (loading) return (<div className="cd-container"><div className="cd-skeleton">در حال بارگذاری…</div></div>);
  if (err) return (<div className="cd-container"><div className="cd-error">{err}</div></div>);
  if (!competition) return (<div className="cd-container"><div className="cd-error">مسابقه یافت نشد.</div></div>);

  const titleText = competition.title || competition.name || "—";
  const regStartVal = competition.registration_start_jalali ?? competition.registration_start;
  const regEndVal = competition.registration_end_jalali ?? competition.registration_end;
  const drawVal = competition.draw_date_jalali ?? competition.draw_date;
  const weighVal = competition.weigh_date_jalali ?? competition.weigh_date;
  const compDateVal = isKyorugi
    ? (competition.competition_date_jalali ?? competition.competition_date)
    : (competition.start_date_jalali ?? competition.start_date ?? competition.competition_date_jalali ?? competition.competition_date);

  const posterSrc = absUrl(competition?.poster?.url || competition?.poster) || "/placeholder.jpg";

  const addressFull = (() => {
    if (competition?.address_full) return competition.address_full;
    const city = competition?.city || "";
    const addr = competition?.address || "";
    if (city && addr) return `${city}، ${addr}`;
    return city || addr || "—";
  })();

  const showBracketBtn = isKyorugi || isPoomsae;
  const showResultsBtn = isKyorugi || isPoomsae;
  const showCoachCardBtnPoomsae = isPoomsae && isCoach;
  const showPlayerCardBtnPoomsae = isPoomsae && isPlayer;

  return (
    <div className="cd-container" dir="rtl">
      {/* هدر */}
      <div className="cd-hero">
        <img className="cd-poster" src={posterSrc} alt={titleText} onError={(e) => (e.currentTarget.src = "/placeholder.jpg")} />
        <div className="cd-hero-body">
          <h1 className="cd-title">{titleText}</h1>

          <div className="cd-chips">
            <span className="cd-chip">
              سبک مسابقه: <strong>{isPoomsae ? "پومسه" : "کیوروگی"}</strong>
            </span>
            {isKyorugi && (
              <span className="cd-chip">
                رده سنی: <strong>{ageHeaderText}</strong>
              </span>
            )}
            <span className="cd-chip">رده کمربندی: <strong>{beltHeaderText}</strong></span>
            <span className="cd-chip">جنسیت: <strong>{genderLabel ? genderFaLabel(genderLabel) : "—"}</strong></span>
            <span className={`cd-chip ${registrationOpenBase ? "ok" : "nok"}`}>
              ثبت‌نام: <strong>{registrationOpenBase ? "بله" : "خیر"}</strong>
            </span>
            <span className={`cd-chip ${eligibility.ok === true ? "ok" : eligibility.ok === false ? "nok" : ""}`}>
              صلاحیت: <strong>
                {eligibility.ok === true ? "بله" : eligibility.ok === false ? "خیر" : "نامشخص"}
              </strong>
            </span>
          </div>

        </div>
      </div>

      {/* جزئیات */}
      <section className="cd-section">
        <h2 className="cd-section-title">جزئیات مسابقه</h2>
        <div className="cd-grid">
          <InfoRow label="مبلغ ورودی" value={competition.entry_fee ? `${toFa(Number(competition.entry_fee).toLocaleString())} تومان` : "رایگان"} />
          <InfoRow label="گروه‌های کمربندی انتخاب‌شده" value={beltGroupsDisplay || "—"} />
          {isPoomsae && <InfoRow label="گروه سنی" value={ageGroupsValue} />}
          <InfoRow label="شروع ثبت‌نام" value={fmtDateFa(regStartVal)} />
          <InfoRow label="پایان ثبت‌نام" value={fmtDateFa(regEndVal)} />
          {drawVal && <InfoRow label="تاریخ قرعه‌کشی" value={fmtDateFa(drawVal)} />}
          {isKyorugi && <InfoRow label="تاریخ وزن‌کشی" value={fmtDateFa(weighVal)} />}
          <InfoRow label="تاریخ برگزاری" value={fmtDateFa(compDateVal)} />
          <InfoRow label="نشانی محل برگزاری" value={addressFull} multiline />
          {isKyorugi && <InfoRow label="تعداد زمین‌ها" value={toFa(competition.mat_count ?? "—")} />}
          {isPoomsae && (
            <InfoRow label="تیم پومسه" value={<span className="cd-note cd-note--poomsae">{competition?.team_registration_note ?? competition?.teamRegistrationNote ?? "ثبت نام تیم پومسه بر عهده مربی می‌باشد"}</span>} multiline />
          )}
        </div>
      </section>

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

          {/* ثبت‌نام تیمی پومسه (Coach) */}
          {isCoach && isPoomsae && (
            <button
              className="btn btn-secondary"
              disabled={true}
              title="ثبت‌نام تیمی پومسه فعلاً غیرفعال است"
              onClick={goRegisterTeam}
            >
              ثبت‌نام تیمی پومسه
            </button>
          )}

          {/* ثبت‌ نام بازیکن (Coach هر دو) */}
          {isCoach && (
            <button
              className="btn btn-primary"
              disabled={!canClickCoachRegister}
              title={!canClickCoachRegister ? coachDisableReason : ""}
              onClick={goRegisterAthlete}
            >
              ثبت‌ نام بازیکن
            </button>
          )}

          {/* ثبت‌نام خودم */}
          {(isPlayer || isCoach || isRef) && (
            <button
              className="btn btn-primary"
              disabled={!canClickSelf}
              title={
                !registrationOpenBase
                  ? "ثبت‌نام این مسابقه فعال نیست"
                  : (eligibility.ok !== true)
                    ? "صلاحیت شما با شرایط مسابقه هم‌خوانی ندارد"
                    : ""
              }
              onClick={() => (isPoomsae ? openRegisterFormPoomsae() : openRegisterForm())}
            >
              ثبت‌نام خودم
            </button>
          )}

          {/* کارت من (فقط KY برای بازیکن) */}
          {isKyorugi && isPlayer && (
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

          {/* مشاهده آیدی کارت برای مربی در پومسه (غیرفعال) */}
          {showCoachCardBtnPoomsae && (
            <button className="btn btn-secondary" disabled title="آیدی کارت در مسابقات پومسه فعلاً فعال نیست">
              مشاهده آیدی کارت
            </button>
          )}

          {/* مشاهده آیدی کارت (بازیکن/پومسه) */}
          {isPlayer && isPoomsae && (
            <button
              className="btn btn-secondary"
              onClick={() => cardInfo.enrollmentId && navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/${cardInfo.enrollmentId}/card`)}
              disabled={!canSeeCard || cardInfo.loading}
              title={
                cardInfo.loading ? "در حال بررسی وضعیت ثبت‌نام…" :
                  !cardInfo.checked ? "" :
                    !cardInfo.enrollmentId ? "هنوز ثبت‌نامی برای شما ثبت نشده است." :
                      cardInfo.status === "pending_payment" ? "ثبت‌نام انجام شده ولی پرداخت تکمیل نشده است." :
                        ""
              }
            >
              {cardInfo.loading ? "در حال بررسی…" : "مشاهده آیدی کارت"}
            </button>
          )}

          {/* مشاهده جدول */}
          {showBracketBtn && (
            <button
              className="btn btn-ghost"
              onClick={isKyorugi ? goBracket : undefined}
              disabled={isPoomsae}
              title={isPoomsae ? "مشاهده جدول فعلاً فقط برای کیوروگی فعال است" : ""}
            >
              مشاهده جدول
            </button>
          )}

          {/* نتایج مسابقه */}
          {showResultsBtn && (
            <button
              className="btn btn-secondary"
              onClick={isKyorugi ? goResults : undefined}
              disabled={isPoomsae || !isPastCompetition}
              title={
                isPoomsae
                  ? "نتایج مسابقه در پومسه فعلاً فعال نیست"
                  : (!isPastCompetition ? "هنوز مسابقه برگزار نشده" : "")
              }
            >
              نتایج مسابقه
            </button>
          )}
        </div>
      </div>

      {/* پیام راهنما (وقتی فرم باز نیست) */}
      {isPoomsae && !regP.open && registrationOpenBase === false && (
        <div className="cd-note cd-note--poomsae" style={{ marginTop: 12 }}>
          ثبت‌نام فردی این مسابقه غیرفعال است (ثبت‌نام تیمی با مربی).
        </div>
      )}

      {/* فرم ثبت‌نام خودی (KY) */}
      {isKyorugi && reg.open && (
        <section className="cd-section">
          <h2 className="cd-section-title">فرم ثبت‌نام</h2>

          {reg.errors.__all__ && <div className="cd-error" style={{ marginBottom: 12 }}>{reg.errors.__all__}</div>}

          <form className="cd-form" onSubmit={submitRegister}>
            {reg.locked ? (
              <div className="cd-grid">
                <InfoRow label="نام" value={reg.locked.first_name || "—"} />
                <InfoRow label="نام خانوادگی" value={reg.locked.last_name || "—"} />
                <InfoRow label="کد ملی" value={toFa(reg.locked.national_id) || "—"} />
                <InfoRow label="تاریخ تولد" value={pickBirthFa(reg.locked)} />
                <InfoRow label="کمربند" value={reg.locked.belt || "—"} />
                <InfoRow label="باشگاه" value={reg.locked.club || "—"} />
                <InfoRow label="مربی" value={reg.locked.coach || "—"} />
              </div>
            ) : (<div className="cd-muted" style={{ marginBottom: 12 }}>در حال بارگذاری اطلاعات پروفایل…</div>)}

            <h3 className="cd-section-title">اطلاعات تکمیلی</h3>
            <div className="cd-grid">
              <div className="cd-row" title="برای ممیز از علامت «.» استفاده کنید. تا ۲۰۰ گرم ارفاق لحاظ می‌شود.">
                <label className="cd-label" htmlFor="weight">وزن (کیلوگرم)</label>
                <div className="cd-value">
                  <input
                    id="weight" className="cd-input" type="text" dir="ltr" inputMode="decimal"
                    placeholder="مثلاً ۶۲.۵ یا ۶۲/۵"
                    value={reg.weight}
                    onChange={(e) => setReg((r) => ({ ...r, weight: sanitizeWeight(e.target.value) }))}
                    aria-invalid={!!reg.errors.weight} required
                  />
                  {reg.errors.weight && <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.weight}</div>}
                </div>
              </div>

              <div className="cd-row" title="شماره درج‌شده روی کارت بیمه ورزشی.">
                <label className="cd-label" htmlFor="ins-num">شماره بیمه</label>
                <div className="cd-value">
                  <input
                    id="ins-num" className="cd-input" type="text" dir="ltr" inputMode="numeric" pattern="\d*"
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                    value={reg.insurance_number}
                    onChange={(e) => setReg((r) => ({ ...r, insurance_number: normalizeDigits(e.target.value) }))}
                    required
                  />
                  {reg.errors.insurance_number && (<div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.insurance_number}</div>)}
                </div>
              </div>

              <div className="cd-row">
                <label className="cd-label" htmlFor="ins-date">تاریخ صدور بیمه‌نامه</label>
                <div className="cd-value">
                  <DatePicker
                    id="ins-date" inputClass="cd-input" containerClassName="cd-date"
                    calendar={persian} locale={persian_fa} format="YYYY/MM/DD"
                    value={toJalaliDO(reg.insurance_issue_date)}
                    onChange={(v) => setReg((r) => ({ ...r, insurance_issue_date: v ? normalizeDigits(v.format("YYYY/MM/DD")) : "" }))}
                    calendarPosition="bottom-right" editable={false}
                    maxDate={maxIssueDO} minDate={minIssueDO}
                  />
                  {reg.errors.insurance_issue_date && (<div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.insurance_issue_date}</div>)}
                </div>
              </div>

              {reg.need_coach_code && (
                <div className="cd-row" title="این کد را مربی‌تان در داشبورد خودش می‌بیند.">
                  <label className="cd-label" htmlFor="coach_code">کد تأیید مربی</label>
                  <div className="cd-value">
                    <input
                      id="coach_code" name="coach_code" dir="ltr" inputMode="numeric" pattern="\d*"
                      className="cd-input" placeholder="مثلاً ۴۵۸۲۷۱"
                      value={reg.coach_code}
                      onChange={(e) => setReg((r) => ({ ...r, coach_code: e.target.value }))}
                      aria-invalid={!!reg.errors.coach_code} required={reg.need_coach_code}
                    />
                    {reg.errors.coach_code && (<div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.coach_code}</div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="cd-row cd-row-multi">
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

      {/* فرم ثبت‌نام خودی (POOMSAE) */}
      {isPoomsae && regP.open && (
        <section className="cd-section">
          <h2 className="cd-section-title">فرم ثبت‌نام</h2>

          {regP.errors.__all__ && <div className="cd-error" style={{ marginBottom: 12 }}>{regP.errors.__all__}</div>}

          <form className="cd-form" onSubmit={submitRegisterPoomsae}>
            {regP.locked ? (
              <div className="cd-grid">
                <InfoRow label="نام" value={regP.locked.first_name || "—"} />
                <InfoRow label="نام خانوادگی" value={regP.locked.last_name || "—"} />
                <InfoRow label="کد ملی" value={toFa(regP.locked.national_id) || "—"} />
                <InfoRow label="تاریخ تولد" value={pickBirthFa(regP.locked)} />
                <InfoRow label="کمربند" value={regP.locked.belt || "—"} />
                <InfoRow label="باشگاه" value={regP.locked.club || "—"} />
                <InfoRow label="مربی" value={regP.locked.coach || "—"} />
              </div>
            ) : (<div className="cd-muted" style={{ marginBottom: 12 }}>در حال بارگذاری اطلاعات پروفایل…</div>)}

            <h3 className="cd-section-title">اطلاعات تکمیلی</h3>
            <div className="cd-grid">
              {/* نوع مسابقه */}
              <div className="cd-row">
                <label className="cd-label">نوع مسابقه</label>
                <div className="cd-value">
                  <div className="cd-radio-group">
                    <label className="cd-radio">
                      <input
                        type="radio"
                        name="poomsae_type"
                        value="standard"
                        checked={regP.poomsae_type === "standard"}
                        onChange={() => setRegP((r) => ({ ...r, poomsae_type: "standard" }))}
                      />
                      <span>استاندارد</span>
                    </label>
                    <label className="cd-radio" style={{ marginInlineStart: 16 }}>
                      <input
                        type="radio"
                        name="poomsae_type"
                        value="creative"
                        checked={regP.poomsae_type === "creative"}
                        onChange={() => setRegP((r) => ({ ...r, poomsae_type: "creative" }))}
                      />
                      <span>ابداعی</span>
                    </label>
                  </div>
                  {regP.errors.poomsae_type && <div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.poomsae_type}</div>}
                </div>
              </div>

              <div className="cd-row" title="شماره درج‌شده روی کارت بیمه ورزشی.">
                <label className="cd-label" htmlFor="ins-num-po">شماره بیمه</label>
                <div className="cd-value">
                  <input
                    id="ins-num-po" className="cd-input" type="text" dir="ltr" inputMode="numeric" pattern="\d*"
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                    value={regP.insurance_number}
                    onChange={(e) => setRegP((r) => ({ ...r, insurance_number: normalizeDigits(e.target.value) }))}
                    required
                  />
                  {regP.errors.insurance_number && (<div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.insurance_number}</div>)}
                </div>
              </div>

              <div className="cd-row">
                <label className="cd-label" htmlFor="ins-date-po">تاریخ صدور بیمه‌نامه</label>
                <div className="cd-value">
                  <DatePicker
                    id="ins-date-po" inputClass="cd-input" containerClassName="cd-date"
                    calendar={persian} locale={persian_fa} format="YYYY/MM/DD"
                    value={toJalaliDO(regP.insurance_issue_date)}
                    onChange={(v) => setRegP((r) => ({ ...r, insurance_issue_date: v ? normalizeDigits(v.format("YYYY/MM/DD")) : "" }))}
                    calendarPosition="bottom-right" editable={false}
                    maxDate={maxIssueDO} minDate={minIssueDO}
                  />
                  {regP.errors.insurance_issue_date && (<div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.insurance_issue_date}</div>)}
                </div>
              </div>

              {regP.need_coach_code && (
                <div className="cd-row" title="این کد را مربی‌تان در داشبورد خودش می‌بیند.">
                  <label className="cd-label" htmlFor="coach_code_po">کد تأیید مربی</label>
                  <div className="cd-value">
                    <input
                      id="coach_code_po" name="coach_code_po" dir="ltr" inputMode="numeric" pattern="\d*"
                      className="cd-input" placeholder="مثلاً ۴۵۸۲۷۱"
                      value={regP.coach_code}
                      onChange={(e) => setRegP((r) => ({ ...r, coach_code: e.target.value }))}
                      aria-invalid={!!regP.errors.coach_code} required={regP.need_coach_code}
                    />
                    {regP.errors.coach_code && (<div className="cd-error" style={{ marginTop: 6 }}>{regP.errors.coach_code}</div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="cd-row cd-row-multi">
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

      {/* لایت‌باکس */}
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
