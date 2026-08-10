// src/components/homepage/main/slider/Slider.js

import React, {
  useEffect,
  useState,
} from "react";

import Slider from "react-slick";

import {
  apiFetchSilent,
} from "../../../../api/apiClient";

import "./Slider.css";

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


const ImageSlider = () => {
  const [
    images,
    setImages,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);


  useEffect(() => {
    const controller =
      new AbortController();


    const loadImages =
      async () => {
        try {
          const response =
            await apiFetchSilent(
              `${API_BASE}/api/slider-images/`,
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


          if (!response.ok) {
            console.warn(
              "IMAGE_SLIDER_HTTP_ERROR",
              response.status
            );

            setImages([]);

            return;
          }


          let data = null;


          try {
            data =
              await response.json();
          } catch (parseError) {
            console.warn(
              "IMAGE_SLIDER_PARSE_ERROR",
              parseError
            );

            setImages([]);

            return;
          }


          setImages(
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


          /*
           * اسلایدر صفحه اصلی محتوای جانبی است.
           * بنابراین عمداً Global Modal
           * نمایش داده نمی‌شود.
           */
          console.warn(
            "IMAGE_SLIDER_LOAD_ERROR",
            error
          );


          setImages([]);

        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        }
      };


    loadImages();


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

    appendDots: (dots) => (
      <ul style={{ margin: 0 }}>
        {dots}
      </ul>
    ),

    customPaging: () => (
      <div
        style={{
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          background: "#bbb",
          display: "inline-block",
          margin: "-20px",
        }}
      />
    ),
  };


  return (
    <div className="slider-wrapper">

      <h4>گالری تصاویر</h4>


      {loading ? (
        <p>
          در حال بارگذاری تصاویر...
        </p>

      ) : images.length > 0 ? (
        <Slider {...settings}>

          {images.map(
            (image, index) => (
              <div
                key={
                  image?.id ??
                  index
                }
                className="slide"
              >

                {image.image && (
                  <img
                    src={
                      getImageUrl(
                        image.image
                      )
                    }
                    alt={
                      image.title ||
                      `اسلایدر ${index + 1}`
                    }
                    className="slider-image"
                    loading="lazy"
                    onError={(event) => {
                      /*
                       * خطای خود تصویر نباید
                       * Modal ایجاد کند.
                       */
                      event.currentTarget.onerror =
                        null;

                      event.currentTarget.style.display =
                        "none";
                    }}
                  />
                )}


                {image.title && (
                  <div className="slider-caption">
                    {image.title}
                  </div>
                )}

              </div>
            )
          )}

        </Slider>

      ) : (
        <p>
          هیچ عکسی برای اسلایدر وجود ندارد
        </p>
      )}

    </div>
  );
};


export default ImageSlider;