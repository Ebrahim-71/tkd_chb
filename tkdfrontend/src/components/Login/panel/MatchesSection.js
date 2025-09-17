// src/components/Login/panel/MatchesSection.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PaginatedList from "../../common/PaginatedList";
import MatchCard from "./maincontentpanel/MatchCard";
import CoachAgreementFlow from "../competitions/CoachAgreementFlow";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

// فقط همینی که توی URLconf شما هست:
const DASHBOARD_URL = `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`;

// --- نقش/توکن ---
function getRole() {
  return (localStorage.getItem("user_role") || "guest").toLowerCase();
}
const isClubLike = (r) => ["club", "heyat", "board"].includes(String(r).toLowerCase());

function candidateTokens(priorRole) {
  const keys = [
    `${priorRole}_token`,
    "both_token",
    "coach_token",
    "player_token",
    "referee_token",
    "club_token",
    "heyat_token",
    "board_token",
    "access_token",
  ];
  const out = [];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && !out.includes(v)) out.push(v);
  }
  return out; // ممکنه فقط یک توکن داشته باشید؛ مشکلی نیست
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.results) return Array.isArray(payload.results) ? payload.results : [];
  if (payload?.items) return Array.isArray(payload.items) ? payload.items : [];
  if (payload?.competitions) return Array.isArray(payload.competitions) ? payload.competitions : [];
  return [];
}

// یک URL رو با چند توکن امتحان می‌کنیم؛ اگر 200 شد، لیستش رو برمی‌گردونیم
async function tryUrlWithTokens(url, tokens) {
  for (const t of tokens.length ? tokens : [null]) {
    try {
      const res = await axios.get(url, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      return { ok: true, status: res.status, data: normalizeList(res.data) };
    } catch (e) {
      const st = e?.response?.status;
      if (st === 401 || st === 403) continue; // برو توکن بعدی/URL بعدی
      // خطای دیگر (۴۰۴/۵۰۰/…) → ادامه بده
    }
  }
  return { ok: false, status: null, data: [] };
}

// چند URL متداول را پشت هم تست می‌کنیم تا یکی جواب بده
async function getDashboardListFor(role) {
  const urls = [
    `${DASHBOARD_URL}?scope=all`,
    `${DASHBOARD_URL}?all=1`,
    `${DASHBOARD_URL}?visibility=public`,
    `${DASHBOARD_URL}?role=${encodeURIComponent(role)}`,
    DASHBOARD_URL, // آخرین تلاش: بدون پارامتر
  ];
  const tokens = candidateTokens(role);

  for (const u of urls) {
    const r = await tryUrlWithTokens(u, tokens);
    if (r.ok) return r.data; // حتی اگر خالی بود، یعنی درخواست موفق ولی چیزی برای نقش شما نیست
  }
  return []; // هیچی گیر نیومد
}

const MatchesSection = () => {
  const navigate = useNavigate();

  const role = useMemo(getRole, []);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr("");

      // اگه لاگین نیستیم:
      const tokens = candidateTokens(role);
      if (!tokens.length) {
        setLoading(false);
        setErr("ابتدا وارد حساب شوید.");
        setMatches([]);
        return;
      }

      try {
        // ✅ برای همهٔ نقش‌ها از داشبورد می‌خوانیم
        const list = await getDashboardListFor(role);

        if (!alive) return;
        setMatches(Array.isArray(list) ? list : []);
        if (!list.length && isClubLike(role)) {
          // پیام راهنما برای هیئت/باشگاه وقتی لیست خالیه
          setErr(
            "مسابقه‌ای برای نمایش پیدا نشد. اگر انتظار دارید همهٔ مسابقات را ببینید، " +
              "در بک‌اند خروجی اندپوینت «/auth/dashboard/kyorugi/» را برای نقش هیئت/باشگاه گسترده‌تر کنید (مثلاً با ?scope=all)."
          );
        }
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "خطا در دریافت مسابقات");
        setMatches([]);
      } finally {
        alive && setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [role]);

  const pushToDetails = (slug, opts = {}) => {
    if (!slug) return;
    const base = `/dashboard/${encodeURIComponent(role)}/competitions/${encodeURIComponent(slug)}`;
    navigate(opts.view === "details" ? `${base}?view=details` : base);
  };

  const handleDetailsClick = (comp) => {
    if (!comp?.public_id) return;
    if (role === "coach" || role === "both") {
      setSelectedMatch(comp);
      setShowTermsModal(true);
    } else if (role === "referee" || role === "player") {
      pushToDetails(comp.public_id);
    } else if (isClubLike(role)) {
      pushToDetails(comp.public_id, { view: "details" }); // بدون «ثبت‌نام خودم»
    } else {
      pushToDetails(comp.public_id);
    }
  };

  const handleModalDone = () => {
    setShowTermsModal(false);
    if (selectedMatch?.public_id) pushToDetails(selectedMatch.public_id);
    setSelectedMatch(null);
  };
  const handleModalCancel = () => {
    setShowTermsModal(false);
    setSelectedMatch(null);
  };

  return (
    <div style={{ padding: "2rem" }} dir="rtl">
      <h2>مسابقات کیوروگی</h2>

      {loading ? (
        <div>در حال بارگذاری…</div>
      ) : err ? (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>
      ) : matches.length === 0 ? (
        <div>مسابقه‌ای یافت نشد.</div>
      ) : (
        <PaginatedList
          items={matches}
          itemsPerPage={4}
          renderItem={(item) => (
            <div
              key={item.id || item.public_id}
              style={{
                width: isMobile ? "90%" : "100%",
                boxSizing: "border-box",
                margin: "10px 20px",
                display: "inline-flex",
                flexDirection: "column",
                verticalAlign: "top",
              }}
            >
              <MatchCard match={item} onDetailsClick={() => handleDetailsClick(item)} />
            </div>
          )}
        />
      )}

      {showTermsModal && selectedMatch && (
        <CoachAgreementFlow
          competition={selectedMatch}
          onDone={handleModalDone}
          onCancel={handleModalCancel}
        />
      )}
    </div>
  );
};

export default MatchesSection;
