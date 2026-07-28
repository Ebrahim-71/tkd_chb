// src/components/Login/competitions/CoachRegisterStudents.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  getEligibleStudentsForCoach,
  registerStudentsBulk,
  getCompetitionDetail, 
  startPaymentIntent,
  startGroupPayment,
  submitGatewayForm,
} from "../../../api/competitions";

import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

// ✅ فقط برای تبدیل جلالی→ISO (بدون UTC)
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";

import "./CoachRegisterStudents.css";

/* ---------------- Constants ---------------- */
const DEFAULT_GATEWAY = "sadad";

/* ---------------- Utils ---------------- */
const toFa = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

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

const getId = (s) => s?.id ?? s?.player_id ?? s?.user_id ?? s?.profile_id;

/* ---------------- Robust extractor: enrollment IDs ---------------- */
const extractEnrollmentIds = (res) => {
  if (!res) return [];

  if (Array.isArray(res.enrollment_ids)) {
    return res.enrollment_ids.map(Number).filter(Number.isFinite);
  }
  if (Array.isArray(res.enrollments)) {
    return res.enrollments
      .map((x) => (typeof x === "number" ? x : x?.enrollment_id ?? x?.id ?? x?.pk))
      .map(Number)
      .filter(Number.isFinite);
  }

  const out = new Set();
  const visit = (v, path = []) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visit(x, path));
      return;
    }
    if (typeof v !== "object") return;

    const keys = Object.keys(v);
    const inEnrollPath = path.some((k) => String(k).toLowerCase().includes("enroll"));

    if ("enrollment_id" in v) {
      const n = Number(v.enrollment_id);
      if (Number.isFinite(n)) out.add(n);
    }
    if (inEnrollPath && ("id" in v || "pk" in v)) {
      const n = Number(v.id ?? v.pk);
      if (Number.isFinite(n)) out.add(n);
    }
    if (v.enrollment && typeof v.enrollment === "object") {
      const n = Number(v.enrollment.enrollment_id ?? v.enrollment.id ?? v.enrollment.pk);
      if (Number.isFinite(n)) out.add(n);
    }

    for (const k of keys) visit(v[k], [...path, k]);
  };

  ["data", "result", "results", "payload", "created", "items"].forEach((k) => {
    if (res && res[k] !== undefined) visit(res[k], [k]);
  });
  visit(res, []);

  return Array.from(out);
};

/* ---------------- Jalali -> ISO (no UTC) ---------------- */
const jalaliToISO = (jalaliStr) => {
  if (!jalaliStr) return "";
  try {
    const d = new DateObject({
      date: normalizeDigits(String(jalaliStr)).replace(/-/g, "/"),
      calendar: persian,
      locale: persian_fa,
      format: "YYYY/MM/DD",
    });
    if (!d?.isValid) return "";
    return d.convert(gregorian, gregorian_en).format("YYYY-MM-DD");
  } catch {
    return "";
  }
};

export default function CoachRegisterStudents() {
  const { role, slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [discountApplied, setDiscountApplied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [comp, setComp] = useState(null);

  const [students, setStudents] = useState([]);
  const studentById = useMemo(() => {
    const m = new Map();
    for (const s of students) {
      const id = getId(s);
      if (id != null) m.set(Number(id), s);
    }
    return m;
  }, [students]);

  const [sel, setSel] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // استایل مسابقه (kyorugi / poomsae)
  const [compStyle, setCompStyle] = useState("kyorugi");

  // ---- تخفیف ----
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);

  // اعداد پرداخت نمایشی (فقط UI)
  const [finalAmount, setFinalAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [originalAmount, setOriginalAmount] = useState(0);

  const detectStyleFromContext = (competition) => {
    const fromState = location?.state?.style;
    if (fromState) return String(fromState).toLowerCase();

    const qs = new URLSearchParams(location?.search || "");
    const fromQs = qs.get("style");
    if (fromQs) return String(fromQs).toLowerCase();

    const path = (location?.pathname || "").toLowerCase();
    if (path.includes("/poomsae/") || path.includes("poomsae")) return "poomsae";
    if (path.includes("/kyorugi/") || path.includes("kyorugi")) return "kyorugi";

    if (
      competition?.kind === "poomsae" ||
      competition?.style === "poomsae" ||
      competition?.style_key === "poomsae"
    ) {
      return "poomsae";
    }
    if (competition?.style_display && String(competition.style_display).includes("پومسه")) {
      return "poomsae";
    }
    return "kyorugi";
  };

  const detectStyleFast = () => {
    const fromState = location?.state?.style;
    if (fromState) return String(fromState).toLowerCase();

    const qs = new URLSearchParams(location?.search || "");
    const fromQs = qs.get("style");
    if (fromQs) return String(fromQs).toLowerCase();

    const path = (location?.pathname || "").toLowerCase();
    if (path.includes("/poomsae/") || path.includes("poomsae")) return "poomsae";
    return "kyorugi";
  };

    // ✅ اگر eligible وزن‌ها را نداد، دیتیل مسابقه را جداگانه بگیر
  const fillCompetitionIfMissingWeights = async (compData, slug) => {
    const hasWeights =
      (Array.isArray(compData?.mat_assignments) &&
        compData.mat_assignments.some(
          (m) => Array.isArray(m?.weights) && m.weights.length
        )) ||
      (Array.isArray(compData?.matAssignments) &&
        compData.matAssignments.some(
          (m) => Array.isArray(m?.weights) && m.weights.length
        )) ||
      (Array.isArray(compData?.weight_categories) && compData.weight_categories.length) ||
      (Array.isArray(compData?.weightCategories) && compData.weightCategories.length);

    if (hasWeights) return compData;

    // eligible کمپتیشن خلاصه داده؛ دیتیل کامل را بگیر
    const detail = await getCompetitionDetail(slug);
    return detail || compData;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    const fastStyle = detectStyleFast();
    setCompStyle(fastStyle);

    getEligibleStudentsForCoach(slug, fastStyle)
      .then(async (res) => { // ✅ async شد
        if (!alive) return;
        const compData = res?.competition || null;
        const list = Array.isArray(res?.students) ? res.students : [];

        // ✅ این خط کلیدی: اگر وزن‌ها نبود، دیتیل کامل را می‌گیرد
        const compFull = await fillCompetitionIfMissingWeights(compData, slug);

        setComp(compFull);
        setStudents(list);

        const style = res?.__style || detectStyleFromContext(compFull) || fastStyle;
        setCompStyle(style);

        const init = {};
        for (const s of list) {
          const id = getId(s);
          if (id == null) continue;
          if (s.already_enrolled) {
            init[id] = {
              checked: true,
              locked: true,
              weight_category_id: "",
              poomsae_type: "",
              ins: "",
              ins_date: "",
              errors: {},
            };
          }
        }
        setSel(init);
      })
      .catch((e) => alive && setErr(e?.message || "خطا در دریافت لیست شاگردها"))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, location?.state, location?.search]);

  // ✅ مبلغ ورودی: همه ریال
  const entryFee = Number(comp?.entry_fee_rial ?? comp?.entry_fee ?? 0);

  // ✅ رده‌های وزنی همین مسابقه — از comp استخراج می‌شود (نه competition!)
  const weightCategories = useMemo(() => {
    // 1) اگر مستقیم برگشت
    const direct =
      comp?.weight_categories ||
      comp?.weightCategories ||
      comp?.weights ||
      comp?.weight_options;

    if (Array.isArray(direct) && direct.length) return direct;

    // 2) mat_assignments یا matAssignments
    const mats =
      (Array.isArray(comp?.mat_assignments) ? comp.mat_assignments : null) ||
      (Array.isArray(comp?.matAssignments) ? comp.matAssignments : []);

    const flat = mats.flatMap((m) => {
      const w =
        m?.weights ||
        m?.weight_categories ||
        m?.weightCategories ||
        m?.weight_options;
      return Array.isArray(w) ? w : [];
    });

    const map = new Map();
    for (const w of flat) {
      const id = w?.id ?? `${w?.name}-${w?.min_weight}-${w?.max_weight}`;
      if (id != null && !map.has(id)) map.set(id, w);
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        Number(a?.min_weight ?? a?.min ?? 0) - Number(b?.min_weight ?? b?.min ?? 0)
    );
  }, [comp]);

  const selectedNewIds = useMemo(() => {
    const out = [];
    for (const s of students) {
      const id = getId(s);
      if (id == null) continue;
      const r = sel[id];
      if (r?.checked && !r?.locked && !s.already_enrolled) out.push(id);
    }
    return out;
  }, [sel, students]);

  const totalAmount = entryFee * selectedNewIds.length;

  useEffect(() => {
    if (discountApplied) return;
    setOriginalAmount(totalAmount);
    setDiscountAmount(0);
    setFinalAmount(totalAmount);
    setDiscountError("");
    setDiscountApplied(false);
  }, [totalAmount, discountApplied]);

  const invalidateDiscount = () => {
    if (discountApplied) setDiscountApplied(false);
    if (discountAmount !== 0) setDiscountAmount(0);
    if (finalAmount !== totalAmount) setFinalAmount(totalAmount);
    if (originalAmount !== totalAmount) setOriginalAmount(totalAmount);
    if (discountError) setDiscountError("");
  };

  const updateRow = (id, patch) => {
    invalidateDiscount();
    setSel((s) => ({
      ...s,
      [id]: {
        ...(s[id] || {
          checked: true,
          locked: false,
          weight_category_id: "",
          poomsae_type: "",
          ins: "",
          ins_date: "",
          errors: {},
        }),
        ...patch,
      },
    }));
  };

  const toggle = (id, checked) => {
    if (sel[id]?.locked) return;
    invalidateDiscount();

    if (!checked) {
      setSel((s) => ({
        ...s,
        [id]: {
          checked: false,
          locked: false,
          weight_category_id: "",
          poomsae_type: "",
          ins: "",
          ins_date: "",
          errors: {},
        },
      }));
    } else {
      updateRow(id, { checked: true });
    }
  };

  const validateRow = (id) => {
    const r = sel[id] || {};
    const errors = {};

    if (compStyle === "kyorugi") {
      if (!r.weight_category_id) errors.weight_category_id = "انتخاب رده وزنی الزامی است.";
    } else if (compStyle === "poomsae") {
      if (!r.poomsae_type) errors.poomsae_type = "انتخاب سبک پومسه الزامی است.";
    }

    if (!r.ins) errors.ins = "شماره بیمه الزامی است.";
    if (!r.ins_date) errors.ins_date = "تاریخ صدور بیمه الزامی است.";

    updateRow(id, { errors });
    return !Object.keys(errors).length;
  };

  const onChangeWeightCategory = (id, v) => updateRow(id, { weight_category_id: v });
  const onChangeIns = (id, v) => updateRow(id, { ins: normalizeDigits(v) });

  const onChangeInsDate = (id, v) =>
    updateRow(id, { ins_date: v ? normalizeDigits(v.format("YYYY/MM/DD")) : "" });

  const onChangePoomsaeType = (id, v) => updateRow(id, { poomsae_type: v });

  const buildStudentsPayload = () => {
    const payload = selectedNewIds.map((id) => {
      const row = sel[id];
      const st = studentById.get(Number(id));
      const issueISO = jalaliToISO(row.ins_date);

      return {
        player_id: Number(id),
        insurance_number: row.ins,
        insurance_issue_date: issueISO || "",
        board_id: st?.board_id ?? st?.board ?? st?.boardId ?? undefined,
        ...(compStyle === "kyorugi" ? { weight_category_id: Number(row.weight_category_id) } : {}),
        ...(compStyle === "poomsae" ? { poomsae_type: row.poomsae_type } : {}),
      };
    });

    for (const p of payload) {
      if (!p.insurance_issue_date) {
        throw new Error("تاریخ صدور بیمه نامعتبر است. لطفاً دوباره انتخاب کنید.");
      }
    }
    return payload;
  };

  const handleApplyDiscount = async () => {
    setDiscountError("");
    setDiscountApplied(false);

    if (!hasDiscount) {
      setDiscountCode("");
      setDiscountAmount(0);
      setFinalAmount(totalAmount);
      setOriginalAmount(totalAmount);
      return;
    }

    if (!discountCode.trim()) {
      setDiscountError("کد تخفیف را وارد کنید.");
      return;
    }
    if (!totalAmount) {
      setDiscountError("ابتدا حداقل یک شاگرد را انتخاب کنید.");
      return;
    }

    for (const id of selectedNewIds) {
      if (!validateRow(id)) return;
    }

    try {
      setDiscountLoading(true);

      const studentsPayloadForPreview = buildStudentsPayload();

      const data = await registerStudentsBulk(
        slug,
        {
          students: studentsPayloadForPreview,
          person_count: studentsPayloadForPreview.length,
          discount_code: discountCode.trim(),
          gateway: DEFAULT_GATEWAY,
          preview: true,
        },
        compStyle
      );

      const oa = Number.isFinite(Number(totalAmount)) ? Number(totalAmount) : 0;

      let fa = data?.amount_irr != null ? Number(data.amount_irr) : NaN;
      if (!Number.isFinite(fa)) {
        const toman = data?.amount_toman != null ? Number(data.amount_toman) : NaN;
        if (Number.isFinite(toman)) fa = toman * 10;
      }
      if (!Number.isFinite(fa)) {
        fa = Number(
          data?.amount_rial ??
            data?.final_amount_rial ??
            data?.final_amount ??
            data?.amount ??
            oa
        );
      }

      const da = Number.isFinite(Number(data?.discount_amount_irr))
        ? Number(data.discount_amount_irr)
        : Number.isFinite(Number(data?.discount_amount_rial))
        ? Number(data.discount_amount_rial)
        : Math.max(0, oa - (Number.isFinite(fa) ? fa : oa));

      setOriginalAmount(oa);
      setFinalAmount(Number.isFinite(fa) ? fa : oa);
      setDiscountAmount(Number.isFinite(da) ? da : 0);

      setDiscountError("");
      setDiscountApplied(true);
    } catch (e) {
      setDiscountAmount(0);
      setFinalAmount(totalAmount);
      setOriginalAmount(totalAmount);
      setDiscountError(e?.message || "امکان اعمال کد تخفیف وجود ندارد.");
      setDiscountApplied(false);
    } finally {
      setDiscountLoading(false);
    }
  };

  const submit = async () => {
    setErr("");

    for (const id of selectedNewIds) {
      if (!validateRow(id)) return;
    }

    if (hasDiscount && discountCode.trim() && !discountApplied) {
      setErr("کد تخفیف هنوز اعمال نشده است. لطفاً روی «اعمال» بزنید تا مبلغ نهایی محاسبه شود.");
      return;
    }

    try {
      setLoading(true);

      const studentsPayload = buildStudentsPayload();

      const res = await registerStudentsBulk(
        slug,
        {
          students: studentsPayload,
          person_count: studentsPayload.length,
          discount_code: hasDiscount ? discountCode.trim() : "",
          gateway: DEFAULT_GATEWAY,
          preview: false,
        },
        compStyle
      );

      if (res?.payment?.url) {
        localStorage.setItem("last_payment_kind", String(compStyle || "kyorugi"));
        localStorage.setItem("last_payment_comp", String(slug || comp?.public_id || ""));
        submitGatewayForm(res.payment);
        return;
      }

      if (res?.payment_required) {
        if (res?.payment_intent_public_id) {
          const pid = res.payment_intent_public_id;

          const payRes = await startPaymentIntent(pid, { gateway: DEFAULT_GATEWAY });

          if (payRes?.payment?.url) {
            localStorage.setItem("last_payment_kind", String(compStyle || "kyorugi"));
            localStorage.setItem("last_payment_comp", String(slug || comp?.public_id || ""));
            localStorage.setItem("last_payment_intent", String(pid));
            submitGatewayForm(payRes.payment);
            return;
          }

          throw new Error("پاسخ شروع پرداخت (intent) معتبر نیست (payment برنگشت).");
        }

        if (res?.group_payment_id) {
          const payRes = await startGroupPayment(res.group_payment_id, { gateway: DEFAULT_GATEWAY });

          if (payRes?.payment?.url) {
            localStorage.setItem("last_payment_kind", String(compStyle || "kyorugi"));
            localStorage.setItem("last_payment_comp", String(slug || comp?.public_id || ""));
            localStorage.setItem("last_group_payment_id", String(res.group_payment_id));
            submitGatewayForm(payRes.payment);
            return;
          }

          throw new Error("پاسخ شروع پرداخت گروهی معتبر نیست (payment برنگشت).");
        }

        throw new Error(
          "پرداخت لازم است اما شناسه PaymentIntent برنگشت (payment_intent_public_id). پاسخ بک‌اند را چک کنید."
        );
      }

      const eids = extractEnrollmentIds(res);
      if (!eids.length) throw new Error("ثبت‌نام انجام شد اما enrollment_ids برنگشت.");

      const kindSafe = compStyle || "kyorugi";
      navigate(
        `/dashboard/${encodeURIComponent(role)}/enrollments/bulk?ids=${encodeURIComponent(
          eids.join(",")
        )}&kind=${encodeURIComponent(kindSafe)}`,
        { state: { ids: eids, kind: kindSafe }, replace: true }
      );
    } catch (e) {
      setErr(e?.message || "خطا در ثبت‌نام / پرداخت");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const canSubmit = useMemo(() => {
    if (selectedNewIds.length === 0) return false;
    for (const id of selectedNewIds) {
      const r = sel[id] || {};
      const errors = r.errors || {};
      if (compStyle === "kyorugi") {
        if (!r.weight_category_id) return false;
      } else if (compStyle === "poomsae") {
        if (!r.poomsae_type) return false;
      }
      if (!r.ins) return false;
      if (!r.ins_date) return false;
      if (errors && Object.keys(errors).length) return false;
    }
    return true;
  }, [sel, selectedNewIds, compStyle]);

  if (loading && !comp) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">در حال بارگذاری…</div>
      </div>
    );
  }

  return (
    <div className="cd-container" dir="rtl">
      {err && (
        <div className="cd-error" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div className="cd-hero small">
        <div className="cd-hero-body">
          <h1 className="cd-title">ثبت‌نام شاگردان – {comp?.title || "—"}</h1>
          <div className="cd-chips">
            {comp?.gender_display && <span className="cd-chip">{comp.gender_display}</span>}
            {comp?.age_category_name && <span className="cd-chip">{comp.age_category_name}</span>}
            {comp?.belt_groups_display && (
              <span className="cd-chip">{comp.belt_groups_display}</span>
            )}

            <span className="cd-chip">
              هزینه ورودی: <strong>{toFa(entryFee.toLocaleString())}</strong> ریال
            </span>
          </div>
        </div>
      </div>

      <section className="cd-section">
        <h2 className="cd-section-title">شاگردهای واجد شرایط</h2>

        {students.length === 0 ? (
          <div className="cd-muted">شاگرد واجدشرایطی برای این مسابقه یافت نشد.</div>
        ) : (
          <div className="crs-table">
            <div className="crs-th">
              <div>انتخاب</div>
              <div>نام</div>
              <div>کد ملی</div>
              <div>تاریخ تولد</div>
              <div>کمربند</div>
              <div>باشگاه</div>
              <div>هیئت</div>
            </div>

            {students.map((s) => {
              const sid = getId(s);
              const row = sel[sid] || {};
              const locked = !!(row.locked || s.already_enrolled);

              return (
                <div key={sid} className="crs-row">
                  <div className="crs-td">
                    <input
                      type="checkbox"
                      checked={!!row.checked}
                      disabled={locked}
                      onChange={(e) => toggle(sid, e.target.checked)}
                    />
                    {locked && (
                      <span className="cd-chip" style={{ marginRight: -22 }}>
                        ثبت‌نام‌شده
                      </span>
                    )}
                  </div>

                  <div className="crs-td">
                    {s.first_name} {s.last_name}
                  </div>
                  <div className="crs-td">{s.national_code || "—"}</div>
                  <div className="crs-td">{s.birth_date || "—"}</div>
                  <div className="crs-td">{s.belt_grade || "—"}</div>
                  <div className="crs-td">{s.club_name || "—"}</div>
                  <div className="crs-td">{s.board_name || "—"}</div>

                  {row.checked && !locked && (
                    <div className="crs-subrow">
                      {compStyle === "kyorugi" ? (
                        <div className="cd-row">
                          <label className="cd-label">رده وزنی</label>
                          <div className="cd-value">
                            <select
                              className="cd-input"
                              value={row.weight_category_id || ""}
                              onChange={(e) => onChangeWeightCategory(sid, e.target.value)}
                              aria-invalid={!!row.errors?.weight_category_id}
                              disabled={!weightCategories.length}
                            >
                              <option value="">
                                {weightCategories.length
                                  ? "انتخاب کنید…"
                                  : "رده‌های وزنی این مسابقه تعریف نشده"}
                              </option>
                              {weightCategories.map((wc) => (
                                <option key={wc.id} value={wc.id}>
                                  {wc.name ?? wc.title ?? wc.label ?? `#${wc.id}`}
                                </option>
                              ))}
                            </select>

                            {row.errors?.weight_category_id && (
                              <div className="cd-error" style={{ marginTop: 6 }}>
                                {row.errors.weight_category_id}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="cd-row">
                          <label className="cd-label">سبک پومسه</label>
                          <div className="cd-value">
                            <div className="cd-radio-group">
                              <label className="cd-radio">
                                <input
                                  type="radio"
                                  name={`poomsae-${sid}`}
                                  value="standard"
                                  checked={row.poomsae_type === "standard"}
                                  onChange={() => onChangePoomsaeType(sid, "standard")}
                                />
                                <span>استاندارد</span>
                              </label>
                              <label className="cd-radio" style={{ marginRight: 16 }}>
                                <input
                                  type="radio"
                                  name={`poomsae-${sid}`}
                                  value="creative"
                                  checked={row.poomsae_type === "creative"}
                                  onChange={() => onChangePoomsaeType(sid, "creative")}
                                />
                                <span>ابداعی</span>
                              </label>
                            </div>
                            {row.errors?.poomsae_type && (
                              <div className="cd-error" style={{ marginTop: 6 }}>
                                {row.errors.poomsae_type}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="cd-row">
                        <label className="cd-label">شماره بیمه</label>
                        <div className="cd-value">
                          <input
                            className="cd-input"
                            dir="ltr"
                            inputMode="numeric"
                            pattern="\\d*"
                            value={row.ins || ""}
                            onChange={(e) => onChangeIns(sid, e.target.value)}
                            aria-invalid={!!row.errors?.ins}
                            placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                          />
                          {row.errors?.ins && (
                            <div className="cd-error" style={{ marginTop: 6 }}>
                              {row.errors.ins}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="cd-row" title="حداقل ۷۲ ساعت قبل از مسابقه">
                        <label className="cd-label">تاریخ صدور بیمه</label>
                        <div className="cd-value">
                          <DatePicker
                            inputClass="cd-input"
                            calendar={persian}
                            locale={persian_fa}
                            format="YYYY/MM/DD"
                            value={
                              row.ins_date
                                ? new DateObject({
                                    date: normalizeDigits(row.ins_date).replace(/-/g, "/"),
                                    calendar: persian,
                                    locale: persian_fa,
                                    format: "YYYY/MM/DD",
                                  })
                                : null
                            }
                            onChange={(v) => onChangeInsDate(sid, v)}
                            editable={false}
                            calendarPosition="bottom-right"
                          />
                          {row.errors?.ins_date && (
                            <div className="cd-error" style={{ marginTop: 6 }}>
                              {row.errors.ins_date}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* --------- باکس کد تخفیف --------- */}
      <section className="cd-section">
        <div className="cd-discount-box">
          <label className="cd-discount-checkbox">
            <input
              type="checkbox"
              checked={hasDiscount}
              onChange={(e) => {
                const checked = e.target.checked;

                setHasDiscount(checked);
                setDiscountError("");

                if (!checked) {
                  setDiscountCode("");
                  setDiscountAmount(0);
                  setFinalAmount(totalAmount);
                  setOriginalAmount(totalAmount);
                  setDiscountApplied(false);
                } else {
                  setDiscountApplied(false);
                }
              }}
            />
            <span>کد تخفیف دارم</span>
          </label>

          {hasDiscount && (
            <div className="cd-discount-row">
              <input
                className="cd-input"
                placeholder="مثلاً ALICOACH"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value);
                  setDiscountApplied(false);
                  setDiscountError("");
                }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleApplyDiscount}
                disabled={discountLoading}
              >
                {discountLoading ? "در حال بررسی…" : "اعمال"}
              </button>
            </div>
          )}

          {discountError && (
            <div className="cd-error" style={{ marginTop: 6 }}>
              {discountError}
            </div>
          )}

          <div className="cd-discount-summary">
            <div>
              مبلغ اولیه: <strong>{toFa(Number(originalAmount).toLocaleString())}</strong> ریال
            </div>
            <div>
              مبلغ تخفیف: <strong>{toFa(Number(discountAmount).toLocaleString())}</strong> ریال
            </div>
            <div>
              مبلغ قابل پرداخت: <strong>{toFa(Number(finalAmount).toLocaleString())}</strong> ریال
            </div>
          </div>
        </div>
      </section>

      <div className="cd-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-light" onClick={() => navigate(-1)}>
          بازگشت
        </button>

        <div className="cd-actions-right">
          <div className="cd-chip">
            انتخاب‌های جدید: <strong>{toFa(selectedNewIds.length)}</strong>
          </div>
          <div className="cd-chip">
            مبلغ کل: <strong>{toFa(Number(finalAmount).toLocaleString())}</strong> ریال
          </div>
          {discountAmount > 0 && (
            <div className="cd-chip cd-chip-muted">
              شامل تخفیف: {toFa(Number(discountAmount).toLocaleString())} ریال
            </div>
          )}

          <button
            className="btn btn-primary"
            disabled={!canSubmit || loading}
            onClick={() => setConfirmOpen(true)}
            title={!canSubmit ? "حداقل یک شاگرد جدید و اطلاعات کامل لازم است" : ""}
          >
            تأیید و پرداخت
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="cd-modal" onClick={() => setConfirmOpen(false)}>
          <div
            className="cd-modal-inner cd-modal-inner--tiny cd-modal-inner--white"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="cd-modal-close" onClick={() => setConfirmOpen(false)}>
              ✕
            </button>
            <h3 className="cd-section-title" style={{ marginTop: 0, textAlign: "center" }}>
              تأیید ثبت‌نام
            </h3>
            <div className="cd-muted" style={{ textAlign: "center", marginBottom: 12 }}>
              {`آیا از ثبت‌نام ${toFa(selectedNewIds.length)} نفر با مبلغ کل ${toFa(
                Number(finalAmount).toLocaleString()
              )} ریال اطمینان دارید؟`}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setConfirmOpen(false)}>
                انصراف
              </button>
              <button className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? "در حال ثبت…" : "بله، ادامه"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}