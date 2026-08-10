// src/components/Login/panel/Sidebar.jsx

import React, {
  useEffect,
  useState,
} from "react";

import axios from "axios";
import { useNavigate } from "react-router-dom";

import placeholderImage from "../../../assets/img/avatar-placeholder.png";

import {
  showGlobalError,
  showGlobalWarning,
} from "../../../services/globalMessage";

import "./dashboard.css";


const API_BASE =
  "https://api.chbtkd.ir";


// ==============================
// عنوان فارسی نقش‌ها
// ==============================

const getRoleInPersian = (role) => {
  switch (role) {
    case "player":
      return "بازیکن";

    case "coach":
      return "مربی";

    case "referee":
      return "داور";

    case "both":
      return "مربی و داور";

    case "club":
      return "باشگاه";

    case "heyat":
      return "هیئت";

    default:
      return "کاربر";
  }
};


// ==============================
// منوهای هر نقش
// ==============================

const menuItemsByRole = {
  player: [
    {
      key: "profile",
      label: "اطلاعات کاربر",
    },
    {
      key: "matches",
      label: "مسابقات",
    },
    {
      key: "exams",
      label: "آزمون‌ها",
    },
    {
      key: "courses",
      label: "دوره‌های آموزشی",
    },
    {
      key: "circulars",
      label: "بخشنامه‌ها",
    },
    {
      key: "news",
      label: "اخبار استان و شهرستان",
    },
  ],

  coach: [
    {
      key: "profile",
      label: "اطلاعات کاربر",
    },
    {
      key: "matches",
      label: "مسابقات",
    },
    {
      key: "exams",
      label: "آزمون‌ها",
    },
    {
      key: "courses",
      label: "دوره‌های آموزشی",
    },
    {
      key: "students",
      label: "شاگردان",
    },
    {
      key: "club-change",
      label: "تغییر باشگاه",
    },
    {
      key: "club-requests",
      label: "درخواست‌های باشگاه",
    },
    {
      key: "circulars",
      label: "بخشنامه‌ها",
    },
    {
      key: "news",
      label: "اخبار استان و شهرستان",
    },
  ],

  referee: [
    {
      key: "profile",
      label: "اطلاعات کاربر",
    },
    {
      key: "matches",
      label: "مسابقات",
    },
    {
      key: "exams",
      label: "آزمون‌ها",
    },
    {
      key: "courses",
      label: "دوره‌های آموزشی",
    },
    {
      key: "circulars",
      label: "بخشنامه‌ها",
    },
    {
      key: "news",
      label: "اخبار استان و شهرستان",
    },
  ],

  both: [
    {
      key: "profile",
      label: "اطلاعات کاربر",
    },
    {
      key: "matches",
      label: "مسابقات",
    },
    {
      key: "exams",
      label: "آزمون‌ها",
    },
    {
      key: "courses",
      label: "دوره‌های آموزشی",
    },
    {
      key: "students",
      label: "شاگردان",
    },
    {
      key: "club-change",
      label: "تغییر باشگاه",
    },
    {
      key: "club-requests",
      label: "درخواست‌های باشگاه",
    },
    {
      key: "circulars",
      label: "بخشنامه‌ها",
    },
    {
      key: "news",
      label: "اخبار استان و شهرستان",
    },
  ],

  club: [
    {
      key: "matches",
      label: "مسابقات",
    },
    {
      key: "exams",
      label: "آزمون‌ها",
    },
    {
      key: "courses",
      label: "دوره‌های آموزشی",
    },
    {
      key: "club-coaches",
      label: "مربیان باشگاه",
    },
    {
      key: "club-students",
      label: "شاگردان باشگاه",
    },
    {
      key: "circulars",
      label: "بخشنامه‌ها",
    },
    {
      key: "news",
      label: "اخبار استان و شهرستان",
    },
  ],

  heyat: [
    {
      key: "matches",
      label: "مسابقات",
    },
    {
      key: "exams",
      label: "آزمون‌ها",
    },
    {
      key: "courses",
      label: "دوره‌های آموزشی",
    },
    {
      key: "students",
      label: "شاگردان",
    },
    {
      key: "heyat-coaches",
      label: "مربی‌ها",
    },
    {
      key: "heyat-referees",
      label: "داوران",
    },
    {
      key: "heyat-clubs",
      label: "باشگاه‌ها",
    },
    {
      key: "circulars",
      label: "بخشنامه‌ها",
    },
    {
      key: "news",
      label: "اخبار استان و شهرستان",
    },
    {
      key: "heyat-create-news",
      label: "ایجاد اخبار هیئت شهرستان",
    },
  ],
};


// ==============================
// کامپوننت Sidebar
// ==============================

const Sidebar = ({
  onLogout,
  onSectionSelect,
  selectedSection,
  className = "",
}) => {
  const [profile, setProfile] =
    useState(null);

  const [
    hasNewClubRequests,
    setHasNewClubRequests,
  ] = useState(false);

  const navigate =
    useNavigate();


  // ==============================
  // دریافت اطلاعات پروفایل Sidebar
  // ==============================

  useEffect(() => {
    const controller =
      new AbortController();


    const loadSidebarData =
      async () => {
        const savedRole =
          localStorage.getItem(
            "user_role"
          );

        const token =
          savedRole
            ? localStorage.getItem(
                `${savedRole}_token`
              )
            : null;


        if (!savedRole || !token) {
          showGlobalWarning(
            "اطلاعات ورود شما یافت نشد. لطفاً دوباره وارد حساب کاربری شوید.",
            "نیاز به ورود مجدد"
          );

          navigate("/");
          return;
        }


        try {
          const res =
            await axios.get(
              `${API_BASE}/api/auth/dashboard/${savedRole}/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                // خطا در همین فایل
                // مدیریت می‌شود.
                skipGlobalError: true,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          const profileData =
            res?.data || {};


          setProfile(
            profileData
          );


          // فقط مربی و both
          // درخواست‌های باشگاه دارند.
          if (
            ![
              "coach",
              "both",
            ].includes(
              profileData.role
            )
          ) {
            setHasNewClubRequests(
              false
            );

            return;
          }


          try {
            const requestsRes =
              await axios.get(
                `${API_BASE}/api/auth/coach/requests/`,
                {
                  headers: {
                    Authorization:
                      `Bearer ${token}`,
                  },

                  signal:
                    controller.signal,

                  skipGlobalError: true,
                }
              );


            if (
              controller.signal
                .aborted
            ) {
              return;
            }


            const requests =
              Array.isArray(
                requestsRes?.data
              )
                ? requestsRes.data
                : [];


            const hasPending =
              requests.some(
                (request) =>
                  request?.status ===
                  "pending"
              );


            setHasNewClubRequests(
              hasPending
            );

          } catch (err) {
            if (
              axios.isCancel(err) ||
              err?.code ===
                "ERR_CANCELED" ||
              err?.name ===
                "CanceledError"
            ) {
              return;
            }


            console.error(
              "SIDEBAR_CLUB_REQUESTS_ERROR",
              err
            );


            if (
              err?.response
                ?.status === 401
            ) {
              localStorage.clear();

              showGlobalWarning(
                "نشست کاربری شما منقضی شده است. لطفاً دوباره وارد شوید.",
                "پایان اعتبار ورود"
              );

              navigate("/");
              return;
            }


            showGlobalError(
              err,
              {
                title:
                  "خطا در دریافت درخواست‌های باشگاه",
              }
            );
          }

        } catch (err) {
          if (
            axios.isCancel(err) ||
            err?.code ===
              "ERR_CANCELED" ||
            err?.name ===
              "CanceledError"
          ) {
            return;
          }


          console.error(
            "SIDEBAR_PROFILE_ERROR",
            err
          );


          if (
            err?.response
              ?.status === 401
          ) {
            localStorage.clear();

            showGlobalWarning(
              "نشست کاربری شما منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",
              "پایان اعتبار ورود"
            );

            navigate("/");
            return;
          }


          showGlobalError(
            err,
            {
              title:
                "خطا در دریافت اطلاعات کاربر",
            }
          );
        }
      };


    loadSidebarData();


    return () => {
      controller.abort();
    };
  }, [navigate]);


  // ==============================
  // خروج از حساب
  // ==============================

  const handleLogout = () => {
    const savedRole =
      localStorage.getItem(
        "user_role"
      );


    if (savedRole) {
      localStorage.removeItem(
        `${savedRole}_token`
      );

      localStorage.removeItem(
        "user_role"
      );
    }


    onLogout?.();
  };


  // ==============================
  // نقش فعلی
  // ==============================

  const role =
    profile?.role ||
    localStorage.getItem(
      "user_role"
    ) ||
    "player";


  // ==============================
  // منوی قابل نمایش
  // ==============================

  const menuItems =
    role === "both"
      ? Array.from(
          new Map(
            [
              ...menuItemsByRole.coach,
              ...menuItemsByRole.referee,
            ].map((item) => [
              item.key,
              item,
            ])
          ).values()
        )
      : menuItemsByRole[role] ||
        [];


  // ==============================
  // نام قابل نمایش کاربر
  // ==============================

  const displayName =
    role === "club" &&
    profile?.club_name
      ? profile.club_name

      : role === "heyat" &&
        profile?.board_name
      ? profile.board_name

      : profile?.full_name ||
        "...";


  // ==============================
  // کلیک روی منو
  // ==============================

  const handleSectionClick = (
    key
  ) => {
    navigate(
      `/dashboard/${encodeURIComponent(
        role
      )}?section=${encodeURIComponent(
        key
      )}`,
      {
        replace: false,
      }
    );


    onSectionSelect?.(
      key
    );
  };


  // ==============================
  // Render
  // ==============================

  return (
    <div
      className={`sidebar ${className}`}
    >
      <div className="sidebar-profile">
        <img
          src={
            profile?.profile_image_url ||
            placeholderImage
          }
          alt="پروفایل"
          className="profile-image"
          onError={(e) => {
            e.currentTarget.src =
              placeholderImage;
          }}
        />


        <div className="profile-info">
          <div className="profile-name">
            {displayName}
          </div>


          <div className="profile-role-logout">
            <span className="role-label">
              {getRoleInPersian(
                role
              )}
            </span>

            <button
              type="button"
              className="logout-btn"
              onClick={
                handleLogout
              }
            >
              خروج
            </button>
          </div>
        </div>
      </div>


      <hr className="sidebar-divider" />


      <ul className="sidebar-menu">
        {menuItems.map(
          (item) => (
            <li
              key={item.key}
              className={
                item.key ===
                selectedSection
                  ? "active"
                  : ""
              }
              onClick={() =>
                handleSectionClick(
                  item.key
                )
              }
            >
              {item.label}


              {item.key ===
                "club-requests" &&
                hasNewClubRequests && (
                  <span className="badge-dot" />
                )}
            </li>
          )
        )}
      </ul>
    </div>
  );
};


export default Sidebar;