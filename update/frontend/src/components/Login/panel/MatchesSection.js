// src/components/Login/panel/MatchesSection.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import PaginatedList from "../../common/PaginatedList";
import MatchCard from "./maincontentpanel/MatchCard";
import CoachAgreementFlow from "../competitions/CoachAgreementFlow";

import {
  getCompetitionsForRole,
} from "../../../api/competitions";

import {
  showGlobalMessage,
} from "../../../services/globalMessage";


/* ======================================================
   Helpers
====================================================== */

function getUserRoles() {
  const raw =
    String(
      localStorage.getItem(
        "user_role"
      ) || ""
    ).toLowerCase();


  const parts =
    raw
      .split(/[,\s]+/)
      .filter(Boolean);


  const roles =
    new Set(parts);


  if (
    roles.has("both")
  ) {
    roles.add("player");
    roles.add("coach");
    roles.delete("both");
  }


  return Array.from(
    roles
  );
}


function roleForPath(
  roles
) {
  if (
    roles.includes(
      "coach"
    )
  ) {
    return "coach";
  }


  if (
    roles.includes(
      "referee"
    )
  ) {
    return "referee";
  }


  if (
    roles.includes(
      "club"
    )
  ) {
    return "club";
  }


  if (
    roles.includes(
      "heyat"
    )
  ) {
    return "heyat";
  }


  if (
    roles.includes(
      "board"
    )
  ) {
    return "board";
  }


  if (
    roles.includes(
      "player"
    )
  ) {
    return "player";
  }


  return "guest";
}


const isClubLike = (
  roles
) =>
  roles.some(
    (role) =>
      [
        "club",
        "heyat",
        "board",
      ].includes(
        String(role)
          .toLowerCase()
      )
  );


function isKyorugi(
  competition
) {
  const style =
    String(
      competition
        ?.style_display ||
      competition?.style ||
      ""
    ).toLowerCase();


  return (
    style.includes(
      "kyorugi"
    ) ||
    style.includes(
      "کیوروگی"
    )
  );
}


function isPoomsae(
  competition
) {
  const style =
    String(
      competition
        ?.style_display ||
      competition?.style ||
      ""
    ).toLowerCase();


  return (
    style.includes(
      "poomsae"
    ) ||
    style.includes(
      "پومسه"
    )
  );
}


const getErrorStatus = (
  error
) =>
  error?.status ||
  error?.response?.status ||
  error?.payload?.status ||
  null;


const getErrorMessage = (
  error,
  fallback
) => {
  const data =
    error?.payload ||
    error?.response?.data ||
    error?.data ||
    null;


  if (
    typeof data ===
      "string" &&
    data.trim()
  ) {
    return data.trim();
  }


  const direct =
    data?.detail ||
    data?.message ||
    data?.error;


  if (
    typeof direct ===
      "string" &&
    direct.trim()
  ) {
    return direct.trim();
  }


  if (
    Array.isArray(
      direct
    ) &&
    direct.length
  ) {
    return direct
      .filter(Boolean)
      .map(String)
      .join("\n");
  }


  if (
    error?.message &&
    typeof error.message ===
      "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }


  return fallback;
};


/* ======================================================
   Component
====================================================== */

const MatchesSection = () => {
  const navigate =
    useNavigate();


  const roles =
    useMemo(
      () =>
        getUserRoles(),
      []
    );


  const rolePath =
    useMemo(
      () =>
        roleForPath(
          roles
        ),
      [roles]
    );


  /*
   * نقش واقعی ذخیره‌شده؛
   * ممکن است both باشد.
   */
  const storedRole =
    useMemo(() => {
      const raw =
        String(
          localStorage.getItem(
            "user_role"
          ) || ""
        ).toLowerCase();


      const allowed = [
        "coach",
        "player",
        "referee",
        "club",
        "heyat",
        "board",
        "both",
      ];


      return allowed.includes(
        raw
      )
        ? raw
        : "player";
    }, []);


  const [
    matches,
    setMatches,
  ] = useState([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);


  const [
    showTermsModal,
    setShowTermsModal,
  ] = useState(false);


  const [
    selectedMatch,
    setSelectedMatch,
  ] = useState(null);


  const isMobile =
    typeof window !==
      "undefined"
      ? window.innerWidth <=
        768
      : false;


  /* ====================================================
     Unauthorized
  ==================================================== */

  const handleUnauthorized =
    useCallback(() => {
      const currentRole =
        String(
          localStorage.getItem(
            "user_role"
          ) ||
          storedRole ||
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
        "coach_token"
      );

      localStorage.removeItem(
        "player_token"
      );

      localStorage.removeItem(
        "both_token"
      );

      localStorage.removeItem(
        "access_token"
      );

      localStorage.removeItem(
        "access"
      );

      localStorage.removeItem(
        "auth_token"
      );

      localStorage.removeItem(
        "token"
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
    }, [
      navigate,
      storedRole,
    ]);


  /* ====================================================
     Navigation
  ==================================================== */

  const pushToDetails = (
    slug,
    options = {}
  ) => {
    if (!slug) {
      return;
    }


    const base =
      `/dashboard/${encodeURIComponent(
        storedRole
      )}/competitions/${encodeURIComponent(
        slug
      )}`;


    navigate(
      options.view ===
        "details"
        ? `${base}?view=details`
        : base
    );
  };


  /* ====================================================
     Details click
  ==================================================== */

  const handleDetailsClick = (
    competition
  ) => {
    if (
      !competition
        ?.public_id
    ) {
      showGlobalMessage({
        type: "warning",

        title:
          "شناسه مسابقه موجود نیست",

        message:
          "شناسه عمومی این مسابقه در دسترس نیست.",
      });

      return;
    }


    const coachLike =
      roles.includes(
        "coach"
      ) ||
      roles.includes(
        "both"
      );


    const refereeOrClubLike =
      roles.includes(
        "referee"
      ) ||
      isClubLike(
        roles
      );


    /*
     * مربی:
     * برای کیوروگی و پومسه
     * ابتدا Flow تعهدنامه.
     */
    if (
      coachLike &&
      (
        isKyorugi(
          competition
        ) ||
        isPoomsae(
          competition
        )
      )
    ) {
      setSelectedMatch(
        competition
      );

      setShowTermsModal(
        true
      );

      return;
    }


    /*
     * داور / باشگاه / هیئت
     */
    if (
      refereeOrClubLike
    ) {
      pushToDetails(
        competition.public_id,
        {
          view:
            "details",
        }
      );

      return;
    }


    /*
     * بازیکن / سایر
     */
    pushToDetails(
      competition.public_id
    );
  };


  /* ====================================================
     Agreement modal
  ==================================================== */

  const handleModalCancel =
    () => {
      setShowTermsModal(
        false
      );

      setSelectedMatch(
        null
      );
    };


  const handleModalDone = (
    slugFromChild
  ) => {
    const competitionSlug =
      slugFromChild ||
      selectedMatch
        ?.public_id;


    setShowTermsModal(
      false
    );


    setSelectedMatch(
      null
    );


    if (
      competitionSlug
    ) {
      pushToDetails(
        competitionSlug
      );
    }
  };


  /* ====================================================
     Load competitions
  ==================================================== */

  useEffect(() => {
    let alive = true;


    const load =
      async () => {
        setLoading(true);

        setLoadFailed(
          false
        );


        try {
          let data =
            await getCompetitionsForRole(
              rolePath
            );


          if (!alive) {
            return;
          }


          data =
            Array.isArray(
              data
            )
              ? data
              : [];


          const getTime =
            (
              competition
            ) => {
              const date =
                competition
                  ?.created_at ||
                competition
                  ?.competition_date ||
                competition
                  ?.start_date ||
                competition
                  ?.event_date ||
                null;


              const timestamp =
                date
                  ? Date.parse(
                      date
                    )
                  : NaN;


              return Number.isNaN(
                timestamp
              )
                ? -Infinity
                : timestamp;
            };


          /*
           * مسابقات جدیدتر اول
           */
          data.sort(
            (a, b) => {
              const timeB =
                getTime(b);

              const timeA =
                getTime(a);


              if (
                timeB !==
                timeA
              ) {
                return (
                  timeB -
                  timeA
                );
              }


              return (
                (b?.id ??
                  0) -
                (a?.id ??
                  0)
              );
            }
          );


          setMatches(
            data
          );

        } catch (error) {
          if (!alive) {
            return;
          }


          console.error(
            "MATCHES_SECTION_LOAD_ERROR",
            error
          );


          setMatches(
            []
          );


          const status =
            getErrorStatus(
              error
            );


          if (
            status === 401
          ) {
            handleUnauthorized();

            return;
          }


          setLoadFailed(
            true
          );


          showGlobalMessage({
            type: "error",

            title:
              "خطا در دریافت مسابقات",

            message:
              getErrorMessage(
                error,
                "لیست مسابقات از سرور دریافت نشد."
              ),
          });

        } finally {
          if (alive) {
            setLoading(
              false
            );
          }
        }
      };


    load();


    return () => {
      alive = false;
    };

  }, [
    rolePath,
    handleUnauthorized,
  ]);


  /* ====================================================
     UI
  ==================================================== */

  return (
    <div
      style={{
        padding:
          "2rem",
      }}
      dir="rtl"
    >

      <h2>
        مسابقات
      </h2>


      {loading ? (
        <div>
          در حال بارگذاری…
        </div>

      ) : loadFailed ? (
        <div>
          امکان دریافت مسابقات در حال حاضر وجود ندارد.
        </div>

      ) : matches.length ===
        0 ? (
        <div>
          مسابقه‌ای یافت نشد.
        </div>

      ) : (
        <PaginatedList
          items={
            matches
          }
          itemsPerPage={
            4
          }
          renderItem={(
            item,
            index
          ) => (
            <div
              key={
                item.public_id ||
                item.id ||
                index
              }
              style={{
                width:
                  isMobile
                    ? "90%"
                    : "100%",

                margin:
                  "10px 20px",

                display:
                  "inline-flex",

                flexDirection:
                  "column",
              }}
            >
              <MatchCard
                match={
                  item
                }
                onDetailsClick={() =>
                  handleDetailsClick(
                    item
                  )
                }
              />
            </div>
          )}
        />
      )}


      {/* ===============================================
          مودال تعهدنامه
          این Modal عمداً باقی می‌ماند.
      =============================================== */}

      {showTermsModal &&
        selectedMatch && (
        <CoachAgreementFlow
          competition={
            selectedMatch
          }
          onDone={
            handleModalDone
          }
          onCancel={
            handleModalCancel
          }
        />
      )}

    </div>
  );
};


export default MatchesSection;