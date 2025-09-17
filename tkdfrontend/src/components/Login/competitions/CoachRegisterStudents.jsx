// src/components/Login/competitions/CoachRegisterStudents.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getEligibleStudentsForCoach,
  registerStudentsBulk,
} from "../../../api/competitions";
import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import "./CoachRegisterStudents.css";

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

  // رایج‌ترین حالت‌ها
  if (Array.isArray(res.enrollment_ids)) {
    return res.enrollment_ids.map(Number).filter(Number.isFinite);
  }
  if (Array.isArray(res.enrollments)) {
    return res.enrollments
      .map((x) =>
        typeof x === "number"
          ? x
          : x?.enrollment_id ?? x?.id ?? x?.pk
      )
      .map(Number)
      .filter(Number.isFinite);
  }

  // جستجوی عمیق برای ساختارهای غیرمعمول
  const out = new Set();
  const visit = (v, path = []) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, path)); return; }
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

export default function CoachRegisterStudents() {
  const { role, slug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [comp, setComp] = useState(null);
  const [students, setStudents] = useState([]);
  const [sel, setSel] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    getEligibleStudentsForCoach(slug)
      .then((res) => {
        if (!alive) return;
        const compData = res?.competition || null;
        const list = Array.isArray(res?.students) ? res.students : [];
        setComp(compData);
        setStudents(list);

        const init = {};
        for (const s of list) {
          const id = getId(s);
          if (id == null) continue;
          if (s.already_enrolled) {
            init[id] = {
              checked: true,
              locked: true,
              weight: "",
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
    return () => { alive = false; };
  }, [slug]);

  const entryFee = Number(comp?.entry_fee || 0);

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

  const canSubmit = useMemo(() => {
    if (selectedNewIds.length === 0) return false;
    for (const id of selectedNewIds) {
      const r = sel[id] || {};
      const w = sanitizeWeight(r.weight);
      if (!w || isNaN(Number(w))) return false;
      if (!r.ins) return false;
      if (!r.ins_date) return false;
      if (r.errors && Object.keys(r.errors).length) return false;
    }
    return true;
  }, [sel, selectedNewIds]);

  const totalAmount = entryFee * selectedNewIds.length;

  const updateRow = (id, patch) =>
    setSel((s) => ({
      ...s,
      [id]: {
        ...(s[id] || {
          checked: true,
          locked: false,
          weight: "",
          ins: "",
          ins_date: "",
          errors: {},
        }),
        ...patch,
      },
    }));

  const toggle = (id, checked) => {
    if (sel[id]?.locked) return;
    if (!checked) {
      setSel((s) => ({
        ...s,
        [id]: { checked: false, locked: false, weight: "", ins: "", ins_date: "", errors: {} },
      }));
    } else {
      updateRow(id, { checked: true });
    }
  };

  const validateRow = (id) => {
    const r = sel[id] || {};
    const errors = {};
    const w = sanitizeWeight(r.weight);
    if (!w || isNaN(Number(w))) errors.weight = "وزن نامعتبر است.";
    if (!r.ins) errors.ins = "شماره بیمه الزامی است.";
    if (!r.ins_date) errors.ins_date = "تاریخ صدور بیمه الزامی است.";
    updateRow(id, { errors, weight: w });
    return !Object.keys(errors).length;
  };

  const onChangeWeight = (id, v) => updateRow(id, { weight: sanitizeWeight(v) });
  const onChangeIns = (id, v) => updateRow(id, { ins: normalizeDigits(v) });
  const onChangeInsDate = (id, v) =>
    updateRow(id, { ins_date: v ? v.format("YYYY/MM/DD") : "" });

  const submit = async () => {
    setErr("");

    for (const id of selectedNewIds) {
      if (!validateRow(id)) return;
    }

    const studentsPayload = selectedNewIds.map((id) => ({
      player_id: Number(id),
      declared_weight: sel[id].weight,
      insurance_number: sel[id].ins,
      insurance_issue_date: sel[id].ins_date,
    }));

    try {
      setLoading(true);
      const res = await registerStudentsBulk(slug, { students: studentsPayload });

      // اگر پرداخت آنلاین داری
      if (res?.payment_url) {
        window.location.href = res.payment_url;
        return;
      }

      const eids = extractEnrollmentIds(res);
      console.debug("registerStudentsBulk -> eids:", eids, "raw:", res);

      if (eids.length) {
        const qs = encodeURIComponent(eids.join(","));
        navigate(`/dashboard/${encodeURIComponent(role)}/enrollments/bulk?ids=${qs}`, {
          state: { ids: eids },
          replace: true,
        });
        return;
      }

      // بدون برگشت به صفحه جزئیات؛ فقط پیام خطای اینلاین
      setErr("ثبت انجام شد اما شناسه‌های ثبت‌نام در پاسخ نبود. لطفاً خروجی ویو را طوری برگردان که 'enrollment_ids' یا 'enrollments' داشته باشد.");
    } catch (e) {
      setErr(e?.message || "خطا در ثبت‌نام");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  if (loading && !comp) {
    return <div className="cd-container"><div className="cd-skeleton">در حال بارگذاری…</div></div>;
  }

  return (
    <div className="cd-container" dir="rtl">
      {err && <div className="cd-error" style={{marginBottom:12}}>{err}</div>}

      <div className="cd-hero small">
        <div className="cd-hero-body">
          <h1 className="cd-title">ثبت‌نام شاگردان – {comp?.title || "—"}</h1>
          <div className="cd-chips">
            {comp?.gender_display && <span className="cd-chip">{comp.gender_display}</span>}
            {comp?.age_category_name && <span className="cd-chip">{comp.age_category_name}</span>}
            {comp?.belt_groups_display && <span className="cd-chip">{comp.belt_groups_display}</span>}
            <span className="cd-chip">هزینه ورودی: <strong>{toFa(Number(comp?.entry_fee||0).toLocaleString())}</strong> تومان</span>
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
                  <div className="crs-td">{s.first_name} {s.last_name}</div>
                  <div className="crs-td">{s.national_code || "—"}</div>
                  <div className="crs-td">{s.birth_date || "—"}</div>
                  <div className="crs-td">{s.belt_grade || "—"}</div>
                  <div className="crs-td">{s.club_name || "—"}</div>
                  <div className="crs-td">{s.board_name || "—"}</div>

                  {row.checked && !locked && (
                    <div className="crs-subrow">
                      <div className="cd-row" title="برای ممیز از «.» استفاده کنید.">
                        <label className="cd-label">وزن (kg)</label>
                        <div className="cd-value">
                          <input
                            className="cd-input" dir="ltr" inputMode="decimal"
                            value={row.weight || ""} onChange={(e) => onChangeWeight(sid, e.target.value)}
                            aria-invalid={!!row.errors?.weight}
                            placeholder="مثلاً ۵۷.۳"
                          />
                          {row.errors?.weight && <div className="cd-error" style={{ marginTop: 6 }}>{row.errors.weight}</div>}
                        </div>
                      </div>

                      <div className="cd-row">
                        <label className="cd-label">شماره بیمه</label>
                        <div className="cd-value">
                          <input
                            className="cd-input" dir="ltr" inputMode="numeric" pattern="\d*"
                            value={row.ins || ""} onChange={(e) => onChangeIns(sid, e.target.value)}
                            aria-invalid={!!row.errors?.ins}
                            placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                          />
                          {row.errors?.ins && <div className="cd-error" style={{ marginTop: 6 }}>{row.errors.ins}</div>}
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
                            value={row.ins_date ? new DateObject({ date: row.ins_date, calendar: persian, locale: persian_fa, format: "YYYY/MM/DD" }) : null}
                            onChange={(v) => onChangeInsDate(sid, v)}
                            editable={false}
                            calendarPosition="bottom-right"
                          />
                          {row.errors?.ins_date && <div className="cd-error" style={{ marginTop: 6 }}>{row.errors.ins_date}</div>}
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

      <div className="cd-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-light" onClick={() => navigate(-1)}>بازگشت</button>

        <div className="cd-actions-right">
          <div className="cd-chip">انتخاب‌های جدید: <strong>{toFa(selectedNewIds.length)}</strong></div>
          <div className="cd-chip">مبلغ کل: <strong>{toFa(totalAmount.toLocaleString())}</strong> تومان</div>
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
          <div className="cd-modal-inner cd-modal-inner--tiny cd-modal-inner--white" onClick={(e) => e.stopPropagation()}>
            <button className="cd-modal-close" onClick={() => setConfirmOpen(false)}>✕</button>
            <h3 className="cd-section-title" style={{ marginTop: 0, textAlign: "center" }}>تأیید ثبت‌نام</h3>
            <div className="cd-muted" style={{ textAlign: "center", marginBottom: 12 }}>
              {`آیا از ثبت‌نام ${toFa(selectedNewIds.length)} نفر با مبلغ کل ${toFa(totalAmount.toLocaleString())} تومان اطمینان دارید؟`}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setConfirmOpen(false)}>انصراف</button>
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
