// src/components/Login/panel/maincontentpanel/ChangeCoachClubs.jsx

import React, {
  useEffect,
  useState,
} from "react";

import axios from "axios";

import {
  useNavigate,
} from "react-router-dom";

import PaginatedList from "../../../common/PaginatedList";

import {
  showGlobalMessage,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../../services/globalMessage";

import "./ChangeCoachClubs.css";


const API_BASE =
  "https://api.chbtkd.ir";


const ChangeCoachClubs = () => {
  const navigate =
    useNavigate();


  const [
    allClubs,
    setAllClubs,
  ] = useState([]);


  const [
    selectedClubs,
    setSelectedClubs,
  ] = useState([]);


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    initialLoading,
    setInitialLoading,
  ] = useState(true);


  const maxSelection = 3;


  /* ======================================================
     Unauthorized
  ====================================================== */

  const handleUnauthorized =
    () => {
      const role =
        (
          localStorage.getItem(
            "user_role"
          ) || ""
        )
          .toLowerCase()
          .trim();


      if (role) {
        localStorage.removeItem(
          `${role}_token`
        );
      }


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
    };


  /* ======================================================
     Load clubs
  ====================================================== */

  useEffect(() => {
    const controller =
      new AbortController();


    const fetchData =
      async () => {
        setInitialLoading(
          true
        );


        try {
          const role =
            (
              localStorage.getItem(
                "user_role"
              ) || ""
            )
              .toLowerCase()
              .trim();


          const token =
            role
              ? localStorage.getItem(
                  `${role}_token`
                )
              : null;


          if (!token) {
            handleUnauthorized();
            return;
          }


          const [
            allResponse,
            mineResponse,
          ] =
            await Promise.all([
              axios.get(
                `${API_BASE}/api/auth/all-clubs/`,
                {
                  headers: {
                    Authorization:
                      `Bearer ${token}`,
                  },

                  signal:
                    controller.signal,

                  /*
                   * چون این فایل خودش خطا را
                   * مدیریت می‌کند، interceptor
                   * نباید Modal تکراری بسازد.
                   */
                  skipGlobalError:
                    true,
                }
              ),

              axios.get(
                `${API_BASE}/api/auth/coach/clubs/`,
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
              ),
            ]);


          const allClubsData =
            Array.isArray(
              allResponse?.data
            )
              ? allResponse.data
              : [];


          const myClubsData =
            Array.isArray(
              mineResponse?.data
            )
              ? mineResponse.data
              : [];


          const mineIds =
            myClubsData
              .map(
                (club) =>
                  club?.id
              )
              .filter(
                (id) =>
                  id !== null &&
                  id !== undefined
              );


          /*
           * باشگاه‌های فعلی مربی
           * ابتدا نمایش داده می‌شوند.
           */
          const sorted = [
            ...allClubsData.filter(
              (club) =>
                mineIds.includes(
                  club.id
                )
            ),

            ...allClubsData.filter(
              (club) =>
                !mineIds.includes(
                  club.id
                )
            ),
          ];


          setAllClubs(
            sorted
          );


          setSelectedClubs(
            mineIds
          );

        } catch (error) {
          if (
            axios.isCancel(
              error
            ) ||
            error?.code ===
              "ERR_CANCELED" ||
            error?.name ===
              "CanceledError"
          ) {
            return;
          }


          console.error(
            "CHANGE_COACH_CLUBS_LOAD_ERROR",
            error
          );


          if (
            error?.response
              ?.status === 401
          ) {
            handleUnauthorized();
            return;
          }


          showGlobalMessage({
            type: "error",

            title:
              "خطا در دریافت باشگاه‌ها",

            message:
              error?.response
                ?.data
                ?.detail ||
              error?.response
                ?.data
                ?.message ||
              error?.message ||
              "اطلاعات باشگاه‌ها از سرور دریافت نشد.",
          });

        } finally {
          setInitialLoading(
            false
          );
        }
      };


    fetchData();


    return () => {
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /* ======================================================
     Select / deselect
  ====================================================== */

  const toggleClub = (
    clubId
  ) => {
    setSelectedClubs(
      (previous) => {
        if (
          previous.includes(
            clubId
          )
        ) {
          return previous.filter(
            (id) =>
              id !== clubId
          );
        }


        if (
          previous.length <
          maxSelection
        ) {
          return [
            ...previous,
            clubId,
          ];
        }


        showGlobalWarning(
          "حداکثر ۳ باشگاه را می‌توانید انتخاب کنید.",
          "حداکثر تعداد باشگاه"
        );


        return previous;
      }
    );
  };


  /* ======================================================
     Submit
  ====================================================== */

  const handleSubmit =
    async () => {
      if (
        selectedClubs.length >
        maxSelection
      ) {
        showGlobalWarning(
          "حداکثر ۳ باشگاه را می‌توانید انتخاب کنید.",
          "تعداد باشگاه نامعتبر است"
        );

        return;
      }


      try {
        setLoading(
          true
        );


        const role =
          (
            localStorage.getItem(
              "user_role"
            ) || ""
          )
            .toLowerCase()
            .trim();


        const token =
          role
            ? localStorage.getItem(
                `${role}_token`
              )
            : null;


        if (!token) {
          handleUnauthorized();
          return;
        }


        await axios.patch(
          `${API_BASE}/api/auth/coach/update-clubs/`,
          {
            coaching_clubs:
              selectedClubs,
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


        showGlobalSuccess(
          "باشگاه‌های مربی با موفقیت به‌روزرسانی شدند.",
          "ذخیره موفق"
        );

      } catch (error) {
        console.error(
          "CHANGE_COACH_CLUBS_SAVE_ERROR",
          error
        );


        if (
          error?.response
            ?.status === 401
        ) {
          handleUnauthorized();
          return;
        }


        const data =
          error?.response
            ?.data;


        let message =
          data?.detail ||
          data?.message ||
          data?.error ||
          error?.message ||
          "خطا در ذخیره باشگاه‌ها.";


        if (
          Array.isArray(
            data?.coaching_clubs
          )
        ) {
          message =
            data.coaching_clubs
              .filter(Boolean)
              .map(String)
              .join(" ");
        }


        showGlobalMessage({
          type: "error",

          title:
            "خطا در ذخیره باشگاه‌ها",

          message,
        });

      } finally {
        setLoading(
          false
        );
      }
    };


  /* ======================================================
     UI
  ====================================================== */

  return (
    <div className="change-coach-clubs">

      <h2>
        تغییر باشگاه‌های مربی
      </h2>


      {initialLoading ? (
        <div>
          در حال دریافت باشگاه‌ها...
        </div>
      ) : (
        <>
          <div className="clubs-header">

            <div>
              نام باشگاه
            </div>

            <div>
              نام موسس
            </div>

            <div>
              انتخاب
            </div>

          </div>


          <PaginatedList
            items={
              allClubs
            }
            itemsPerPage={
              10
            }
            renderItem={(
              club
            ) => (
              <div
                className="club-row"
                key={
                  club.id
                }
              >

                <div>
                  {club.club_name}
                </div>


                <div>
                  {club.founder_name}
                </div>


                <div>

                  <input
                    type="checkbox"
                    checked={
                      selectedClubs.includes(
                        club.id
                      )
                    }
                    onChange={() =>
                      toggleClub(
                        club.id
                      )
                    }
                    disabled={
                      loading
                    }
                  />

                </div>

              </div>
            )}
          />


          <div className="submit-wrapper">

            <button
              type="button"
              className="confirm-btn"
              onClick={
                handleSubmit
              }
              disabled={
                loading
              }
            >
              {loading
                ? "در حال ذخیره..."
                : "تأیید"}
            </button>

          </div>
        </>
      )}

    </div>
  );
};


export default ChangeCoachClubs;