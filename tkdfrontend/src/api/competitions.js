// src/api/competitions.js
// فقط کیوروگی + پومسه + اندپوینت‌های جنریک (هماهنگ با urls.py و views.py شما)

/* ---------------- Base URLs ---------------- */
export const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// Kyorugi roots
const KY_PUBLIC_ROOT = `${API_BASE}/api/competitions/kyorugi`;
const KY_AUTH_ROOT   = `${API_BASE}/api/competitions/auth/kyorugi`;

// Poomsae roots
const POOM_PUBLIC_ROOT = `${API_BASE}/api/competitions/poomsae`;
const POOM_AUTH_ROOT   = `${API_BASE}/api/competitions/auth/poomsae`;

// Generic (any model)
const ANY_PUBLIC_ROOT = `${API_BASE}/api/competitions`;

// Dashboard
const DASHBOARD_KY_AUTH  = `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`;
const DASHBOARD_ALL_AUTH = `${API_BASE}/api/competitions/auth/dashboard/all/`;

/* ---------------- Token & Headers ---------------- */
// اولویت طبق ترجیح شما: coach → both → <role>_token → access_token → token
function pickToken() {
  const role = (localStorage.getItem("user_role") || "").toLowerCase().trim();
  const roleTokenKey = role ? `${role}_token` : null;
  const keys = [
    "coach_token",
    "both_token",
    roleTokenKey,
    "access_token",
    "token",
  ].filter(Boolean);
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

function authHeaders(extra) {
  const t = pickToken();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

function requireAuthHeaders() {
  const t = pickToken();
  if (!t) {
    const err = new Error("برای انجام این عملیات باید وارد شوید.");
    err.code = "NO_TOKEN";
    throw err;
  }
  return authHeaders();
}

/* ---------------- Fetch helpers ---------------- */
const DEBUG_API = true; // ← اگر نخواستی لاگ‌ها بیاد، بگذار false
async function safeFetch(url, opts = {}) {
  if (DEBUG_API) {
    console.groupCollapsed("🌐 safeFetch");
    console.log("URL:", url);
    console.log("Method:", opts?.method || "GET");
    console.log("Headers:", opts?.headers);
    try {
      const b = opts?.body && (typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body);
      if (b && typeof b === "object") {
        console.log("Body:", b);
        const typed = {};
        Object.entries(b).forEach(([k, v]) => (typed[k] = `${v}  ← type: ${typeof v}`));
        console.table(typed);
      } else if (opts?.body) {
        console.log("Body (raw):", opts.body);
      }
    } catch { console.log("Body (raw):", opts?.body); }
    console.groupEnd();
  }

  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* may be text */ }
  if (DEBUG_API) {
    console.groupCollapsed("📩 safeFetch Response");
    console.log("Status:", res.status, res.statusText);
    console.log("Data:", data);
    console.groupEnd();
  }
  if (!res.ok) {
    let message =
      data?.detail ||
      (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(" ") : null) ||
      (Array.isArray(data?.__all__) ? data.__all__.join(" ") : null) ||
      // اگر ساختار شبیه { errors: {field: ["..."]} } بود:
      (data?.errors && typeof data.errors === "object"
        ? Object.values(data.errors).flat().join(" ")
        : null) ||
      data?.message ||
      data?.error ||
      `HTTP ${res.status}`;
    if (!message && res.statusText) message = `${res.status} ${res.statusText}`;
    const err = new Error(message || "HTTP Error");
    err.status = res.status;
    err.payload = data;
    if (DEBUG_API) {
      console.warn("❗ safeFetch ERROR:", { url, status: res.status, message, payload: data });
      try { console.table(data); } catch {}
    }
    throw err;
  }
  if (res.status === 204 || res.status === 205) return null;
  if (data !== null) return data;
  const text = await res.text().catch(() => "");
  return text ? { raw: text } : null;
}

// حذف کلیدهای undefined/"" قبل از ارسال
function compact(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v.trim() === "") return;
    out[k] = v;
  });
  return out;
}

// چند URL را تست می‌کند و اولین موفق را برمی‌گرداند؛ 404 ها نادیده
async function tryFirst(urls, options = {}) {
  let lastErr;
  const tried = [];
  for (const u of urls) {
    try {
      if (options.__debugUrls) console.debug("[tryFirst]", options.method || "GET", u);
      return await safeFetch(u, options);
    } catch (e) {
      tried.push({ url: u, status: e?.status, message: e?.message });
      lastErr = e;
      if (e?.status && e.status !== 404) break; // روی خطاهای غیر 404 متوقف شو
    }
  }
  if (options.__debugUrls) console.warn("[tryFirst] all candidates failed:", tried);
  const err = lastErr || new Error("No endpoint responded");
  err.tried = tried;
  throw err;
}

function normalizeList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.competitions)) return res.competitions;
  return [];
}

/* ---------------- Helpers: نقش و کنترل UI ---------------- */
export function getCurrentRole() {
  return (localStorage.getItem("user_role") || "").toLowerCase();
}
export function isClubLike(role = getCurrentRole()) {
  const r = (role || "").toLowerCase();
  return r === "club" || r === "heyat" || r === "board";
}
export function shouldShowSelfRegister(competitionOrRole = getCurrentRole(), userRoleIfAny) {
  if (typeof competitionOrRole === "object" && competitionOrRole) {
    const c = competitionOrRole;
    const can =
      Boolean(c.registration_open_effective ?? c.registration_open ?? c.can_register ?? c.canRegister);
    const role = String(userRoleIfAny || getCurrentRole()).toLowerCase();
    return can && !(role && isClubLike(role));
  }
  return !isClubLike(String(competitionOrRole || getCurrentRole()));
}
export function shouldShowStudentRegister(competitionOrRole = getCurrentRole(), userRoleIfAny) {
  const role = typeof competitionOrRole === "object"
    ? String(userRoleIfAny || getCurrentRole()).toLowerCase()
    : String(competitionOrRole || getCurrentRole()).toLowerCase();
  return role === "coach" || role === "both";
}

/* ---------------- Terms (تعهدنامه) ---------------- */
export async function getCompetitionTerms(key) {
  const headers = authHeaders();
  const k = encodeURIComponent(String(key || "").trim());
  return tryFirst(
    [
      `${ANY_PUBLIC_ROOT}/by-public/${k}/terms/`,
      `${ANY_PUBLIC_ROOT}/${k}/terms/`,
      `${KY_PUBLIC_ROOT}/${k}/terms/`,
    ],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
}

/* ---------------- Competition detail (public_id/slug/id) ---------------- */
export async function getCompetitionDetail(key) {
  const headers = authHeaders();
  const k = encodeURIComponent(String(key || "").trim());
  return tryFirst(
    [
      `${ANY_PUBLIC_ROOT}/by-public/${k}/`,
      `${ANY_PUBLIC_ROOT}/${k}/`,
      `${KY_PUBLIC_ROOT}/${k}/`,
      `${POOM_PUBLIC_ROOT}/${k}/`,
    ],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
}

/* ---------------- Coach approval (کیوروگی) ---------------- */
export async function getCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, {
    method: "GET", headers, credentials: "omit"
  });
}
export async function approveCompetition(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, {
    method: "POST", headers, credentials: "omit", body: JSON.stringify({ agree: true })
  });
}

/* ---------------- Coach approval (پومسه) ---------------- */
export async function getPoomsaeCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${POOM_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, {
    method: "GET", headers, credentials: "omit"
  });
}
export async function approvePoomsaeCompetition(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${POOM_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, {
    method: "POST", headers, credentials: "omit", body: JSON.stringify({ agree: true })
  });
}

/* ---------------- Register self (کیوروگی) ---------------- */
export async function getRegisterSelfPrefill(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/prefill/`, {
    method: "GET", headers, credentials: "omit"
  });
}
export async function registerSelf(publicId, payload) {
  const headers = requireAuthHeaders();
  const body = compact({
    coach_code: (payload?.coach_code ?? "").trim(),
    declared_weight: String(payload?.declared_weight ?? "").trim(),
    insurance_number: (payload?.insurance_number ?? "").trim(),
    insurance_issue_date: (payload?.insurance_issue_date ?? "").trim(), // YYYY-MM-DD
  });
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/register/self/`, {
    method: "POST", headers, credentials: "omit", body: JSON.stringify(body)
  });
}

/* ---------------- Register self (پومسه) ---------------- */
// prefill مجزا برای پومسه نداریم؛ از دیتیل می‌سازیم
export async function buildPoomsaePrefill(publicId) {
  const detail = await getCompetitionDetail(publicId); // kind: "poomsae"
  const locked = detail?.me_locked || detail?.my_profile || {};
  return {
    can_register: Boolean(
      detail?.registration_open_effective ??
      detail?.registration_open ??
      detail?.can_register
    ),
    locked: {
      first_name: locked.first_name || "",
      last_name: locked.last_name || "",
      national_code: locked.national_id || locked.nationalCode || "",
      birth_date: locked.birth_date || locked.birthDate || "",
      belt: locked.belt || "",
      club: locked.club || "",
      coach: locked.coach || "",
    },
    suggested: {
      insurance_number: "",
      insurance_issue_date: "",
    },
    // طبق تصمیم اخیر: کد مربی برای پومسه هم اجباری است
    need_coach_code: true,
  };
}

export async function registerSelfPoomsae(publicId, payload) {
  const headers = requireAuthHeaders();
  const body = compact({
    coach_code: payload?.coach_code ? String(payload.coach_code).trim() : undefined,
    // یکی از 'standard' | 'creative'
    poomsae_type: payload?.poomsae_type ? String(payload.poomsae_type).toLowerCase() : undefined,
    insurance_number: payload?.insurance_number ? String(payload.insurance_number).trim() : undefined,
    insurance_issue_date: payload?.insurance_issue_date, // YYYY-MM-DD
  });
  return safeFetch(
    `${POOM_AUTH_ROOT}/${encodeURIComponent(publicId)}/register/self/`,
    { method: "POST", headers, credentials: "omit", body: JSON.stringify(body) }
  );
}

/* ---------------- Coach bulk register (شاگردان مربی) ---------------- */
export async function getCoachEligibleStudents(key) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(key)}/coach/students/eligible/`, {
    method: "GET", headers, credentials: "omit"
  });
}
export async function registerStudentsBulk(key, itemsOrPayload) {
  const headers = requireAuthHeaders();
  let students = [];
  if (Array.isArray(itemsOrPayload?.students)) {
    students = itemsOrPayload.students;
  } else if (Array.isArray(itemsOrPayload)) {
    students = itemsOrPayload;
  }
  if (!Array.isArray(students) || !students.length) {
    throw new Error("payload باید شامل آرایه students باشد (هر عضو حداقل player_id دارد).");
  }
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(key)}/coach/register/students/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({ students })
  });
}

export async function requestBulkCards(enrollmentIds) {
  const headers = requireAuthHeaders();
  return safeFetch(`${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`, {
    method: "POST", headers, credentials: "omit", body: JSON.stringify({ enrollment_ids: enrollmentIds })
  });
}
export async function downloadBulkCards(enrollmentIds) {
  const headers = requireAuthHeaders();
  const url = `${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "application/pdf" },
    body: JSON.stringify({ enrollment_ids: enrollmentIds }),
    credentials: "omit",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} – ${text}`.trim());
  }
  return await res.blob();
}

/* ---------------- Dashboard list ---------------- */
export async function getKyorugiListFromDashboard() {
  const headers = requireAuthHeaders();
  const res = await tryFirst(
    [DASHBOARD_ALL_AUTH, DASHBOARD_KY_AUTH],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
  return normalizeList(res);
}
export async function getCompetitionsForRole() {
  try {
    return await getKyorugiListFromDashboard();
  } catch {
    return []; // اندپوینت عمومی لیست در بک‌اند فعلی نداریم
  }
}

/* ---------------- Player/Referee ---------------- */
export async function getPlayerOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${API_BASE}/api/competitions/kyorugi/player/competitions/`, {
    method: "GET", headers, credentials: "omit"
  });
}
export async function getRefereeOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${API_BASE}/api/competitions/kyorugi/referee/competitions/`, {
    method: "GET", headers, credentials: "omit"
  });
}

/* ---------------- Enrollment detail, card & my enrollment ---------------- */


export async function getEnrollmentDetail(enrollmentId) {
  const headers = requireAuthHeaders(); // ← توکن الزامی
  const id = String(enrollmentId).trim();
  const base = `${API_BASE}/api/competitions/auth/enrollments/${id}`; // ← /api اضافه شد

  // فقط /card/ معتبره؛ اگه خواستی کامپتیبلیتی بذار، 404 رو هندل کن
  try {
    return await safeFetch(`${base}/card/`, { method: "GET", headers, credentials: "omit" });
  } catch (e) {
    if (e?.status === 404) {
      // سرور قدیمی (درصورت داشتن)
      return await safeFetch(`${base}/`, { method: "GET", headers, credentials: "omit" });
    }
    throw e;
  }
}



export function getEnrollmentCardUrl(enrollmentOrUrl) {
  if (typeof enrollmentOrUrl === "string") {
    return enrollmentOrUrl.startsWith("http")
      ? enrollmentOrUrl
      : `${API_BASE}${enrollmentOrUrl}`;
  }
  const e = enrollmentOrUrl || {};
  const id = e.id || e.enrollment_id || e.pk;
  return id ? `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(id)}/card/` : null;
}


export async function getEnrollmentCard(enrollmentId) {
  const headers = requireAuthHeaders();
  return safeFetch(
    `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(enrollmentId)}/card/`,
    { method: "GET", headers, credentials: "omit" }
  );
}



// وضعیت ثبت‌نام خود کاربر در یک مسابقه (کیوروگی)
export async function getMyEnrollment(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`, {
    method: "GET", headers, credentials: "omit"
  });
}

// وضعیت ثبت‌نام‌های پومسهٔ کاربر (اگر بک‌اند دارید؛ در غیر این صورت کل تابع را حذف کنید)
// پومسه: وضعیت ثبت‌نام‌های من (استاندارد/ابداعی) + can_show_card
export async function getMyPoomsaeEnrollments(key) {
  const k = encodeURIComponent(String(key || "").trim());
  const headers = authHeaders(); // ← به‌جای ساخت دستی

  const candidates = [
    `${API_BASE}/api/competitions/auth/poomsae/${k}/my-enrollments/`,
    `${API_BASE}/api/competitions/poomsae/${k}/my-enrollments/`,
  ];

  for (const url of candidates) {
    const res = await fetch(url, { headers, credentials: "omit" });
    if (res.ok) return await res.json();
    if (res.status !== 404) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `HTTP ${res.status}`);
    }
  }
  throw new Error("اندپوینت my-enrollments برای پومسه پیدا نشد.");
}


/* ---------------- Bracket & Results (کیوروگی/جنریک) ---------------- */
export async function getBracket(publicId) {
  const headers = authHeaders();
  const data = await tryFirst(
    [
      `${KY_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/bracket/`,
      `${ANY_PUBLIC_ROOT}/by-public/${encodeURIComponent(publicId)}/bracket/`,
    ],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
  return {
    ready: data?.competition?.bracket_ready ?? true,
    draws: data?.draws ?? [],
    by_mat: data?.by_mat ?? [],
    competition: data?.competition ?? {},
  };
}
export async function getCompetitionResults(publicId) {
  const headers = authHeaders();
  const data = await tryFirst(
    [
      `${KY_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/results/`,
      `${ANY_PUBLIC_ROOT}/by-public/${encodeURIComponent(publicId)}/results/`,
      `${ANY_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/results/`,
    ],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
  const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
  return { results, count: Number.isFinite(data?.count) ? data.count : results.length };
}

/* ---------------- Seminars ---------------- */
export async function listSeminars(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const url = `${API_BASE}/api/competitions/seminars/${qs.toString() ? "?" + qs.toString() : ""}`;
  return safeFetch(url, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit" });
}
export async function getSeminarDetail(publicId) {
  const url = `${API_BASE}/api/competitions/seminars/${encodeURIComponent(publicId)}/`;
  return safeFetch(url, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit" });
}
export async function registerSeminar(publicId, payload) {
  const headers = requireAuthHeaders();
  const url = `${API_BASE}/api/competitions/auth/seminars/${encodeURIComponent(publicId)}/register/`;
  return safeFetch(url, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({
      roles: Array.isArray(payload?.roles) ? payload.roles : [],
      phone: payload?.phone ?? "",
      note: payload?.note ?? "",
    }),
  });
}

/* ---------------- Legacy aliases (backward compatibility) ---------------- */
export const getEligibleStudentsForCoach = getCoachEligibleStudents;
export async function coachStudentsList(key) { return getCoachEligibleStudents(key); }
export async function coachRegisterStudents(key, payload) { return registerStudentsBulk(key, payload); }
