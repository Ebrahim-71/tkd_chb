// src/api/competitions.js

// پایه‌ی API از env (برای پروداکشن) یا localhost
const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

// ریشه‌ها (با فرض اینکه competitions زیر /api/competitions/ mount شده)
const COMP_PUBLIC_ROOT = `${API_BASE}/api/competitions/kyorugi`;                 // عمومی (جزئیات با public_id)
const COMP_AUTH_ROOT   = `${API_BASE}/api/competitions/auth/kyorugi`;            // ایندپوینت‌های نیازمند احراز هویت
const DASHBOARD_LIST   = `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`; // لیست داشبورد

/* ---------------- Token & Headers ---------------- */

function pickToken() {
  const role = localStorage.getItem("user_role") || "";
  const keys = [
    `${role}_token`,
    "both_token",
    "player_token",
    "coach_token",
    "referee_token",
    "club_token",
    "heyat_token",
    "board_token",
    "access_token",
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

/** اولین URL که پاسخ معتبر بدهد را برمی‌گرداند (برای تفاوت مسیرها در بک‌اند‌ها) */
async function tryFirst(urls, options) {
  let lastErr;
  for (const u of urls) {
    try {
      return await safeFetch(u, options);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No endpoint responded");
}

/** خروجی‌های رایج لیست را به آرایه نرمال‌سازی می‌کند */
function normalizeList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.competitions)) return res.competitions;
  return [];
}

/* ---------------- Helpers: نقش و کنترل UI ---------------- */

/** نقش فعلی از localStorage (lowercase) */
export function getCurrentRole() {
  return (localStorage.getItem("user_role") || "").toLowerCase();
}

/** آیا نقش از جنس هیئت/باشگاه است؟ (board هم به‌عنوان معادل هیئت) */
export function isClubLike(role = getCurrentRole()) {
  return role === "club" || role === "heyat" || role === "board";
}
/** برای کنترل UI: نمایش/عدم‌نمایش دکمه‌ها */
export function shouldShowSelfRegister(role = getCurrentRole()) {
  return !isClubLike(role); // هیئت/باشگاه: ثبت‌نام "خودم" مخفی می‌ماند
}
// ✅ فقط مربی‌ها اجازه دیدن «ثبت‌نام شاگرد» را دارند (نه هیئت/باشگاه)
export function shouldShowStudentRegister(role = getCurrentRole()) {
  const r = String(role || getCurrentRole() || "").toLowerCase();
  return r === "coach" || r === "both";
}

/* ---------------- Competition detail (public_id) ---------------- */

export async function getCompetitionDetail(publicId) {
  const url = `${COMP_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/`;
  return safeFetch(url, {
    method: "GET",
    headers: authHeaders(), // اگر توکن باشد eligibility_debug بهتر پر می‌شود
    credentials: "omit",
  });
}

/* ---------------- Coach approval (اختیاری) ---------------- */

export async function getCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${COMP_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

export async function approveCompetition(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${COMP_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({}),
  });
}

/* ---------------- Register self ---------------- */
/**
 * ثبت‌نام بازیکن در مسابقه (انتخاب اتوماتیک Weight در بک‌اند)
 * @param {string} publicId
 * @param {Object} payload
 * @param {string} payload.coach_code
 * @param {string|number} payload.declared_weight  // می‌تواند "47.5" یا "۴۷٫۵" باشد
 * @param {string} payload.insurance_number
 * @param {string} payload.insurance_issue_date    // شمسی: YYYY/MM/DD
 */
export async function registerSelf(publicId, payload) {
  const headers = requireAuthHeaders();
  return safeFetch(`${COMP_AUTH_ROOT}/${encodeURIComponent(publicId)}/register/self/`, {
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
  return safeFetch(`${COMP_AUTH_ROOT}/${encodeURIComponent(publicId)}/prefill/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

/* ---------------- Coach bulk register (شاگردانِ مربی) ---------------- */
/**
 * اندپوینت‌ها طبق طراحی ذخیره‌شده:
 * - GET  /api/competitions/auth/kyorugi/<key>/coach/students/eligible/
 * - POST /api/competitions/auth/kyorugi/<key>/coach/register/students/
 * - POST /api/competitions/auth/enrollments/cards/bulk/   (برای چاپ کارت‌ها)
 */

// لیست شاگردان واجد شرایطِ مربی برای این مسابقه
export async function getCoachEligibleStudents(key) {
  const headers = requireAuthHeaders();
  return safeFetch(
    `${COMP_AUTH_ROOT}/${encodeURIComponent(key)}/coach/students/eligible/`,
    { method: "GET", headers, credentials: "omit" }
  );
}

// ثبت‌نام گروهی شاگردان توسط مربی
// itemsOrPayload:  یا آرایه‌ی دانشجوها [{...}, ...]  یا آبجکت { students: [...] }
export async function registerStudentsBulk(key, itemsOrPayload) {
  const headers = requireAuthHeaders();
  const students = Array.isArray(itemsOrPayload)
    ? itemsOrPayload
    : (itemsOrPayload?.students || []);

  return safeFetch(
    `${COMP_AUTH_ROOT}/${encodeURIComponent(key)}/coach/register/students/`,
    {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify({ students }),
    }
  );
}

// درخواست چاپ کارتِ گروهی (خروجی بستگی به بک‌اند: JSON یا فایل)
// اگر بک‌اند JSON بدهد (مثلاً url کارت‌ها)، از همین استفاده کن.
// اگر PDF/فایل می‌دهد، از downloadBulkCards استفاده کن.
export async function requestBulkCards(enrollmentIds) {
  const headers = requireAuthHeaders();
  return safeFetch(
    `${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`,
    {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify({ enrollment_ids: enrollmentIds }),
    }
  );
}

// نسخه‌ی مخصوص دانلود فایل (مثلاً PDF) در صورت نیاز
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
  return await res.blob(); // مصرف‌کننده خودش Blob را دانلود/باز کند
}

/* --- سازگاری با کدهای قدیمی (DEPRECATED): نگه‌داشت برای جلوگیری از شکست --- */
// قبلاً به اشتباه از مسیر بدون coach/ استفاده می‌شد یا token جدا پاس داده می‌شد.
// این‌ها را به ای‌پی‌آی‌های جدید هدایت می‌کنیم.
export const getEligibleStudentsForCoach = getCoachEligibleStudents;

export async function coachStudentsList(key /*, token */) {
  // token نادیده گرفته می‌شود؛ هدر از localStorage خوانده می‌شود
  return getCoachEligibleStudents(key);
}

export async function coachRegisterStudents(key, payload /*, token */) {
  // token نادیده گرفته می‌شود؛ هدر از localStorage خوانده می‌شود
  return registerStudentsBulk(key, payload);
}

/* ---------------- Dashboard list (smart with public fallback) ---------------- */

export async function listAllCompetitionsPublic() {
  const headers = authHeaders();
  const res = await tryFirst(
    [
      `${COMP_PUBLIC_ROOT}/?published=1&ordering=-created_at`,
      `${COMP_PUBLIC_ROOT}/?ordering=-created_at`,
      `${COMP_PUBLIC_ROOT}/list/`,
      `${COMP_PUBLIC_ROOT}/`,
      `${API_BASE}/api/competitions/kyorugi-open/`,
    ],
    { method: "GET", headers, credentials: "omit" }
  );
  return normalizeList(res);
}

/**
 * لیست مسابقات داشبورد:
 * - تلاش اول: ایندپوینت داشبورد (با/بدون توکن – خطای 401 را برای نقش‌های غیر-org پاس می‌دهیم)
 * - اگر نقش هیئت/باشگاه باشد و نتیجهٔ داشبورد خالی یا خطا بود → fallback به لیست عمومی
 * - همیشه آرایهٔ نرمال‌شده برمی‌گرداند
 */
export async function getKyorugiListFromDashboard(roleArg) {
  const role = (roleArg || getCurrentRole()).toLowerCase();
  const headers = authHeaders(); // اگر توکن باشد اضافه می‌شود
  try {
    const res = await safeFetch(DASHBOARD_LIST, {
      method: "GET",
      headers,
      credentials: "omit",
    });
    const arr = normalizeList(res);
    if (arr.length > 0 || !isClubLike(role)) return arr;
  } catch (e) {
    if (!isClubLike(role)) throw e;
  }
  return await listAllCompetitionsPublic();
}

/** هِلپر انتخاب لیست مناسب بر اساس نقش */
export async function getCompetitionsForRole(roleArg) {
  const role = (roleArg || getCurrentRole()).toLowerCase();
  if (isClubLike(role)) {
    return listAllCompetitionsPublic();
    }
  return getKyorugiListFromDashboard(role);
}

/* ---------------- Optional: مسابقات بازیکن/داور ---------------- */

export async function getPlayerOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${COMP_PUBLIC_ROOT}/player/competitions/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

export async function getRefereeOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${COMP_PUBLIC_ROOT}/referee/competitions/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

/* ---------------- Enrollment card & my enrollment ---------------- */

export async function getEnrollmentCard(enrollmentId) {
  const headers = requireAuthHeaders();
  return safeFetch(
    `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(enrollmentId)}/card/`,
    { method: "GET", headers, credentials: "omit" }
  );
}

export async function getMyEnrollment(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(
    `${COMP_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`,
    { method: "GET", headers, credentials: "omit" }
  );
}

/* ---------------- Bracket (جدول مسابقات) ---------------- */
/**
 * بک‌اند:  /api/competitions/kyorugi/<public_id>/bracket/
 * خروجی را به فرمت مورد انتظار UI نرمال‌سازی می‌کنیم:
 * { ready, draws, by_mat, competition }
 */
export async function getBracket(publicId) {
  const headers = authHeaders();
  const url = `${COMP_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/bracket/`;

  try {
    const body = await safeFetch(url, {
      method: "GET",
      headers,
      credentials: "omit",
    });

    return {
      ready: body?.competition?.bracket_ready ?? true,
      draws: body?.draws ?? [],
      by_mat: body?.by_mat ?? [],
      competition: body?.competition ?? {},
    };
  } catch (e) {
    if (e?.status === 404) {
      const err = new Error(
        e?.payload?.detail === "bracket_not_ready"
          ? "هنوز قرعه‌کشی یا شماره‌گذاری کامل نشده است."
          : "جدول مسابقات پیدا نشد."
      );
      err.status = 404;
      throw err;
    }
    throw e;
  }
}

export async function getCompetitionResults(publicId) {
  const headers = authHeaders();
  // اول مسیر تمیز (پیشنهادی)، بعد مسیری که الان در urls.py هست، بعد هم قدیمی
  const data = await tryFirst(
    [
      `${COMP_PUBLIC_ROOT}/${encodeURIComponent(publicId)}/results/`,                 // /api/competitions/kyorugi/<key>/results/
      `${API_BASE}/api/competitions/competitions/${encodeURIComponent(publicId)}/results/`, // /api/competitions/competitions/<key>/results/
      `${API_BASE}/api/competitions/${encodeURIComponent(publicId)}/results/`,       // legacy
    ],
    { method: "GET", headers, credentials: "omit" }
  );

  const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
  return { results, count: Number.isFinite(data?.count) ? data.count : results.length };

}




//#------------------------------------------------------------- سمینار -------------------------------------------------------------

/* ---- Public: list (با پشتیبانی از فیلترها) ----
   params: { q, role, open, upcoming, past, date_from, date_to, ordering, page, page_size }
*/
export async function listSeminars(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const url = `${API_BASE}/api/competitions/seminars/${qs.toString() ? "?" + qs.toString() : ""}`;
  return safeFetch(url, {
    method: "GET",
    // برای endpoint عمومی، هدر احراز هویت لازم نیست
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
}

/* ---- Public: detail ---- */
export async function getSeminarDetail(publicId) {
  const url = `${API_BASE}/api/competitions/seminars/${encodeURIComponent(publicId)}/`;
  return safeFetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
}

/* ---- Auth: register ----
   payload: { roles: ['coach'|'player'|...], phone: '09...', note?: string }
*/
export async function registerSeminar(publicId, payload) {
  const headers = requireAuthHeaders(); // باید شامل Authorization و Content-Type: application/json باشد
  const url = `${API_BASE}/api/competitions/auth/seminars/${encodeURIComponent(publicId)}/register/`;
  return safeFetch(url, {
    method: "POST",
    headers,
    credentials: "omit", // چون JWT در localStorage است، کوکی نیاز نیست
    body: JSON.stringify({
      // نیازی به seminar_public_id نیست چون از URL می‌گیریم؛ اگر خواستی می‌تونی حذفش کنی
      // seminar_public_id: publicId,
      roles: Array.isArray(payload?.roles) ? payload.roles : [],
      phone: payload?.phone ?? "",
      note: payload?.note ?? "",
    }),
  });
}
