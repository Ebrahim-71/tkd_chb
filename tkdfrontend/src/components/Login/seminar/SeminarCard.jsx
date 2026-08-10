// src/components/seminar/SeminarDetail.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import axios from "axios";

import {
  showGlobalError,
  showGlobalMessage,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../services/globalMessage";

import "./SeminarDetail.css";


const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  "https://api.chbtkd.ir";


// ==============================
// اعداد فارسی
// ==============================

const toFaDigits = (
  value
) =>
  String(value ?? "").replace(
    /\d/g,
    (digit) =>
      "۰۱۲۳۴۵۶۷۸۹"[digit]
  );


// ==============================
// تاریخ
// ==============================

const fmtDateFa = (
  gDate,
  faStr
) => {
  const base =
    faStr ||
    (
      gDate
        ? String(gDate)
            .slice(0, 10)
            .replace(
              /-/g,
              "/"
            )
        : ""
    );


  return base
    ? toFaDigits(base)
    : "—";
};


// ==============================
// تبدیل نقش
// ==============================

const roleArrayFromRole = (
  role
) => {
  if (role === "both") {
    return [
      "coach",
      "referee",
    ];
  }


  if (
    [
      "player",
      "coach",
      "referee",
    ].includes(role)
  ) {
    return [role];
  }


  return [];
};


// ==============================
// خواندن امن فیلد
// ==============================

const pickFirst = (
  obj,
  keys,
  fallback = "—"
) => {
  if (!obj) {
    return fallback;
  }


  for (const key of keys) {
    const value =
      key.includes(".")
        ? key
            .split(".")
            .reduce(
              (
                current,
                part
              ) =>
                current
                  ? current[
                      part
                    ]
                  : undefined,
              obj
            )
        : obj?.[key];


    if (
      value !==
        undefined &&
      value !== null &&
      String(value).trim() !==
        ""
    ) {
      return String(value);
    }
  }


  return fallback;
};


// ==============================
// Component
// ==============================

const SeminarDetail = () => {
  const navigate =
    useNavigate();

  const { slug } =
    useParams();


  const role =
    (
      localStorage.getItem(
        "user_role"
      ) ||
      "player"
    ).toLowerCase();


  const token =
    localStorage.getItem(
      `${role}_token`
    ) ||
    localStorage.getItem(
      "access_token"
    ) ||
    "";


  const [
    seminar,
    setSeminar,
  ] = useState(null);


  const [
    profile,
    setProfile,
  ] = useState(null);


  const [
    miniProfile,
    setMiniProfile,
  ] = useState(null);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);


  const [
    showConfirm,
    setShowConfirm,
  ] = useState(false);


  const [
    registering,
    setRegistering,
  ] = useState(false);


  const [
    alreadyRegistered,
    setAlreadyRegistered,
  ] = useState(false);


  // ==============================
  // مجاز بودن نقش
  // ==============================

  const canRegisterByRole =
    useMemo(() => {
      if (!seminar) {
        return false;
      }


      if (
        [
          "club",
          "heyat",
          "board",
        ].includes(role)
      ) {
        return false;
      }


      const allowed =
        seminar.allowed_roles ||
        [];


      if (!allowed.length) {
        return true;
      }


      const requestedRoles =
        roleArrayFromRole(role);


      return requestedRoles.some(
        (requestedRole) =>
          allowed.includes(
            requestedRole
          )
      );

    }, [
      seminar,
      role,
    ]);


  // ==============================
  // وضعیت سمینار
  // ==============================

  const statusBadge =
    useMemo(() => {
      if (!seminar) {
        return null;
      }


      const today =
        new Date()
          .toISOString()
          .slice(0, 10);


      const open =
        seminar.registration_start &&
        seminar.registration_start <=
          today &&
        seminar.registration_end &&
        seminar.registration_end >=
          today;


      const upcoming =
        seminar.event_date &&
        seminar.event_date >=
          today;


      if (open) {
        return {
          text:
            "در حال ثبت‌نام",
          type: "open",
        };
      }


      if (upcoming) {
        return {
          text:
            "رویداد آینده",
          type:
            "upcoming",
        };
      }


      return {
        text:
          "پایان‌یافته",
        type: "past",
      };

    }, [seminar]);


  // ==============================
  // مدیریت 401
  // ==============================

  const handleUnauthorized =
    () => {
      if (role) {
        localStorage.removeItem(
          `${role}_token`
        );
      }


      localStorage.removeItem(
        "access_token"
      );

      localStorage.removeItem(
        "user_role"
      );


      showGlobalMessage({
        type: "warning",

        title:
          "پایان اعتبار ورود",

        message:
          "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",

        onClose: () => {
          navigate("/");
        },
      });
    };


  // ==============================
  // 1) دریافت جزئیات سمینار
  //    + پروفایل داشبورد
  // ==============================

  useEffect(() => {
    const controller =
      new AbortController();


    const loadData =
      async () => {
        setLoading(true);
        setLoadFailed(false);


        try {
          // ----------------------
          // جزئیات سمینار
          // ----------------------

          const seminarRequest =
            axios.get(
              `${API_BASE}/api/competitions/seminars/${encodeURIComponent(
                slug
              )}/`,
              {
                signal:
                  controller.signal,

                skipGlobalError: true,
              }
            );


          // ----------------------
          // پروفایل کاربر
          // ----------------------

          const profileRequest =
            token
              ? axios.get(
                  `${API_BASE}/api/auth/dashboard/${encodeURIComponent(
                    role
                  )}/`,
                  {
                    headers: {
                      Authorization:
                        `Bearer ${token}`,
                    },

                    signal:
                      controller.signal,

                    skipGlobalError:
                      true,
                  }
                )
              : Promise.resolve({
                  data: null,
                });


          const [
            seminarResult,
            profileResult,
          ] =
            await Promise.allSettled([
              seminarRequest,
              profileRequest,
            ]);


          if (
            controller.signal.aborted
          ) {
            return;
          }


          // ----------------------
          // نتیجه جزئیات سمینار
          // ----------------------

          if (
            seminarResult.status ===
            "fulfilled"
          ) {
            setSeminar(
              seminarResult.value
                ?.data ||
                null
            );

          } else {
            const error =
              seminarResult.reason;


            if (
              axios.isCancel(
                error
              ) ||
              error?.code ===
                "ERR_CANCELED"
            ) {
              return;
            }


            console.error(
              "SEMINAR_DETAIL_ERROR",
              error
            );


            setLoadFailed(true);


            showGlobalError(
              error,
              {
                title:
                  "خطا در دریافت اطلاعات سمینار",
              }
            );


            return;
          }


          // ----------------------
          // نتیجه پروفایل
          // ----------------------

          if (
            profileResult.status ===
            "fulfilled"
          ) {
            setProfile(
              profileResult.value
                ?.data ||
                null
            );

          } else if (token) {
            const error =
              profileResult.reason;


            if (
              axios.isCancel(
                error
              ) ||
              error?.code ===
                "ERR_CANCELED"
            ) {
              return;
            }


            console.error(
              "SEMINAR_PROFILE_ERROR",
              error
            );


            if (
              error?.response
                ?.status === 401
            ) {
              handleUnauthorized();
              return;
            }


            showGlobalError(
              error,
              {
                title:
                  "خطا در دریافت اطلاعات کاربر",
              }
            );
          }

        } catch (error) {
          if (
            axios.isCancel(
              error
            ) ||
            error?.code ===
              "ERR_CANCELED"
          ) {
            return;
          }


          console.error(
            "SEMINAR_LOAD_ERROR",
            error
          );


          setLoadFailed(true);


          showGlobalError(
            error,
            {
              title:
                "خطا در دریافت اطلاعات سمینار",
            }
          );

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    loadData();


    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slug,
    role,
    token,
  ]);


  // ==============================
  // 2) mini-profile
  // ==============================

  useEffect(() => {
    if (!token) {
      return undefined;
    }


    const controller =
      new AbortController();


    const loadMiniProfile =
      async () => {
        try {
          const { data } =
            await axios.get(
              `${API_BASE}/api/auth/profile/mini/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                /*
                 * mini-profile اطلاعات
                 * کمکی است.
                 * خطای آن نباید Modal
                 * اضافی ایجاد کند.
                 */
                skipGlobalError:
                  true,
              }
            );


          if (
            !controller.signal.aborted
          ) {
            setMiniProfile(
              data || {}
            );
          }

        } catch (error) {
          if (
            axios.isCancel(
              error
            ) ||
            error?.code ===
              "ERR_CANCELED"
          ) {
            return;
          }


          console.warn(
            "MINI_PROFILE_LOAD_ERROR",
            error
          );

          // عمداً Modal نمایش داده نمی‌شود.
          // پروفایل داشبورد fallback است.
        }
      };


    loadMiniProfile();


    return () => {
      controller.abort();
    };

  }, [token]);


  // ==============================
  // بازگشت
  // ==============================

  const onBack = () => {
    navigate(
      `/dashboard/${encodeURIComponent(
        role
      )}?section=courses`
    );
  };


  // ==============================
  // کلیک ثبت‌نام
  // ==============================

  const onClickRegister =
    () => {
      if (!token) {
        showGlobalWarning(
          "برای ثبت‌نام در سمینار ابتدا باید وارد حساب کاربری شوید.",
          "ورود الزامی است"
        );

        return;
      }


      if (
        !canRegisterByRole
      ) {
        showGlobalWarning(
          "نقش کاربری شما مجاز به ثبت‌نام در این سمینار نیست.",
          "عدم امکان ثبت‌نام"
        );

        return;
      }


      if (
        alreadyRegistered
      ) {
        showGlobalWarning(
          "شما قبلاً در این سمینار ثبت‌نام کرده‌اید.",
          "ثبت‌نام تکراری"
        );

        return;
      }


      setShowConfirm(true);
    };


  // ==============================
  // تأیید و ثبت‌نام
  // ==============================

  const onConfirmAndPay =
    async () => {
      if (
        !seminar ||
        !token
      ) {
        showGlobalWarning(
          "برای ثبت‌نام در سمینار ابتدا باید وارد حساب کاربری شوید.",
          "ورود الزامی است"
        );

        return;
      }


      const roles =
        roleArrayFromRole(
          role
        );


      if (
        roles.length === 0
      ) {
        showGlobalWarning(
          "این نقش کاربری امکان ثبت‌نام در سمینار را ندارد.",
          "عدم امکان ثبت‌نام"
        );

        return;
      }


      setRegistering(true);


      try {
        const { data } =
          await axios.post(
            `${API_BASE}/api/competitions/auth/seminars/${encodeURIComponent(
              slug
            )}/register/`,
            {
              roles,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },

              skipGlobalError:
                true,
            }
          );


        // ============================
        // پرداخت - فعلاً غیرفعال
        // ============================
        //
        // وقتی Backend payment_url
        // برگرداند:
        //
        // if (
        //   data?.payment_required &&
        //   data?.payment_url
        // ) {
        //   window.location.href =
        //     data.payment_url;
        //
        //   return;
        // }
        //
        // ============================


        setAlreadyRegistered(
          true
        );

        setShowConfirm(
          false
        );


        if (
          data?.status ===
          "ok"
        ) {
          showGlobalSuccess(
            data?.message ||
              "ثبت‌نام شما با موفقیت انجام شد.",
            "ثبت‌نام موفق"
          );

          return;
        }


        showGlobalSuccess(
          data?.message ||
            "درخواست ثبت‌نام شما با موفقیت ارسال شد.",
          "درخواست ثبت شد"
        );

      } catch (error) {
        console.error(
          "SEMINAR_REGISTER_ERROR",
          error
        );


        const status =
          error?.response
            ?.status;


        const detail =
          error?.response
            ?.data?.detail ||
          error?.response
            ?.data?.message ||
          error?.response
            ?.data?.error ||
          "";


        // --------------------------
        // ثبت‌نام تکراری
        // --------------------------

        if (
          status === 400 ||
          status === 409
        ) {
          const normalized =
            String(
              detail
            ).toLowerCase();


          const duplicate =
            normalized.includes(
              "unique"
            ) ||
            normalized.includes(
              "exists"
            ) ||
            normalized.includes(
              "already"
            ) ||
            normalized.includes(
              "قبلاً"
            );


          if (duplicate) {
            setAlreadyRegistered(
              true
            );

            setShowConfirm(
              false
            );


            showGlobalWarning(
              "شما قبلاً در این سمینار ثبت‌نام کرده‌اید.",
              "ثبت‌نام تکراری"
            );

            return;
          }


          showGlobalError(
            error,
            {
              title:
                "ثبت‌نام سمینار انجام نشد",
            }
          );

          return;
        }


        // --------------------------
        // پایان نشست
        // --------------------------

        if (
          status === 401
        ) {
          handleUnauthorized();
          return;
        }


        // --------------------------
        // عدم دسترسی
        // --------------------------

        if (
          status === 403
        ) {
          showGlobalWarning(
            detail ||
              "شما مجاز به ثبت‌نام در این سمینار نیستید.",
            "عدم دسترسی"
          );

          return;
        }


        // --------------------------
        // سایر خطاها
        // --------------------------

        showGlobalError(
          error,
          {
            title:
              "خطا در ثبت‌نام سمینار",
          }
        );

      } finally {
        setRegistering(
          false
        );
      }
    };


  // ==============================
  // Loading
  // ==============================

  if (loading) {
    return (
      <div className="seminar-detail">
        <p>
          در حال بارگذاری…
        </p>
      </div>
    );
  }


  // ==============================
  // خطای دریافت سمینار
  // ==============================

  if (
    loadFailed ||
    !seminar
  ) {
    return (
      <div className="seminar-detail">
        <p>
          اطلاعات سمینار در دسترس نیست.
        </p>

        <button
          type="button"
          className="sd-back"
          onClick={onBack}
        >
          بازگشت به دوره‌های آموزشی
        </button>
      </div>
    );
  }


  // ==============================
  // اطلاعات نمایشی
  // ==============================

  const imageSrc =
    seminar.poster_url ||
    "/placeholder.jpg";


  // نام

  const fullName =
    (
      pickFirst(
        miniProfile,
        [
          "full_name",
          "name",
        ],
        ""
      ) ||
      `${pickFirst(
        miniProfile,
        ["first_name"],
        ""
      )} ${pickFirst(
        miniProfile,
        ["last_name"],
        ""
      )}`.trim()
    ) ||
    (
      pickFirst(
        profile,
        [
          "full_name",
          "name",
        ],
        ""
      ) ||
      `${pickFirst(
        profile,
        ["first_name"],
        ""
      )} ${pickFirst(
        profile,
        ["last_name"],
        ""
      )}`.trim()
    ) ||
    "—";


  // کد ملی

  const nationalCodeRaw =
    pickFirst(
      miniProfile,
      [
        "national_code",
        "nationalCode",
        "nationalcode",
        "national_id",
        "nationalId",
        "melli_code",
        "melliCode",
      ],
      ""
    ) ||
    pickFirst(
      profile,
      [
        "national_code",
        "nationalCode",
        "user.national_code",
        "profile.national_code",
        "nid",
        "national_id",
        "nationalId",
        "national_number",
        "nationalNumber",
      ],
      ""
    );


  const nationalCode =
    nationalCodeRaw
      ? toFaDigits(
          nationalCodeRaw
        )
      : "—";


  // کمربند

  const beltTitleRaw =
    pickFirst(
      miniProfile,
      [
        "belt_grade",
        "beltGrade",
        "belt_title",
        "beltTitle",
        "belt_name",
        "beltName",
        "rank_title",
        "rank",
      ],
      ""
    ) ||
    pickFirst(
      profile,
      [
        "belt_grade",
        "beltGrade",
        "belt_title",
        "beltTitle",
        "belt_name",
        "beltName",
        "rank_title",
        "rank",
        "belt_group_label",
        "beltGroupLabel",
        "belt_group.label",
        "belt.label",
      ],
      ""
    );


  const beltTitle =
    beltTitleRaw ||
    "—";


  const canClickRegister =
    canRegisterByRole &&
    !alreadyRegistered;


  const fee =
    Number(
      seminar?.fee || 0
    );


  const finalCtaLabel =
    fee > 0
      ? "تایید و پرداخت"
      : "تایید ثبت‌نام";


  // ==============================
  // Render
  // ==============================

  return (
    <div
      className="seminar-detail"
      dir="rtl"
    >

      <div className="sd-head">

        <button
          type="button"
          className="sd-back"
          onClick={onBack}
          aria-label="بازگشت"
        >
          <span className="sd-back-icon">
            ↩
          </span>

          {" "}
          بازگشت به دوره‌های آموزشی
        </button>


        <div className="sd-badges">

          {statusBadge && (
            <span
              className={
                `sd-badge sd-${statusBadge.type}`
              }
            >
              {statusBadge.text}
            </span>
          )}


          {alreadyRegistered && (
            <span className="sd-badge sd-ok">
              ثبت‌نام‌شده
            </span>
          )}

        </div>
      </div>


      <div className="sd-card">

        <div className="sd-media">

          <img
            src={imageSrc}
            alt={
              seminar?.title
                ? `پوستر ${seminar.title}`
                : "پوستر سمینار"
            }
            className="sd-image"
            onError={(e) => {
              e.currentTarget.src =
                "/placeholder.jpg";
            }}
          />

        </div>


        <div className="sd-body">

          <h1 className="sd-title">
            {seminar?.title ||
              "—"}
          </h1>


          <div className="sd-meta">

            <div className="sd-meta-item">
              <span className="sd-meta-icon">
                📍
              </span>

              <div className="sd-meta-text">
                <span className="sd-meta-label">
                  محل برگزاری
                </span>

                <span className="sd-meta-value">
                  {seminar?.location ||
                    "—"}
                </span>
              </div>
            </div>


            <div className="sd-meta-item">
              <span className="sd-meta-icon">
                💳
              </span>

              <div className="sd-meta-text">
                <span className="sd-meta-label">
                  هزینه
                </span>

                <span className="sd-meta-value">
                  {fee > 0
                    ? `${toFaDigits(
                        fee.toLocaleString()
                      )} تومان`
                    : "رایگان"}
                </span>
              </div>
            </div>


            <div className="sd-meta-item">
              <span className="sd-meta-icon">
                🟢
              </span>

              <div className="sd-meta-text">
                <span className="sd-meta-label">
                  شروع ثبت‌نام
                </span>

                <span className="sd-meta-value">
                  {fmtDateFa(
                    seminar
                      ?.registration_start,
                    seminar
                      ?.registration_start_jalali
                  )}
                </span>
              </div>
            </div>


            <div className="sd-meta-item">
              <span className="sd-meta-icon">
                🔴
              </span>

              <div className="sd-meta-text">
                <span className="sd-meta-label">
                  پایان ثبت‌نام
                </span>

                <span className="sd-meta-value">
                  {fmtDateFa(
                    seminar
                      ?.registration_end,
                    seminar
                      ?.registration_end_jalali
                  )}
                </span>
              </div>
            </div>


            <div className="sd-meta-item">
              <span className="sd-meta-icon">
                📅
              </span>

              <div className="sd-meta-text">
                <span className="sd-meta-label">
                  تاریخ برگزاری
                </span>

                <span className="sd-meta-value">
                  {fmtDateFa(
                    seminar
                      ?.event_date,
                    seminar
                      ?.event_date_jalali
                  )}
                </span>
              </div>
            </div>

          </div>


          {seminar?.description && (
            <div className="sd-desc">
              {seminar.description}
            </div>
          )}


          {!alreadyRegistered && (
            <>
              {!showConfirm ? (
                <button
                  type="button"
                  className="sd-primary"
                  onClick={
                    onClickRegister
                  }
                  disabled={
                    !canClickRegister
                  }
                  title={
                    !canRegisterByRole
                      ? "نقش شما مجاز به ثبت‌نام نیست"
                      : ""
                  }
                >
                  ثبت نام
                </button>
              ) : (
                <>
                  <div className="sd-confirm">

                    <div className="sd-field">
                      <label>
                        نام و نام خانوادگی
                      </label>

                      <input
                        type="text"
                        value={
                          fullName
                        }
                        disabled
                      />
                    </div>


                    <div className="sd-field">
                      <label>
                        درجه کمربند
                      </label>

                      <input
                        type="text"
                        value={
                          beltTitle
                        }
                        disabled
                      />
                    </div>


                    <div className="sd-field">
                      <label>
                        کد ملی
                      </label>

                      <input
                        type="text"
                        value={
                          nationalCode
                        }
                        disabled
                      />
                    </div>

                  </div>


                  <button
                    type="button"
                    className="sd-primary"
                    onClick={
                      onConfirmAndPay
                    }
                    disabled={
                      registering
                    }
                  >
                    {registering
                      ? "در حال ارسال…"
                      : finalCtaLabel}
                  </button>


                  <button
                    type="button"
                    className="sd-back"
                    onClick={() =>
                      setShowConfirm(
                        false
                      )
                    }
                    disabled={
                      registering
                    }
                  >
                    انصراف
                  </button>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
};


export default SeminarDetail;