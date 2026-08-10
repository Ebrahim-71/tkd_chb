// src/components/Login/competitions/EnrollmentCardsBulk.jsx

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useSearchParams,
  useParams,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  requestBulkCards,
  API_BASE,
} from "../../../api/competitions";

import {
  apiFetchSilent,
} from "../../../api/apiClient";

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


const parseIds = (value) => {
  if (!value) {
    return [];
  }


  return Array.from(
    new Set(
      String(value)
        .split(",")
        .map((item) =>
          Number(
            String(item).trim()
          )
        )
        .filter(
          (id) =>
            Number.isFinite(id) &&
            id > 0
        )
    )
  );
};


/* ======================================================
   Token
====================================================== */

const getAuthToken = () => {
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
    const token =
      localStorage.getItem(key);

    if (token) {
      return token;
    }
  }


  return null;
};


/* ======================================================
   Resolve enrollment ids from pid

   عمداً Silent است.
   چون endpoint اول ممکن است 404 بدهد
   و endpoint دوم جواب بدهد.
====================================================== */

async function resolveEnrollmentIdsFromPid(
  pid,
  kind,
  signal
) {
  if (!pid) {
    return [];
  }


  // ------------------------------
  // Cache فقط برای همین pid
  // ------------------------------

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
    const parsed =
      parseIds(cachedIds);

    if (parsed.length) {
      return parsed;
    }
  }


  const candidates = [
    `${API_BASE}/api/payments/intents/${encodeURIComponent(
      pid
    )}/enrollments/`,

    `${API_BASE}/api/payments/intent/${encodeURIComponent(
      pid
    )}/enrollments/`,
  ].map((url) =>
    kind
      ? `${url}?kind=${encodeURIComponent(
          kind
        )}`
      : url
  );


  const token =
    getAuthToken();


  for (const url of candidates) {
    try {
      const response =
        await apiFetchSilent(
          url,
          {
            method: "GET",

            headers: {
              Accept:
                "application/json",

              ...(token
                ? {
                    Authorization:
                      `Bearer ${token}`,
                  }
                : {}),
            },

            credentials:
              "omit",

            signal,
          }
        );


      // این خطا ممکن است فقط
      // مربوط به candidate اول باشد.
      if (!response.ok) {
        continue;
      }


      const data =
        await response
          .json()
          .catch(() => null);


      const rawIds =
        Array.isArray(
          data?.enrollment_ids
        )
          ? data.enrollment_ids

          : Array.isArray(
              data?.ids
            )
          ? data.ids

          : [];


      const cleanIds =
        Array.from(
          new Set(
            rawIds
              .map(Number)
              .filter(
                (id) =>
                  Number.isFinite(
                    id
                  ) &&
                  id > 0
              )
          )
        );


      if (cleanIds.length) {
        localStorage.setItem(
          "last_payment_pid",
          pid
        );

        localStorage.setItem(
          "last_payment_enrollment_ids",
          cleanIds.join(",")
        );


        return cleanIds;
      }

    } catch (error) {
      if (
        signal?.aborted ||
        error?.name ===
          "AbortError"
      ) {
        return [];
      }


      console.warn(
        "BULK_CARDS_PID_RESOLVE_CANDIDATE_FAILED",
        url,
        error
      );

      // candidate بعدی
    }
  }


  return [];
}


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


  const poomsaeStyle =
    String(
      data?.poomsae_style ||
      ""
    ).trim();


  if (
    poomsaeStyle.startsWith(
      "تیمی"
    )
  ) {
    return true;
  }


  const teamName =
    String(
      data?.team_name || ""
    ).trim();


  if (
    !teamName ||
    teamName === "-" ||
    teamName === "—"
  ) {
    return false;
  }


  return true;
};


const getTeamName = (
  data
) => {
  const candidates = [
    data?.team_name,
    data?.teamName,
    data?.team_title,
    data?.teamTitle,
    data?.team,
    data?.team?.name,
    data?.team?.title,
  ];


  const name =
    candidates
      .map((item) =>
        String(
          item || ""
        ).trim()
      )
      .find(
        (item) =>
          item &&
          item !== "-" &&
          item !== "—"
      );


  return name || "";
};


const getPoomsaeStyleLabel = (
  data
) => {
  if (
    data?.poomsae_style
  ) {
    return String(
      data.poomsae_style
    );
  }


  const type =
    String(
      data?.poomsae_type ||
      ""
    ).toLowerCase();


  const typeFa =
    type === "creative"
      ? "ابداعی"
      : type === "standard"
      ? "استاندارد"
      : "—";


  const sectionFa =
    isTeamEnrollment(data)
      ? "تیمی"
      : "انفرادی";


  return `${sectionFa} ${typeFa}`;
};


/* ======================================================
   Player merging
====================================================== */

const playerKeyOf = (
  data
) => {
  const nationalCode =
    data?.national_code ||
    data?.national_id ||
    data?.nationalId ||
    data?.nid;


  if (nationalCode) {
    return `nat:${String(
      nationalCode
    )}`;
  }


  const firstName =
    String(
      data?.first_name || ""
    ).trim();

  const lastName =
    String(
      data?.last_name || ""
    ).trim();

  const birthDate =
    String(
      data?.birth_date || ""
    ).trim();


  return `p:${firstName}|${lastName}|${birthDate}`;
};


const mergeSameSectionCardsPerPlayer =
  (okItems) => {
    const byPlayer =
      new Map();


    for (const item of okItems) {
      const playerKey =
        playerKeyOf(
          item.data
        );


      if (
        !byPlayer.has(
          playerKey
        )
      ) {
        byPlayer.set(
          playerKey,
          []
        );
      }


      byPlayer
        .get(playerKey)
        .push(item);
    }


    const output = [];


    for (
      const itemsOfPlayer
      of byPlayer.values()
    ) {
      const buckets = {
        team: [],
        individual: [],
      };


      for (
        const item
        of itemsOfPlayer
      ) {
        const bucket =
          isTeamEnrollment(
            item.data
          )
            ? "team"
            : "individual";


        buckets[bucket].push(
          item
        );
      }


      for (
        const bucketName
        of [
          "team",
          "individual",
        ]
      ) {
        const cards =
          buckets[bucketName];


        if (!cards.length) {
          continue;
        }


        if (
          cards.length === 1
        ) {
          output.push(
            cards[0]
          );

          continue;
        }


        const base =
          cards[0];


        const styles =
          Array.from(
            new Set(
              cards
                .map((item) =>
                  getPoomsaeStyleLabel(
                    item.data
                  )
                )
                .filter(Boolean)
            )
          );


        const teamNames =
          Array.from(
            new Set(
              cards
                .map((item) =>
                  getTeamName(
                    item.data
                  )
                )
                .filter(Boolean)
            )
          );


        output.push({
          ...base,

          data: {
            ...base.data,

            poomsae_style:
              styles.join(" و "),

            ...(bucketName ===
            "team"
              ? {
                  team_names:
                    teamNames,

                  team_name:
                    teamNames.length
                      ? teamNames.join(
                          " و "
                        )
                      : getTeamName(
                          base.data
                        ) ||
                        "—",
                }
              : {}),
          },

          merged_ids:
            cards.map(
              (item) =>
                item.id
            ),
        });
      }
    }


    return output;
  };


/* ======================================================
   UI helpers
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


function CardView({
  data,
}) {
  if (!data) {
    return null;
  }


  const {
    competition_title,
    competition_date_jalali,
    first_name,
    last_name,
    birth_date,
    photo,
    weight_name,
    belt,
    belt_group,
    insurance_number,
    insurance_issue_date_jalali,
    coach_name,
    club_name,

    style,
    kind,
    discipline,

    poomsae_style,
    poomsae_type,
    poomsae_type_display,
    age_category_name,
    age_category_label,
    age_category_title,
  } = data;


  const fullName =
    [
      first_name,
      last_name,
    ]
      .filter(Boolean)
      .join(" ");


  const styleNorm =
    String(
      style ||
      kind ||
      discipline ||
      ""
    ).toLowerCase();


  const isPoomsae =
    styleNorm ===
      "poomsae" ||
    styleNorm.includes(
      "poom"
    ) ||
    styleNorm.includes(
      "پومسه"
    ) ||
    Boolean(
      poomsae_style ||
      poomsae_type ||
      poomsae_type_display ||
      age_category_name
    );


  const poomsaeTypeFa =
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


  const categoryValue =
    isPoomsae
      ? poomsae_style ||
        poomsaeTypeFa ||
        "—"

      : weight_name ||
        "—";


  const ageValue =
    age_category_name ||
    age_category_label ||
    age_category_title ||
    data?.age_group_name ||
    data?.age_group ||
    "—";


  return (
    <div className="enroll-card enroll-card--outlined">

      <div className="enroll-card__head enroll-card__head--center">
        <h2 className="enroll-card__title">
          کارت شناسایی بازیکن
        </h2>
      </div>


      <div className="enroll-card__grid">
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
          {photo ? (
            <img
              className="enroll-card__photo"
              src={
                absUrl(photo)
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


          {isPoomsae ? (
            <>
              <Info
                label="سبک مسابقه"
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
            </>
          ) : (
            <Info
              label="رده وزنی"
              value={
                categoryValue
              }
            />
          )}

        </div>


        <div className="enroll-card__info-cols">

          {isPoomsae &&
            isTeamEnrollment(
              data
            ) && (
              <Info
                label="نام تیم"
                value={
                  (
                    Array.isArray(
                      data.team_names
                    ) &&
                    data.team_names
                      .length
                      ? data.team_names.join(
                          " و "
                        )
                      : data.team_name
                  ) ||
                  "—"
                }
              />
            )}


          <Info
            label="تاریخ تولد"
            value={
              birth_date ||
              "—"
            }
          />


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
    </div>
  );
}


/*
 * این دو کامپوننت را نگه می‌داریم.
 * اینها Modal عمومی نیستند؛
 * وضعیت اختصاصی هر enrollment را
 * داخل لیست کارت‌ها نشان می‌دهند.
 */

function PendingCard({
  id,
  message,
}) {
  return (
    <div
      className="cd-card"
      style={{
        marginBottom: 12,
        padding: 12,
        border:
          "1px dashed #d0d0d0",
        background:
          "#fafafa",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        کارت ثبت‌نام #
        {toFa(id)}
      </div>

      <div className="cd-muted">
        {message ||
          "این ثبت‌نام هنوز پرداخت/تأیید نهایی نشده است."}
      </div>
    </div>
  );
}


function ErrorCard({
  id,
  message,
}) {
  return (
    <div
      className="cd-card"
      style={{
        marginBottom: 12,
        padding: 12,
        border:
          "1px solid #f3c2c2",
        background:
          "#fff7f7",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        کارت ثبت‌نام #
        {toFa(id)}
      </div>

      <div
        className="cd-error"
        style={{
          margin: 0,
        }}
      >
        {message ||
          "اطلاعات کارت در دسترس نیست."}
      </div>
    </div>
  );
}


/* ======================================================
   Main component
====================================================== */

export default function EnrollmentCardsBulk() {
  const { role } =
    useParams();

  const navigate =
    useNavigate();

  const location =
    useLocation();

  const [searchParams] =
    useSearchParams();


  const roleSafe =
    useMemo(() => {
      const currentRole =
        (
          role &&
          String(role).trim()
        ) ||
        localStorage.getItem(
          "user_role"
        ) ||
        "coach";


      return encodeURIComponent(
        String(
          currentRole
        ).toLowerCase()
      );

    }, [role]);


  const idsString =
    searchParams.get(
      "ids"
    ) || "";


  const pid =
    searchParams.get(
      "pid"
    ) || "";


  const stateIds =
    location?.state?.ids;


  const rawKind =
    location?.state?.kind ||
    searchParams.get(
      "kind"
    ) ||
    "kyorugi";


  const kind =
    [
      "poomsae",
      "kyorugi",
    ].includes(
      String(
        rawKind
      ).toLowerCase()
    )
      ? String(
          rawKind
        ).toLowerCase()
      : "kyorugi";


  const ids =
    useMemo(() => {
      // ---------------------------
      // اول QueryString
      // ---------------------------

      const fromQuery =
        parseIds(
          idsString
        );


      if (
        fromQuery.length
      ) {
        return fromQuery;
      }


      // ---------------------------
      // سپس navigate state
      // ---------------------------

      if (
        Array.isArray(
          stateIds
        )
      ) {
        return Array.from(
          new Set(
            stateIds
              .map(Number)
              .filter(
                (id) =>
                  Number.isFinite(
                    id
                  ) &&
                  id > 0
              )
          )
        );
      }


      return [];

    }, [
      idsString,
      stateIds,
    ]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    items,
    setItems,
  ] = useState([]);


  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);


  /* ====================================================
     Load cards
  ==================================================== */

  useEffect(() => {
    let alive = true;

    const controller =
      new AbortController();


    const run =
      async () => {
        try {
          setLoading(true);
          setLoadFailed(false);


          let idsToLoad =
            [...ids];


          // ----------------------------
          // ids نداریم ولی pid داریم
          // ----------------------------

          if (
            !idsToLoad.length &&
            pid
          ) {
            idsToLoad =
              await resolveEnrollmentIdsFromPid(
                pid,
                kind,
                controller.signal
              );


            if (
              !alive ||
              controller
                .signal
                .aborted
            ) {
              return;
            }
          }


          // ----------------------------
          // هیچ شناسه‌ای پیدا نشد
          // ----------------------------

          if (
            !idsToLoad.length
          ) {
            if (!alive) {
              return;
            }


            setItems([]);
            setLoadFailed(true);


            showGlobalMessage({
              type:
                "warning",

              title:
                "کارت ثبت‌نام یافت نشد",

              message:
                pid
                  ? "هیچ ثبت‌نامی برای این پرداخت پیدا نشد."
                  : "شناسه ثبت‌نام برای نمایش کارت‌ها در آدرس موجود نیست.",
            });


            return;
          }


          // ----------------------------
          // دریافت کارت‌ها
          // ----------------------------

          const response =
            await requestBulkCards(
              idsToLoad,
              {
                kind,
              }
            );


          if (!alive) {
            return;
          }


          const list =
            Array.isArray(
              response
            )
              ? response

              : Array.isArray(
                  response?.results
                )
              ? response.results

              : [];


          const responseMap =
            new Map(
              list.map(
                (item) => [
                  Number(
                    item?.enrollment_id
                  ),
                  item,
                ]
              )
            );


          const output =
            idsToLoad.flatMap(
              (rawId) => {
                const enrollmentId =
                  Number(rawId);


                const item =
                  responseMap.get(
                    enrollmentId
                  );


                if (!item) {
                  return [
                    {
                      id:
                        enrollmentId,

                      enrollmentId,

                      status:
                        "error",

                      message:
                        "اطلاعات این کارت از سرور دریافت نشد.",
                    },
                  ];
                }


                if (
                  item.error ===
                  "not_ready"
                ) {
                  return [
                    {
                      id:
                        enrollmentId,

                      enrollmentId,

                      status:
                        "pending",

                      message:
                        "این ثبت‌نام هنوز پرداخت یا تأیید نهایی نشده است.",
                    },
                  ];
                }


                if (
                  item.error ===
                  "forbidden"
                ) {
                  return [
                    {
                      id:
                        enrollmentId,

                      enrollmentId,

                      status:
                        "error",

                      message:
                        "اجازه مشاهده این کارت را ندارید.",
                    },
                  ];
                }


                if (
                  item.error ===
                  "not_found"
                ) {
                  return [
                    {
                      id:
                        enrollmentId,

                      enrollmentId,

                      status:
                        "error",

                      message:
                        "کارت این ثبت‌نام یافت نشد.",
                    },
                  ];
                }


                if (item.error) {
                  return [
                    {
                      id:
                        enrollmentId,

                      enrollmentId,

                      status:
                        "error",

                      message:
                        String(
                          item.error
                        ),
                    },
                  ];
                }


                // -------------------------
                // ثبت‌نام تیمی
                // -------------------------

                const teamCards =
                  Array.isArray(
                    item?.cards
                  )
                    ? item.cards.filter(
                        Boolean
                      )
                    : [];


                if (
                  teamCards.length
                ) {
                  return teamCards.map(
                    (
                      card,
                      index
                    ) => ({
                      id:
                        card?.card_key ||
                        `${enrollmentId}-${index + 1}`,

                      enrollmentId,

                      status:
                        "ok",

                      data: {
                        ...card,

                        enrollment_id:
                          card?.enrollment_id ??
                          enrollmentId,

                        mode:
                          card?.mode ||
                          item?.mode ||
                          "team",

                        team_id:
                          card?.team_id ??
                          item?.team_id ??
                          null,

                        team_name:
                          card?.team_name ||
                          item?.team_name ||
                          "",

                        poomsae_type:
                          card?.poomsae_type ||
                          item?.poomsae_type ||
                          "",

                        poomsae_type_display:
                          card?.poomsae_type_display ||
                          item?.poomsae_type_display ||
                          "",

                        status:
                          card?.status ||
                          item?.status ||
                          "",

                        is_paid:
                          card?.is_paid ??
                          item?.is_paid ??
                          false,
                      },
                    })
                  );
                }


                // -------------------------
                // ثبت‌نام انفرادی
                // -------------------------

                return [
                  {
                    id:
                      enrollmentId,

                    enrollmentId,

                    status:
                      "ok",

                    data: item,
                  },
                ];
              }
            );


          if (alive) {
            setItems(
              output
            );
          }

        } catch (error) {
          if (
            !alive ||
            controller
              .signal
              .aborted ||
            error?.name ===
              "AbortError"
          ) {
            return;
          }


          console.error(
            "BULK_CARDS_LOAD_ERROR",
            error
          );


          setLoadFailed(true);


          const status =
            error?.status ||
            error?.response
              ?.status;


          if (
            status === 401
          ) {
            const currentRole =
              localStorage.getItem(
                "user_role"
              );


            if (currentRole) {
              localStorage.removeItem(
                `${currentRole}_token`
              );
            }


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


            return;
          }


          const payload =
            error?.payload ||
            error?.response
              ?.data;


          const message =
            payload?.detail ||
            payload?.error ||
            payload?.message ||
            error?.message;


          if (message) {
            showGlobalMessage({
              type:
                "error",

              title:
                "خطا در دریافت کارت‌های ثبت‌نام",

              message,
            });
          } else {
            showGlobalError(
              error,
              {
                title:
                  "خطا در دریافت کارت‌های ثبت‌نام",
              }
            );
          }

        } finally {
          if (alive) {
            setLoading(false);
          }
        }
      };


    run();


    return () => {
      alive = false;

      controller.abort();
    };

  }, [
    ids,
    pid,
    kind,
    navigate,
  ]);


  /* ====================================================
     Groups
  ==================================================== */

  const okCards =
    items.filter(
      (item) =>
        item.status ===
        "ok"
    );


  const pendingCards =
    items.filter(
      (item) =>
        item.status ===
        "pending"
    );


  const errorCards =
    items.filter(
      (item) =>
        item.status ===
        "error"
    );


  const mergedOkCards =
    useMemo(
      () =>
        mergeSameSectionCardsPerPlayer(
          okCards
        ),
      [okCards]
    );


  /* ====================================================
     Loading
  ==================================================== */

  if (
    loading &&
    items.length === 0
  ) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">
          در حال بارگذاری…
        </div>
      </div>
    );
  }


  /* ====================================================
     Top-level failure
  ==================================================== */

  if (
    loadFailed &&
    items.length === 0
  ) {
    return (
      <div
        className="cd-container"
        dir="rtl"
      >
        <div className="cd-muted">
          امکان نمایش کارت‌ها در حال حاضر وجود ندارد.
        </div>

        <div
          className="cd-actions"
          style={{
            marginTop: 12,
          }}
        >
          <Link
            className="btn btn-light"
            to={
              `/dashboard/${roleSafe}`
            }
          >
            بازگشت
          </Link>
        </div>
      </div>
    );
  }


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

      <div
        className="cd-actions"
        style={{
          marginBottom: 12,
          gap: 8,
        }}
      >

        <button
          type="button"
          className="btn btn-outline"
          onClick={() =>
            window.print()
          }
          disabled={
            mergedOkCards.length ===
            0
          }
          title={
            mergedOkCards.length ===
            0
              ? "هیچ کارت آماده‌ای برای چاپ وجود ندارد"
              : ""
          }
        >
          چاپ همه کارت‌های آماده
        </button>


        <Link
          className="btn btn-light"
          to={
            `/dashboard/${roleSafe}`
          }
        >
          بازگشت
        </Link>

      </div>


      {(pendingCards.length >
        0 ||
        errorCards.length >
          0) && (
        <div
          className="cd-note"
          style={{
            marginBottom: 12,
          }}
        >
          <div>
            کارت‌های آماده:{" "}
            <strong>
              {toFa(
                mergedOkCards.length
              )}
            </strong>

            {" | "}

            در انتظار پرداخت/تأیید:{" "}
            <strong>
              {toFa(
                pendingCards.length
              )}
            </strong>

            {" | "}

            خطادار:{" "}
            <strong>
              {toFa(
                errorCards.length
              )}
            </strong>
          </div>


          {pendingCards.length >
            0 && (
            <div
              className="cd-muted"
              style={{
                marginTop: 6,
              }}
            >
              پس از پرداخت یا تأیید نهایی ثبت‌نام، کارت مربوطه قابل چاپ خواهد بود.
            </div>
          )}

        </div>
      )}


      {items.length === 0 ? (
        <div className="cd-muted">
          هیچ آیتمی یافت نشد.
        </div>
      ) : (
        <>
          {pendingCards.map(
            (item) => (
              <PendingCard
                key={`p-${item.id}`}
                id={
                  item.id
                }
                message={
                  item.message
                }
              />
            )
          )}


          {errorCards.map(
            (item) => (
              <ErrorCard
                key={`e-${item.id}`}
                id={
                  item.id
                }
                message={
                  item.message
                }
              />
            )
          )}


          {mergedOkCards.map(
            (
              item,
              index
            ) => (
              <CardView
                key={`ok-${item.id}-${index}`}
                data={
                  item.data
                }
              />
            )
          )}
        </>
      )}

    </div>
  );
}