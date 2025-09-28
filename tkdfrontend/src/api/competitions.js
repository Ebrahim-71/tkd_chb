// src/api/competitions.js
// هماهنگ با بک‌اند کیوروگی/پومسه و فیکس تایید تعهدنامه مربی

/* ---------------- Base URLs ---------------- */
export const API_BASE = (process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// ریشه‌ها (با فرض mount زیر /api/competitions/)
const KY_PUBLIC_ROOT = `${API_BASE}/api/competitions/kyorugi`;           // عمومی (public_id) - کیوروگی
const KY_AUTH_ROOT   = `${API_BASE}/api/competitions/auth/kyorugi`;      // نیازمند احراز هویت - کیوروگی
const PO_AUTH_ROOT   = `${API_BASE}/api/competitions/auth/poomsae`;      // نیازمند احراز هویت - پومسه

// برای سازگاری با کدهای قدیمی که از نام COMP_* استفاده می‌کردند
const COMP_PUBLIC_ROOT = KY_PUBLIC_ROOT;
const COMP_AUTH_ROOT   = KY_AUTH_ROOT;

// داشبورد — مسیر اصلی و فالبک
const DASHBOARD_KY_URL_PRIMARY  = `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`;   // ✅ اصلی
const DASHBOARD_KY_URL_FALLBACK = `${API_BASE}/api/auth/dashboard/kyorugi/`;                // فالبک
const DASHBOARD_ALL_URL         = `${API_BASE}/api/competitions/auth/dashboard/all/`;

/* ---------------- Token & Headers ---------------- */
function pickToken() {
  const role = (localStorage.getItem("user_role") || "").toLowerCase().trim();
  const keys = [
    "coach_token",
    "both_token",
    `${role}_token`,
    "access_token",
    "referee_token",
    "player_token",
    "club_token",
    "heyat_token",
    "board_token",
    "token",
  ];
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
const BAD_APPROVAL_RE = /\/coach-approvals\/[^/]+\/(accept|approve)\/?$/;

async function parseJSONorThrow(res) {
  if (res.status === 204 || res.status === 205) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      let msg =
        data?.detail ||
        (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(" ") : null) ||
        data?.message ||
        data?.error ||
        `${res.status} ${res.statusText}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }
  const text = await res.text();
  const err = new Error(`${res.status} ${res.statusText} – Expected JSON, got non-JSON`);
  err.status = res.status;
  err.payload = text;
  throw err;
}

async function safeFetch(url, options = {}) {
  if (BAD_APPROVAL_RE.test(String(url))) {
    throw new Error("❌ مسیر قدیمی coach-approvals/accept|approve فراخوانی شد. از مسیر جدید استفاده کنید.");
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return await parseJSONorThrow(res);
  } catch (e) {
    if (e?.status === 401) e.message = "دسترسی غیرمجاز. لطفاً وارد حساب کاربری شوید.";
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function tryFirst(urls, options) {
  let lastErr;
  for (const u of urls) {
    try { return await safeFetch(u, options); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("No endpoint responded");
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
export function shouldShowSelfRegister(role = getCurrentRole()) {
  return !isClubLike(role);
}
export function shouldShowStudentRegister(role = getCurrentRole()) {
  const r = String(role || getCurrentRole() || "").toLowerCase();
  return r === "coach" || r === "both";
}

/* ---------------- User Id helper (برای کلید تعهدنامه پومسه) ---------------- */
export function getUserId() {
  const keys = ["user_id", "profile_id", "uid", "id"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && String(v).trim()) return String(v).trim();
  }
  return "anon";
}

/* ---------------- Terms (تعهدنامه) ---------------- */
export function poomsaeConsentKey(publicId, userId = getUserId()) {
  return `poomsae_consent_${publicId}_${userId}`;
}
export function hasPoomsaeConsent(publicId, userId = getUserId()) {
  try { return localStorage.getItem(poomsaeConsentKey(publicId, userId)) === "ok"; } catch { return false; }
}
export function setPoomsaeConsent(publicId, userId = getUserId()) {
  try { localStorage.setItem(poomsaeConsentKey(publicId, userId), "ok"); } catch {}
}

export async function getCompetitionTerms(key) {
  const headers = authHeaders();
  return tryFirst(
    [
      `${API_BASE}/api/competitions/${encodeURIComponent(key)}/terms/`,                // جنریک (هر دو سبک)
      `${KY_PUBLIC_ROOT}/${encodeURIComponent(key)}/terms/`,                           // کیوروگی
      `${API_BASE}/api/competitions/competitions/${encodeURIComponent(key)}/terms/`,   // قدیمی
    ],
    { method: "GET", headers, credentials: "omit" }
  );
}




/* ---------------- Competition detail (public_id) ---------------- */
export async function getCompetitionDetail(publicId) {
  const headers = authHeaders();
  return tryFirst(
    [
      // ✅ اندپوینت جنریک جدید (هر دو سبک)
      `${API_BASE}/api/competitions/${encodeURIComponent(publicId)}/`,

      // پومسه اختصاصی (اگر هنوز دارید)
      `${API_BASE}/api/competitions/poomsae/${encodeURIComponent(publicId)}/`,

      // کیوروگی قدیمی
      `${KY_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/`,

      // کامپت قدیمی
      `${API_BASE}/api/competitions/competitions/${encodeURIComponent(publicId)}/`,
    ],
    { method: "GET", headers, credentials: "omit" }
  );
}

/* ---------------- Coach approval (کیوروگی) ---------------- */
export async function getCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, {
    method: "GET", headers, credentials: "omit"
  });
}

// تنها مسیر صحیح تایید مربی در کیوروگی
export async function approveCompetition(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, {
    method: "POST", headers, credentials: "omit", body: JSON.stringify({ agree: true })
  });
}

/* ---------------- Register self ---------------- */
export async function registerSelf(publicId, payload) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/register/self/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({
      coach_code: payload.coach_code,
      declared_weight: String(payload.declared_weight ?? "").trim(),
      insurance_number: payload.insurance_number,
      insurance_issue_date: payload.insurance_issue_date,
    }),
  });
}

export async function getRegisterSelfPrefill(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/prefill/`, {
    method: "GET", headers, credentials: "omit"
  });
}

/* ---------------- Coach bulk register (شاگردان مربی) ---------------- */
export async function getCoachEligibleStudents(key) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(key)}/coach/students/eligible/`, {
    method: "GET", headers, credentials: "omit"
  });
}

// itemsOrPayload: آرایه‌ی آیتم‌ها یا {students:[...]} یا {student_ids:[...]}
export async function registerStudentsBulk(key, itemsOrPayload) {
  const headers = requireAuthHeaders();
  let payload = [];
  if (Array.isArray(itemsOrPayload)) payload = itemsOrPayload;
  else if (Array.isArray(itemsOrPayload?.students)) payload = itemsOrPayload.students;
  else if (Array.isArray(itemsOrPayload?.student_ids)) payload = itemsOrPayload.student_ids;

  const ids = (payload || []).map((x) => {
    if (x == null) return null;
    if (typeof x === "number" || typeof x === "string") return x;
    return x.id ?? x.user_id ?? x.profile_id ?? x.student_id ?? null;
  }).filter(Boolean);

  const body = ids.length ? { student_ids: ids } : (Array.isArray(payload) ? { students: payload } : itemsOrPayload || {});

  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(key)}/coach/register/students/`, {
    method: "POST", headers, credentials: "omit", body: JSON.stringify(body)
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
export async function listAllCompetitionsPublic() {
  const headers = authHeaders();
  const res = await tryFirst(
    [
      `${KY_PUBLIC_ROOT}/?published=1&ordering=-created_at`,
      `${KY_PUBLIC_ROOT}/?ordering=-created_at`,
      `${KY_PUBLIC_ROOT}/list/`,
      `${KY_PUBLIC_ROOT}/`,
      `${API_BASE}/api/competitions/kyorugi-open/`,
    ],
    { method: "GET", headers, credentials: "omit" }
  );
  return normalizeList(res);
}

export async function getKyorugiListFromDashboard(roleArg) {
  const role = (roleArg || getCurrentRole()).toLowerCase();
  const headers = authHeaders();
  try {
    const res = await tryFirst(
      [DASHBOARD_KY_URL_PRIMARY, DASHBOARD_ALL_URL, DASHBOARD_KY_URL_FALLBACK],
      { method: "GET", headers, credentials: "omit" }
    );
    const arr = normalizeList(res);
    if (arr.length > 0 || !isClubLike(role)) return arr;
  } catch (e) {
    if (!isClubLike(role)) throw e;
  }
  return await listAllCompetitionsPublic();
}

export async function getCompetitionsForRole(roleArg) {
  const role = (roleArg || getCurrentRole()).toLowerCase();
  if (isClubLike(role)) return listAllCompetitionsPublic();
  return getKyorugiListFromDashboard(role);
}

/* ---------------- Player/Referee ---------------- */
// ⚠️ این دو اندپوینت در بک‌اند «auth» هستند؛ قبلاً به مسیر public می‌رفت و 404/401 می‌داد.
export async function getPlayerOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/player/competitions/`, { method: "GET", headers, credentials: "omit" });
}
export async function getRefereeOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/referee/competitions/`, { method: "GET", headers, credentials: "omit" });
}

/* ---------------- Enrollment card & my enrollment ---------------- */
export async function getEnrollmentCard(enrollmentId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(enrollmentId)}/card/`, {
    method: "GET", headers, credentials: "omit"
  });
}

export async function getMyEnrollment(publicId) {
  const headers = requireAuthHeaders();
  return tryFirst(
    [
      `${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`,   // کیوروگی
      `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`,   // پومسه
    ],
    { method: "GET", headers, credentials: "omit" }
  );
}

/* نسخه‌ی اختصاصی پومسه */
export async function getMyEnrollmentPoomsae(publicId) {
  const headers = requireAuthHeaders();
  const url = `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`;
  return safeFetch(url, { method: "GET", headers, credentials: "omit" });
}

/* نسخه‌ی ترکیبی: اول کیوروگی، اگر نشد پومسه */
export async function getMyEnrollmentAny(publicId) {
  const headers = requireAuthHeaders();
  return tryFirst(
    [
      `${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`,
      `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`,
    ],
    { method: "GET", headers, credentials: "omit" }
  );
}

/* ---------------- Bracket (جدول مسابقات) ---------------- */
export async function getBracket(publicId) {
  const headers = authHeaders();
  const data = await tryFirst(
    [
      `${KY_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/bracket/`,
      `${API_BASE}/api/competitions/competitions/${encodeURIComponent(publicId)}/bracket/`,
      `${API_BASE}/api/competitions/${encodeURIComponent(publicId)}/bracket/`, // جنریک
    ],
    { method: "GET", headers, credentials: "omit" }
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
      `${API_BASE}/api/competitions/competitions/${encodeURIComponent(publicId)}/results/`,
      `${API_BASE}/api/competitions/${encodeURIComponent(publicId)}/results/`, // جنریک
    ],
    { method: "GET", headers, credentials: "omit" }
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

/* ---------------- Poomsae Coach Approval ---------------- */
export async function getPoomsaeCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  // مسیر صحیح + فالبک سازگاری
  const urls = [
    `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, // ✅ صحیح
    `${API_BASE}/api/competitions/competitions/auth/poomsae/${encodeURIComponent(publicId)}/coach-approval/status/`, // قدیمی/اشتباه
  ];
  return tryFirst(urls, { method: "GET", headers, credentials: "omit" });
}

export async function approvePoomsaeCompetition(publicId) {
  const headers = requireAuthHeaders();
  const urls = [
    `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, // ✅ صحیح
    `${API_BASE}/api/competitions/competitions/auth/poomsae/${encodeURIComponent(publicId)}/coach-approval/approve/`, // قدیمی/اشتباه
  ];
  return tryFirst(urls, { method: "POST", headers, credentials: "omit", body: JSON.stringify({}) });
}

/* ---------------- Legacy aliases (backward compatibility) ---------------- */
export const getEligibleStudentsForCoach = getCoachEligibleStudents;
export async function coachStudentsList(key) { return getCoachEligibleStudents(key); }
export async function coachRegisterStudents(key, payload) { return registerStudentsBulk(key, payload); }

// --- Status (any) ---
export async function getCoachApprovalStatusAny(publicId) {
  const headers = requireAuthHeaders();
  return tryFirst(
    [
      // Kyorugi
      `${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`,
      // Poomsae
      `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`,
    ],
    { method: "GET", headers, credentials: "omit" }
  );
}

// --- Approve (any) ---
export async function approveCompetitionAny(publicId) {
  const headers = requireAuthHeaders();
  return tryFirst(
    [
      // Kyorugi
      `${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`,
      // Poomsae
      `${PO_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`,
      // legacy aliases if any (آخر بیاد تا اشتباهی نخوریم)
      `${API_BASE}/api/competitions/coach-approvals/${encodeURIComponent(publicId)}/accept/`,
    ],
    { method: "POST", headers, credentials: "omit", body: JSON.stringify({}) }
  );
}
