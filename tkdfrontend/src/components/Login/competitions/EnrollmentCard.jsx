// src/components/Login/competitions/EnrollmentCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getEnrollmentDetail,
  getEnrollmentCard,
  getEnrollmentCardUrl,
  API_BASE,
} from "../../../api/competitions";
import "./EnrollmentCard.css";

/* ---------- helpers ---------- */
const toFa = (s = "") => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const absUrl = (u) => (u ? (u.startsWith?.("http") ? u : `${API_BASE}${u}`) : null);
const pick = (o, ...keys) => keys.map(k => o?.[k]).find(v => v != null);

/* ================================= */
export default function EnrollmentCard() {
  const { role, enrollmentId } = useParams();
  const navigate = useNavigate();

  const [enroll, setEnroll] = useState(null);     // JSON جزئیات ثبت‌نام
  const [cardUrl, setCardUrl] = useState(null);   // URL تصویر کارت (اگر موجود)
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr("");
      setEnroll(null);
      setCardUrl(null);

      try {
        // 1) اول تلاش برای گرفتن کارت از اندپوینت /card/
        const cardRes = await getEnrollmentCard(enrollmentId);
        if (!alive) return;

        // ممکن است JSON باشد یا متن/URL خام
        const fromJson = getEnrollmentCardUrl(cardRes);
        if (fromJson) setCardUrl(absUrl(fromJson));
        if (!fromJson && typeof cardRes === "string") {
          setCardUrl(absUrl(cardRes));
        }

        // اگر کارت، JSON کامل ثبت‌نام را هم برگرداند (برخی سرورها)
        if (cardRes && typeof cardRes === "object" && !Array.isArray(cardRes)) {
          setEnroll((prev) => prev ?? cardRes);
        }
      } catch (e) {
        // اگر /card/ 404 داد، می‌رویم سراغ جزئیات (fallback)
        if (e?.status !== 404) {
          if (alive) setErr(e?.message || "خطا در دریافت کارت");
        }
      }

      // 2) جزئیات ثبت‌نام (برای پرکردن داده‌های متنی یا اگر کارت نبود)
      if (alive) {
        try {
          const detail = await getEnrollmentDetail(enrollmentId);
          if (!alive) return;
          setEnroll(detail);

          // اگر خود جزئیات آدرس کارت داشت
          const urlFromDetail =
            getEnrollmentCardUrl(detail) ||
            pick(detail, "card_url", "cardUrl", "card") ||
            detail?.card?.url;

          if (!cardUrl && urlFromDetail) {
            setCardUrl(absUrl(String(urlFromDetail)));
          }
        } catch (e2) {
          if (!alive) return;
          // فقط وقتی هیچ کارت و هیچ دیتیلی نگرفته‌ایم، ارور را نشان بده
          if (!cardUrl) setErr(e2?.message || "کارت/ثبت‌نام یافت نشد");
        }
      }

      if (alive) setLoading(false);
    })();

    return () => { alive = false; };
  }, [enrollmentId]);

  const status = useMemo(
    () => String(enroll?.status || enroll?.payment_status || "").toLowerCase(),
    [enroll]
  );
  const isPaidLike = ["paid", "confirmed", "approved", "accepted", "completed"].includes(status);
  const isPoomsae = useMemo(() => String(enroll?.kind || enroll?.discipline || "").toLowerCase() === "poomsae", [enroll]);

  /* ---------- UI states ---------- */
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
  if (!enroll && !cardUrl) {
    return (
      <div className="cd-container">
        <div className="cd-error">کارت یافت نشد.</div>
      </div>
    );
  }

  /* ---------- fields ---------- */
  const {
    competition_title,
    competition_date_jalali,
    first_name,
    last_name,
    birth_date,
    photo,
    declared_weight,
    weight_name,
    belt,
    belt_group,
    insurance_number,
    insurance_issue_date_jalali,
    coach_name,
    club_name,
    // پومسه
    poomsae_type,
    poomsae_type_display,
    age_category_name,
  } = enroll || {};

  const fullName = [first_name, last_name].filter(Boolean).join(" ");
  const photoUrl = absUrl(photo);

  const leftTopLabel  = isPoomsae ? "نوع مسابقه" : "وزن اعلامی";
  const leftTopValue  = isPoomsae
    ? (poomsae_type_display || poomsae_type || "—")
    : (declared_weight ? `${toFa(declared_weight)} kg` : "—");

  const rightBottomLabel = isPoomsae ? "گروه سنی" : "رده وزنی";
  const rightBottomValue = isPoomsae ? (age_category_name || "—") : (weight_name || "—");

  return (
    <div className="cd-container" dir="rtl" style={{ maxWidth: 900 }}>
      <div className="enroll-card enroll-card--outlined">
        <div className="enroll-card__head enroll-card__head--center">
          <h2 className="enroll-card__title">کارت شناسایی بازیکن</h2>

        
        </div>

     
        {/* اطلاعات متنی جانبی */}
        {enroll && (
          <>
            <div className="enroll-card__grid" style={{ marginTop: 12 }}>
              <Info label="عنوان مسابقه" value={competition_title || "—"} />
              <Info label="تاریخ برگزاری" value={competition_date_jalali || "—"} />
            </div>

            <div className="enroll-card__divider" />

            <div className="enroll-card__grid enroll-card__grid--photo">
              <div className="enroll-card__photo-wrap">
                {photoUrl ? (
                  <img className="enroll-card__photo" src={photoUrl} alt="player" />
                ) : (
                  <div className="enroll-card__photo placeholder">بدون عکس</div>
                )}
              </div>

              <div className="enroll-card__info-cols">
                <Info label="نام و نام خانوادگی" value={fullName || "—"} />
                <Info label="تاریخ تولد" value={birth_date || "—"} />
                <Info label="کمربند" value={belt || "—"} />
                <Info label="گروه کمربندی" value={belt_group || "—"} />
                <Info label={rightBottomLabel} value={rightBottomValue} />
              </div>

              <div className="enroll-card__info-cols">
                <Info label={leftTopLabel} value={leftTopValue} />
                <Info label="نام مربی" value={coach_name || "—"} />
                <Info label="نام باشگاه" value={club_name || "—"} />
                <Info label="شماره بیمه" value={insurance_number || "—"} />
                <Info label="تاریخ صدور بیمه" value={insurance_issue_date_jalali || "—"} />
              </div>
            </div>
          </>
        )}

        <div className="enroll-card__footer">
          <div className="enroll-card__notice">
            این کارت را چاپ کرده و روز مسابقه همراه خود داشته باشید.
          </div>
          <div className="cd-actions enroll-card__actions">
            <button className="btn btn-outline" onClick={() => window.print()}>
              چاپ کارت
            </button>
            <button
              className="btn btn-light"
              onClick={() => navigate(`/dashboard/${encodeURIComponent(role)}`)}
            >
              بازگشت به داشبورد
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
