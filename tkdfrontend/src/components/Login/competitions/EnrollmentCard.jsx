// src/components/Login/competitions/EnrollmentCard.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useNavigate,
} from "react-router-dom";

import {
  getEnrollmentDetail,
  getEnrollmentCard,
  getEnrollmentCardUrl,
  API_BASE,
} from "../../../api/competitions";

import {
  showGlobalError,
  showGlobalMessage,
} from "../../../services/globalMessage";

import "./EnrollmentCard.css";


/* ======================================================
   Helpers
====================================================== */

const toFa = (value = "") =>
  String(value).replace(
    /\d/g,
    (digit) =>
      "۰۱۲۳۴۵۶۷۸۹"[digit]
  );


const absUrl = (url) =>
  url
    ? (
        url.startsWith?.("http")
          ? url
          : `${API_BASE}${url}`
      )
    : null;


const pick = (
  object,
  ...keys
) =>
  keys
    .map(
      (key) =>
        object?.[key]
    )
    .find(
      (value) =>
        value !== null &&
        value !== undefined
    );


const getErrorStatus = (
  error
) =>
  error?.status ||
  error?.response?.status ||
  null;


/* ======================================================
   Team helpers
====================================================== */

const isTeamEnrollment = (
  data
) => {
  const mode =
    String(
      data?.mode || ""
    ).toLowerCase();


  if (mode === "team") {
    return true;
  }


  const style =
    String(
      data?.poomsae_style ||
      ""
    ).trim();


  if (
    style.startsWith(
      "تیمی"
    )
  ) {
    return true;
  }


  const teamName =
    String(
      data?.team_name ||
      ""
    ).trim();


  return Boolean(
    teamName &&
    teamName !== "-" &&
    teamName !== "—"
  );
};


/* ======================================================
   Component
====================================================== */

export default function EnrollmentCard() {
  const {
    role,
    enrollmentId,
  } = useParams();


  const navigate =
    useNavigate();


  const [
    enroll,
    setEnroll,
  ] = useState(null);


  const [
    cardUrl,
    setCardUrl,
  ] = useState(null);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);


  /* ====================================================
     Unauthorized
  ==================================================== */

  const handleUnauthorized =
    () => {
      const currentRole =
        (
          localStorage.getItem(
            "user_role"
          ) ||
          role ||
          ""
        )
          .toLowerCase()
          .trim();


      if (currentRole) {
        localStorage.removeItem(
          `${currentRole}_token`
        );
      }


      localStorage.removeItem(
        "access_token"
      );

      localStorage.removeItem(
        "user_role"
      );


      showGlobalMessage({
        type:
          "warning",

        title:
          "پایان اعتبار ورود",

        message:
          "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",

        onClose: () => {
          navigate("/");
        },
      });
    };


  /* ====================================================
     Load enrollment/card
  ==================================================== */

  useEffect(() => {
    let alive = true;


    const load =
      async () => {
        setLoading(true);
        setLoadFailed(false);
        setEnroll(null);
        setCardUrl(null);


        let localCardUrl =
          null;


        try {
          // ============================
          // 1) جزئیات ثبت‌نام
          // ============================

          const detail =
            await getEnrollmentDetail(
              enrollmentId
            );


          if (!alive) {
            return;
          }


          setEnroll(
            detail
          );


          // ============================
          // تشخیص نوع مسابقه
          // ============================

          const inferredKind =
            (() => {
              const kind =
                String(
                  detail?.kind ||
                  detail?.discipline ||
                  detail?.style ||
                  detail?.competition_kind ||
                  detail?.competition_style ||
                  detail?.competition_type ||
                  ""
                ).toLowerCase();


              if (
                kind.includes(
                  "poom"
                ) ||
                kind.includes(
                  "پومسه"
                )
              ) {
                return "poomsae";
              }


              return "kyorugi";
            })();


          // ============================
          // 2) دریافت اطلاعات کارت
          // ============================

          try {
            const cardResult =
              await getEnrollmentCard(
                enrollmentId,
                {
                  kind:
                    inferredKind,
                }
              );


            if (!alive) {
              return;
            }


            const fromJson =
              getEnrollmentCardUrl(
                cardResult
              );


            if (fromJson) {
              localCardUrl =
                absUrl(
                  fromJson
                );
            }


            if (
              !fromJson &&
              typeof cardResult ===
                "string"
            ) {
              localCardUrl =
                absUrl(
                  cardResult
                );
            }


            /*
             * اگر خود پاسخ کارت شامل
             * داده‌های بازیکن بود، با
             * detail ادغام شود.
             */

            if (
              cardResult &&
              typeof cardResult ===
                "object" &&
              !Array.isArray(
                cardResult
              )
            ) {
              setEnroll(
                (previous) => ({
                  ...(previous ||
                    {}),
                  ...cardResult,
                })
              );
            }


            if (
              localCardUrl
            ) {
              setCardUrl(
                localCardUrl
              );
            }

          } catch (cardError) {
            if (!alive) {
              return;
            }


            const cardStatus =
              getErrorStatus(
                cardError
              );


            /*
             * 404 یا 403 در endpoint کارت
             * الزاماً به معنی خراب بودن
             * detail نیست.
             *
             * بنابراین در اینجا Modal
             * مزاحم نشان نمی‌دهیم.
             */

            if (
              cardStatus === 404 ||
              cardStatus === 403
            ) {
              console.warn(
                "ENROLLMENT_CARD_OPTIONAL_ERROR",
                cardError
              );

            } else if (
              cardStatus === 401
            ) {
              handleUnauthorized();

              return;

            } else {
              console.error(
                "ENROLLMENT_CARD_LOAD_ERROR",
                cardError
              );


              showGlobalError(
                cardError,
                {
                  title:
                    "خطا در دریافت اطلاعات کارت",
                }
              );
            }
          }


          // ============================
          // 3) URL از detail
          // ============================

          const urlFromDetail =
            getEnrollmentCardUrl(
              detail
            ) ||
            pick(
              detail,
              "card_url",
              "cardUrl",
              "card"
            ) ||
            detail?.card?.url;


          if (
            !localCardUrl &&
            urlFromDetail
          ) {
            localCardUrl =
              absUrl(
                String(
                  urlFromDetail
                )
              );


            if (
              localCardUrl
            ) {
              setCardUrl(
                localCardUrl
              );
            }
          }

        } catch (detailError) {
          if (!alive) {
            return;
          }


          console.error(
            "ENROLLMENT_DETAIL_LOAD_ERROR",
            detailError
          );


          setLoadFailed(true);


          const status =
            getErrorStatus(
              detailError
            );


          if (
            status === 401
          ) {
            handleUnauthorized();

            return;
          }


          if (
            status === 403
          ) {
            showGlobalMessage({
              type:
                "warning",

              title:
                "عدم دسترسی",

              message:
                "اجازه مشاهده این کارت را ندارید.",
            });

            return;
          }


          if (
            status === 404
          ) {
            showGlobalMessage({
              type:
                "warning",

              title:
                "کارت یافت نشد",

              message:
                "ثبت‌نام یا کارت موردنظر یافت نشد.",
            });

            return;
          }


          const payload =
            detailError?.payload ||
            detailError?.response
              ?.data;


          const message =
            payload?.detail ||
            payload?.error ||
            payload?.message;


          if (message) {
            showGlobalMessage({
              type:
                "error",

              title:
                "خطا در دریافت کارت ثبت‌نام",

              message,
            });

          } else {
            showGlobalError(
              detailError,
              {
                title:
                  "خطا در دریافت کارت ثبت‌نام",
              }
            );
          }

        } finally {
          if (alive) {
            setLoading(false);
          }
        }
      };


    load();


    return () => {
      alive = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enrollmentId,
  ]);


  /* ====================================================
     Poomsae detection
  ==================================================== */

  const isPoomsae =
    useMemo(() => {
      if (!enroll) {
        return false;
      }


      const poomsaeType =
        String(
          enroll.poomsae_type ||
          ""
        ).toLowerCase();


      const poomsaeDisplay =
        String(
          enroll.poomsae_type_display ||
          ""
        ).toLowerCase();


      const ageName =
        enroll.age_category_name ||
        enroll.age_category_label ||
        enroll.age_category_title ||
        "";


      if (
        poomsaeType ||
        poomsaeDisplay ||
        ageName
      ) {
        return true;
      }


      const kind =
        String(
          enroll.kind ||
          enroll.discipline ||
          enroll.style ||
          ""
        ).toLowerCase();


      if (
        kind === "poomsae" ||
        kind.includes(
          "poom"
        ) ||
        kind.includes(
          "پومسه"
        )
      ) {
        return true;
      }


      const competitionStyle =
        String(
          enroll.competition_style ||
          enroll.competition_kind ||
          enroll.competition_type ||
          ""
        ).toLowerCase();


      if (
        competitionStyle ===
          "poomsae" ||
        competitionStyle.includes(
          "poom"
        ) ||
        competitionStyle.includes(
          "پومسه"
        )
      ) {
        return true;
      }


      const hasWeightField =
        "weight_name" in
          enroll ||
        "weight_category" in
          enroll ||
        "weight_category_name" in
          enroll ||
        "weight_category_display" in
          enroll;


      const hasWeightValue =
        (
          enroll.weight_name &&
          enroll.weight_name !==
            "—"
        ) ||
        enroll.weight_category_name ||
        enroll.weight_category_display ||
        enroll.weight_category
          ?.name ||
        enroll.weight_category
          ?.title;


      if (
        !hasWeightValue &&
        ageName &&
        !hasWeightField
      ) {
        return true;
      }


      return false;

    }, [enroll]);


  /* ====================================================
     Loading
  ==================================================== */

  if (loading) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">
          در حال بارگذاری…
        </div>
      </div>
    );
  }


  /* ====================================================
     Failed
  ==================================================== */

  if (
    loadFailed ||
    (
      !enroll &&
      !cardUrl
    )
  ) {
    return (
      <div
        className="cd-container"
        dir="rtl"
      >
        <div className="cd-muted">
          امکان نمایش این کارت در حال حاضر وجود ندارد.
        </div>


        <div
          style={{
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-light"
            onClick={() =>
              navigate(-1)
            }
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }


  /* ====================================================
     Fields
  ==================================================== */

  const {
    competition_title,
    competition_date_jalali,

    first_name,
    last_name,
    birth_date,
    photo,

    weight_name,
    weight_category_name,
    weight_category_display,
    weight_category,

    belt,
    belt_group,

    insurance_number,
    insurance_issue_date_jalali,

    coach_name,
    club_name,

    poomsae_type,
    poomsae_type_display,

    age_category_name,
    age_category_label,
    age_category_title,
  } = enroll || {};


  const fullName =
    [
      first_name,
      last_name,
    ]
      .filter(Boolean)
      .join(" ");


  const photoUrl =
    absUrl(photo);


  const ageValue =
    age_category_name ||
    age_category_label ||
    age_category_title ||
    enroll?.age_group_name ||
    enroll?.age_group ||
    "—";


  const weightCategoryValue =
    weight_name ||
    weight_category_display ||
    weight_category_name ||
    weight_category?.name ||
    weight_category?.title ||
    "—";


  const poomsaeStyleValue =
    enroll?.poomsae_style ||
    poomsae_type_display ||
    (
      poomsae_type ===
        "creative"
        ? "ابداعی"

        : poomsae_type ===
          "standard"
        ? "استاندارد"

        : poomsae_type ||
          "—"
    );


  const categoryLabel =
    isPoomsae
      ? "سبک مسابقه"
      : "رده وزنی";


  const categoryValue =
    isPoomsae
      ? poomsaeStyleValue
      : weightCategoryValue;


  const teamName =
    enroll?.team_name ||
    enroll?.team?.name ||
    enroll?.team_title ||
    "—";


  /* ====================================================
     Render
  ==================================================== */

  return (
    <div
      className="cd-container"
      dir="rtl"
      style={{
        maxWidth: 900,
      }}
    >

      <div className="enroll-card enroll-card--outlined">

        <div className="enroll-card__head enroll-card__head--center">
          <h2 className="enroll-card__title">
            کارت شناسایی بازیکن
          </h2>
        </div>


        <div
          className="enroll-card__grid"
          style={{
            marginTop: 12,
          }}
        >

          <Info
            label="عنوان مسابقه"
            value={
              competition_title ||
              "—"
            }
          />


          <Info
            label="تاریخ برگزاری"
            value={
              competition_date_jalali ||
              "—"
            }
          />

        </div>


        <div className="enroll-card__divider" />


        <div className="enroll-card__grid enroll-card__grid--photo">

          <div className="enroll-card__photo-wrap">

            {photoUrl ? (
              <img
                className="enroll-card__photo"
                src={
                  photoUrl
                }
                alt="بازیکن"
              />
            ) : (
              <div className="enroll-card__photo placeholder">
                بدون عکس
              </div>
            )}

          </div>


          <div className="enroll-card__info-cols">

            <Info
              label="نام و نام خانوادگی"
              value={
                fullName ||
                "—"
              }
            />


            <Info
              label="تاریخ تولد"
              value={
                birth_date ||
                "—"
              }
            />


            <Info
              label="کمربند"
              value={
                belt ||
                "—"
              }
            />


            <Info
              label="گروه کمربندی"
              value={
                belt_group ||
                "—"
              }
            />


            <Info
              label="تاریخ صدور بیمه"
              value={
                insurance_issue_date_jalali ||
                "—"
              }
            />

          </div>


          <div className="enroll-card__info-cols">

            {isPoomsae ? (
              <>
                <Info
                  label={
                    categoryLabel
                  }
                  value={
                    categoryValue
                  }
                />


                <Info
                  label="گروه سنی"
                  value={
                    ageValue
                  }
                />


                {isTeamEnrollment(
                  enroll
                ) && (
                  <Info
                    label="نام تیم"
                    value={
                      teamName
                    }
                  />
                )}
              </>
            ) : (
              <Info
                label={
                  categoryLabel
                }
                value={
                  categoryValue
                }
              />
            )}


            <Info
              label="نام مربی"
              value={
                coach_name ||
                "—"
              }
            />


            <Info
              label="نام باشگاه"
              value={
                club_name ||
                "—"
              }
            />


            <Info
              label="شماره بیمه"
              value={
                insurance_number ||
                "—"
              }
            />

          </div>

        </div>


        <div className="enroll-card__footer">

          <div className="enroll-card__notice">
            این کارت را چاپ کرده و روز مسابقه همراه خود داشته باشید.
          </div>


          <div className="cd-actions enroll-card__actions">

            <button
              type="button"
              className="btn btn-outline"
              onClick={() =>
                window.print()
              }
            >
              چاپ کارت
            </button>


            <button
              type="button"
              className="btn btn-light"
              onClick={() =>
                navigate(
                  `/dashboard/${encodeURIComponent(
                    role
                  )}`
                )
              }
            >
              بازگشت به داشبورد
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}


/* ======================================================
   Info
====================================================== */

function Info({
  label,
  value,
}) {
  return (
    <div className="cd-row">

      <div className="cd-label">
        {label}
      </div>

      <div className="cd-value">
        {value}
      </div>

    </div>
  );
}