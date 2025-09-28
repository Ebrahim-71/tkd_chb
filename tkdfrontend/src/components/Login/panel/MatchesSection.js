// src/components/Login/panel/MatchesSection.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PaginatedList from "../../common/PaginatedList";
import MatchCard from "./maincontentpanel/MatchCard";
import CoachAgreementFlow from "../competitions/CoachAgreementFlow";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

// اندپوینت‌های داشبورد
const DASHBOARD_ALL_URL = `${API_BASE}/api/competitions/auth/dashboard/all/`;
const DASHBOARD_KY_URL  = `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`;
const DASHBOARD_PO_URL  = `${API_BASE}/api/competitions/auth/dashboard/poomsae/`;

// --- نقش/توکن ---
function getUserRoles() {
  const raw = String(localStorage.getItem("user_role") || "").toLowerCase();
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  const s = new Set(parts);
  if (s.has("both")) {
    s.add("player");
    s.add("coach");
    s.delete("both");
  }
  return Array.from(s);
}
function roleForPath(roles) {
  if (roles.includes("coach")) return "coach";
  if (roles.includes("referee")) return "referee";
  if (roles.includes("club")) return "club";
  if (roles.includes("heyat")) return "heyat";
  if (roles.includes("board")) return "board";
  if (roles.includes("player")) return "player";
  return "guest";
}
const isClubLike = (roles) =>
  roles.some((r) => ["club", "heyat", "board"].includes(String(r).toLowerCase()));

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
  return out;
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.results) return Array.isArray(payload.results) ? payload.results : [];
  if (payload?.items) return Array.isArray(payload.items) ? payload.items : [];
  if (payload?.competitions) return Array.isArray(payload.competitions) ? payload.competitions : [];
  return [];
}

async function tryUrlWithTokens(url, tokens) {
  for (const t of tokens.length ? tokens : [null]) {
    try {
      const res = await axios.get(url, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      return { ok: true, status: res.status, data: normalizeList(res.data) };
    } catch (e) {
      const st = e?.response?.status;
      if (st === 401 || st === 403) continue;
    }
  }
  return { ok: false, status: null, data: [] };
}

async function getDashboardList(roles) {
  const prior = roleForPath(roles);
  const tokens = candidateTokens(prior);
  const urls = [DASHBOARD_ALL_URL, DASHBOARD_KY_URL, DASHBOARD_PO_URL];
  for (const u of urls) {
    const r = await tryUrlWithTokens(u, tokens);
    if (r.ok) return r.data;
  }
  return [];
}

// --- سبک‌ها ---
const isKyorugi = (m) => {
  const s = String(m?.style_display || m?.style || "").trim().toLowerCase();
  return s.includes("کیوروگی") || s.includes("kyorugi") || s.includes("kyor");
};
const isPoomsae = (m) => {
  const s = String(m?.style_display || m?.style || "").trim().toLowerCase();
  return s.includes("پوم") || s.includes("poom"); // "پومسه" یا "poomsae"
};

// --- تایید مربی برای پومسه ---
const isPoomsaeApproved = (m) => {
  // اگر بک‌اند فیلد یکپارچه بده، اولویت با همونه
  const getBool = (v) =>
    typeof v === "boolean" ? v : (typeof v === "string" ? v.toLowerCase() === "true" : null);

  const candidates = [
    m?.coach_approved_unified,          // ✅ اگر اضافه شد
    m?.poomsae_coach_approved,
    m?.poomsae?.coach_approved,
    m?.poomsae_coach_approval?.approved,
    // برخی APIها فیلد عمومی می‌فرستند:
    m?.coach_approved,
    m?.coachApproved,
    m?.coach_approval?.approved,
  ];

  let sawExplicitFlag = false;
  for (const v of candidates) {
    if (v === undefined) continue;
    const b = getBool(v);
    if (b === null) continue;
    sawExplicitFlag = true;
    return b; // به محض یافتن مقدار معتبر، همون رو برگردون
  }
  // اگر هیچ فلگی موجود نبود، یعنی ویو بک‌اند قبلاً فیلتر کرده → اعتماد کن
  return !sawExplicitFlag ? true : false;
};

const MatchesSection = () => {
  const navigate = useNavigate();

  const roles = useMemo(getUserRoles, []);
  const rolePath = useMemo(() => roleForPath(roles), [roles]);

  // ✅ نقش ذخیره‌شده در localStorage (Dashboard بر همین اساس ریدایرکت می‌کند)
  const storedRole = useMemo(
    () => (localStorage.getItem("user_role") || "guest").toLowerCase(),
    []
  );

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  // ناوبری به جزئیات — حتماً با storedRole بساز که با منطق Dashboard همخوان باشد
  const pushToDetails = (slug, opts = {}) => {
    if (!slug) return;
    const base = `/dashboard/${encodeURIComponent(storedRole)}/competitions/${encodeURIComponent(slug)}`;
    navigate(opts.view === "details" ? `${base}?view=details` : base);
  };

  // کلیک روی «جزئیات و ثبت‌نام»
  const handleDetailsClick = (comp) => {
    if (!comp?.public_id) return;

    // مربی (و نقش‌های both که شامل coach می‌شوند): مودال تعهدنامه
    if (roles.includes("coach")) {
      setSelectedMatch(comp);
      setShowTermsModal(true);
      return;
    }

    // داور/باشگاه/هیئت → مستقیم
    if (roles.includes("referee") || isClubLike(roles)) {
      pushToDetails(comp.public_id, { view: "details" });
      return;
    }

    // بازیکن/سایر → مستقیم
    pushToDetails(comp.public_id);
  };

  const handleModalCancel = () => {
    setShowTermsModal(false);
    setSelectedMatch(null);
  };

  // ✅ وقتی تعهدنامه تایید شد و کاربر «ادامه» را زد → برو صفحه جزئیات با storedRole
  const handleModalDone = (slugFromChild) => {
    const slug = slugFromChild || selectedMatch?.public_id;
    setShowTermsModal(false);
    setSelectedMatch(null);
    if (slug) pushToDetails(slug);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");

      const tokens = candidateTokens(rolePath);
      if (!tokens.length) {
        setLoading(false);
        setErr("ابتدا وارد حساب شوید.");
        setMatches([]);
        return;
      }

      try {
        const list = await getDashboardList(roles);
        if (!alive) return;

        // Player-only
        const playerOnly =
          roles.includes("player") &&
          !roles.some((r) => ["coach", "referee", "club", "heyat", "board"].includes(r));

        let data = Array.isArray(list) ? list : [];
        if (playerOnly) {
          // ✅ کیوروگی مثل قبل میاد؛
          // ✅ پومسه فقط وقتی میاد که مربی تایید کرده باشه.
          data = data.filter(
            (item) => isKyorugi(item) || (isPoomsae(item) && isPoomsaeApproved(item))
          );
        }

        // مرتب‌سازی: جدیدترین بالا
        const getTime = (x) => {
          const s = x?.created_at || x?.competition_date || null;
          const t = s ? Date.parse(s) : NaN;
          return Number.isNaN(t) ? -Infinity : t;
        };
        data.sort((a, b) => {
          const tb = getTime(b);
          const ta = getTime(a);
          if (tb !== ta) return tb - ta;
          return (b?.id ?? 0) - (a?.id ?? 0);
        });

        setMatches(data);

        if (!data.length && isClubLike(roles)) {
          setErr(
            "مسابقه‌ای برای نمایش پیدا نشد. اگر انتظار دارید همهٔ مسابقات را ببینید، خروجی «/auth/dashboard/all/» را برای نقش هیئت/باشگاه گسترده‌تر کنید."
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
  }, [roles, rolePath]);

  return (
    <div style={{ padding: "2rem" }} dir="rtl">
      <h2>مسابقات</h2>

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
