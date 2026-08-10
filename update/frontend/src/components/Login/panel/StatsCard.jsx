// src/components/Login/panel/StatsCard.jsx

import React, {
  useEffect,
  useState,
  useRef,
} from "react";

import axios from "axios";
import { useNavigate } from "react-router-dom";

import "./dashboard.css";

import {
  showGlobalError,
  showGlobalWarning,
} from "../../../services/globalMessage";


const API_BASE =
  "https://api.chbtkd.ir";


const StatsCard = () => {
  const [stats, setStats] =
    useState(null);

  const scrollRef =
    useRef(null);

  const navigate =
    useNavigate();

  const [
    canScrollLeft,
    setCanScrollLeft,
  ] = useState(false);

  const [
    canScrollRight,
    setCanScrollRight,
  ] = useState(true);


  // ==============================
  // دریافت آمار پنل
  // ==============================

  useEffect(() => {
    const controller =
      new AbortController();

    const loadStats =
      async () => {
        const role =
          localStorage.getItem(
            "user_role"
          );

        const token =
          role
            ? localStorage.getItem(
                `${role}_token`
              )
            : null;


        if (!role || !token) {
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
              `${API_BASE}/api/auth/dashboard/${role}/`,
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },

                signal:
                  controller.signal,

                // خطا در همین فایل
                // مدیریت می‌شود تا
                // Global Axios Interceptor
                // پیام را دوبار نمایش ندهد.
                skipGlobalError: true,
              }
            );


          setStats(
            res?.data || {}
          );

        } catch (err) {
          // لغو درخواست هنگام
          // خارج شدن از صفحه
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
            "STATS_LOAD_ERROR",
            err
          );


          if (
            err?.response?.status ===
            401
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
                "خطا در دریافت آمار پنل",
            }
          );
        }
      };


    loadStats();


    return () => {
      controller.abort();
    };
  }, [navigate]);


  // ==============================
  // کنترل اسکرول کارت‌ها
  // ==============================

  const updateScrollButtons =
    () => {
      const el =
        scrollRef.current;

      if (!el) {
        return;
      }


      setCanScrollLeft(
        el.scrollLeft > 0
      );


      setCanScrollRight(
        el.scrollLeft +
          el.clientWidth <
          el.scrollWidth - 5
      );
    };


  const scroll = (offset) => {
    const el =
      scrollRef.current;

    if (!el) {
      return;
    }


    el.scrollBy({
      left: offset,
      behavior: "smooth",
    });
  };


  useEffect(() => {
    const el =
      scrollRef.current;

    if (!el) {
      return undefined;
    }


    el.addEventListener(
      "scroll",
      updateScrollButtons
    );


    updateScrollButtons();


    return () => {
      el.removeEventListener(
        "scroll",
        updateScrollButtons
      );
    };
  }, [stats]);


  // ==============================
  // Loading
  // ==============================

  if (!stats) {
    return (
      <p className="loading-text">
        در حال بارگذاری...
      </p>
    );
  }


  // ==============================
  // کارت‌های ثابت بر اساس نقش
  // ==============================

  const staticCards = [];


  // هیئت
  if (
    stats.role === "heyat"
  ) {
    staticCards.push(
      {
        title: "بازیکن",
        emoji: "👥",
        value:
          stats.student_count,
        bg: "#f3e5f5",
      },
      {
        title: "مربی",
        emoji: "👨‍🏫",
        value:
          stats.coach_count,
        bg: "#e8f5e9",
      },
      {
        title: "داور",
        emoji: "🧑‍⚖️",
        value:
          stats.referee_count,
        bg: "#fbe9e7",
      },
      {
        title: "باشگاه‌ها",
        emoji: "🏟️",
        value:
          stats.club_count,
        bg: "#e3f2fd",
      }
    );
  }


  // باشگاه
  if (
    stats.role === "club"
  ) {
    staticCards.push(
      {
        title: "نام موسس",
        emoji: "👤",
        value:
          stats.founder_name,
        bg: "#fce4ec",
      },
      {
        title: "شاگردان",
        emoji: "👥",
        value:
          stats.student_count,
        bg: "#e1f5fe",
      },
      {
        title: "مربی‌ها",
        emoji: "👨‍🏫",
        value:
          stats.coach_count,
        bg: "#ffe0b2",
      }
    );
  }


  // بازیکن / مربی / داور
  if (
    [
      "player",
      "coach",
      "referee",
      "both",
    ].includes(stats.role)
  ) {
    staticCards.push(
      {
        title: "مربی",
        emoji: "👨‍🏫",
        value:
          stats.coach_name,
        bg: "#fce4ec",
      },
      {
        title: "کمربند",
        emoji: "🥋",
        value:
          stats.belt_grade,
        bg: "#ede7f6",
      }
    );


    if (
      [
        "coach",
        "both",
      ].includes(stats.role)
    ) {
      staticCards.push(
        {
          title: "شاگردان",
          emoji: "👥",
          value:
            stats.student_count,
          bg: "#e1f5fe",
        },
        {
          title: "باشگاه‌ها",
          emoji: "🏟️",
          value:
            stats.coaching_clubs_count,
          bg: "#ffe0b2",
        }
      );
    }
  }


  // ==============================
  // کارت‌های آماری
  // ==============================

  const dynamicCards = [
    {
      title: "طلای استانی",
      emoji: "🥇",
      value:
        stats.gold_medals,
      bg: "#fff3e0",
    },
    {
      title: "نقره استانی",
      emoji: "🥈",
      value:
        stats.silver_medals,
      bg: "#eeeeee",
    },
    {
      title: "برنز استانی",
      emoji: "🥉",
      value:
        stats.bronze_medals,
      bg: "#efebe9",
    },

    {
      title: "طلای کشوری",
      emoji: "🥇",
      value:
        stats.gold_medals_country,
      bg: "#fff3e0",
    },
    {
      title: "نقره کشوری",
      emoji: "🥈",
      value:
        stats.silver_medals_country,
      bg: "#eeeeee",
    },
    {
      title: "برنز کشوری",
      emoji: "🥉",
      value:
        stats.bronze_medals_country,
      bg: "#efebe9",
    },

    {
      title: "طلای جهانی",
      emoji: "🥇",
      value:
        stats.gold_medals_int,
      bg: "#fff3e0",
    },
    {
      title: "نقره جهانی",
      emoji: "🥈",
      value:
        stats.silver_medals_int,
      bg: "#eeeeee",
    },
    {
      title: "برنز جهانی",
      emoji: "🥉",
      value:
        stats.bronze_medals_int,
      bg: "#efebe9",
    },

    {
      title: "امتیاز مسابقه",
      emoji: "🎯",
      value:
        stats.ranking_competition,
      bg: "#f3e5f5",
    },
    {
      title: "امتیاز کل",
      emoji: "🌟",
      value:
        stats.ranking_total,
      bg: "#e8eaf6",
    },

    {
      title: "مسابقات",
      emoji: "🎽",
      value:
        stats.match_count,
      bg: "#e0f2f1",
    },
    {
      title: "سمینارها",
      emoji: "🎓",
      value:
        stats.seminar_count,
      bg: "#fff8e1",
    },
  ];


  // کارت‌های صفر یا بدون مقدار
  // نمایش داده نشوند
  const filteredDynamic =
    dynamicCards.filter(
      (card) =>
        card.value !== null &&
        card.value !==
          undefined &&
        Number(card.value) !== 0
    );


  const cardsToShow = [
    ...staticCards,
    ...filteredDynamic,
  ];


  // ==============================
  // Render
  // ==============================

  return (
    <div className="stats-section">

      <button
        type="button"
        className="scroll-btn left"
        onClick={() => scroll(-200)}
        disabled={!canScrollLeft}
        aria-label="مشاهده کارت‌های قبلی"
      >
        ❯
      </button>

      <div
        className="stats-carousel"
        ref={scrollRef}
      >
        {cardsToShow.map((card, index) => (
          <div
            key={`${card.title}-${index}`}
            className="carousel-card"
            style={{
              backgroundColor: card.bg,
            }}
          >
            <div className="emoji">
              {card.emoji || ""}
            </div>

            <div className="title">
              {card.title}
            </div>

            <div className="value">
              {card.value ?? "-"}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="scroll-btn right"
        onClick={() => scroll(200)}
        disabled={!canScrollRight}
        aria-label="مشاهده کارت‌های بعدی"
      >
        ❮
      </button>

    </div>
  );
};


export default StatsCard;