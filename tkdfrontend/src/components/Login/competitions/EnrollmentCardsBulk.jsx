import React, { useEffect, useState } from "react";
import { useSearchParams, useParams, Link } from "react-router-dom";
import { getEnrollmentCard } from "../../../api/competitions";
import "./EnrollmentCard.css"; // از همان استایل تک‌کارته استفاده می‌کنیم

const toFa = (s="") => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

function CardView({ data }) {
  if (!data) return null;
  const {
    competition_title, competition_date_jalali, first_name, last_name, birth_date,
    photo, declared_weight, weight_name, belt, belt_group,
    insurance_number, insurance_issue_date_jalali, coach_name, club_name,
  } = data;
  const fullName = [first_name,last_name].filter(Boolean).join(" ");
  return (
    <div className="enroll-card enroll-card--outlined" style={{marginBottom:24}}>
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
          {photo ? <img className="enroll-card__photo" src={photo} alt="player" /> : <div className="enroll-card__photo placeholder">بدون عکس</div>}
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

export default function EnrollmentCardsBulk() {
  const { role } = useParams();
  const [sp] = useSearchParams();
  const idsStr = sp.get("ids") || "";
  const ids = idsStr.split(",").map((x) => x.trim()).filter(Boolean);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cards, setCards] = useState([]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        setLoading(true); setErr("");
        const out = [];
        for (const id of ids) {
          try {
            const c = await getEnrollmentCard(id);
            out.push(c);
          } catch (e) {
            // اگر کارتی هنوز آماده نباشد، صرف‌نظر می‌کنیم
          }
        }
        if (alive) setCards(out);
      } catch (e) {
        if (alive) setErr(e?.message || "خطا");
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [idsStr]);

  if (loading && cards.length === 0) {
    return <div className="cd-container"><div className="cd-skeleton">در حال بارگذاری…</div></div>;
  }
  if (err) {
    return <div className="cd-container"><div className="cd-error">{err}</div></div>;
  }

  return (
    <div className="cd-container" dir="rtl" style={{ maxWidth: 900 }}>
      <div className="cd-actions" style={{marginBottom:12}}>
        <button className="btn btn-outline" onClick={() => window.print()}>چاپ همه کارت‌ها</button>
        <Link className="btn btn-light" to={`/dashboard/${encodeURIComponent(role)}`}>بازگشت</Link>
      </div>
      {cards.length === 0 ? (
        <div className="cd-muted">کارت آماده‌ای یافت نشد.</div>
      ) : (
        cards.map((c, i) => <CardView key={i} data={c} />)
      )}
    </div>
  );
}
