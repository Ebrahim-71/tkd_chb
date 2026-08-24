// src/components/homepage/heder/header.js

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  apiFetchSilent,
} from "../../../api/apiClient";

import "./header.css";

import logo from "../../../assets/img/logo.png";
import defaultHeroBackground from "../../../assets/img/panelback.png";


const API_BASE =
  "https://api.chbtkd.ir";


const getMediaUrl = (url) => {
  if (!url) {
    return "";
  }

  const value =
    String(url).trim();

  if (
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }

  return `${API_BASE}${value}`;
};


const Header = () => {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const isHome =
    location.pathname === "/";


  /* =====================================================
     HERO SLIDES
     3 عکس اول اسلایدر برای هدر
  ===================================================== */

  const [
    heroSlides,
    setHeroSlides,
  ] = useState([
    defaultHeroBackground,
  ]);

  const [
    activeSlide,
    setActiveSlide,
  ] = useState(0);


  useEffect(() => {

    const controller =
      new AbortController();


    const loadSlides =
      async () => {

        try {

          const response =
            await apiFetchSilent(
              `${API_BASE}/api/header-background/`,
              {
                method: "GET",

                headers: {
                  Accept:
                    "application/json",
                },

                signal:
                  controller.signal,
              }
            );


          if (
            controller.signal.aborted
          ) {
            return;
          }


          if (!response?.ok) {

            console.warn(
              "HEADER_SLIDES_HTTP_ERROR",
              response?.status
            );

            return;
          }


          const data =
            await response.json();


          if (
            !Array.isArray(data)
          ) {

            console.warn(
              "HEADER_SLIDES_INVALID_RESPONSE",
              data
            );

            return;
          }


          const slides =
            data
              .map(
                (item) =>
                  getMediaUrl(
                    item?.background_image
                  )
              )
              .filter(Boolean)
              .slice(0, 3);


          if (
            slides.length > 0
          ) {

            setHeroSlides(
              slides
            );

            setActiveSlide(
              0
            );

          } else {

            setHeroSlides([
              defaultHeroBackground,
            ]);

          }


        } catch (error) {

          if (
            controller.signal.aborted ||
            error?.name === "AbortError" ||
            error?.name === "CanceledError" ||
            error?.code === "ERR_CANCELED"
          ) {
            return;
          }


          console.warn(
            "HEADER_SLIDES_LOAD_ERROR",
            error
          );


          setHeroSlides([
            defaultHeroBackground,
          ]);

        }

      };


    loadSlides();


    return () => {
      controller.abort();
    };

  }, []);


  /* =====================================================
     AUTO SLIDE
  ===================================================== */

  useEffect(() => {
    if (
      !Array.isArray(heroSlides) ||
      heroSlides.length <= 1
    ) {
      return undefined;
    }

    const interval =
      setInterval(() => {
        setActiveSlide((prev) =>
          prev + 1 >=
          heroSlides.length
            ? 0
            : prev + 1
        );
      }, 4500);

    return () => {
      clearInterval(interval);
    };
  }, [heroSlides]);


  useEffect(() => {
    if (
      activeSlide >=
      heroSlides.length
    ) {
      setActiveSlide(0);
    }
  }, [
    activeSlide,
    heroSlides,
  ]);


  /* =====================================================
     Navigation
  ===================================================== */

  const goHome = () => {
    if (isHome) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      return;
    }

    navigate("/");
  };


  const scrollHomeSection = (
    id
  ) => {
    const scroll =
      () => {
        const element =
          document.getElementById(
            id
          );

        if (element) {
          element.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      };

    if (isHome) {
      scroll();
    } else {
      navigate("/");
      setTimeout(scroll, 350);
    }
  };


  const handleCompetitionsClick =
    () => {
      scrollHomeSection(
        "active-competitions"
      );
    };

  const handlePanelClick =
    () => {
      scrollHomeSection(
        "tkd-quick-access"
      );
    };


  const slideDots =
    useMemo(
      () =>
        heroSlides.map(
          (_, index) => (
            <button
              key={index}
              type="button"
              className={
                index ===
                activeSlide
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setActiveSlide(index)
              }
              aria-label={`slide ${index + 1}`}
            />
          )
        ),
      [
        heroSlides,
        activeSlide,
      ]
    );


  return (
    <header
      className={`main-site-header ${
        isHome
          ? "main-site-header--home"
          : "main-site-header--inner"
      }`}
    >
      {/* ===============================================
          NAV
      =============================================== */}

      <div className="header-nav-shell">
        <div className="header-nav">
          <button
            type="button"
            className="header-brand"
            onClick={goHome}
          >
            <img
              src={logo}
              alt="هیئت تکواندو چهارمحال و بختیاری"
              className="header-brand-logo"
            />

            <div className="header-brand-text">
              <strong>
                سامانه جامع تکواندو
              </strong>
              <span>
                هیئت تکواندو استان
              </span>
            </div>
          </button>

          <nav
            className="header-menu"
            aria-label="منوی اصلی"
          >
            <button
              type="button"
              className={
                isHome
                  ? "active"
                  : ""
              }
              onClick={goHome}
            >
              خانه
            </button>

            <button
              type="button"
              onClick={
                handleCompetitionsClick
              }
            >
              مسابقات
            </button>

            <button
              type="button"
              onClick={() =>
                scrollHomeSection(
                  "home-news"
                )
              }
            >
              اخبار
            </button>

            <button
              type="button"
              onClick={() =>
                scrollHomeSection(
                  "tkd-quick-access"
                )
              }
            >
              پنل کاربران
            </button>

            <button
              type="button"
              onClick={() =>
                scrollHomeSection(
                  "site-footer"
                )
              }
            >
              تماس با ما
            </button>
          </nav>

          <div
            className="header-menu-mark"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>


      {/* ===============================================
          HERO
      =============================================== */}

      <div className="header-hero">
        <div className="header-hero-slides">
          {heroSlides.map(
            (image, index) => (
              <div
                key={`${image}-${index}`}
                className={`header-hero-slide ${
                  index ===
                  activeSlide
                    ? "is-active"
                    : ""
                }`}
                style={{
                  backgroundImage: `url("${image}")`,
                }}
              />
            )
          )}
        </div>

        <div
          className="header-hero-overlay"
          aria-hidden="true"
        />

        <div className="header-hero-inner">
          <div className="header-hero-content">
            <span className="header-hero-kicker">
              سامانه جامع
            </span>

            <h1>
              تکواندو
            </h1>

            <p>
              مدیریت هوشمند مسابقات، ثبت‌نام ورزشکاران
              <br />
              و ارائه خدمات دیجیتال به جامعه تکواندو
            </p>

            {isHome && (
              <div className="header-hero-actions">
                <button
                  type="button"
                  className="header-btn header-btn-primary"
                  onClick={
                    handleCompetitionsClick
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect
                      x="4"
                      y="5"
                      width="16"
                      height="15"
                      rx="2"
                    />
                    <path d="M8 3v4M16 3v4M4 10h16" />
                  </svg>

                  مشاهده مسابقات
                </button>

                <button
                  type="button"
                  className="header-btn header-btn-secondary"
                  onClick={
                    handlePanelClick
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="8"
                      r="4"
                    />
                    <path d="M5 21c.7-5 3-7 7-7s6.3 2 7 7" />
                  </svg>

                  ورود به پنل کاربری
                </button>
              </div>
            )}
          </div>


          {/* لوگوی کنار هدر */}
          <div className="header-side-logo">
            <div className="header-side-logo-ring">
              <img
                src={logo}
                alt="لوگوی هیئت تکواندو"
              />
            </div>

            <strong>
              هیئت تکواندو
            </strong>

            <span>
              چهارمحال و بختیاری
            </span>
          </div>
        </div>


        {/* dots */}
        {heroSlides.length > 1 && (
          <div className="header-hero-dots">
            {slideDots}
          </div>
        )}
      </div>
    </header>
  );
};


export default Header;