// src/components/Login/competitions/EnrollmentCard.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getEnrollmentCard } from "../../../api/competitions";
import "./EnrollmentCard.css";

const toFa = (s = "") => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export default function EnrollmentCard() {
  const { role, enrollmentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    getEnrollmentCard(enrollmentId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e?.message || "خطا در دریافت کارت"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [enrollmentId]);

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
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-light" onClick={() => navigate(-1)}>بازگشت</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="cd-container">
        <div className="cd-error">کارت یافت نشد.</div>
      </div>
    );
  }

  const {
    // card_id,  // ⛔️ حذف شد
    competition_title,
    competition_date_jalali,
    first_name,
    last_name,
    birth_date,
    photo,
    declared_weight,
    weight_name,
    // weight_range, // ⛔️ حذف شد
    belt,
    belt_group,
    insurance_number,
    insurance_issue_date_jalali,
    coach_name,
    club_name,
  } = data;

  const fullName = [first_name, last_name].filter(Boolean).join(" ");

  return (
    <div className="cd-container" dir="rtl" style={{ maxWidth: 900 }}>
      <div className="enroll-card enroll-card--outlined">
        {/* تیتر وسط */}
        <div className="enroll-card__head enroll-card__head--center">
          <h2 className="enroll-card__title">کارت شناسایی بازیکن</h2>
        </div>

        <div className="enroll-card__grid">
          <Info label="عنوان مسابقه" value={competition_title || "—"} />
          <Info label="تاریخ برگزاری" value={competition_date_jalali || "—"} />
        </div>

        <div className="enroll-card__divider" />

        <div className="enroll-card__grid enroll-card__grid--photo">
          <div className="enroll-card__photo-wrap">
            {photo ? (
              <img className="enroll-card__photo" src={photo} alt="player" />
            ) : (
              <div className="enroll-card__photo placeholder">بدون عکس</div>
            )}
          </div>

          <div className="enroll-card__info-cols">
            <Info label="نام و نام خانوادگی" value={fullName || "—"} />
            <Info label="تاریخ تولد" value={birth_date || "—"} />
            <Info label="کمربند" value={belt || "—"} />
            <Info label="گروه کمربندی" value={belt_group || "—"} />
            <Info label="رده وزنی" value={weight_name || "—"} />
          </div>

          <div className="enroll-card__info-cols">
            <Info label="وزن اعلامی" value={declared_weight ? `${toFa(declared_weight)} kg` : "—"} />
            <Info label="نام مربی" value={coach_name || "—"} />
            <Info label="نام باشگاه" value={club_name || "—"} />
            <Info label="شماره بیمه" value={insurance_number || "—"} />
            <Info label="تاریخ صدور بیمه" value={insurance_issue_date_jalali || "—"} />
          </div>
        </div>

        {/* پایین کارت */}
        <div className="enroll-card__footer">
          <div className="enroll-card__notice">
            این کارت را چاپ کرده و روز مسابقه همراه خود داشته باشید.
          </div>
          <div className="cd-actions enroll-card__actions">
            <button className="btn btn-outline" onClick={() => window.print()}>
              چاپ کارت
            </button>
            {/* ⬇️ تغییر متن و عمل دکمه */}
            <button className="btn btn-light" onClick={() => navigate(-1)}>
              بازگشت به صفحه جزییات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="cd-row">
      <div className="cd-label">{label}</div>
      <div className="cd-value">{value}</div>
    </div>
  );
}
