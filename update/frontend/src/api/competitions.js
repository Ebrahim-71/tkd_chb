// src/api/competitions.js

import { apiFetchSilent } from "./apiClient";

/* ---------------- Base URLs ---------------- */

export const API_BASE = (
  process.env.REACT_APP_API_BASE_URL ||
  "https://api.chbtkd.ir"
).replace(/\/$/, "");


// Kyorugi roots
const KY_PUBLIC_ROOT =
  `${API_BASE}/api/competitions/kyorugi`;

const KY_AUTH_ROOT =
  `${API_BASE}/api/competitions/auth/kyorugi`;


// Poomsae roots
const POOM_PUBLIC_ROOT =
  `${API_BASE}/api/competitions/poomsae`;

const POOM_AUTH_ROOT =
  `${API_BASE}/api/competitions/auth/poomsae`;


// Generic
const ANY_PUBLIC_ROOT =
  `${API_BASE}/api/competitions`;


// Dashboard
const DASHBOARD_KY_AUTH =
  `${API_BASE}/api/competitions/auth/dashboard/kyorugi/`;

const DASHBOARD_ALL_AUTH =
  `${API_BASE}/api/competitions/auth/dashboard/all/`;


/* =========================================================
   Token & Headers
========================================================= */

function pickToken() {
  const role =
    (
      localStorage.getItem("user_role") ||
      ""
    )
      .toLowerCase()
      .trim();


  const roleTokenKey =
    role
      ? `${role}_token`
      : null;


  const keys = [
    "coach_token",
    "both_token",
    roleTokenKey,
    "access_token",
    "access",
    "auth_token",
    "token",
  ].filter(Boolean);


  for (const key of keys) {
    const value =
      localStorage.getItem(key);

    if (value) {
      return value;
    }
  }


  return null;
}


function authHeaders(extra) {
  const token =
    pickToken();


  const headers = {
    Accept:
      "application/json",

    "Content-Type":
      "application/json",

    ...(extra || {}),
  };


  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }


  return headers;
}


function requireAuthHeaders() {
  const token =
    pickToken();


  if (!token) {
    const message =
      "برای انجام این عملیات باید وارد شوید.";


    const error =
      new Error(message);


    error.code =
      "NO_TOKEN";

    error.status =
      401;

    error.payload = {
      detail:
        message,
    };


    throw error;
  }


  return authHeaders();
}


const DEFAULT_CREDENTIALS =
  "omit";


/* =========================================================
   Fetch helpers
========================================================= */

const DEBUG_API =
  process.env.NODE_ENV !==
    "production" &&
  Boolean(
    process.env.REACT_APP_DEBUG_API
  );


function _safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}


/**
 * استخراج پیام خطای قابل‌نمایش از پاسخ بک‌اند
 *
 * پشتیبانی از:
 * detail
 * message
 * error
 * discount_code
 * non_field_errors
 * __all__
 * raw
 * خطاهای فیلدی دیگر
 */
function extractApiErrorMessage(value) {
  if (value == null) {
    return "";
  }


  if (
    typeof value ===
    "string"
  ) {
    return value
      .trim()
      .slice(0, 800);
  }


  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        extractApiErrorMessage
      )
      .filter(Boolean)
      .join(" ");
  }


  if (
    typeof value ===
    "object"
  ) {
    const preferredKeys = [
      "detail",
      "message",
      "error",
      "discount_code",
      "non_field_errors",
      "__all__",
      "raw",
    ];


    for (
      const key
      of preferredKeys
    ) {
      const message =
        extractApiErrorMessage(
          value[key]
        );


      if (message) {
        return message;
      }
    }


    /*
     * خطاهای سایر فیلدها
     */
    for (
      const fieldValue
      of Object.values(value)
    ) {
      const message =
        extractApiErrorMessage(
          fieldValue
        );


      if (message) {
        return message;
      }
    }
  }


  return "";
}


function isAbortError(error) {
  return (
    error?.name ===
      "AbortError" ||

    error?.name ===
      "CanceledError" ||

    error?.code ===
      "ERR_CANCELED"
  );
}


/**
 * نکته مهم:
 *
 * این فایل از apiFetchSilent استفاده می‌کند.
 *
 * علت:
 * تعدادی از APIهای مسابقه چند endpoint را به صورت fallback
 * امتحان می‌کنند و 404 در آن مرحله می‌تواند کاملاً طبیعی باشد.
 *
 * بنابراین اینجا Global Modal نمایش نمی‌دهیم.
 *
 * safeFetch در نهایت Error دارای:
 *
 * error.status
 * error.payload
 * error.url
 *
 * می‌سازد و Component تصمیم می‌گیرد خطا چگونه نمایش داده شود.
 */
async function safeFetch(
  url,
  opts = {}
) {
  const method =
    (
      opts?.method ||
      "GET"
    ).toUpperCase();


  const headers =
    opts?.headers ||
    {};


  const bodyRaw =
    opts?.body;


  if (DEBUG_API) {
    console.groupCollapsed(
      "🌐 safeFetch"
    );

    console.log(
      "URL:",
      url
    );

    console.log(
      "Method:",
      method
    );

    console.log(
      "Headers:",
      headers
    );


    if (
      bodyRaw !==
      undefined
    ) {
      console.log(
        "Body (raw):",
        bodyRaw
      );


      if (
        typeof bodyRaw ===
        "string"
      ) {
        const parsed =
          _safeJsonParse(
            bodyRaw
          );


        if (parsed) {
          console.log(
            "Body (json):",
            parsed
          );
        }
      }
    }


    console.groupEnd();
  }


  let response;


  try {
    response =
      await apiFetchSilent(
        url,
        opts
      );

  } catch (error) {
    if (
      !isAbortError(error)
    ) {
      console.error(
        "❗ safeFetch NETWORK ERROR:",
        {
          url,
          method,
          error:
            String(error),
        }
      );
    }


    throw error;
  }


  const text =
    await response
      .text()
      .catch(
        () => ""
      );


  const data =
    _safeJsonParse(text) ??
    (
      text
        ? {
            raw:
              text,
          }
        : null
    );


  if (DEBUG_API) {
    console.groupCollapsed(
      "📩 safeFetch Response"
    );


    console.log(
      "Status:",
      response.status,
      response.statusText
    );


    console.log(
      "Content-Type:",
      response.headers?.get(
        "content-type"
      )
    );


    console.log(
      "Data (parsed):",
      data
    );


    console.log(
      "Text (raw):",
      text
    );


    console.groupEnd();
  }


  if (!response.ok) {
    const backendMessage =
      extractApiErrorMessage(
        data
      );


    const message =
      backendMessage ||
      `خطای HTTP ${response.status}`;


    const error =
      new Error(message);


    error.status =
      response.status;

    error.payload =
      data;

    error.url =
      url;


    if (DEBUG_API) {
      console.error(
        "❌ BACKEND ERROR (FULL):",
        {
          url,

          method,

          request: {
            headers,

            body_raw:
              bodyRaw,

            body_json:
              typeof bodyRaw ===
              "string"
                ? _safeJsonParse(
                    bodyRaw
                  )
                : null,
          },

          response: {
            status:
              response.status,

            statusText:
              response.statusText,

            contentType:
              response.headers?.get(
                "content-type"
              ),

            contentLength:
              response.headers?.get(
                "content-length"
              ),

            text_raw:
              text,

            json:
              _safeJsonParse(
                text
              ),
          },

          message,
        }
      );
    }


    throw error;
  }


  if (
    response.status ===
      204 ||
    response.status ===
      205
  ) {
    return null;
  }


  return data;
}


function compact(obj) {
  const out = {};


  Object.entries(
    obj || {}
  ).forEach(
    ([key, value]) => {
      if (
        value ===
          undefined ||
        value ===
          null
      ) {
        return;
      }


      if (
        typeof value ===
          "string" &&
        value.trim() ===
          ""
      ) {
        return;
      }


      out[key] =
        value;
    }
  );


  return out;
}


/**
 * تعدادی endpoint به‌صورت fallback هستند.
 *
 * فقط 404 اجازه دارد endpoint بعدی امتحان شود.
 *
 * 401
 * 403
 * 500
 * Network Error
 *
 * نباید باعث ارسال درخواست‌های اضافه شوند.
 */
async function tryFirst(
  urls,
  options = {}
) {
  let lastErr;


  const tried = [];


  for (
    const url
    of urls
  ) {
    try {
      if (
        options.__debugUrls
      ) {
        console.debug(
          "[tryFirst]",
          options.method ||
            "GET",
          url
        );
      }


      const {
        __debugUrls,
        ...rest
      } = options;


      return await safeFetch(
        url,
        rest
      );

    } catch (error) {
      tried.push({
        url,

        status:
          error?.status,

        message:
          error?.message,

        payload:
          error?.payload,
      });


      lastErr =
        error;


      /*
       * فقط 404 مجاز است
       * به endpoint بعدی fallback کند.
       */
      if (
        error?.status !==
        404
      ) {
        break;
      }
    }
  }


  if (
    options.__debugUrls
  ) {
    console.warn(
      "[tryFirst] all candidates failed:",
      tried
    );
  }


  const error =
    lastErr ||
    new Error(
      "No endpoint responded"
    );


  error.tried =
    tried;


  throw error;
}


function normalizeList(res) {
  if (
    Array.isArray(res)
  ) {
    return res;
  }


  if (
    Array.isArray(
      res?.results
    )
  ) {
    return res.results;
  }


  if (
    Array.isArray(
      res?.items
    )
  ) {
    return res.items;
  }


  if (
    Array.isArray(
      res?.competitions
    )
  ) {
    return res.competitions;
  }


  return [];
}


/* =========================================================
   Helpers: نقش و کنترل UI
========================================================= */


/**
 * normalize response for bulk register
 * backend may return amount_toman/amount_irr
 */
function normalizeBulkRegisterResponse(
  res
) {
  if (
    !res ||
    typeof res !==
      "object"
  ) {
    return res;
  }


  const pickNum =
    (...values) => {
      for (
        const value
        of values
      ) {
        const number =
          Number(value);


        if (
          Number.isFinite(
            number
          )
        ) {
          return number;
        }
      }


      return null;
    };


  /*
   * مبلغ پایه/کل
   */
  const amount_irr =
    pickNum(
      res.amount_irr,
      res.amountIrr,

      res.amount,
      res.total_amount,
      res.totalAmount,

      res.total_amount_irr,
      res.totalAmountIrr,

      res.payable_amount_irr,
      res.payableAmountIrr
    );


  /*
   * اگر بک‌اند تومان هم می‌فرستد
   */
  const amount_toman =
    pickNum(
      res.amount_toman,
      res.amountToman
    );


  /*
   * تخفیف
   */
  const discount_irr =
    pickNum(
      res.discount_amount_irr,
      res.discountAmountIrr,

      res.discount_irr,
      res.discountIrr,

      res.discount_amount,
      res.discountAmount,

      res.discount
    ) || 0;


  /*
   * مبلغ نهایی قابل پرداخت
   */
  const payable_irr =
    pickNum(
      res.payable_amount_irr,
      res.payableAmountIrr,

      res.final_amount_irr,
      res.finalAmountIrr,

      res.amount_after_discount_irr,
      res.amountAfterDiscountIrr,

      res.payable,

      res.final_amount,
      res.finalAmount
    );


  /*
   * اگر payable وجود نداشت
   */
  const payable_irr_fallback =
    payable_irr != null
      ? payable_irr
      : amount_irr != null
      ? Math.max(
          0,
          amount_irr -
            discount_irr
        )
      : null;


  const payment_intent_public_id =
    res.payment_intent_public_id ??
    res.paymentIntentPublicId ??
    res.pid ??
    null;


  const group_payment_id =
    res.group_payment_id ??
    res.groupPaymentId ??
    res.gp ??
    null;


  const payment_required =
    res.payment_required ??
    res.paymentRequired ??
    null;


  const enrollment_ids =
    res.enrollment_ids ??
    res.enrollmentIds ??
    res.ids ??
    null;


  return {
    ...res,

    amount_irr,

    amount_toman,

    discount_irr,

    payable_irr:
      payable_irr_fallback,

    payment_intent_public_id,

    group_payment_id,

    payment_required,

    enrollment_ids,
  };
}


/* =========================================================
   Role helpers
========================================================= */

export function getCurrentRole() {
  return (
    localStorage.getItem(
      "user_role"
    ) || ""
  ).toLowerCase();
}


export function isClubLike(
  role = getCurrentRole()
) {
  const normalized =
    (
      role ||
      ""
    ).toLowerCase();


  return (
    normalized ===
      "club" ||

    normalized ===
      "heyat" ||

    normalized ===
      "board"
  );
}


export function shouldShowSelfRegister(
  competitionOrRole =
    getCurrentRole(),

  userRoleIfAny
) {
  if (
    typeof competitionOrRole ===
      "object" &&
    competitionOrRole
  ) {
    const competition =
      competitionOrRole;


    const can =
      Boolean(
        competition
          .registration_open_effective ??

        competition
          .registration_open ??

        competition
          .can_register ??

        competition
          .canRegister
      );


    const role =
      String(
        userRoleIfAny ||
        getCurrentRole()
      ).toLowerCase();


    return (
      can &&
      !(
        role &&
        isClubLike(role)
      )
    );
  }


  return !isClubLike(
    String(
      competitionOrRole ||
      getCurrentRole()
    )
  );
}


export function shouldShowStudentRegister(
  competitionOrRole =
    getCurrentRole(),

  userRoleIfAny
) {
  const role =
    typeof competitionOrRole ===
      "object"
      ? String(
          userRoleIfAny ||
          getCurrentRole()
        ).toLowerCase()
      : String(
          competitionOrRole ||
          getCurrentRole()
        ).toLowerCase();


  return (
    role ===
      "coach" ||
    role ===
      "both"
  );
}


export async function getEligiblePoomsaeStudentsForCoach(
  key
) {
  return getCoachEligibleStudents(
    key,
    "poomsae"
  );
}


/* =========================================================
   Terms
========================================================= */

export async function getCompetitionTerms(
  key
) {
  const headers =
    authHeaders();


  const encodedKey =
    encodeURIComponent(
      String(
        key ||
        ""
      ).trim()
    );


  return tryFirst(
    [
      `${ANY_PUBLIC_ROOT}/by-public/${encodedKey}/terms/`,

      `${ANY_PUBLIC_ROOT}/${encodedKey}/terms/`,

      `${KY_PUBLIC_ROOT}/${encodedKey}/terms/`,

      `${POOM_PUBLIC_ROOT}/${encodedKey}/terms/`,
    ],

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",

      __debugUrls:
        true,
    }
  );
}


/* =========================================================
   Competition detail
========================================================= */

export async function getCompetitionDetail(
  key
) {
  const headers =
    authHeaders();


  const encodedKey =
    encodeURIComponent(
      String(
        key ||
        ""
      ).trim()
    );


  return tryFirst(
    [
      `${ANY_PUBLIC_ROOT}/by-public/${encodedKey}/`,

      `${ANY_PUBLIC_ROOT}/${encodedKey}/`,

      `${KY_PUBLIC_ROOT}/${encodedKey}/`,

      `${POOM_PUBLIC_ROOT}/${encodedKey}/`,
    ],

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",

      __debugUrls:
        true,
    }
  );
}


/* =========================================================
   Coach approval - Kyorugi
========================================================= */

export async function getCoachApprovalStatus(
  publicId
) {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${KY_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/coach-approval/status/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


export async function approveCompetition(
  publicId
) {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${KY_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/coach-approval/approve/`,

    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify({
          agree:
            true,
        }),
    }
  );
}


/* =========================================================
   Coach approval - Poomsae
========================================================= */

export async function getPoomsaeCoachApprovalStatus(
  publicId
) {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${POOM_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/coach-approval/status/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


export async function approvePoomsaeCompetition(
  publicId
) {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${POOM_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/coach-approval/approve/`,

    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify({
          agree:
            true,
        }),
    }
  );
}


/* =========================================================
   Register self - Kyorugi
========================================================= */

export async function getRegisterSelfPrefill(
  publicId
) {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${KY_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/prefill/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


export async function registerSelf(
  publicId,
  payload
) {
  const headers =
    requireAuthHeaders();


  const body =
    compact({
      coach_code:
        (
          payload?.coach_code ??
          ""
        ).trim(),


      /*
       * به‌جای وزن دقیق
       * فقط رده وزنی
       */
      weight_category_id:
        payload
          ?.weight_category_id !=
          null &&
        String(
          payload
            .weight_category_id
        ).trim() !==
          ""
          ? Number(
              payload
                .weight_category_id
            )
          : undefined,


      insurance_number:
        (
          payload
            ?.insurance_number ??
          ""
        ).trim(),


      insurance_issue_date:
        (
          payload
            ?.insurance_issue_date ??
          ""
        ).trim(),
    });


  return safeFetch(
    `${KY_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/register/self/`,

    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify(
          body
        ),
    }
  );
}


/* =========================================================
   Register self - Poomsae
========================================================= */

export async function buildPoomsaePrefill(
  publicId
) {
  const detail =
    await getCompetitionDetail(
      publicId
    );


  const locked =
    detail?.me_locked ||
    detail?.my_profile ||
    {};


  return {
    can_register:
      Boolean(
        detail
          ?.registration_open_effective ??

        detail
          ?.registration_open ??

        detail
          ?.can_register
      ),


    locked: {
      first_name:
        locked.first_name ||
        "",

      last_name:
        locked.last_name ||
        "",

      national_code:
        locked.national_id ||
        locked.nationalCode ||
        "",

      birth_date:
        locked.birth_date ||
        locked.birthDate ||
        "",

      belt:
        locked.belt ||
        "",

      club:
        locked.club ||
        "",

      coach:
        locked.coach ||
        "",
    },


    suggested: {
      insurance_number:
        "",

      insurance_issue_date:
        "",
    },


    need_coach_code:
      true,
  };
}


export async function registerSelfPoomsae(
  publicId,
  payload
) {
  const headers =
    requireAuthHeaders();


  const body =
    compact({
      coach_code:
        payload?.coach_code
          ? String(
              payload.coach_code
            ).trim()
          : undefined,


      poomsae_type:
        payload?.poomsae_type
          ? String(
              payload.poomsae_type
            ).toLowerCase()
          : undefined,


      insurance_number:
        payload?.insurance_number
          ? String(
              payload
                .insurance_number
            ).trim()
          : undefined,


      insurance_issue_date:
        payload
          ?.insurance_issue_date,
    });


  return safeFetch(
    `${POOM_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/register/self/`,

    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify(
          body
        ),
    }
  );
}


/* =========================================================
   ثبت‌نام تیمی پومسه - مربی
========================================================= */

export async function registerPoomsaeTeams(
  key,
  payload = {}
) {
  const headers =
    requireAuthHeaders();


  const encodedKey =
    encodeURIComponent(
      String(
        key ||
        ""
      ).trim()
    );


  const rawTeams =
    Array.isArray(
      payload
    )
      ? payload

      : Array.isArray(
          payload?.teams
        )
      ? payload.teams

      : [payload];


  const teams =
    rawTeams
      .filter(
        (team) =>
          team &&
          typeof team ===
            "object"
      )
      .map(
        (
          team,
          teamIndex
        ) => {
          const rawMembers =
            Array.isArray(
              team?.members
            )
              ? team.members
              : [];


          const style =
            String(
              team
                ?.poomsae_type ||

              team?.style ||

              team?.type ||

              "standard"
            )
              .trim()
              .toLowerCase();


          const members =
            rawMembers
              .map(
                (
                  member,
                  memberIndex
                ) => {
                  const playerId =
                    Number(
                      member
                        ?.player_id ??

                      member?.id ??

                      member
                        ?.profile_id
                    );


                  const rawRole =
                    String(
                      member
                        ?.role ||

                      member
                        ?.member_role ||

                      "main"
                    )
                      .trim()
                      .toLowerCase();


                  const role =
                    rawRole ===
                      "sub" ||
                    rawRole ===
                      "reserve"
                      ? "sub"
                      : "main";


                  return {
                    player_id:
                      playerId,

                    role,

                    order:
                      Number(
                        member
                          ?.order ||
                        memberIndex +
                          1
                      ),

                    insurance_number:
                      String(
                        member
                          ?.insurance_number ||

                        member
                          ?.insuranceNumber ||

                        ""
                      ).trim(),

                    insurance_issue_date:
                      member
                        ?.insurance_issue_date ||

                      member
                        ?.insuranceIssueDate ||

                      "",
                  };
                }
              )
              .filter(
                (
                  member
                ) =>
                  Number.isFinite(
                    member.player_id
                  ) &&
                  member.player_id >
                    0
              );


          return {
            team_name:
              String(
                team
                  ?.team_name ||

                team
                  ?.teamName ||

                team?.name ||

                `تیم ${
                  teamIndex +
                  1
                }`
              ).trim(),


            poomsae_type:
              style ===
              "creative"
                ? "creative"
                : "standard",


            members,
          };
        }
      );


  if (!teams.length) {
    throw new Error(
      "حداقل یک تیم معتبر باید ارسال شود."
    );
  }


  const normalizedDiscountCode =
    String(
      payload
        ?.discount_code ??

      payload
        ?.discountCode ??

      payload?.code ??

      ""
    ).trim();


  const preview =
    payload?.preview ===
      true ||

    String(
      payload?.preview ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "true" ||

    String(
      payload?.preview ||
      ""
    ).trim() ===
      "1";


  const callbackUrl =
    String(
      payload
        ?.callback_url ??

      payload
        ?.callbackUrl ??

      ""
    ).trim();


  const bodyToSend = {
    teams,


    gateway:
      String(
        payload?.gateway ||
        "sadad"
      )
        .trim()
        .toLowerCase(),


    ...(preview
      ? {
          preview:
            true,
        }
      : {}),


    ...(normalizedDiscountCode
      ? {
          discount_code:
            normalizedDiscountCode,
        }
      : {}),


    ...(callbackUrl
      ? {
          callback_url:
            callbackUrl,
        }
      : {}),
  };


  if (DEBUG_API) {
    console.log(
      "[registerPoomsaeTeams] bodyToSend:",
      bodyToSend
    );
  }


  const response =
    await tryFirst(
      [
        `${POOM_AUTH_ROOT}/${encodedKey}/coach/register/teams/`,

        `${POOM_AUTH_ROOT}/${encodedKey}/coach/teams/`,

        `${POOM_AUTH_ROOT}/${encodedKey}/teams/`,
      ],

      {
        method:
          "POST",

        headers,

        credentials:
          "omit",

        body:
          JSON.stringify(
            bodyToSend
          ),

        __debugUrls:
          true,
      }
    );


  return normalizeBulkRegisterResponse(
    response
  );
}


/* =========================================================
   Coach bulk register
========================================================= */

export async function getCoachEligibleStudents(
  key,
  style = "kyorugi"
) {
  const headers =
    requireAuthHeaders();


  const encodedKey =
    encodeURIComponent(
      String(
        key ||
        ""
      ).trim()
    );


  const normalizedStyle =
    String(
      style ||
      "kyorugi"
    ).toLowerCase();


  const urls =
    normalizedStyle ===
    "poomsae"
      ? [
          `${POOM_AUTH_ROOT}/${encodedKey}/coach/students/eligible/`,
        ]
      : [
          `${KY_AUTH_ROOT}/${encodedKey}/coach/students/eligible/`,
        ];


  /*
   * این endpoint باید GET باشد
   * و body ندارد
   */
  return tryFirst(
    urls,
    {
      method:
        "GET",

      headers,

      credentials:
        "omit",

      __debugUrls:
        true,
    }
  );
}


/**
 * bulk register
 *
 * خروجی مورد انتظار:
 *
 * نیاز به پرداخت:
 * {
 *   payment_required: true,
 *   group_payment_id,
 *   amount,
 *   payment
 * }
 *
 * رایگان:
 * {
 *   payment_required: false,
 *   enrollment_ids: [...]
 * }
 */
export async function registerStudentsBulk(
  key,
  itemsOrPayload,
  style = "kyorugi"
) {
  const headers =
    requireAuthHeaders();


  let students = [];

  let discount_code =
    "";

  let gateway =
    "";

  let preview =
    false;

  let person_count =
    0;


  if (
    Array.isArray(
      itemsOrPayload
        ?.students
    )
  ) {
    students =
      itemsOrPayload.students;

  } else if (
    Array.isArray(
      itemsOrPayload
    )
  ) {
    students =
      itemsOrPayload;
  }


  if (
    itemsOrPayload &&
    typeof itemsOrPayload ===
      "object"
  ) {
    discount_code =
      String(
        itemsOrPayload
          .discount_code ??

        itemsOrPayload
          .discountCode ??

        itemsOrPayload
          .code ??

        ""
      ).trim();


    gateway =
      String(
        itemsOrPayload
          .gateway ??
        ""
      ).trim();


    preview =
      Boolean(
        itemsOrPayload
          .preview
      );


    person_count =
      Number(
        itemsOrPayload
          .person_count ??

        itemsOrPayload
          .personCount ??

        students.length
      );
  }


  if (
    !Number.isInteger(
      person_count
    ) ||
    person_count <
      1
  ) {
    person_count =
      students.length;
  }


  if (
    !Array.isArray(
      students
    ) ||
    !students.length
  ) {
    throw new Error(
      "payload باید شامل آرایه students باشد (هر عضو حداقل player_id دارد)."
    );
  }


  const encodedKey =
    encodeURIComponent(
      String(
        key ||
        ""
      ).trim()
    );


  const normalizedStyle =
    String(
      style ||
      "kyorugi"
    ).toLowerCase();


  const urls =
    normalizedStyle ===
    "poomsae"
      ? [
          `${POOM_AUTH_ROOT}/${encodedKey}/coach/register/students/`,
        ]
      : [
          `${KY_AUTH_ROOT}/${encodedKey}/coach/register/students/`,
        ];


  const bodyToSend = {
    students,


    /*
     * تعداد واقعی ورزشکاران انتخاب‌شده
     */
    person_count:
      students.length,


    style:
      normalizedStyle,


    kind:
      normalizedStyle,


    ...(discount_code
      ? {
          discount_code,
        }
      : {}),


    ...(gateway
      ? {
          gateway,
        }
      : {}),


    ...(preview
      ? {
          preview:
            true,
        }
      : {}),
  };


  const response =
    await tryFirst(
      urls,
      {
        method:
          "POST",

        headers,

        credentials:
          "omit",

        body:
          JSON.stringify(
            bodyToSend
          ),

        __debugUrls:
          true,
      }
    );


  return normalizeBulkRegisterResponse(
    response
  );
}


/* =========================================================
   Bulk cards
========================================================= */

export async function requestBulkCards(
  enrollmentIds,
  opts = {}
) {
  const headers =
    requireAuthHeaders();


  const kind =
    String(
      opts?.kind ||
      "kyorugi"
    )
      .trim()
      .toLowerCase();


  return safeFetch(
    `${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`,

    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify({
          enrollment_ids:
            enrollmentIds,

          kind,
        }),
    }
  );
}


export async function downloadBulkCards(
  enrollmentIds,
  opts = {}
) {
  const headers =
    requireAuthHeaders();


  const kind =
    opts.kind
      ? String(
          opts.kind
        ).toLowerCase()
      : "kyorugi";


  const url =
    `${API_BASE}/api/competitions/auth/enrollments/cards/bulk/`;


  const response =
    await apiFetchSilent(
      url,
      {
        method:
          "POST",

        headers: {
          ...headers,

          Accept:
            "application/pdf",
        },

        body:
          JSON.stringify({
            enrollment_ids:
              enrollmentIds,

            kind,
          }),

        credentials:
          "omit",
      }
    );


  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(
          () => ""
        );


    const payload =
      _safeJsonParse(
        text
      ) ??
      (
        text
          ? {
              raw:
                text,
            }
          : null
      );


    const backendMessage =
      extractApiErrorMessage(
        payload
      );


    const error =
      new Error(
        backendMessage ||

        `${response.status} ${
          response.statusText ||
          ""
        }`.trim() ||

        `خطای HTTP ${response.status}`
      );


    error.status =
      response.status;

    error.payload =
      payload;

    error.url =
      url;


    throw error;
  }


  return response.blob();
}


/* =========================================================
   Dashboard list
========================================================= */

export async function getKyorugiListFromDashboard() {
  const headers =
    requireAuthHeaders();


  const response =
    await tryFirst(
      [
        DASHBOARD_ALL_AUTH,

        DASHBOARD_KY_AUTH,
      ],

      {
        method:
          "GET",

        headers,

        credentials:
          "omit",

        __debugUrls:
          true,
      }
    );


  return normalizeList(
    response
  );
}


export async function getCompetitionsForRole(
  _role
) {
  /*
   * قبلاً:
   *
   * try/catch
   * و در هر خطا return []
   *
   * انجام می‌شد.
   *
   * در نتیجه UI نمی‌توانست تفاوت بین:
   *
   * لیست خالی
   *
   * و
   *
   * خطای واقعی API
   *
   * را متوجه شود.
   *
   * حالا Error به MatchesSection
   * منتقل می‌شود.
   */
  return getKyorugiListFromDashboard();
}


/* =========================================================
   Player / Referee
========================================================= */

export async function getPlayerOpenCompetitions() {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${API_BASE}/api/competitions/kyorugi/player/competitions/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


export async function getRefereeOpenCompetitions() {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${API_BASE}/api/competitions/kyorugi/referee/competitions/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


/* =========================================================
   Enrollment detail / card / my enrollment
========================================================= */

export async function getEnrollmentDetail(
  enrollmentId
) {
  const headers =
    requireAuthHeaders();


  const id =
    String(
      enrollmentId
    ).trim();


  const base =
    `${API_BASE}/api/competitions/auth/enrollments/${id}`;


  try {
    return await safeFetch(
      `${base}/card/`,

      {
        method:
          "GET",

        headers,

        credentials:
          "omit",
      }
    );

  } catch (error) {
    if (
      error?.status ===
      404
    ) {
      return safeFetch(
        `${base}/`,

        {
          method:
            "GET",

          headers,

          credentials:
            "omit",
        }
      );
    }


    throw error;
  }
}


export function getEnrollmentCardUrl(
  enrollmentOrUrl,
  opts = {}
) {
  const kind =
    opts.kind
      ? String(
          opts.kind
        ).toLowerCase()
      : "kyorugi";


  if (
    typeof enrollmentOrUrl ===
    "string"
  ) {
    const url =
      enrollmentOrUrl
        .startsWith(
          "http"
        )
        ? enrollmentOrUrl
        : `${API_BASE}${enrollmentOrUrl}`;


    if (kind) {
      const join =
        url.includes("?")
          ? "&"
          : "?";


      return (
        `${url}${join}kind=` +
        encodeURIComponent(
          kind
        )
      );
    }


    return url;
  }


  const enrollment =
    enrollmentOrUrl ||
    {};


  const id =
    enrollment
      .enrollment_id ||

    enrollment
      .enrollmentId ||

    enrollment
      .enrollment?.id ||

    enrollment
      .kyorugi_enrollment_id ||

    enrollment
      .kyorugiEnrollmentId ||

    enrollment
      .poomsae_enrollment_id ||

    enrollment
      .poomsaeEnrollmentId ||

    enrollment.pk;


  if (!id) {
    return null;
  }


  const query =
    new URLSearchParams();


  if (kind) {
    query.set(
      "kind",
      kind
    );
  }


  return (
    `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(
      id
    )}/card/` +

    (
      query.toString()
        ? `?${query.toString()}`
        : ""
    )
  );
}


export async function getEnrollmentCard(
  enrollmentId,
  opts = {}
) {
  const headers =
    requireAuthHeaders();


  const query =
    new URLSearchParams();


  const kind =
    opts.kind
      ? String(
          opts.kind
        ).toLowerCase()
      : "kyorugi";


  if (kind) {
    query.set(
      "kind",
      kind
    );
  }


  if (opts.debug) {
    query.set(
      "debug",
      "1"
    );
  }


  const url =
    `${API_BASE}/api/competitions/auth/enrollments/${encodeURIComponent(
      enrollmentId
    )}/card/` +

    (
      query.toString()
        ? `?${query.toString()}`
        : ""
    );


  return safeFetch(
    url,
    {
      method:
        "GET",

      headers,

      credentials:
        DEFAULT_CREDENTIALS,
    }
  );
}


export async function getMyEnrollment(
  publicId
) {
  const headers =
    requireAuthHeaders();


  return safeFetch(
    `${KY_AUTH_ROOT}/${encodeURIComponent(
      publicId
    )}/my-enrollment/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


/**
 * عمداً fallback حفظ شده است.
 *
 * اگر endpoint اول 404 باشد
 * endpoint دوم بررسی می‌شود.
 *
 * اگر هر دو 404 باشند
 * خطای نهایی به Component می‌رسد.
 */
export async function getMyPoomsaeEnrollments(
  key
) {
  const encodedKey =
    encodeURIComponent(
      String(
        key ||
        ""
      ).trim()
    );


  const headers =
    requireAuthHeaders();


  return tryFirst(
    [
      `${API_BASE}/api/competitions/auth/poomsae/${encodedKey}/my-enrollments/`,

      `${API_BASE}/api/competitions/poomsae/${encodedKey}/my-enrollments/`,
    ],

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",

      __debugUrls:
        true,
    }
  );
}


/* =========================================================
   Bracket
========================================================= */

export async function getBracket(
  publicId
) {
  const headers =
    authHeaders();


  const encodedId =
    encodeURIComponent(
      publicId
    );


  const data =
    await tryFirst(
      [
        `${KY_PUBLIC_ROOT}/${encodedId}/bracket/`,

        `${ANY_PUBLIC_ROOT}/by-public/${encodedId}/bracket/`,
      ],

      {
        method:
          "GET",

        headers,

        credentials:
          "omit",

        __debugUrls:
          true,
      }
    );


  return {
    ready:
      data?.competition
        ?.bracket_ready ??
      true,


    draws:
      data?.draws ??
      [],


    by_mat:
      data?.by_mat ??
      [],


    competition:
      data?.competition ??
      {},
  };
}


/* =========================================================
   Results
========================================================= */

export async function getCompetitionResults(
  publicId
) {
  const headers =
    authHeaders();


  const key =
    encodeURIComponent(
      String(
        publicId ||
        ""
      ).trim()
    );


  const data =
    await tryFirst(
      [
        /*
         * مسیر مشترک اصلی
         * برای پومسه و کیوروگی
         */
        `${ANY_PUBLIC_ROOT}/by-public/${key}/results/`,


        /*
         * fallbackها
         */
        `${POOM_PUBLIC_ROOT}/${key}/results/`,

        `${KY_PUBLIC_ROOT}/${key}/results/`,

        `${ANY_PUBLIC_ROOT}/${key}/results/`,
      ],

      {
        method:
          "GET",

        headers,

        credentials:
          "omit",

        __debugUrls:
          true,
      }
    );


  const results =
    Array.isArray(
      data?.results
    )
      ? data.results

      : Array.isArray(
          data
        )
      ? data

      : [];


  return {
    kind:
      data?.kind ||
      results?.[0]
        ?.kind ||
      null,


    competition:
      data?.competition ||
      null,


    results,


    count:
      Number.isFinite(
        data?.count
      )
        ? data.count
        : results.length,


    has_results:
      data?.has_results ??
      results.length >
        0,
  };
}


/* =========================================================
   Seminars
========================================================= */

export async function listSeminars(
  params = {}
) {
  const query =
    new URLSearchParams();


  Object.entries(
    params
  ).forEach(
    ([key, value]) => {
      if (
        value !==
          undefined &&
        value !==
          null &&
        value !==
          ""
      ) {
        query.set(
          key,
          String(value)
        );
      }
    }
  );


  const url =
    `${API_BASE}/api/competitions/seminars/` +
    (
      query.toString()
        ? `?${query.toString()}`
        : ""
    );


  return safeFetch(
    url,
    {
      method:
        "GET",

      headers: {
        Accept:
          "application/json",
      },

      credentials:
        "omit",
    }
  );
}


export async function getSeminarDetail(
  publicId
) {
  const url =
    `${API_BASE}/api/competitions/seminars/${encodeURIComponent(
      publicId
    )}/`;


  return safeFetch(
    url,
    {
      method:
        "GET",

      headers: {
        Accept:
          "application/json",
      },

      credentials:
        "omit",
    }
  );
}


export async function registerSeminar(
  publicId,
  payload
) {
  const headers =
    requireAuthHeaders();


  const url =
    `${API_BASE}/api/competitions/auth/seminars/${encodeURIComponent(
      publicId
    )}/register/`;


  return safeFetch(
    url,
    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify({
          roles:
            Array.isArray(
              payload?.roles
            )
              ? payload.roles
              : [],

          phone:
            payload?.phone ??
            "",

          note:
            payload?.note ??
            "",
        }),
    }
  );
}


/* =========================================================
   Legacy aliases
========================================================= */

export const getEligibleStudentsForCoach =
  getCoachEligibleStudents;


export async function coachStudentsList(
  key,
  style
) {
  return getCoachEligibleStudents(
    key,
    style
  );
}


export async function coachRegisterStudents(
  key,
  payload,
  style
) {
  return registerStudentsBulk(
    key,
    payload,
    style
  );
}


/* =========================================================
   Payments - Single intent
========================================================= */

export async function startPaymentIntent(
  publicId,
  opts = {}
) {
  const headers =
    requireAuthHeaders();


  const pidRaw =
    String(
      publicId ||
      ""
    ).trim();


  const pid =
    encodeURIComponent(
      pidRaw
    );


  const gateway =
    String(
      opts.gateway ||
      "sadad"
    )
      .toLowerCase()
      .trim();


  /*
   * مطابق payments/urls.py:
   *
   * SADAD:
   * bank-return/<pid>/
   *
   * سایر gatewayها:
   * callback/<gateway_name>/
   */
  const defaultCallback =
    gateway ===
    "sadad"
      ? `${API_BASE}/api/payments/bank-return/${pid}/`

      : `${API_BASE}/api/payments/callback/${encodeURIComponent(
          gateway
        )}/`;


  const body =
    compact({
      gateway,


      callback_url:
        opts.callback_url ||
        opts.callbackUrl ||
        defaultCallback,


      intent_id:
        opts.intent_id ||
        opts.intentId,
    });


  const response =
    await safeFetch(
      `${API_BASE}/api/payments/start/${pid}/`,

      {
        method:
          "POST",

        headers,

        credentials:
          "omit",

        body:
          JSON.stringify(
            body
          ),
      }
    );


  const payment =
    response?.payment ||

    (
      response?.url &&
      response?.method
        ? {
            url:
              response.url,

            method:
              response.method,

            params:
              response.params ||
              response.data ||
              {},
          }

        : null
    );


  const payment_url =
    response?.payment_url ||

    response?.paymentUrl ||

    response?.redirect_url ||

    response?.redirectUrl ||

    response?.url ||

    payment?.url ||

    null;


  return {
    ...response,

    payment,

    payment_url,
  };
}


/**
 * helper فقط برای خوانایی UI
 */
export async function getPaymentUrlForIntent(
  paymentIntentPublicId,
  opts = {}
) {
  const response =
    await startPaymentIntent(
      paymentIntentPublicId,
      opts
    );


  return response
    ?.payment_url
    ? response
    : {
        ...response,

        payment_url:
          null,
      };
}


export async function getIntentEnrollments(
  pid
) {
  const headers =
    requireAuthHeaders();


  const id =
    encodeURIComponent(
      String(
        pid ||
        ""
      ).trim()
    );


  return safeFetch(
    `${API_BASE}/api/payments/intent/${id}/enrollments/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


/* =========================================================
   Payments - Group
========================================================= */

/**
 * Group payment start در عمل همان
 * start payment intent است.
 */
export async function startGroupPayment(
  paymentIntentPublicId,
  opts = {}
) {
  return startPaymentIntent(
    paymentIntentPublicId,
    opts
  );
}


export async function verifyGroupPayment(
  groupPaymentId,
  payload = {}
) {
  const headers =
    requireAuthHeaders();


  const id =
    encodeURIComponent(
      String(
        groupPaymentId ||
        ""
      ).trim()
    );


  return safeFetch(
    `${API_BASE}/api/payments/group/verify/${id}/`,

    {
      method:
        "POST",

      headers,

      credentials:
        "omit",

      body:
        JSON.stringify(
          payload
        ),
    }
  );
}


export async function getGroupPaymentStatus(
  groupPaymentId
) {
  const headers =
    requireAuthHeaders();


  const id =
    encodeURIComponent(
      String(
        groupPaymentId ||
        ""
      ).trim()
    );


  return safeFetch(
    `${API_BASE}/api/payments/group/status/${id}/`,

    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}


/* =========================================================
   Gateway form submit
========================================================= */

export function submitGatewayForm(
  payment
) {
  const url =
    payment?.url;


  const method =
    String(
      payment?.method ||
      "POST"
    ).toUpperCase();


  const params =
    payment?.params ||

    payment?.data ||

    payment?.fields ||

    payment?.form ||

    payment?.payload ||

    {};


  if (!url) {
    throw new Error(
      "Gateway URL is missing"
    );
  }


  const form =
    document.createElement(
      "form"
    );


  form.method =
    method;

  form.action =
    url;

  form.style.display =
    "none";


  Object.entries(
    params
  ).forEach(
    ([key, value]) => {
      const input =
        document.createElement(
          "input"
        );


      input.type =
        "hidden";

      input.name =
        key;

      input.value =
        String(
          value ??
          ""
        );


      form.appendChild(
        input
      );
    }
  );


  document.body.appendChild(
    form
  );


  form.submit();
}


/* =========================================================
   Coach player cards
========================================================= */

export async function getCoachPlayerCardsInCompetition(
  slug,
  kind = "kyorugi"
) {
  const headers =
    requireAuthHeaders();


  const safeSlug =
    encodeURIComponent(
      String(
        slug ||
        ""
      ).trim()
    );


  const safeKind =
    String(
      kind ||
      ""
    ).toLowerCase() ===
    "poomsae"
      ? "poomsae"
      : "kyorugi";


  const url =
    `${API_BASE}/api/competitions/auth/` +
    `${safeKind}/${safeSlug}/coach/enrollment-card-ids/`;


  return safeFetch(
    url,
    {
      method:
        "GET",

      headers,

      credentials:
        "omit",
    }
  );
}