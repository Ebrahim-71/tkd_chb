// src/components/Login/competitions/CompetitionDetails.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getCompetitionDetail,
  getCoachApprovalStatus,
  approveCompetition,
  registerSelf,
  getRegisterSelfPrefill,
  getMyEnrollment,
  // 👇 از api/competitions (ویرایش‌شده)
  shouldShowSelfRegister,
  shouldShowStudentRegister,
} from "../../../api/competitions";
import { getCompetitionResults } from "../../../api/competitions"; // 👈 اضافه شد
import "./CompetitionDetails.css";

/* ====== DatePicker (Jalali) ====== */
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

/* ---------- Helpers ---------- */
const toFa = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const fmtDateFa = (val) => {
  if (!val) return "—";
  const s = String(val).slice(0, 10).replace(/-/g, "/");
  return toFa(s);
};
const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
const toDateSafe = (s) => (isISODate(s) ? new Date(s) : null);
const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";
const absUrl = (u) => (u ? (u.startsWith("http") ? u : `${API_BASE}${u}`) : null);
const fileNameFromUrl = (u) => { try { return decodeURIComponent(u.split("/").pop()); } catch { return "فایل"; } };

// ارقام فارسی/عربی → انگلیسی
const normalizeDigits = (s = "") =>
  s
    .replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)])
    .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);

// وزن: قبول "." و "/" و "٫" و "," → نقطه
const sanitizeWeight = (raw = "") => {
  let t = normalizeDigits(raw);
  t = t.replace(/[\/٫,،]/g, ".");
  t = t.replace(/[^0-9.]/g, "");
  t = t.replace(/(\..*)\./g, "$1");
  return t;
};

/* —— تبدیل جلالی به میلادی —— */
const div = (a, b) => Math.trunc(a / b);
const jalBreaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy){
  let bl = jalBreaks.length, gy = jy + 621, leapJ = -14, jp = jalBreaks[0], jm, jump = 0, n, i;
  if (jy < jp || jy >= jalBreaks[bl - 1]) return {gy, march: 20, leap: false};
  for (i = 1; i < bl; i++) {
    jm = jalBreaks[i]; jump = jm - jp;
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
  if (n >= 0) {
    if ([1,5,9,13,17,22,26,30].includes(n % 33)) leap = true;
  }
  return {gy, march, leap};
}
function g2d(gy, gm, gd){
  let a = div(14 - gm, 12);
  let y = gy + 4800 - a;
  let m = gm + 12 * a - 3;
  return gd + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
}
function d2g(jdn){
  let j = jdn + 32044;
  let g = div(j, 146097);
  let dg = j % 146097;
  let c = div((dg / 36524 + 1) * 3, 4);
  let dc = dg - c * 36524;
  let b = div(dc, 1461);
  let db = dc % 1461;
  let a = div((db / 365 + 1) * 3, 4);
  let da = db - a * 365;
  let y = g * 400 + c * 100 + b * 4 + a;
  let m = div(5 * da + 308, 153) - 2;
  let d = da - div(153 * (m + 2) + 2, 5) + 1;
  y = y - 4800 + div(m + 2, 12);
  m = (m + 2) % 12 + 1;
  return {gy: y, gm: m, gd: d};
}
function j2d(jy, jm, jd){
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function jalaliToGregorian(jy, jm, jd){
  return d2g(j2d(jy, jm, jd));
}
function parseJalaliInputToDate(str){
  if (!str) return null;
  const t = normalizeDigits(String(str)).trim().replace(/-/g, "/");
  const m = t.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const jy = parseInt(m[1], 10), jm = parseInt(m[2], 10), jd = parseInt(m[3], 10);
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}
const toJalaliDO = (s) => {
  if (!s) return null;
  try {
    const t = normalizeDigits(String(s)).replace(/-/g, "/");
    return new DateObject({ date: t, calendar: persian, locale: persian_fa, format: "YYYY/MM/DD" });
  } catch {
    return null;
  }
};

/* Console debug from backend */
function printEligibilityToConsole(c) {
  if (!c) return;
  console.groupCollapsed(`🧪 Eligibility – ${c.public_id || c.id}: ${c.title}`);
  console.table({
    can_register_backend: c.can_register,
    user_eligible_backend: c.user_eligible_self,
    age_from: c.age_from || "—",
    age_to: c.age_to || "—",
    allowed_belts: Array.isArray(c.allowed_belts) ? c.allowed_belts.join(", ") : "—",
  });
  if (c.eligibility_debug) {
    const d = c.eligibility_debug;
    console.table({
      registration_open: d.registration_open,
      in_reg_window: d.in_reg_window,
      required_gender: d.required_gender,
      player_gender: d.player_gender,
      gender_ok: d.gender_ok,
      age_from: d.age_from,
      age_to: d.age_to,
      player_dob: d.player_dob,
      age_ok: d.age_ok,
      allowed_belts: Array.isArray(d.allowed_belts) ? d.allowed_belts.join(", ") : "—",
      player_belt: d.player_belt,
      belt_ok: d.belt_ok,
      profile_role: d.profile_role,
    });
  }
  console.groupEnd();
}

/* ---------- Component ---------- */
export default function CompetitionDetails() {
  const { slug, role: roleFromRoute } = useParams();
  const navigate = useNavigate();

  const role = (roleFromRoute || localStorage.getItem("user_role") || "guest").toLowerCase();
  const isPlayer  = role === "player" || role === "both";
  const isCoach   = role === "coach"  || role === "both";
  const isReferee = role === "referee";
  const isClub    = role === "club";
  const isHeyat   = role === "heyat" || role === "board";

  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // فرم ثبت‌نام خودی
  const [reg, setReg] = useState({
    open: false, loading: false, errors: {},
    can_register: false, need_coach_code: false,
    locked: null,
    coach_code: "",
    weight: "",
    insurance_number: "",
    insurance_issue_date: "",  // شمسی: YYYY/MM/DD
    confirmed: false,
  });

  // مودال کد مربی
  const [codeModal, setCodeModal] = useState({
    open: false, loading: true, code: null, approved: false, error: "",
  });

  // وضعیت کارت (برای غیرفعال کردن دکمه)
  const [cardInfo, setCardInfo] = useState({
    loading: false,
    checked: false,
    enrollmentId: null,
    status: null,
    canShow: false,
  });

  // لایت‌باکس
  const [lightbox, setLightbox] = useState(null);

  // مودال نتایج
  const [resultsModal, setResultsModal] = useState({
    open: false, loading: false, error: "", has: false, rows: [],
  });

  /* --- لود جزئیات مسابقه --- */
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");
    getCompetitionDetail(slug)
      .then((data) => {
        if (!mounted) return;
        setCompetition(data);
        try { printEligibilityToConsole(data); } catch {}
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e?.message || "خطا در دریافت اطلاعات مسابقه");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [slug]);

  /* --- بررسی ثبت‌نام کاربر برای فعال‌سازی دکمهٔ کارت --- */
  useEffect(() => {
    let mounted = true;
    if (!isPlayer) {
      setCardInfo((s) => ({ ...s, checked: true, enrollmentId: null, status: null }));
      return () => { mounted = false; };
    }
    setCardInfo({ loading: true, checked: false, enrollmentId: null, status: null });
    getMyEnrollment(slug)
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
          setCardInfo({ loading: false, checked: true, enrollmentId: null, status: null });      });
    return () => { mounted = false; };
  }, [slug, isPlayer]);

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
    if (typeof can_register === "boolean" && typeof user_eligible_self === "boolean") {
      return can_register && user_eligible_self;
    }
    return inRegWindow;
  }, [can_register, user_eligible_self, inRegWindow]);

  // امکان ثبت‌نامِ دیگران (برای مربی/باشگاه/هیئت)
  const canRegisterOthers = useMemo(() => {
    if (typeof can_register === "boolean") return can_register;
    return inRegWindow;
  }, [can_register, inRegWindow]);

  const isPastCompetition = useMemo(() => {
    if (competitionDate) return today > stripTime(competitionDate);
    return false;
  }, [competitionDate, today]);

 const canSeeCard = useMemo(() => {
    if (!isPlayer || !cardInfo.enrollmentId) return false;
    if (typeof cardInfo.canShow === "boolean") return cardInfo.canShow;
    const st = String(cardInfo.status || "");
    return ["paid","confirmed","approved","accepted","completed"].includes(st);
  }, [isPlayer, cardInfo.enrollmentId, cardInfo.status, cardInfo.canShow]);
  const disableReason =
    typeof can_register === "boolean" && !can_register
      ? "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است"
      : typeof user_eligible_self === "boolean" && !user_eligible_self
      ? "سن/کمربند/جنسیت شما با شرایط مسابقه هم‌خوانی ندارد"
      : "ثبت‌نام برای شما مجاز نیست";

  const beltGroupsDisplay = useMemo(() => {
    const groups = competition?.belt_groups || competition?.belt_groups_display || [];
    if (Array.isArray(groups)) {
      return groups
        .map((g) => (typeof g === "string" ? g : (g.label || g.name)))
        .filter(Boolean)
        .join("، ");
    }
    return groups || "—";
  }, [competition]);

  const matAssignments = useMemo(
    () => (Array.isArray(competition?.mat_assignments) ? competition.mat_assignments : []),
    [competition]
  );

  const posterSrc = useMemo(() => absUrl(competition?.poster) || "/placeholder.jpg", [competition]);

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
      const data = await getCoachApprovalStatus(slug);
      setCodeModal({
        open: true, loading: false,
        code: data?.code || null, approved: !!data?.approved, error: "",
      });
    } catch (e) {
      setCodeModal({ open: true, loading: false, code: null, approved: false, error: e.message || "خطا" });
    }
  };

  const approveAndGetCode = async () => {
    try {
      setCodeModal((m) => ({ ...m, loading: true, error: "" }));
      const res = await approveCompetition(slug); // { code }
      setCodeModal({ open: true, loading: false, code: res?.code || null, approved: true, error: "" });
    } catch (e) {
      setCodeModal((m) => ({ ...m, loading: false, error: e.message || "خطا در دریافت کد" }));
    }
  };

  const goResults = () =>
  navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/results`);


  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(String(codeModal.code || ""));
      alert("کد کپی شد.");
    } catch {
      window.prompt("برای کپی، کد را انتخاب و کپی کنید:", String(codeModal.code || ""));
    }
  };

  /* ---------- Register self (فرم داخل صفحه) ---------- */
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

  // حداکثر تاریخ مجاز صدور = ۳ روز قبل از مسابقه
  const maxIssueDO = useMemo(() => {
    if (!competitionDate) return null;
    const d = new DateObject({ date: competitionDate, calendar: persian, locale: persian_fa });
    return d.subtract(3, "days");
  }, [competitionDate]);

  const validateForm = () => {
    const errors = {};

    const w = sanitizeWeight(reg.weight);
    if (!w || isNaN(Number(w))) {
      errors.weight = "وزن نامعتبر است.";
    }

    if (competitionDate) {
      const issueDate = parseJalaliInputToDate(reg.insurance_issue_date);
      if (!issueDate || isNaN(issueDate.getTime())) {
        errors.insurance_issue_date = "تاریخ صدور نامعتبر است (الگوی ۱۴۰۳/۰۵/۲۰).";
      } else {
        const comp = stripTime(competitionDate);
        const minOk = new Date(comp);
        minOk.setDate(minOk.getDate() - 3);
        if (issueDate > minOk) {
          errors.insurance_issue_date = "تاریخ صدور کارت بیمه باید حداقل ۷۲ ساعت قبل از تاریخ برگزاری مسابقه باشد.";
        }
      }
    }

    if (reg.need_coach_code && !String(reg.coach_code).trim()) {
      errors.coach_code = "کد تأیید مربی الزامی است.";
    }

    if (!reg.confirmed) {
      errors.confirmed = "لطفاً صحت اطلاعات را تأیید کنید.";
    }

    return errors;
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    const errs = validateForm();
    if (Object.keys(errs).length) {
      setReg((r) => ({ ...r, errors: errs }));
      return;
    }

    setReg((r) => ({ ...r, loading: true, errors: {} }));
    try {
      const payload = {
        coach_code: normalizeDigits(reg.coach_code || "").trim(),
        declared_weight: sanitizeWeight(reg.weight || ""),
        insurance_number: normalizeDigits(reg.insurance_number || "").trim(),
        insurance_issue_date: reg.insurance_issue_date, // شمسی: YYYY/MM/DD
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
    } catch (e) {
      const p = e?.payload || {};
      const mapped = {};
      if (p.coach_code) mapped.coach_code = Array.isArray(p.coach_code) ? p.coach_code.join(" ") : String(p.coach_code);
      if (p.declared_weight) mapped.weight = Array.isArray(p.declared_weight) ? p.declared_weight.join(" ") : String(p.declared_weight);
      if (p.insurance_number) mapped.insurance_number = Array.isArray(p.insurance_number) ? p.insurance_number.join(" ") : String(p.insurance_number);
      if (p.insurance_issue_date) mapped.insurance_issue_date = Array.isArray(p.insurance_issue_date) ? p.insurance_issue_date.join(" ") : String(p.insurance_issue_date);
      if (Array.isArray(p.non_field_errors) && p.non_field_errors.length) {
        mapped.__all__ = p.non_field_errors.join(" ");
      }
      const fallback = p.detail || e.message || "خطای نامشخص در ثبت‌نام";
      if (!Object.keys(mapped).length) mapped.__all__ = fallback;
      setReg((r) => ({ ...r, loading: false, errors: mapped }));
    }
  };

  // نمایش آیدی کارت
  const showMyCard = () => {
    if (!canSeeCard) return;
    navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/${cardInfo.enrollmentId}/card`);
  };

  // مسیرها
  const goBackToDashboardList = () => navigate(`/dashboard/${encodeURIComponent(role)}`);
  const goRegisterAthlete = () =>
    navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/register/athlete`);
  const goBracket = () =>
    navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}/bracket`);

  // 👇 کمکی برای نمایش یک خانه‌ی مدال
  const showEntry = (v) => {
    if (!v) return "—";
    if (typeof v === "string") return v;
    const player =
      v.player_name || v.player || v.full_name ||
      (v.player?.full_name || `${v.player?.first_name || ""} ${v.player?.last_name || ""}`.trim());
    const club = v.club_name || v.club || v.club_title || v.club?.club_name || v.club?.name;
    const label = v.label || [player, club].filter(Boolean).join(" — ");
    return label || "—";
  };

  // 👇 هندلر مودال نتایج
  const onOpenResults = async () => {
    setResultsModal({ open: true, loading: true, error: "", has: false, rows: [] });
    try {
      if (typeof competition?.has_results === "boolean" && !competition.has_results) {
        setResultsModal({ open: true, loading: false, error: "", has: false, rows: [] });
        return;
      }
      const data = await getCompetitionResults(slug);
      const rows = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
      setResultsModal({ open: true, loading: false, error: "", has: rows.length > 0, rows });
    } catch (e) {
      const msg = e?.message || "";
      if (/404/.test(msg)) {
        setResultsModal({ open: true, loading: false, error: "", has: false, rows: [] });
      } else {
        setResultsModal({ open: true, loading: false, error: (e?.message || "خطا در دریافت نتایج"), has: false, rows: [] });
      }
    }
  };

  if (loading) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">در حال بارگذاری…</div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="cd-container">
        <div className="cd-error">{err}</div>
      </div>
    );
  }
  if (!competition) {
    return (
      <div className="cd-container">
        <div className="cd-error">مسابقه یافت نشد.</div>
      </div>
    );
  }

  // 👇 نمایش/عدم نمایش دکمه‌ها با هِلپرها
  const showSelfRegBtn = isPlayer && shouldShowSelfRegister(role);
  const showStudentRegBtn = isCoach; // ✅ فقط مربی‌ها

  // عنوان دکمه ثبت‌نام دیگران
  const studentBtnLabel = isCoach ? "ثبت‌ نام بازیکن" : "ثبت‌نام شاگرد";

  return (
    <div className="cd-container" dir="rtl">
      {/* هدر */}
      <div className="cd-hero">
        <img
          className="cd-poster"
          src={posterSrc}
          alt={competition.title}
          onError={(e) => (e.currentTarget.src = "/placeholder.jpg")}
        />
        <div className="cd-hero-body">
          <h1 className="cd-title">{competition.title}</h1>

          <div className="cd-chips">
            <span className="cd-chip">سبک مسابقه: <strong>{competition.style_display || "—"}</strong></span>
            <span className="cd-chip">رده سنی: <strong>{competition.age_category_name || "—"}</strong></span>
            <span className="cd-chip">رده کمربندی: <strong>{competition.belt_level_display || "—"}</strong></span>
            <span className="cd-chip">جنسیت: <strong>{competition.gender_display || "—"}</strong></span>
            <span className={`cd-chip ${competition?.can_register ? "ok" : "nok"}`}>
              ثبت‌نام: <strong>{competition?.can_register ? "بله" : "خیر"}</strong>
            </span>
            <span className={`cd-chip ${competition?.user_eligible_self ? "ok" : "nok"}`}>
              صلاحیت: <strong>{competition?.user_eligible_self ? "بله" : "خیر"}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* جزئیات */}
      <section className="cd-section">
        <h2 className="cd-section-title">جزئیات مسابقه</h2>
        <div className="cd-grid">
          <InfoRow
            label="مبلغ ورودی"
            value={
              competition.entry_fee
                ? `${toFa(Number(competition.entry_fee).toLocaleString())} تومان`
                : "رایگان"
            }
          />
          <InfoRow label="گروه‌های کمربندی انتخاب‌شده" value={competition?.belt_groups_display || "—"} />
          <InfoRow label="شروع ثبت‌نام" value={fmtDateFa(competition.registration_start_jalali ?? competition.registration_start)} />
          <InfoRow label="پایان ثبت‌نام" value={fmtDateFa(competition.registration_end_jalali ?? competition.registration_end)} />
          <InfoRow label="تاریخ وزن‌کشی" value={fmtDateFa(competition.weigh_date_jalali ?? competition.weigh_date)} />
          <InfoRow label="تاریخ قرعه‌کشی" value={fmtDateFa(competition.draw_date_jalali ?? competition.draw_date)} />
          <InfoRow label="تاریخ برگزاری" value={fmtDateFa(competition.competition_date_jalali ?? competition.competition_date)} />
          <InfoRow label="شهر" value={competition.city || "—"} />
          <InfoRow label="نشانی محل برگزاری" value={competition.address || "—"} multiline />
          <InfoRow label="تعداد زمین‌ها" value={toFa(competition.mat_count ?? "—")} />
        </div>
      </section>

      {/* تخصیص وزن‌ها به زمین‌ها */}
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
                ) : (
                  <div className="cd-muted">وزنی ثبت نشده.</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="cd-muted">هنوز اطلاعات زمین‌ها وارد نشده است.</div>
        )}
      </section>

      {/* پیوست‌ها */}
      <section className="cd-section">
        <h2 className="cd-section-title">پیوست‌ها</h2>
        {(() => {
          const imgsRaw =
            (Array.isArray(competition.images) && competition.images.map((i) => i.image || i.url || i.file)) ||
            (Array.isArray(competition.gallery) && competition.gallery.map((i) => i.image || i.url)) ||
            [];
          const filesRaw =
            (Array.isArray(competition.files) && competition.files.map((f) => f.file || f.url)) ||
            (Array.isArray(competition.documents) && competition.documents.map((f) => f.file || f.url)) ||
            [];

          const images = imgsRaw.map(absUrl).filter(Boolean);
          const files = filesRaw.map(absUrl).filter(Boolean);

          return (
            <div className="cd-attachments-wrap">
              {/* تصاویر */}
              <div className="cd-attachments-block">
                <div className="cd-block-head">
                  <span>تصاویر</span>
                  <span className="cd-count">{toFa(images.length)}</span>
                </div>
                {images.length === 0 ? (
                  <div className="cd-muted cd-empty">عکسی آپلود نشده است.</div>
                ) : (
                  <div className="cd-attachments">
                    {images.map((src, idx) => (
                      <button
                        key={`img-${idx}`}
                        type="button"
                        className="cd-attachment img"
                        onClick={() => setLightbox({ type: "img", url: src })}
                        title="نمایش تصویر"
                      >
                        <img className="cd-thumb" src={src} alt={`image-${idx}`} />
                        <span>مشاهده</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* فایل‌ها */}
              <div className="cd-attachments-block">
                <div className="cd-block-head">
                  <span>فایل‌ها</span>
                  <span className="cd-count">{toFa(files.length)}</span>
                </div>
                {files.length === 0 ? (
                  <div className="cd-muted cd-empty">فایلی آپلود نشده است.</div>
                ) : (
                  <div className="cd-attachments">
                    {files.map((url, idx) => (
                      <div key={`file-${idx}`} className="cd-attachment file">
                        <div className="cd-file-body">
                          <div className="cd-file-icon">📎</div>
                          <div className="cd-file-name" title={fileNameFromUrl(url)}>
                            {fileNameFromUrl(url)}
                          </div>
                        </div>
                        <div className="cd-file-actions">
                          <a className="btn btn-outline" style={{width: '70px',height: '22px'}} href={url} target="_blank" rel="noreferrer" download>
                            دانلود
                          </a>
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
        <button className="btn btn-light" onClick={goBackToDashboardList}>
          بازگشت
        </button>

        <div className="cd-actions-right">
          {/* مربی: کد مربی */}
          {isCoach && (
            <button className="btn btn-outline" onClick={onOpenCoachCode}>
              کد مربی
            </button>
          )}

          {/* ثبت‌نام دیگران: مربی + هیئت/باشگاه */}
          {showStudentRegBtn && (
            <button
              className="btn btn-primary"
              disabled={!canRegisterOthers}
              title={!canRegisterOthers ? "ثبت‌نام این مسابقه فعال نیست یا خارج از بازه است" : ""}
              onClick={goRegisterAthlete}
            >
              {studentBtnLabel}
            </button>
          )}

          {/* بازیکن: ثبت‌نام خودم */}
          {showSelfRegBtn && (
            <button
              className="btn btn-primary"
              disabled={!registrationOpen}
              title={!registrationOpen ? (disableReason || "ثبت‌نام برای شما مجاز نیست") : ""}
              onClick={openRegisterForm}
            >
              ثبت‌نام خودم
            </button>
          )}

          {/* کارت من */}
          {isPlayer && (
            <button
              className="btn btn-secondary"
              onClick={showMyCard}
              disabled={!canSeeCard || cardInfo.loading}
              title={
                cardInfo.loading
                  ? "در حال بررسی وضعیت ثبت‌نام…"
                  : !cardInfo.checked
                  ? ""
                  : !cardInfo.enrollmentId
                  ? "هنوز ثبت‌نامی برای شما ثبت نشده است."
                  : cardInfo.status === "pending_payment"
                  ? "ثبت‌نام شما انجام شده ولی پرداخت تکمیل نشده است."
                  : "پس از پرداخت موفق فعال می‌شود."
              }
            >
              {cardInfo.loading ? "در حال بررسی…" : "مشاهده آیدی کارت"}
            </button>
          )}

          <button className="btn btn-ghost" onClick={goBracket}>
            مشاهده جدول
          </button>
          <button
            className="btn btn-secondary"
            disabled={!isPastCompetition}
            title={!isPastCompetition ? "هنوز مسابقه برگزار نشده" : ""}
            onClick={goResults}
          >
            نتایج مسابقه
          </button>
        </div>
      </div>

      {/* فرم ثبت‌نام خودی */}
      {reg.open && (
        <section className="cd-section">
          <h2 className="cd-section-title">فرم ثبت‌نام</h2>

          {reg.errors.__all__ && <div className="cd-error" style={{ marginBottom: 12 }}>{reg.errors.__all__}</div>}

          <form className="cd-form" onSubmit={submitRegister}>
            {/* فیلدهای قفل‌شده */}
            {reg.locked ? (
              <div className="cd-grid">
                <InfoRow label="نام" value={reg.locked.first_name || "—"} />
                <InfoRow label="نام خانوادگی" value={reg.locked.last_name || "—"} />
                <InfoRow label="کد ملی" value={reg.locked.national_id || "—"} />
                <InfoRow label="تاریخ تولد" value={reg.locked.birth_date || "—"} />
                <InfoRow label="کمربند" value={reg.locked.belt || "—"} />
                <InfoRow label="باشگاه" value={reg.locked.club || "—"} />
                <InfoRow label="مربی" value={reg.locked.coach || "—"} />
              </div>
            ) : (
              <div className="cd-muted" style={{ marginBottom: 12 }}>
                در حال بارگذاری اطلاعات پروفایل…
              </div>
            )}

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
                  {reg.errors.insurance_number && <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.insurance_number}</div>}
                </div>
              </div>

              {/* تاریخ صدور بیمه‌نامه (شمسی) */}
              <div
                className="cd-row"
                title="تاریخ صدور کارت بیمه باید حداقل ۷۲ ساعت قبل از تاریخ برگزاری مسابقه باشد."
              >
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
                    onChange={(v) =>
                      setReg((r) => ({ ...r, insurance_issue_date: v ? v.format("YYYY/MM/DD") : "" }))
                    }
                    calendarPosition="bottom-right"
                    editable={false}
                    maxDate={maxIssueDO}
                  />
                  {reg.errors.insurance_issue_date && (
                    <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.insurance_issue_date}</div>
                  )}
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
                      required
                    />
                    {reg.errors.coach_code && <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.coach_code}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* تأیید صحت اطلاعات */}
            <div className="cd-row cd-row-multi" title="با تأیید این گزینه مسئولیت صحت اطلاعات را می‌پذیرید.">
              <label className="cd-checkbox">
                <input
                  type="checkbox"
                  checked={reg.confirmed}
                  onChange={(e) => setReg((r) => ({ ...r, confirmed: e.target.checked }))}
                />
                <span>تمام اطلاعات واردشده را صحیح می‌دانم و مسئولیت آن را می‌پذیرم.</span>
              </label>
              {reg.errors.confirmed && <div className="cd-error" style={{ marginTop: 6 }}>{reg.errors.confirmed}</div>}
            </div>

            <div className="cd-actions" style={{ marginTop: 16 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={reg.loading || !reg.can_register}
                title={!reg.can_register ? "خارج از بازه ثبت‌نام یا ثبت‌نام غیرفعال است" : ""}
              >
                {reg.loading ? "در حال ثبت…" : "تأیید و  پرداخت"}
              </button>
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setReg((r) => ({ ...r, open: false }))}
                disabled={reg.loading}
              >
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
            {lightbox.type === "img" ? (
              <img className="cd-modal-media" src={lightbox.url} alt="preview" />
            ) : null}
          </div>
        </div>
      )}

      {/* مودال کد مربی (فقط مربی‌ها) */}
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
                <div className="cd-code-actions">
                  <button className="btn btn-outline" onClick={copyCode}>کپی</button>
                </div>
              </>
            ) : (
              <>
                <div className="cd-muted" style={{ marginBottom: 12, textAlign: "center" }}>
                  برای این مسابقه هنوز کدی ساخته نشده.
                </div>
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
