import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getCompetitionResults, getCompetitionDetail } from "../../../api/competitions";
import "./CompetitionResults.css";

const toFa = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const API_BASE = process.env.REACT_APP_API_BASE_URL || "https://api.chbtkd.ir";
const absUrl = (u) => (u ? (u.startsWith("http") ? u : `${API_BASE}${u}`) : null);

function showEntry(v) {
  if (!v) return "—";
  if (typeof v === "string") return v;
  const player =
    v.player_name || v.player || v.full_name ||
    (v.player?.full_name || `${v.player?.first_name || ""} ${v.player?.last_name || ""}`.trim());
  const club = v.club_name || v.club || v.club_title || v.club?.club_name || v.club?.name;
  const label = v.label || [player, club].filter(Boolean).join(" — ");
  return label || "—";
}

export default function CompetitionResults() {
  const { slug, role } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState({ loading: true, error: "", data: null });
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let mounted = true;
    setMeta((s) => ({ ...s, loading: true, error: "" }));
    getCompetitionDetail(slug)
      .then((d) => mounted && setMeta({ loading: false, error: "", data: d }))
      .catch((e) => mounted && setMeta({ loading: false, error: e?.message || "خطا در دریافت مسابقه", data: null }));
    return () => { mounted = false; };
  }, [slug]);

  useEffect(() => {
    let mounted = true;
    setState({ loading: true, error: "", rows: [] });
    getCompetitionResults(slug)
      .then((d) => {
        if (!mounted) return;
        const rows = Array.isArray(d?.results) ? d.results : (Array.isArray(d) ? d : []);
        setState({ loading: false, error: "", rows });
      })
      .catch((e) => {
        if (!mounted) return;
        setState({ loading: false, error: e?.message || "خطا در دریافت نتایج", rows: [] });
      });
    return () => { mounted = false; };
  }, [slug]);

  const poster = useMemo(() => absUrl(meta?.data?.poster) || "/placeholder.jpg", [meta?.data]);

  const hasBeltGroups = useMemo(
    () => state.rows.some(
      (row) => Boolean(
        row.belt_group || row.belt_group_label
      )
    ),
    [state.rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return state.rows;
    const norm = (s) => String(s || "").toLowerCase();
    const contains = (s) => norm(s).includes(norm(q));
    return state.rows.filter((r) => {
      return (
        contains(r.weight || r.weight_name) ||
        contains(showEntry(r.gold || r.gold_enrollment)) ||
        contains(showEntry(r.silver || r.silver_enrollment)) ||
        contains(showEntry(r.bronze1 || r.bronze1_enrollment || r.b1)) ||
        contains(showEntry(r.bronze2 || r.bronze2_enrollment || r.b2))
      );
    });
  }, [state.rows, query]);

  const onPrint = () => window.print();
  const goBack = () => navigate(`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}`);

  return (
    <div className="res-container" dir="rtl">
      {/* Header */}
      <header className="res-hero">
        <img className="res-poster" src={poster} alt={meta?.data?.title || "poster"} onError={(e)=>e.currentTarget.src="/placeholder.jpg"} />
        <div className="res-hero-body">
          <h1 className="res-title">نتایج مسابقه</h1>
          <div className="res-subtitle">
            <Link className="res-link" to={`/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}`}>
              {meta?.data?.title || "—"}
            </Link>
            {meta?.data?.competition_date && (
              <span className="res-dot">•</span>
            )}
            {meta?.data?.competition_date && (
              <span className="res-chip">تاریخ برگزاری: {toFa(String(meta.data.competition_date).slice(0,10).replace(/-/g,"/"))}</span>
            )}
          </div>
        </div>
        <div className="res-actions no-print">
          <button className="btn btn-light" onClick={goBack}>بازگشت</button>
          <button className="btn btn-outline" onClick={onPrint}>چاپ</button>
        </div>
      </header>

      {/* Tools */}
      <div className="res-toolbar no-print">
        <input
          className="res-search"
          placeholder="جستجو در اسامی/باشگاه/وزن…"
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
        />
        <div className="res-count">تعداد ردیف‌ها: <strong>{toFa(filtered.length)}</strong></div>
      </div>

      {/* Content */}
      <section className="res-content">
        {state.loading ? (
          <div className="res-skeleton">در حال بارگذاری…</div>
        ) : state.error ? (
          <div className="res-error">{state.error}</div>
        ) : filtered.length === 0 ? (
          <div className="res-empty">نتایجی ثبت نشده است.</div>
        ) : (
          <div className="res-table-wrap">
            <table className="listing res-table">
            <thead>
                <tr>
                <th className="col-weight">رده وزنی</th>

                {hasBeltGroups && (
                  <th className="col-belt">گروه کمربندی</th>
                )}

                <th className="col-gold">🥇 طلا</th>
                <th className="col-silver">🥈 نقره</th>
                <th className="col-bronze">🥉 برنز </th>
                <th className="col-bronze">🥉 برنز </th>
                </tr>
            </thead>
            <tbody>
                {filtered.map((r, idx) => (
                <tr key={idx}>
                    <td className="col-weight">
                      {r.weight || r.weight_name || "—"}
                    </td>
                    {hasBeltGroups && (
                      <td className="col-belt">
                        {r.belt_group || r.belt_group_label || "—"}
                      </td>)}
                    <td className="col-gold">{showEntry(r.gold || r.gold_enrollment)}</td>
                    <td className="col-silver">{showEntry(r.silver || r.silver_enrollment)}</td>
                    <td className="col-bronze">{showEntry(r.bronze1 || r.bronze1_enrollment || r.b1)}</td>
                    <td className="col-bronze">{showEntry(r.bronze2 || r.bronze2_enrollment || r.b2)}</td>
                </tr>
                ))}
            </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
