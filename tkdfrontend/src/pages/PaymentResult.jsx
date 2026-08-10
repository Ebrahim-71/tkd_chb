// src/pages/payment/PaymentResult.jsx

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  API_BASE,
} from "../api/competitions";

import {
  apiFetchSilent,
} from "../api/apiClient";

import {
  showGlobalMessage,
  showGlobalSuccess,
} from "../services/globalMessage";


/* ======================================================
   Query helper
====================================================== */

function useQuery() {
  const { search } =
    useLocation();


  return useMemo(() => {
    if (!search) {
      return new URLSearchParams(
        ""
      );
    }


    /*
     * اگر به هر دلیل callback بانک
     * بیش از یک ? داشته باشد،
     * ?های بعدی به & تبدیل می‌شوند.
     */

    const firstQ =
      search.indexOf("?");


    if (firstQ === -1) {
      return new URLSearchParams(
        search
      );
    }


    const head =
      search.slice(
        0,
        firstQ + 1
      );


    const tail =
      search
        .slice(firstQ + 1)
        .replace(
          /\?/g,
          "&"
        );


    return new URLSearchParams(
      head + tail
    );

  }, [search]);
}


/* ======================================================
   Token helpers
====================================================== */

const pickToken = () => {
  const role =
    (
      localStorage.getItem(
        "user_role"
      ) || ""
    )
      .toLowerCase()
      .trim();


  const roleTokenKey =
    role
      ? `${role}_token`
      : null;


  /*
   * ابتدا توکن نقش فعلی.
   * این کار مانع استفاده اتفاقی
   * از توکن قدیمی یک نقش دیگر می‌شود.
   */

  const keys = [
    roleTokenKey,
    "access_token",
    "access",
    "auth_token",
    "token",
    "both_token",
    "coach_token",
  ].filter(Boolean);


  for (const key of keys) {
    const value =
      localStorage.getItem(
        key
      );


    if (value) {
      return value;
    }
  }


  return null;
};


const authHeaders = () => {
  const token =
    pickToken();


  const headers = {
    Accept:
      "application/json",
  };


  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }


  return headers;
};


/* ======================================================
   Helpers
====================================================== */

const parseIds = (
  idsString
) => {
  if (!idsString) {
    return [];
  }


  return String(idsString)
    .split(",")
    .map(
      (value) =>
        Number(
          String(value).trim()
        )
    )
    .filter(
      (number) =>
        Number.isFinite(number) &&
        number > 0
    );
};


/* ======================================================
   Dashboard role
====================================================== */

function pickDashboardRoleForFlow(
  flow
) {
  const roleFromStorage =
    (
      localStorage.getItem(
        "user_role"
      ) || ""
    )
      .toLowerCase()
      .trim();


  if (
    String(flow || "")
      .toLowerCase()
      .includes("bulk")
  ) {
    return (
      roleFromStorage ||
      "coach"
    );
  }


  return (
    roleFromStorage ||
    "player"
  );
}


/* ======================================================
   Competition kind
====================================================== */

function pickKind({
  flow,
  queryKind,
}) {
  const kind =
    String(
      queryKind || ""
    )
      .toLowerCase()
      .trim();


  if (
    kind === "poomsae" ||
    kind === "kyorugi"
  ) {
    return kind;
  }


  const normalizedFlow =
    String(flow || "")
      .toLowerCase();


  if (
    normalizedFlow.includes(
      "poomsae"
    )
  ) {
    return "poomsae";
  }


  if (
    normalizedFlow.includes(
      "kyorugi"
    )
  ) {
    return "kyorugi";
  }


  const lastKind =
    (
      localStorage.getItem(
        "last_payment_kind"
      ) || ""
    )
      .toLowerCase()
      .trim();


  if (
    lastKind === "poomsae" ||
    lastKind === "kyorugi"
  ) {
    return lastKind;
  }


  return "kyorugi";
}


/* ======================================================
   Resolve enrollment ids by PaymentIntent pid

   مهم:
   این تابع عمداً Silent است.
   چون endpoint اول ممکن است 404 بدهد
   ولی endpoint دوم درست باشد.
====================================================== */

async function resolveEnrollmentIdsByPid(
  pid,
  kind,
  signal
) {
  if (!pid) {
    return [];
  }


  /*
   * Cache فقط زمانی معتبر است که
   * متعلق به همین PaymentIntent باشد.
   *
   * در نسخه قبلی ممکن بود ids پرداخت
   * قبلی اشتباهاً استفاده شود.
   */

  const cachedPid =
    (
      localStorage.getItem(
        "last_payment_pid"
      ) || ""
    ).trim();


  const cachedIds =
    (
      localStorage.getItem(
        "last_payment_enrollment_ids"
      ) || ""
    ).trim();


  if (
    cachedPid === pid &&
    cachedIds
  ) {
    const ids =
      parseIds(
        cachedIds
      );


    if (ids.length) {
      return ids;
    }
  }


  const candidates = [
    `${API_BASE}/api/payments/intents/${encodeURIComponent(
      pid
    )}/enrollments/`,

    `${API_BASE}/api/payments/intent/${encodeURIComponent(
      pid
    )}/enrollments/`,
  ].map(
    (url) =>
      kind
        ? `${url}?kind=${encodeURIComponent(
            kind
          )}`
        : url
  );


  for (
    const url of candidates
  ) {
    try {
      const response =
        await apiFetchSilent(
          url,
          {
            method: "GET",

            headers:
              authHeaders(),

            credentials:
              "omit",

            signal,
          }
        );


      /*
       * 404 در اینجا ممکن است
       * صرفاً به معنی این باشد
       * که باید candidate بعدی
       * امتحان شود.
       */

      if (!response.ok) {
        continue;
      }


      const data =
        await response
          .json()
          .catch(
            () => null
          );


      const raw =
        Array.isArray(
          data?.enrollment_ids
        )
          ? data.enrollment_ids
          : [];


      const clean =
        raw
          .map(Number)
          .filter(
            (number) =>
              Number.isFinite(
                number
              ) &&
              number > 0
          );


      if (clean.length) {
        localStorage.setItem(
          "last_payment_pid",
          pid
        );

        localStorage.setItem(
          "last_payment_enrollment_ids",
          clean.join(",")
        );


        return clean;
      }

    } catch (error) {
      /*
       * Abort یعنی صفحه ترک شده.
       */

      if (
        error?.name ===
          "AbortError" ||
        signal?.aborted
      ) {
        return [];
      }


      /*
       * سایر خطاهای candidate
       * عمداً نمایش داده نمی‌شوند.
       *
       * candidate بعدی امتحان می‌شود.
       */
      console.warn(
        "PAYMENT_ENROLLMENT_RESOLVE_CANDIDATE_FAILED",
        url,
        error
      );
    }
  }


  return [];
}


/* ======================================================
   Component
====================================================== */

const PaymentResult = () => {
  const query =
    useQuery();

  const navigate =
    useNavigate();


  const [
    status,
    setStatus,
  ] = useState(
    "loading"
  );


  /*
   * جلوگیری از اجرای دوباره callback
   * در development / StrictMode.
   */

  const handledRef =
    useRef(false);


  useEffect(() => {
    if (
      handledRef.current
    ) {
      return undefined;
    }


    handledRef.current =
      true;


    const controller =
      new AbortController();


    let alive = true;


    const processPayment =
      async () => {
        try {
          // ============================
          // Query parameters
          // ============================

          const ok =
            (
              query.get("ok") ||
              ""
            ).trim();


          const pid =
            (
              query.get("pid") ||
              ""
            ).trim();


          const ref =
            (
              query.get("ref") ||
              ""
            ).trim();


          const trackingCode =
            (
              query.get("tc") ||
              ""
            ).trim();


          const bankToken =
            (
              query.get("token") ||
              ""
            ).trim();


          const flow =
            (
              query.get("flow") ||
              ""
            ).trim();


          const queryRole =
            (
              query.get("role") ||
              ""
            )
              .toLowerCase()
              .trim();


          // ============================
          // enrollment ids
          // ============================

          const idsFromUrl =
            (
              query.get("ids") ||
              query.get(
                "enrollment_ids"
              ) ||
              query.get(
                "enrollmentIds"
              ) ||
              query.get(
                "enrollments"
              ) ||
              ""
            ).trim();


          // ============================
          // enrollment تکی
          // ============================

          const enrollmentIdSingle =
            (
              query.get(
                "enrollment_id"
              ) ||
              query.get(
                "enrollment"
              ) ||
              query.get(
                "enroll"
              ) ||
              query.get("eid") ||
              ""
            ).trim();


          const kind =
            pickKind({
              flow,
              queryKind:
                query.get(
                  "kind"
                ),
            });


          const dashboardRole =
            queryRole ||
            pickDashboardRoleForFlow(
              flow
            );


          // ============================
          // پرداخت ناموفق / لغو
          // ============================

          if (ok !== "1") {
            if (!alive) {
              return;
            }


            setStatus(
              "failed"
            );


            showGlobalMessage({
              type:
                "warning",

              title:
                "پرداخت انجام نشد",

              message:
                "پرداخت ناموفق بود یا توسط کاربر لغو شد.",
            });


            return;
          }


          // ============================
          // ساخت پارامترهای مشترک
          // ============================

          const appendCommonParams =
            (
              params
            ) => {
              params.set(
                "ok",
                "1"
              );

              params.set(
                "kind",
                kind
              );


              if (pid) {
                params.set(
                  "pid",
                  pid
                );
              }


              if (ref) {
                params.set(
                  "ref",
                  ref
                );
              }


              if (
                trackingCode
              ) {
                params.set(
                  "tc",
                  trackingCode
                );
              }


              if (
                bankToken
              ) {
                params.set(
                  "token",
                  bankToken
                );
              }


              if (flow) {
                params.set(
                  "flow",
                  flow
                );
              }
            };


          // ============================
          // 1) کارت ثبت‌نام تکی
          // ============================

          if (
            enrollmentIdSingle
          ) {
            const params =
              new URLSearchParams();


            appendCommonParams(
              params
            );


            const target =
              `/dashboard/${encodeURIComponent(
                dashboardRole
              )}/enrollments/${encodeURIComponent(
                enrollmentIdSingle
              )}/card?${params.toString()}`;


            if (!alive) {
              return;
            }


            setStatus(
              "success"
            );


            showGlobalSuccess(
              "پرداخت با موفقیت انجام شد.",
              "پرداخت موفق"
            );


            navigate(
              target,
              {
                replace: true,
              }
            );


            return;
          }


          // ============================
          // 2) ids از URL
          // ============================

          let idsString =
            idsFromUrl;


          if (idsString) {
            const parsed =
              parseIds(
                idsString
              );


            idsString =
              parsed.length
                ? parsed.join(
                    ","
                  )
                : "";
          }


          // ============================
          // 3) resolve توسط pid
          // ============================

          if (
            !idsString &&
            pid
          ) {
            const resolved =
              await resolveEnrollmentIdsByPid(
                pid,
                kind,
                controller.signal
              );


            if (
              controller
                .signal
                .aborted ||
              !alive
            ) {
              return;
            }


            if (
              resolved.length
            ) {
              idsString =
                resolved.join(
                  ","
                );
            }
          }


          // ============================
          // Bulk cards
          // ============================

          if (idsString) {
            const params =
              new URLSearchParams();


            params.set(
              "ids",
              idsString
            );


            appendCommonParams(
              params
            );


            const bulkRole =
              queryRole ||
              pickDashboardRoleForFlow(
                flow ||
                  "bulk_after_payment"
              );


            const target =
              `/dashboard/${encodeURIComponent(
                bulkRole
              )}/enrollments/bulk?${params.toString()}`;


            if (!alive) {
              return;
            }


            setStatus(
              "success"
            );


            showGlobalSuccess(
              "پرداخت با موفقیت انجام شد.",
              "پرداخت موفق"
            );


            navigate(
              target,
              {
                replace: true,
              }
            );


            return;
          }


          // ============================
          // هیچ enrollment id پیدا نشد
          //
          // پرداخت موفق بوده، بنابراین
          // کاربر را به Dashboard می‌بریم.
          // ============================

          const params =
            new URLSearchParams();


          params.set(
            "ok",
            "1"
          );


          if (pid) {
            params.set(
              "pid",
              pid
            );
          }


          if (ref) {
            params.set(
              "ref",
              ref
            );
          }


          const target =
            `/dashboard/${encodeURIComponent(
              dashboardRole
            )}?${params.toString()}`;


          if (!alive) {
            return;
          }


          setStatus(
            "success"
          );


          showGlobalSuccess(
            "پرداخت با موفقیت انجام شد.",
            "پرداخت موفق"
          );


          navigate(
            target,
            {
              replace: true,
            }
          );

        } catch (error) {
          if (
            controller
              .signal
              .aborted ||
            !alive
          ) {
            return;
          }


          console.error(
            "PAYMENT_RESULT_PROCESS_ERROR",
            error
          );


          setStatus(
            "failed"
          );


          showGlobalMessage({
            type:
              "error",

            title:
              "خطا در پردازش نتیجه پرداخت",

            message:
              "نتیجه پرداخت دریافت شد اما پردازش آن با خطا مواجه شد. لطفاً دوباره از داشبورد وضعیت ثبت‌نام را بررسی کنید.",
          });
        }
      };


    processPayment();


    return () => {
      alive = false;

      controller.abort();
    };

  }, [
    query,
    navigate,
  ]);


  // ==============================
  // Dashboard fallback
  // ==============================

  const goToDashboard =
    () => {
      const flow =
        (
          query.get("flow") ||
          ""
        ).trim();


      const role =
        (
          query.get("role") ||
          ""
        )
          .toLowerCase()
          .trim() ||
        pickDashboardRoleForFlow(
          flow
        );


      navigate(
        `/dashboard/${encodeURIComponent(
          role
        )}`,
        {
          replace: true,
        }
      );
    };


  /* ======================================================
     UI
  ====================================================== */

  if (
    status === "loading"
  ) {
    return (
      <div className="payment-result-page">
        <p>
          در حال پردازش نتیجه پرداخت...
        </p>
      </div>
    );
  }


  if (
    status === "failed"
  ) {
    return (
      <div className="payment-result-page">

        <button
          type="button"
          onClick={
            goToDashboard
          }
          className="px-4 py-2 rounded bg-red-500 text-white"
        >
          بازگشت به داشبورد
        </button>

      </div>
    );
  }


  return (
    <div className="payment-result-page">
      <p>
        پرداخت با موفقیت انجام شد، در حال انتقال...
      </p>
    </div>
  );
};


export default PaymentResult;