// src/components/homepage/main/slider/newsslider.js

import React, {
  useEffect,
  useState,
} from "react";

import Slider from "react-slick";
import { Link } from "react-router-dom";

import {
  apiFetchSilent,
} from "../../../../api/apiClient";

import "./NewsSlider.css";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";


const API_BASE =
  "https://api.chbtkd.ir";


const getImageUrl = (url) => {
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


const NewsSlider = () => {
  const [
    newsList,
    setNewsList,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);


  useEffect(() => {
    const controller =
      new AbortController();


    const loadNews =
      async () => {
        try {
          const response =
            await apiFetchSilent(
              `${API_BASE}/api/news/slider/`,
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


          /*
           * این API فقط محتوای صفحه اصلی را
           * تأمین می‌کند؛ بنابراین خطای HTTP
           * باعث Global Modal نمی‌شود.
           */
          if (!response.ok) {
            console.warn(
              "NEWS_SLIDER_HTTP_ERROR",
              response.status
            );

            setNewsList([]);

            return;
          }


          let data = null;


          try {
            data =
              await response.json();
          } catch (parseError) {
            console.warn(
              "NEWS_SLIDER_PARSE_ERROR",
              parseError
            );

            setNewsList([]);

            return;
          }


          setNewsList(
            Array.isArray(data)
              ? data
              : []
          );

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
            "NEWS_SLIDER_LOAD_ERROR",
            error
          );


          setNewsList([]);

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    loadNews();


    return () => {
      controller.abort();
    };
  }, []);


  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 3000,
    arrows: true,
    cssEase: "linear",
    adaptiveHeight: true,
    fade: false,
  };


  return (
    <div className="news-slider-wrapper">

      <h4>
        اخبار استان و شهرستان
      </h4>


      {loading ? (
        <p>
          در حال بارگذاری...
        </p>

      ) : newsList.length > 0 ? (
        <Slider {...settings}>

          {newsList.map(
            (news) => (
              <div
                key={news.id}
                className="news-slide"
              >

                <Link
                  to={`/news/${news.id}`}
                  className="news-link"
                >

                  {news.image && (
                    <img
                      src={
                        getImageUrl(
                          news.image
                        )
                      }
                      alt={
                        news.title ||
                        "خبر"
                      }
                      className="newsimage"
                      loading="lazy"
                      onError={(event) => {
                        /*
                         * خرابی یک تصویر نباید
                         * باعث حلقه یا Modal شود.
                         */
                        event.currentTarget.onerror =
                          null;

                        event.currentTarget.style.display =
                          "none";
                      }}
                    />
                  )}


                  <div className="news-caption">

                    <h3>
                      {news.title}
                    </h3>

                  </div>

                </Link>

              </div>
            )
          )}

        </Slider>

      ) : (
        <p>
          هیچ خبری یافت نشد.
        </p>
      )}

    </div>
  );
};


export default NewsSlider;