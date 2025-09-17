// MatchCard.jsx
import React from "react";
import { Link } from "react-router-dom";
import "./MatchCard.css";

const toPersianDigits = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const fmtDateFa = (val) => {
  if (!val) return "—";
  const s = String(val).slice(0, 10).replace(/-/g, "/");
  return toPersianDigits(s);
};

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

function getRole() {
  return localStorage.getItem("user_role") || "player"; // پیش‌فرض امن
}

const MatchCard = ({ match, onDetailsClick }) => {
  const imageSrc = match?.poster?.startsWith("http")
    ? match.poster
    : match?.poster
    ? `${API_BASE}${match.poster}`
    : "/placeholder.jpg";

  const slug = match?.public_id; // 🔑 فقط با public_id
  const role = getRole();

  return (
    <div className="match-card">
      <img
        src={imageSrc}
        alt="پوستر مسابقه"
        className="match-image"
        onError={(e) => (e.currentTarget.src = "/placeholder.jpg")}
      />

      <h3 className="match-title">{match?.title || "—"}</h3>

      <div className="match-details">
        <p>سبک مسابقه: {match?.style_display || "—"}</p>
        <p>رده سنی: {match?.age_category_name || "—"}</p>
        <p>رده کمربندی: {match?.belt_level_display || "—"}</p>
        <p>جنسیت: {match?.gender_display || "—"}</p>
        <p>شروع ثبت‌نام: {fmtDateFa(match?.registration_start_jalali ?? match?.registration_start)}</p>
        <p>پایان ثبت‌نام: {fmtDateFa(match?.registration_end_jalali ?? match?.registration_end)}</p>
        <p>تاریخ قرعه‌کشی: {fmtDateFa(match?.draw_date_jalali ?? match?.draw_date)}</p>
        <p>تاریخ برگزاری: {fmtDateFa(match?.competition_date_jalali ?? match?.competition_date)}</p>

        <p>
          مبلغ ورودی:{" "}
          {match?.entry_fee
            ? `${toPersianDigits(Number(match.entry_fee).toLocaleString())} تومان`
            : "رایگان"}
        </p>
        <p>محل برگزاری: {match?.city || "—"}</p>
      </div>

      {/* اگر والد onDetailsClick داده، همون رو صدا بزن؛ وگرنه لینک داخل داشبورد */}
      {onDetailsClick ? (
        <button className="match-button" onClick={() => onDetailsClick(match)}>
          جزئیات بیشتر و ثبت نام
        </button>
      ) : slug ? (
        <Link className="match-button" to={`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}`}>
          جزئیات بیشتر و ثبت نام
        </Link>
      ) : (
        <button className="match-button" disabled title="شناسه عمومی موجود نیست">
          جزئیات بیشتر و ثبت نام
        </button>
      )}
    </div>
  );
};

export default MatchCard;
