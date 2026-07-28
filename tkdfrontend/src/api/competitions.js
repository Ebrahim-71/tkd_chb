// src/api/competitions.js
/* ---------------- Base URLs ---------------- */
export const API_BASE = (
  process.env.REACT_APP_API_BASE_URL || "https://api.chbtkd.ir"
).replace(/\/$/, "");

// Kyorugi roots
const KY_PUBLIC_ROOT = `${API_BASE}/api/competitions/kyorugi`;
const KY_AUTH_ROOT = `${API_BASE}/api/competitions/auth/kyorugi`;

// Poomsae roots
const POOM_PUBLIC_ROOT = `${API_BASE}/api/competitions/poomsae`;
const POOM_AUTH_ROOT = `${API_BASE}/api/competitions/auth/poomsae`;

// Generic
const ANY_PUBLIC_ROOT = `${API_BASE}/api/competitions`;

// Dashboard
const DASHBOARD_KY_AUTH = `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`;
const DASHBOARD_ALL_AUTH = `${API_BASE}/api/competitions/auth/dashboard/all/`;

/* ---------------- Token & Headers ---------------- */
function pickToken() {
  const role = (localStorage.getItem("user_role") || "").toLowerCase().trim();
  const roleTokenKey = role ? `${role}_token` : null;

  const keys = [
    "coach_token",
    "both_token",
    roleTokenKey,
    "access_token",
    "access",
    "auth_token",
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

const DEFAULT_CREDENTIALS = "omit";

/* ---------------- Fetch helpers ---------------- */
const DEBUG_API =
  process.env.NODE_ENV !== "production" &&
  Boolean(process.env.REACT_APP_DEBUG_API);

function _safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * استخراج پیام خطای قابل‌نمایش از پاسخ بک‌اند
 * پشتیبانی از:
 * detail
 * message
 * error
 * discount_code
 * non_field_errors
 * خطاهای فیلدی دیگر
 */
function extractApiErrorMessage(value) {
  if (value == null) return "";

  if (typeof value === "string") {
    return value.trim().slice(0, 800);
  }

  if (Array.isArray(value)) {
    return value
      .map(extractApiErrorMessage)
      .filter(Boolean)
      .join(" ");
  }

  if (typeof value === "object") {
    const preferredKeys = [
      "detail",
      "message",
      "error",
      "discount_code",
      "non_field_errors",
      "__all__",
      "raw",
    ];

    for (const key of preferredKeys) {
      const message = extractApiErrorMessage(value[key]);

      if (message) {
        return message;
      }
    }

    // خطاهای سایر فیلدها
    for (const fieldValue of Object.values(value)) {
      const message = extractApiErrorMessage(fieldValue);

      if (message) {
        return message;
      }
    }
  }

  return "";
}

async function safeFetch(url, opts = {}) {
  const method = (opts?.method || "GET").toUpperCase();
  const headers = opts?.headers || {};
  const bodyRaw = opts?.body;

  if (DEBUG_API) {
    console.groupCollapsed("🌐 safeFetch");
    console.log("URL:", url);
    console.log("Method:", method);
    console.log("Headers:", headers);
    if (bodyRaw !== undefined) {
      console.log("Body (raw):", bodyRaw);
      if (typeof bodyRaw === "string") {
        const parsed = _safeJsonParse(bodyRaw);
        if (parsed) console.log("Body (json):", parsed);
      }
    }
    console.groupEnd();
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    console.error("❗ safeFetch NETWORK ERROR:", { url, method, error: String(e) });
    throw e;
  }

  const text = await res.text().catch(() => "");
  const data = _safeJsonParse(text) ?? (text ? { raw: text } : null);

  if (DEBUG_API) {
    console.groupCollapsed("📩 safeFetch Response");
    console.log("Status:", res.status, res.statusText);
    console.log("Content-Type:", res.headers?.get("content-type"));
    console.log("Data (parsed):", data);
    console.log("Text (raw):", text);
    console.groupEnd();
  }

  if (!res.ok) {
    const backendMessage = extractApiErrorMessage(data);

    const message =
      backendMessage ||
      `خطای HTTP ${res.status}`;

    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    err.url = url;

    if (DEBUG_API) {
      console.error("❌ BACKEND ERROR (FULL):", {
        url,
        method,
        request: {
          headers,
          body_raw: bodyRaw,
          body_json: typeof bodyRaw === "string" ? _safeJsonParse(bodyRaw) : null,
        },
        response: {
          status: res.status,
          statusText: res.statusText,
          contentType: res.headers?.get("content-type"),
          contentLength: res.headers?.get("content-length"),
          text_raw: text,
          json: _safeJsonParse(text),
        },
        message,
      });
    }

    throw err;
  }

  if (res.status === 204 || res.status === 205) return null;
  return data;
}

function compact(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v.trim() === "") return;
    out[k] = v;
  });
  return out;
}

async function tryFirst(urls, options = {}) {
  let lastErr;
  const tried = [];

  for (const u of urls) {
    try {
      if (options.__debugUrls) console.debug("[tryFirst]", options.method || "GET", u);
      const { __debugUrls, ...rest } = options;
      return await safeFetch(u, rest);
    } catch (e) {
      tried.push({ url: u, status: e?.status, message: e?.message, payload: e?.payload });
      lastErr = e;
      if (e?.status && e.status !== 404) break;
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

// ✅ normalize response for bulk register (backend may return amount_toman/amount_irr)
// ✅ normalize response for bulk register/preview
function normalizeBulkRegisterResponse(res) {
  if (!res || typeof res !== "object") return res;

  const pickNum = (...vals) => {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  // مبلغ پایه/کل (ممکنه قبل تخفیف یا بعد تخفیف باشد؛ بستگی به بک‌اند)
  const amount_irr = pickNum(
    res.amount_irr, res.amountIrr,
    res.amount, res.total_amount, res.totalAmount,
    res.total_amount_irr, res.totalAmountIrr,
    res.payable_amount_irr, res.payableAmountIrr
  );

  // اگر بک‌اند تومان هم می‌فرستد (برای سازگاری قبلی)
  const amount_toman = pickNum(
    res.amount_toman, res.amountToman
  );

  // تخفیف
  const discount_irr = pickNum(
    res.discount_amount_irr, res.discountAmountIrr,
    res.discount_irr, res.discountIrr,
    res.discount_amount, res.discountAmount,
    res.discount
  ) || 0;

  // مبلغ قابل پرداخت نهایی (بعد تخفیف)
  const payable_irr = pickNum(
    res.payable_amount_irr, res.payableAmountIrr,
    res.final_amount_irr, res.finalAmountIrr,
    res.amount_after_discount_irr, res.amountAfterDiscountIrr,
    res.payable, res.final_amount, res.finalAmount
  );

  // اگر payable نبود، حداقل از amount-discount بساز
  const payable_irr_fallback =
    payable_irr != null
      ? payable_irr
      : (amount_irr != null ? Math.max(0, amount_irr - discount_irr) : null);

  const payment_intent_public_id =
    res.payment_intent_public_id ?? res.paymentIntentPublicId ?? res.pid ?? null;

  const group_payment_id =
    res.group_payment_id ?? res.groupPaymentId ?? res.gp ?? null;

  const payment_required =
    res.payment_required ?? res.paymentRequired ?? null;

  const enrollment_ids =
    res.enrollment_ids ?? res.enrollmentIds ?? res.ids ?? null;

  return {
    ...res,
    // استانداردسازی فیلدها
    amount_irr,
    amount_toman,
    discount_irr,
    payable_irr: payable_irr_fallback,
    payment_intent_public_id,
    group_payment_id,
    payment_required,
    enrollment_ids,
  };
}



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
    const can = Boolean(c.registration_open_effective ?? c.registration_open ?? c.can_register ?? c.canRegister);
    const role = String(userRoleIfAny || getCurrentRole()).toLowerCase();
    return can && !(role && isClubLike(role));
  }
  return !isClubLike(String(competitionOrRole || getCurrentRole()));
}
export function shouldShowStudentRegister(competitionOrRole = getCurrentRole(), userRoleIfAny) {
  const role =
    typeof competitionOrRole === "object"
      ? String(userRoleIfAny || getCurrentRole()).toLowerCase()
      : String(competitionOrRole || getCurrentRole()).toLowerCase();
  return role === "coach" || role === "both";
}

export async function getEligiblePoomsaeStudentsForCoach(key) {
  return getCoachEligibleStudents(key, "poomsae");
}

/* ---------------- Terms ---------------- */
export async function getCompetitionTerms(key) {
  const headers = authHeaders();
  const k = encodeURIComponent(String(key || "").trim());
  return tryFirst(
    [
      `${ANY_PUBLIC_ROOT}/by-public/${k}/terms/`,
      `${ANY_PUBLIC_ROOT}/${k}/terms/`,
      `${KY_PUBLIC_ROOT}/${k}/terms/`,
      `${POOM_PUBLIC_ROOT}/${k}/terms/`,
    ],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
}

/* ---------------- Competition detail ---------------- */
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

/* ---------------- Coach approval (kyorugi) ---------------- */
export async function getCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}
export async function approveCompetition(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({ agree: true }),
  });
}

/* ---------------- Coach approval (poomsae) ---------------- */
export async function getPoomsaeCoachApprovalStatus(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${POOM_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/status/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}
export async function approvePoomsaeCompetition(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${POOM_AUTH_ROOT}/${encodeURIComponent(publicId)}/coach-approval/approve/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify({ agree: true }),
  });
}

/* ---------------- Register self (kyorugi) ---------------- */
export async function getRegisterSelfPrefill(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/prefill/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}
export async function registerSelf(publicId, payload) {
  const headers = requireAuthHeaders();
  const body = compact({
    coach_code: (payload?.coach_code ?? "").trim(),

    // ✅ جدید: به‌جای وزن دقیق فقط رده وزنی
    weight_category_id:
      payload?.weight_category_id != null && String(payload.weight_category_id).trim() !== ""
        ? Number(payload.weight_category_id)
        : undefined,

    insurance_number: (payload?.insurance_number ?? "").trim(),
    insurance_issue_date: (payload?.insurance_issue_date ?? "").trim(),
  });

  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/register/self/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(body),
  });
}

/* ---------------- Register self (poomsae) ---------------- */
export async function buildPoomsaePrefill(publicId) {
  const detail = await getCompetitionDetail(publicId);
  const locked = detail?.me_locked || detail?.my_profile || {};
  return {
    can_register: Boolean(detail?.registration_open_effective ?? detail?.registration_open ?? detail?.can_register),
    locked: {
      first_name: locked.first_name || "",
      last_name: locked.last_name || "",
      national_code: locked.national_id || locked.nationalCode || "",
      birth_date: locked.birth_date || locked.birthDate || "",
      belt: locked.belt || "",
      club: locked.club || "",
      coach: locked.coach || "",
    },
    suggested: { insurance_number: "", insurance_issue_date: "" },
    need_coach_code: true,
  };
}

export async function registerSelfPoomsae(publicId, payload) {
  const headers = requireAuthHeaders();
  const body = compact({
    coach_code: payload?.coach_code ? String(payload.coach_code).trim() : undefined,
    poomsae_type: payload?.poomsae_type ? String(payload.poomsae_type).toLowerCase() : undefined,
    insurance_number: payload?.insurance_number ? String(payload.insurance_number).trim() : undefined,
    insurance_issue_date: payload?.insurance_issue_date,
  });
  return safeFetch(`${POOM_AUTH_ROOT}/${encodeURIComponent(publicId)}/register/self/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(body),
  });
}

/* ---------------- ثبت‌نام تیمی پومسه (مربی) ---------------- */
export async function registerPoomsaeTeams(key, payload) {
  const headers = requireAuthHeaders();
  const k = encodeURIComponent(String(key || "").trim());

  const members = Array.isArray(payload?.members) ? payload.members : [];
  const style = String(payload?.style || payload?.type || "").toLowerCase();

  const main_members = members
    .filter((m) => String(m?.role || "").toLowerCase() === "main")
    .map((m) => m.player_id);

  const reserve_members = members
    .filter((m) => {
      const r = String(m?.role || "").toLowerCase();
      return r === "sub" || r === "reserve";
    })
    .map((m) => m.player_id);

  const bodyToSend = {
    name: payload?.name,
    style,
    members,
    main_members,
    reserve_members,
    type: style,
  };

  if (DEBUG_API) console.log("[registerPoomsaeTeams] bodyToSend:", bodyToSend);

  return tryFirst(
    [
      `${POOM_AUTH_ROOT}/${k}/teams/`,
      `${POOM_AUTH_ROOT}/${k}/coach/teams/`,
      `${POOM_AUTH_ROOT}/${k}/coach/register/teams/`,
    ],
    {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify(bodyToSend),
      __debugUrls: true,
    }
  );
}

/* ---------------- Coach bulk register ---------------- */
export async function getCoachEligibleStudents(key, style = "kyorugi") {
  const headers = requireAuthHeaders();
  const k = encodeURIComponent(String(key || "").trim());
  const s = String(style || "kyorugi").toLowerCase();

  const urls =
    s === "poomsae"
      ? [`${POOM_AUTH_ROOT}/${k}/coach/students/eligible/`]
      : [`${KY_AUTH_ROOT}/${k}/coach/students/eligible/`];

  // ✅ این endpoint باید GET باشد و body ندارد
  const res = await tryFirst(urls, {
    method: "GET",
    headers,
    credentials: "omit",
    __debugUrls: true,
  });

  return res;
}

/**
 * bulk register:
 * انتظار خروجی از بک‌اند:
 * - اگر نیاز به پرداخت: { payment_required: true, group_payment_id, amount, payment }
 * - اگر رایگان/تأیید شد: { payment_required: false, enrollment_ids: [...] }
 */
export async function registerStudentsBulk(key, itemsOrPayload, style = "kyorugi") {
  const headers = requireAuthHeaders();

  let students = [];
  let discount_code = "";
  let gateway = "";
  let preview = false;
  let person_count = 0;

  if (Array.isArray(itemsOrPayload?.students)) {
    students = itemsOrPayload.students;
  } else if (Array.isArray(itemsOrPayload)) {
    students = itemsOrPayload;
  }

  if (itemsOrPayload && typeof itemsOrPayload === "object") {
    discount_code = String(
      itemsOrPayload.discount_code ??
        itemsOrPayload.discountCode ??
        itemsOrPayload.code ??
        ""
    ).trim();

    gateway = String(
      itemsOrPayload.gateway ?? ""
    ).trim();

    preview = Boolean(
      itemsOrPayload.preview
    );

    person_count = Number(
      itemsOrPayload.person_count ??
        itemsOrPayload.personCount ??
        students.length
    );
  }

  if (!Number.isInteger(person_count) || person_count < 1) {
    person_count = students.length;
  }

  if (!Array.isArray(students) || !students.length) {
    throw new Error("payload باید شامل آرایه students باشد (هر عضو حداقل player_id دارد).");
  }

  const k = encodeURIComponent(String(key || "").trim());
  const s = String(style || "kyorugi").toLowerCase();

  const urls =
    s === "poomsae"
      ? [`${POOM_AUTH_ROOT}/${k}/coach/register/students/`]
      : [`${KY_AUTH_ROOT}/${k}/coach/register/students/`];

  const bodyToSend = {
    students,

    // تعداد واقعی ورزشکاران انتخاب‌شده
    person_count: students.length,

    style: s,
    kind: s,

    ...(discount_code
      ? { discount_code }
      : {}),

    ...(gateway
      ? { gateway }
      : {}),

    ...(preview
      ? { preview: true }
      : {}),
  };

  const res = await tryFirst(urls, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(bodyToSend),
    __debugUrls: true,
  });

  return normalizeBulkRegisterResponse(res);

}

/* ---------------- Bulk cards ---------------- */
export async function requestBulkCards(
  enrollmentIds,
  opts = {}
) {
  const headers = requireAuthHeaders();

  const kind =
    String(opts.kind || "").toLowerCase() === "poomsae"
      ? "poomsae"
      : "kyorugi";

  return safeFetch(
    `${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`,
    {
      method: "POST",
      headers,
      credentials: "omit",
      body: JSON.stringify({
        enrollment_ids: enrollmentIds,
        kind,
      }),
    }
  );
}


export async function downloadBulkCards(enrollmentIds, opts = {}) {
  const headers = requireAuthHeaders();
  const kind = opts.kind ? String(opts.kind).toLowerCase() : "kyorugi";

  const url = `${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "application/pdf" },
    body: JSON.stringify({ enrollment_ids: enrollmentIds, kind }),
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
  const res = await tryFirst([DASHBOARD_ALL_AUTH, DASHBOARD_KY_AUTH], {
    method: "GET",
    headers,
    credentials: "omit",
    __debugUrls: true,
  });
  return normalizeList(res);
}

export async function getCompetitionsForRole() {
  try {
    return await getKyorugiListFromDashboard();
  } catch {
    return [];
  }
}

/* ---------------- Player/Referee ---------------- */
export async function getPlayerOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${API_BASE}/api/competitions/kyorugi/player/competitions/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

export async function getRefereeOpenCompetitions() {
  const headers = requireAuthHeaders();
  return safeFetch(`${API_BASE}/api/competitions/kyorugi/referee/competitions/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

/* ---------------- Enrollment detail, card & my enrollment ---------------- */
export async function getEnrollmentDetail(enrollmentId) {
  const headers = requireAuthHeaders();
  const id = String(enrollmentId).trim();
  const base = `${API_BASE}/api/competitions/auth/enrollments/${id}`;

  try {
    return await safeFetch(`${base}/card/`, { method: "GET", headers, credentials: "omit" });
  } catch (e) {
    if (e?.status === 404) {
      return await safeFetch(`${base}/`, { method: "GET", headers, credentials: "omit" });
    }
    throw e;
  }
}

export function getEnrollmentCardUrl(enrollmentOrUrl, opts = {}) {
  const kind = opts.kind ? String(opts.kind).toLowerCase() : "kyorugi";

  if (typeof enrollmentOrUrl === "string") {
    const u = enrollmentOrUrl.startsWith("http")
      ? enrollmentOrUrl
      : `${API_BASE}${enrollmentOrUrl}`;

    if (kind) {
      const join = u.includes("?") ? "&" : "?";
      return `${u}${join}kind=${encodeURIComponent(kind)}`;
    }

    return u;
  }

  const e = enrollmentOrUrl || {};

  const id =
    e.enrollment_id ||
    e.enrollmentId ||
    e.enrollment?.id ||
    e.kyorugi_enrollment_id ||
    e.kyorugiEnrollmentId ||
    e.poomsae_enrollment_id ||
    e.poomsaeEnrollmentId ||
    e.pk;

  if (!id) return null;

  const qs = new URLSearchParams();
  if (kind) qs.set("kind", kind);

  return (
    `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(id)}/card/` +
    (qs.toString() ? `?${qs.toString()}` : "")
  );
}

export async function getEnrollmentCard(enrollmentId, opts = {}) {
  const headers = requireAuthHeaders();
  const qs = new URLSearchParams();

  const kind = opts.kind ? String(opts.kind).toLowerCase() : "kyorugi";
  if (kind) qs.set("kind", kind);

  if (opts.debug) qs.set("debug", "1");

  const url =
    `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(enrollmentId)}/card/` +
    (qs.toString() ? `?${qs.toString()}` : "");

  return safeFetch(url, { method: "GET", headers, credentials: DEFAULT_CREDENTIALS });
}

export async function getMyEnrollment(publicId) {
  const headers = requireAuthHeaders();
  return safeFetch(`${KY_AUTH_ROOT}/${encodeURIComponent(publicId)}/my-enrollment/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

export async function getMyPoomsaeEnrollments(key) {
  const k = encodeURIComponent(String(key || "").trim());
  const headers = requireAuthHeaders();
  return tryFirst(
    [
      `${API_BASE}/api/competitions/auth/poomsae/${k}/my-enrollments/`,
      `${API_BASE}/api/competitions/poomsae/${k}/my-enrollments/`,
    ],
    { method: "GET", headers, credentials: "omit", __debugUrls: true }
  );
}

/* ---------------- Bracket & Results ---------------- */
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
  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
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

/* ---------------- Legacy aliases ---------------- */
export const getEligibleStudentsForCoach = getCoachEligibleStudents;

export async function coachStudentsList(key, style) {
  return getCoachEligibleStudents(key, style);
}

export async function coachRegisterStudents(key, payload, style) {
  return registerStudentsBulk(key, payload, style);
}

/* ---------------- Payments (Single intent) ---------------- */
export async function startPaymentIntent(publicId, opts = {}) {
  const headers = requireAuthHeaders();
  const pidRaw = String(publicId || "").trim();
  const pid = encodeURIComponent(pidRaw);

  const gw = String(opts.gateway || "sadad").toLowerCase().trim();

  // ✅ مطابق payments/urls.py شما:
  // - برای sadad باید bank-return/<pid>/ باشد
  // - برای سایر gatewayها callback/<gateway_name>/ است (pid ندارد)
  const defaultCallback =
    gw === "sadad"
      ? `${API_BASE}/api/payments/bank-return/${pid}/`
      : `${API_BASE}/api/payments/callback/${encodeURIComponent(gw)}/`;

  const body = compact({
    gateway: gw,
    callback_url: opts.callback_url || opts.callbackUrl || defaultCallback,
    intent_id: opts.intent_id || opts.intentId,
  });

  const res = await safeFetch(`${API_BASE}/api/payments/start/${pid}/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(body),
  });

  const payment =
    res?.payment ||
    (res?.url && res?.method
      ? { url: res.url, method: res.method, params: res.params || res.data || {} }
      : null);

  const payment_url =
    res?.payment_url ||
    res?.paymentUrl ||
    res?.redirect_url ||
    res?.redirectUrl ||
    res?.url ||
    payment?.url ||
    null;

  return { ...res, payment, payment_url };
}

// ✅ helper: فقط برای خوانایی در UI
export async function getPaymentUrlForIntent(paymentIntentPublicId, opts = {}) {
  const res = await startPaymentIntent(paymentIntentPublicId, opts);
  return res?.payment_url ? res : { ...res, payment_url: null };
}



export async function getIntentEnrollments(pid) {
  const headers = requireAuthHeaders();
  const id = encodeURIComponent(String(pid || "").trim());
  return safeFetch(`${API_BASE}/api/payments/intent/${id}/enrollments/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

/* ---------------- Payments (Group payment) ----------------
   این URL ها را مطابق urls.py پرداخت‌هایت تنظیم کن.
*/
// ✅ Group payment start is actually "start payment intent" (alias for clarity)
export async function startGroupPayment(paymentIntentPublicId, opts = {}) {
  return startPaymentIntent(paymentIntentPublicId, opts);
}



export async function verifyGroupPayment(groupPaymentId, payload = {}) {
  const headers = requireAuthHeaders();
  const id = encodeURIComponent(String(groupPaymentId || "").trim());

  return safeFetch(`${API_BASE}/api/payments/group/verify/${id}/`, {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(payload),
  });
}

export async function getGroupPaymentStatus(groupPaymentId) {
  const headers = requireAuthHeaders();
  const id = encodeURIComponent(String(groupPaymentId || "").trim());

  return safeFetch(`${API_BASE}/api/payments/group/status/${id}/`, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}

/* ---------------- Gateway form submit ---------------- */
export function submitGatewayForm(payment) {
  const url = payment?.url;
  const method = String(payment?.method || "POST").toUpperCase();
  const params =
    payment?.params ||
    payment?.data ||
    payment?.fields ||
    payment?.form ||
    payment?.payload ||
    {};

  if (!url) throw new Error("Gateway URL is missing");

  const form = document.createElement("form");
  form.method = method;
  form.action = url;
  form.style.display = "none";

  Object.entries(params).forEach(([k, v]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = String(v ?? "");
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
export async function getCoachPlayerCardsInCompetition(
  slug,
  kind = "kyorugi"
) {
  const headers = requireAuthHeaders();

  const safeSlug = encodeURIComponent(
    String(slug || "").trim()
  );

  const safeKind =
    String(kind || "").toLowerCase() === "poomsae"
      ? "poomsae"
      : "kyorugi";

  const url =
    `${API_BASE}/api/competitions/auth/` +
    `${safeKind}/${safeSlug}/coach/enrollment-card-ids/`;

  return safeFetch(url, {
    method: "GET",
    headers,
    credentials: "omit",
  });
}