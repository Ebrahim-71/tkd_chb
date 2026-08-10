// src/components/homepage/main/slider/CircularSlider.js

import React, { useEffect, useState } from "react";
import Slider from "react-slick";
import { Link } from "react-router-dom";

import {
  apiFetchSilent,
} from "../../../../api/apiClient";

import "./CircularSlider.css";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";


const API_BASE = "https://api.chbtkd.ir";


const CircularSlider = () => {

  const [circulars, setCirculars] = useState([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {

    const controller =
      new AbortController();


    const fetchCirculars =
      async () => {

        try {

          const response =
            await apiFetchSilent(
              `${API_BASE}/api/circulars/slider/`,
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
              "CIRCULAR_SLIDER_HTTP_ERROR",
              response.status
            );

            setCirculars([]);
            return;
          }


          const data =
            await response.json();


          setCirculars(
            Array.isArray(data)
              ? data
              : []
          );


        } catch (error) {

          if (
            error?.name ===
              "AbortError" ||
            error?.name ===
              "CanceledError" ||
            error?.code ===
              "ERR_CANCELED"
          ) {
            return;
          }


          console.warn(
            "خطا در دریافت اطلاعیه‌های اسلایدر:",
            error
          );

          setCirculars([]);

        } finally {

          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }

        }

      };


    fetchCirculars();


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

    fade: false,

    cssEase: "linear",

    adaptiveHeight: true,

  };



  return (

    <div className="circular-slider-wrapper">

      <h4>
        اطلاعیه و بخشنامه
      </h4>


      {
        loading ? (

          <p>
            در حال بارگذاری...
          </p>


        ) : circulars.length > 0 ? (

          <Slider {...settings}>

            {
              circulars.map((item) => (

                <div
                  key={item.id}
                  className="circular-slide"
                >

                  <Link
                    to={`/circular/${item.id}`}
                    className="circular-link"
                  >

                    {
                      item.thumbnail_url && (

                        <img

                          src={
                            item.thumbnail_url
                          }

                          alt={
                            item.title ||
                            "Circular"
                          }

                          className="circular-image"

                          loading="lazy"

                        />

                      )
                    }


                    <div className="circular-caption">

                      <h3>
                        {item.title}
                      </h3>

                    </div>


                  </Link>


                </div>

              ))
            }

          </Slider>


        ) : (

          <p>
            اطلاعیه‌ای یافت نشد.
          </p>

        )

      }


    </div>

  );

};


export default CircularSlider;