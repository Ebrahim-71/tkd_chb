// src/components/Login/competitions/CompetitionBracket.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getBracket,
} from "../../../api/competitions";

import {
  showGlobalMessage,
} from "../../../services/globalMessage";

import {
  toPng,
} from "html-to-image";

import boardLogoFile from "../../../assets/img/logo.png";

import "./CompetitionBracket.css";


/* =========================================================
   Constants
========================================================= */

const BOARD_LOGO =
  process.env.REACT_APP_BOARD_LOGO_URL ||
  boardLogoFile;


const DEVICE_PIXEL_RATIO =
  typeof window !== "undefined"
    ? window.devicePixelRatio || 1
    : 1;


const SNAPSHOT_DPR =
  Math.min(
    1.6,
    Math.max(
      1,
      DEVICE_PIXEL_RATIO
    )
  );


/* =========================================================
   Helpers
========================================================= */

function slugify(value = "") {
  return (
    String(value)
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\u0600-\u06FF\w-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "bracket"
  );
}


function getErrorStatus(error) {
  return (
    error?.status ||
    error?.response?.status ||
    error?.payload?.status ||
    null
  );
}


function extractErrorMessage(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  if (
    typeof value === "string"
  ) {
    return value.trim();
  }


  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        extractErrorMessage
      )
      .filter(Boolean)
      .join("\n");
  }


  if (
    typeof value === "object"
  ) {
    const preferredKeys = [
      "detail",
      "message",
      "error",
      "non_field_errors",
      "__all__",
      "raw",
    ];


    for (
      const key
      of preferredKeys
    ) {
      const message =
        extractErrorMessage(
          value[key]
        );


      if (message) {
        return message;
      }
    }


    for (
      const item
      of Object.values(
        value
      )
    ) {
      const message =
        extractErrorMessage(
          item
        );


      if (message) {
        return message;
      }
    }
  }


  return "";
}


function getErrorMessage(
  error,
  fallback
) {
  const payload =
    error?.payload ||
    error?.response?.data ||
    error?.data ||
    null;


  return (
    extractErrorMessage(
      payload
    ) ||
    error?.message ||
    fallback
  );
}


/* =========================================================
   Bracket Card
========================================================= */

function BracketCard({
  draw,
  logoUrl = BOARD_LOGO,
  onSnapshotError,
}) {
  /*
   * کل محتوای کارت:
   * هدر + براکت
   */
  const contentRef =
    useRef(null);


  /*
   * ریشه براکت زنده
   */
  const wrapRef =
    useRef(null);


  const viewRef =
    useRef(null);


  const [
    png,
    setPng,
  ] = useState(null);


  const [
    rendering,
    setRendering,
  ] = useState(false);


  /* =======================================================
     Mat number
  ======================================================= */

  const matNo =
    useMemo(() => {
      const map =
        new Map();


      (
        draw?.matches ||
        []
      ).forEach(
        (match) => {
          const mat =
            match?.mat_no ??
            match?.mat ??
            match?.tatami_no ??
            match?.tatami ??
            match?.ring ??
            match?.area ??
            match?.court ??
            null;


          if (!mat) {
            return;
          }


          map.set(
            mat,
            (
              map.get(mat) ||
              0
            ) + 1
          );
        }
      );


      let best =
        null;

      let count =
        -1;


      for (
        const [
          key,
          value,
        ]
        of map.entries()
      ) {
        if (
          value >
          count
        ) {
          best =
            key;

          count =
            value;
        }
      }


      return (
        best ||
        "—"
      );

    }, [
      draw?.matches,
    ]);


  /* =======================================================
     Header fit

     مهم:
     این تابع قبل از useEffect اصلی تعریف شده است.
     مشکل ESLint قبلی از اینجا بود.
  ======================================================= */

  const fitHeader =
    useCallback(() => {
      const root =
        contentRef.current;


      if (!root) {
        return;
      }


      const header =
        root.querySelector(
          ".hd"
        );


      if (!header) {
        return;
      }


      const left =
        header.querySelector(
          ".left"
        );


      const logo =
        header.querySelector(
          ".brand-logo"
        );


      if (!left) {
        return;
      }


      const available =
        header.clientWidth -
        (
          logo?.offsetWidth ||
          0
        ) -
        24;


      const needed =
        left.scrollWidth;


      let scale =
        1;


      if (
        needed >
          available &&
        available >
          0
      ) {
        scale =
          Math.max(
            0.85,
            Math.min(
              1,
              available /
                needed
            )
          );
      }


      root.style.setProperty(
        "--hdrScale",
        scale.toFixed(3)
      );
    }, []);


  /* =======================================================
     Fill bracket + fit
  ======================================================= */

  useEffect(() => {
    const wrap =
      wrapRef.current;


    if (!wrap) {
      return undefined;
    }


    const matches =
      draw?.matches ||
      [];


    /* -----------------------------------------------------
       Round shifting
    ----------------------------------------------------- */

    const applyRoundShifting =
      (
        declaredSize
      ) => {
        const size =
          Math.max(
            1,
            Number(
              declaredSize ||
              0
            )
          );


        let roundsCount =
          0;


        while (
          (1 << roundsCount) <
          size
        ) {
          roundsCount +=
            1;
        }


        roundsCount =
          Math.max(
            1,
            roundsCount
          );


        const shift =
          5 -
          roundsCount;


        for (
          let column = 1;
          column <= 5;
          column += 1
        ) {
          const element =
            wrap.querySelector(
              `.r${column}`
            );


          if (element) {
            element.style.display =
              column <
              shift + 1
                ? "none"
                : "";
          }
        }


        return {
          mapRound:
            (round) =>
              round +
              shift,
        };
      };


    /* -----------------------------------------------------
       Fit board
    ----------------------------------------------------- */

    const fitToCard =
      () => {
        const view =
          wrap.querySelector(
            ".view"
          );


        const board =
          wrap.querySelector(
            ".board"
          );


        if (
          !view ||
          !board
        ) {
          return;
        }


        board.style.transform =
          "translateX(-50%) scale(1)";


        const padding =
          6;


        const naturalWidth =
          board.scrollWidth +
          padding;


        const naturalHeight =
          board.scrollHeight +
          padding;


        const viewWidth =
          view.clientWidth;


        const viewHeight =
          view.clientHeight;


        if (
          naturalWidth <= 0 ||
          naturalHeight <= 0 ||
          viewWidth <= 0 ||
          viewHeight <= 0
        ) {
          return;
        }


        const scale =
          Math.min(
            viewWidth /
              naturalWidth,

            viewHeight /
              naturalHeight
          ) *
          0.985;


        board.style.setProperty(
          "--scale",
          Math.max(
            0,
            Math.min(
              1,
              scale
            )
          ).toFixed(3)
        );


        board.style.transform =
          "";
      };


    /* -----------------------------------------------------
       Helpers
    ----------------------------------------------------- */

    const isRest =
      (value) =>
        String(
          value ||
          ""
        ).trim() ===
        "استراحت";


    const put =
      (
        element,
        value
      ) => {
        if (!element) {
          return;
        }


        element.value =
          value ||
          "";


        element.title =
          element.value;


        if (
          isRest(
            element.value
          )
        ) {
          element.classList.add(
            "bye"
          );
        } else {
          element.classList.remove(
            "bye"
          );
        }
      };


    const getMatchNumber =
      (match) => {
        const candidates = [
          "match_number",
          "number",
          "match_no",
          "no",
          "bout_no",
          "number_on_mat",
          "order_on_mat",
          "seq_on_mat",
          "seq_no",
          "seq",
          "order",
          "index",
          "bracket_no",
        ];


        for (
          const key
          of candidates
        ) {
          if (
            match?.[key] !==
              undefined &&
            match?.[key] !==
              null &&
            match?.[key] !==
              ""
          ) {
            return match[
              key
            ];
          }
        }


        return "";
      };


    /* -----------------------------------------------------
       First round info
    ----------------------------------------------------- */

    const firstRoundInfo =
      (
        mapRound
      ) => {
        for (
          let round = 1;
          round <= 5;
          round += 1
        ) {
          const visualRound =
            mapRound(
              round
            );


          const count =
            wrap.querySelectorAll(
              `input.player-input[data-r="${visualRound}"][data-pos="a"]`
            ).length;


          if (
            count >
            0
          ) {
            return {
              r:
                round,

              vr:
                visualRound,

              count,
            };
          }
        }


        return {
          r:
            null,

          vr:
            null,

          count:
            0,
        };
      };


    /* -----------------------------------------------------
       BYE propagation
    ----------------------------------------------------- */

    const propagateByesOneStep =
      (
        mapRound
      ) => {
        const info =
          firstRoundInfo(
            mapRound
          );


        if (!info.r) {
          return;
        }


        const round =
          info.r;


        const visualRound =
          info.vr;


        const count =
          info.count;


        for (
          let index = 0;
          index <
          count;
          index += 1
        ) {
          const playerA =
            wrap.querySelector(
              `input.player-input[data-r="${visualRound}"][data-i="${index}"][data-pos="a"]`
            );


          const playerB =
            wrap.querySelector(
              `input.player-input[data-r="${visualRound}"][data-i="${index}"][data-pos="b"]`
            );


          const number =
            wrap.querySelector(
              `input.bubble[data-r="${visualRound}"][data-i="${index}"][data-num]`
            );


          const aValue =
            String(
              playerA?.value ||
              ""
            ).trim();


          const bValue =
            String(
              playerB?.value ||
              ""
            ).trim();


          const restPair =
            (
              aValue ===
              "استراحت"
            ) ^
            (
              bValue ===
              "استراحت"
            );


          if (
            restPair &&
            number
          ) {
            number.classList.add(
              "bye-mark"
            );

            number.value =
              "";

            number.title =
              "استراحت";
          }


          const hasA =
            Boolean(
              playerA &&
              aValue &&
              aValue !==
                "استراحت"
            );


          const hasB =
            Boolean(
              playerB &&
              bValue &&
              bValue !==
                "استراحت"
            );


          const playerAAdvanced =
            hasA &&
            bValue ===
              "استراحت";


          const playerBAdvanced =
            hasB &&
            aValue ===
              "استراحت";


          if (
            !playerAAdvanced &&
            !playerBAdvanced
          ) {
            continue;
          }


          const winner =
            hasA
              ? playerA.value
              : playerB.value;


          const nextVisualRound =
            mapRound(
              round +
              1
            );


          if (
            !wrap.querySelector(
              `input.player-input[data-r="${nextVisualRound}"]`
            )
          ) {
            continue;
          }


          const nextIndex =
            Math.floor(
              index /
              2
            );


          const nextPosition =
            index % 2 ===
              0
              ? "a"
              : "b";


          const nextInput =
            wrap.querySelector(
              `input.player-input[data-r="${nextVisualRound}"][data-i="${nextIndex}"][data-pos="${nextPosition}"]`
            );


          const nextValue =
            String(
              nextInput
                ?.value ||
              ""
            ).trim();


          if (
            nextInput &&
            (
              nextValue ===
                "" ||
              nextValue ===
                "استراحت"
            )
          ) {
            put(
              nextInput,
              winner
            );
          }
        }
      };


    /* -----------------------------------------------------
       Detect single player
    ----------------------------------------------------- */

    const detectSinglePlayerName =
      (
        matchList
      ) => {
        const names =
          new Set();


        for (
          const match
          of matchList
        ) {
          const playerA =
            String(
              match
                ?.player_a_name ||
              ""
            ).trim();


          const playerB =
            String(
              match
                ?.player_b_name ||
              ""
            ).trim();


          if (
            playerA &&
            playerA !==
              "استراحت"
          ) {
            names.add(
              playerA
            );
          }


          if (
            playerB &&
            playerB !==
              "استراحت"
          ) {
            names.add(
              playerB
            );
          }
        }


        return names.size ===
          1
          ? [
              ...names,
            ][0]
          : "";
      };


    /* -----------------------------------------------------
       Single player path
    ----------------------------------------------------- */

    const fillSinglePathAllTheWay =
      (
        name,
        mapRound,
        firstInfo
      ) => {
        if (
          !name ||
          !firstInfo ||
          !firstInfo.r
        ) {
          return;
        }


        let index =
          0;


        for (
          let itemIndex = 0;
          itemIndex <
          firstInfo.count;
          itemIndex += 1
        ) {
          const playerA =
            wrap.querySelector(
              `input.player-input[data-r="${firstInfo.vr}"][data-i="${itemIndex}"][data-pos="a"]`
            );


          const playerB =
            wrap.querySelector(
              `input.player-input[data-r="${firstInfo.vr}"][data-i="${itemIndex}"][data-pos="b"]`
            );


          if (
            playerA?.value.trim() ===
              name ||
            playerB?.value.trim() ===
              name
          ) {
            index =
              itemIndex;

            break;
          }
        }


        let round =
          firstInfo.r;


        while (true) {
          const visualRound =
            mapRound(
              round
            );


          const playerA =
            wrap.querySelector(
              `input.player-input[data-r="${visualRound}"][data-i="${index}"][data-pos="a"]`
            );


          const playerB =
            wrap.querySelector(
              `input.player-input[data-r="${visualRound}"][data-i="${index}"][data-pos="b"]`
            );


          const number =
            wrap.querySelector(
              `input.bubble[data-r="${visualRound}"][data-i="${index}"][data-num]`
            );


          if (
            !playerA ||
            !playerB
          ) {
            break;
          }


          if (
            visualRound ===
            firstInfo.vr
          ) {
            if (
              playerA.value.trim() ===
              name
            ) {
              put(
                playerB,
                "استراحت"
              );

            } else if (
              playerB.value.trim() ===
              name
            ) {
              put(
                playerA,
                "استراحت"
              );

            } else {
              put(
                playerA,
                name
              );

              put(
                playerB,
                "استراحت"
              );
            }


            if (number) {
              number.classList.add(
                "bye-mark"
              );

              number.value =
                "";

              number.title =
                "استراحت";
            }
          }


          const nextVisualRound =
            mapRound(
              round +
              1
            );


          if (
            !wrap.querySelector(
              `input.player-input[data-r="${nextVisualRound}"]`
            )
          ) {
            break;
          }


          const nextIndex =
            Math.floor(
              index /
              2
            );


          const nextPosition =
            index % 2 ===
              0
              ? "a"
              : "b";


          const nextInput =
            wrap.querySelector(
              `input.player-input[data-r="${nextVisualRound}"][data-i="${nextIndex}"][data-pos="${nextPosition}"]`
            );


          if (nextInput) {
            put(
              nextInput,
              name
            );
          }


          index =
            nextIndex;

          round +=
            1;
        }


        const champion =
          wrap.querySelector(
            ".r6 .champ .player-input"
          );


        if (champion) {
          champion.value =
            `🏆  ${name}`;

          champion.title =
            name;
        }
      };


    /* -----------------------------------------------------
       Determine draw size
    ----------------------------------------------------- */

    const declaredSize =
      draw?.size ||
      (
        draw?.matches
          ? Math.max(
              1,
              draw.matches.length *
                2
            )
          : 1
      );


    const {
      mapRound,
    } =
      applyRoundShifting(
        declaredSize
      );


    const firstRound =
      firstRoundInfo(
        mapRound
      );


    /* -----------------------------------------------------
       Fill matches
    ----------------------------------------------------- */

    if (
      matches.length
    ) {
      const byRound =
        new Map();


      for (
        const match
        of matches
      ) {
        const round =
          Number(
            match?.round_no ??
            match?.round ??
            match?.stage ??
            1
          );


        if (
          !byRound.has(
            round
          )
        ) {
          byRound.set(
            round,
            []
          );
        }


        byRound
          .get(round)
          .push(
            match
          );
      }


      /*
       * Sort each round.
       * از round key استفاده نمی‌کنیم،
       * بنابراین warning مربوط به r هم حذف می‌شود.
       */
      for (
        const roundMatches
        of byRound.values()
      ) {
        roundMatches.sort(
          (
            first,
            second
          ) => {
            const firstOrder =
              first?.slot_a ??
              first
                ?.order_in_round ??
              first?.index ??
              0;


            const secondOrder =
              second?.slot_a ??
              second
                ?.order_in_round ??
              second?.index ??
              0;


            return (
              (
                firstOrder ||
                0
              ) -
              (
                secondOrder ||
                0
              )
            );
          }
        );


        /*
         * fallback شماره مسابقه
         */
        let localNumber =
          1;


        roundMatches.forEach(
          (
            match
          ) => {
            if (
              !getMatchNumber(
                match
              )
            ) {
              match.__fallback_no__ =
                localNumber;

              localNumber +=
                1;
            }
          }
        );
      }


      for (
        const [
          round,
          roundMatches,
        ]
        of byRound
      ) {
        const visualRound =
          mapRound(
            round
          );


        const isFirstRound =
          visualRound ===
          firstRound.vr;


        roundMatches.forEach(
          (
            match,
            index
          ) => {
            const playerA =
              wrap.querySelector(
                `input.player-input[data-r="${visualRound}"][data-i="${index}"][data-pos="a"]`
              );


            const playerB =
              wrap.querySelector(
                `input.player-input[data-r="${visualRound}"][data-i="${index}"][data-pos="b"]`
              );


            const number =
              wrap.querySelector(
                `input.bubble[data-r="${visualRound}"][data-i="${index}"][data-num]`
              );


            const playerAName =
              String(
                match
                  ?.player_a_name ??
                match?.a_name ??
                match?.player_a ??
                ""
              );


            const playerBName =
              String(
                match
                  ?.player_b_name ??
                match?.b_name ??
                match?.player_b ??
                ""
              );


            const hasA =
              playerAName.trim() !==
              "";


            const hasB =
              playerBName.trim() !==
              "";


            if (playerA) {
              playerA.value =
                hasA
                  ? playerAName

                  : (
                      hasB &&
                      match
                        ?.is_bye &&
                      isFirstRound
                    )
                  ? "استراحت"

                  : playerA.value;
            }


            if (playerB) {
              playerB.value =
                hasB
                  ? playerBName

                  : (
                      hasA &&
                      match
                        ?.is_bye &&
                      isFirstRound
                    )
                  ? "استراحت"

                  : playerB.value;
            }


            if (number) {
              const restPair =
                isFirstRound &&
                (
                  (
                    playerA?.value
                      ?.trim() ===
                    "استراحت"
                  ) ^
                  (
                    playerB?.value
                      ?.trim() ===
                    "استراحت"
                  )
                );


              if (restPair) {
                number.classList.add(
                  "bye-mark"
                );

                number.value =
                  "";

                number.title =
                  "استراحت";

              } else {
                number.classList.remove(
                  "bye-mark"
                );


                const matchNumber =
                  getMatchNumber(
                    match
                  ) ||
                  match
                    .__fallback_no__ ||
                  "";


                number.value =
                  String(
                    matchNumber
                  );


                number.title =
                  number.value;
              }
            }
          }
        );
      }
    }


    /* -----------------------------------------------------
       BYE / single player
    ----------------------------------------------------- */

    const singleName =
      detectSinglePlayerName(
        matches
      );


    if (singleName) {
      fillSinglePathAllTheWay(
        singleName,
        mapRound,
        firstRound
      );
    } else {
      propagateByesOneStep(
        mapRound
      );
    }


    /* -----------------------------------------------------
       Initial fit
    ----------------------------------------------------- */

    fitToCard();

    fitHeader();


    /* -----------------------------------------------------
       Resize
    ----------------------------------------------------- */

    let timeoutId;


    const onResize =
      () => {
        clearTimeout(
          timeoutId
        );


        timeoutId =
          setTimeout(
            () => {
              fitToCard();

              fitHeader();
            },
            120
          );
      };


    window.addEventListener(
      "resize",
      onResize
    );


    return () => {
      clearTimeout(
        timeoutId
      );


      window.removeEventListener(
        "resize",
        onResize
      );
    };

  }, [
    draw,
    fitHeader,
  ]);


  /* =======================================================
     Render snapshot
  ======================================================= */

  const renderToImage =
    useCallback(
      async () => {
        const node =
          contentRef.current;


        if (!node) {
          return;
        }


        setRendering(
          true
        );


        setPng(
          null
        );


        node.classList.add(
          "is-snapshotting"
        );


        try {
          /*
           * دو frame صبر می‌کنیم تا DOM
           * و transformها کامل شوند.
           */
          await new Promise(
            (resolve) =>
              requestAnimationFrame(
                () =>
                  requestAnimationFrame(
                    resolve
                  )
              )
          );


          try {
            if (
              document.fonts
                ?.ready
            ) {
              await document
                .fonts
                .ready;
            }
          } catch {
            /*
             * آماده نبودن Fonts
             * نباید کل snapshot را متوقف کند.
             */
          }


          fitHeader();


          const dataUrl =
            await toPng(
              node,
              {
                pixelRatio:
                  SNAPSHOT_DPR,

                backgroundColor:
                  "#fff",

                cacheBust:
                  true,

                filter:
                  (
                    element
                  ) => {
                    if (
                      element
                        ?.classList
                        ?.contains?.(
                          "snapshot-overlay"
                        )
                    ) {
                      return false;
                    }


                    return true;
                  },
              }
            );


          setPng(
            dataUrl
          );

        } catch (error) {
          console.error(
            "BRACKET_SNAPSHOT_ERROR",
            error
          );


          setPng(
            null
          );


          if (
            typeof onSnapshotError ===
            "function"
          ) {
            onSnapshotError(
              error
            );
          }

        } finally {
          node.classList.remove(
            "is-snapshotting"
          );


          setRendering(
            false
          );
        }
      },
      [
        fitHeader,
        onSnapshotError,
      ]
    );


  /* =======================================================
     Auto snapshot
  ======================================================= */

  useEffect(() => {
    const timeoutId =
      setTimeout(
        () => {
          fitHeader();

          renderToImage();
        },
        140
      );


    return () => {
      clearTimeout(
        timeoutId
      );
    };

  }, [
    fitHeader,
    renderToImage,
  ]);


  /* =======================================================
     Filename
  ======================================================= */

  const filename =
    `${slugify(
      draw
        ?.age_category_name
    )}-` +

    `${slugify(
      draw
        ?.gender_display
    )}-` +

    `${slugify(
      draw
        ?.belt_group_label
    )}-` +

    `${slugify(
      draw
        ?.weight_name
    )}-` +

    `${slugify(
      matNo
    )}.png`;


  /* =======================================================
     Download one
  ======================================================= */

  const downloadOne =
    () => {
      if (
        !png ||
        rendering
      ) {
        showGlobalMessage({
          type:
            "warning",

          title:
            "تصویر هنوز آماده نیست",

          message:
            "لطفاً چند لحظه صبر کنید تا تصویر جدول مسابقه آماده شود.",
        });

        return;
      }


      const anchor =
        document.createElement(
          "a"
        );


      anchor.href =
        png;


      anchor.download =
        filename;


      document.body.appendChild(
        anchor
      );


      anchor.click();


      anchor.remove();
    };


  const showSnapshot =
    Boolean(
      png &&
      !rendering
    );


  /* =======================================================
     Render
  ======================================================= */

  return (
    <div
      className={
        `card ${
          showSnapshot
            ? "is-snap"
            : ""
        } ${
          rendering
            ? "is-rendering"
            : ""
        }`
      }
      data-filename={
        filename
      }
    >

      {/* =================================================
          محتوای اصلی کارت
      ================================================= */}

      <div
        className="card-content"
        ref={
          contentRef
        }
      >

        {/* ===============================================
            Header
        =============================================== */}

        <div className="hd">

          <div className="left">

            <span className="pill">
              {draw
                ?.age_category_name ||
                "—"}
            </span>


            <span className="pill">
              {draw
                ?.gender_display ||
                "—"}
            </span>


            <span className="pill">
              رده کمربندی:{" "}
              {draw
                ?.belt_group_label ||
                "—"}
            </span>


            <span className="pill">
              رده وزنی:{" "}
              {draw
                ?.weight_name ||
                "—"}
            </span>


            <span className="pill">
              زمین:{" "}
              <b>
                {matNo}
              </b>
            </span>

          </div>


          <img
            className="brand-logo"
            src={
              logoUrl ||
              boardLogoFile
            }
            alt="لوگوی هیئت"
            crossOrigin="anonymous"
            onError={(
              event
            ) => {
              event.currentTarget.onerror =
                null;


              event.currentTarget.src =
                boardLogoFile;
            }}
          />

        </div>


        {/* ===============================================
            Body
        =============================================== */}

        <div className="bd">

          <div
            className="bracket-wrap"
            data-size={
              draw?.size ||
              ""
            }
            ref={
              wrapRef
            }
          >

            <div
              className="view"
              ref={
                viewRef
              }
            >

              <div className="board">

                {/* =======================================
                    Round 1
                ======================================= */}

                <div className="col r1">

                  <div className="stack">

                    {Array.from({
                      length:
                        16,
                    }).map(
                      (
                        _,
                        index
                      ) => (
                        <React.Fragment
                          key={`r1-${index}`}
                        >

                          <div className="item">

                            <input
                              className="player-input"
                              data-r="1"
                              data-i={
                                index
                              }
                              data-pos="a"
                              readOnly
                            />

                          </div>


                          <div className="item">

                            <input
                              className="player-input"
                              data-r="1"
                              data-i={
                                index
                              }
                              data-pos="b"
                              readOnly
                            />


                            <input
                              className="bubble"
                              data-r="1"
                              data-i={
                                index
                              }
                              data-num
                              readOnly
                              style={{
                                right:
                                  "-28px",
                              }}
                            />

                          </div>

                        </React.Fragment>
                      )
                    )}

                  </div>

                </div>


                {/* =======================================
                    Round 2
                ======================================= */}

                <div className="col r2">

                  <div className="stack">

                    {Array.from({
                      length:
                        8,
                    }).map(
                      (
                        _,
                        index
                      ) => (
                        <React.Fragment
                          key={`r2-${index}`}
                        >

                          <div className="item">

                            <input
                              className="player-input"
                              data-r="2"
                              data-i={
                                index
                              }
                              data-pos="a"
                              readOnly
                            />

                          </div>


                          <div className="item">

                            <input
                              className="player-input"
                              data-r="2"
                              data-i={
                                index
                              }
                              data-pos="b"
                              readOnly
                            />


                            <input
                              className="bubble"
                              data-r="2"
                              data-i={
                                index
                              }
                              data-num
                              readOnly
                              style={{
                                right:
                                  "-28px",
                              }}
                            />

                          </div>

                        </React.Fragment>
                      )
                    )}

                  </div>

                </div>


                {/* =======================================
                    Round 3
                ======================================= */}

                <div className="col r3">

                  <div className="stack">

                    {Array.from({
                      length:
                        4,
                    }).map(
                      (
                        _,
                        index
                      ) => (
                        <React.Fragment
                          key={`r3-${index}`}
                        >

                          <div className="item">

                            <input
                              className="player-input"
                              data-r="3"
                              data-i={
                                index
                              }
                              data-pos="a"
                              readOnly
                            />

                          </div>


                          <div className="item">

                            <input
                              className="player-input"
                              data-r="3"
                              data-i={
                                index
                              }
                              data-pos="b"
                              readOnly
                            />


                            <input
                              className="bubble"
                              data-r="3"
                              data-i={
                                index
                              }
                              data-num
                              readOnly
                              style={{
                                right:
                                  "-28px",
                              }}
                            />

                          </div>

                        </React.Fragment>
                      )
                    )}

                  </div>

                </div>


                {/* =======================================
                    Round 4
                ======================================= */}

                <div className="col r4">

                  <div className="stack">

                    {Array.from({
                      length:
                        2,
                    }).map(
                      (
                        _,
                        index
                      ) => (
                        <React.Fragment
                          key={`r4-${index}`}
                        >

                          <div className="item">

                            <input
                              className="player-input"
                              data-r="4"
                              data-i={
                                index
                              }
                              data-pos="a"
                              readOnly
                            />

                          </div>


                          <div className="item">

                            <input
                              className="player-input"
                              data-r="4"
                              data-i={
                                index
                              }
                              data-pos="b"
                              readOnly
                            />


                            <input
                              className="bubble"
                              data-r="4"
                              data-i={
                                index
                              }
                              data-num
                              readOnly
                              style={{
                                right:
                                  "-28px",
                              }}
                            />

                          </div>

                        </React.Fragment>
                      )
                    )}

                  </div>

                </div>


                {/* =======================================
                    Round 5 / Final
                ======================================= */}

                <div className="col r5">

                  <div className="stack">

                    <div className="item">

                      <input
                        className="player-input"
                        data-r="5"
                        data-i="0"
                        data-pos="a"
                        readOnly
                      />

                    </div>


                    <div className="item">

                      <input
                        className="player-input"
                        data-r="5"
                        data-i="0"
                        data-pos="b"
                        readOnly
                      />


                      <input
                        className="bubble"
                        data-r="5"
                        data-i="0"
                        data-num
                        readOnly
                        style={{
                          right:
                            "-18px",
                        }}
                      />

                    </div>

                  </div>

                </div>


                {/* =======================================
                    Champion
                ======================================= */}

                <div className="col r6">

                  <div className="champ">

                    <input
                      className="player-input"
                      defaultValue="🏆                      "
                      readOnly
                    />

                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>


      {/* =================================================
          Snapshot
      ================================================= */}

      {showSnapshot && (
        <img
          className="card-snapshot"
          src={
            png
          }
          alt="Bracket snapshot"
        />
      )}


      {/* =================================================
          Rendering overlay
      ================================================= */}

      {rendering && (
        <div
          className="snapshot-overlay"
          aria-hidden="true"
        >

          <div className="spinner" />


          <div className="wait-label">
            در حال ساخت تصویر…
          </div>

        </div>
      )}


      {/* =================================================
          Controls
      ================================================= */}

      <div className="card-controls">

        <button
          type="button"
          className="btn btn-primary"
          onClick={
            downloadOne
          }
          disabled={
            !png ||
            rendering
          }
        >
          دانلود تصویر
        </button>

      </div>

    </div>
  );
}


/* =========================================================
   Competition Bracket Page
========================================================= */

export default function CompetitionBracket() {
  const {
    slug,
    role,
  } =
    useParams();


  const navigate =
    useNavigate();


  const [
    data,
    setData,
  ] = useState(null);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    loadState,
    setLoadState,
  ] = useState(
    "loading"
  );
  // loading | ready | not-found | failed


  /*
   * نمی‌خواهیم اگر چند کارت همزمان snapshot
   * شکست خوردند، چند Global Modal پشت سر هم
   * نمایش داده شود.
   */
  const snapshotErrorShownRef =
    useRef(false);


  /* =======================================================
     Dashboard role
  ======================================================= */

  const dashboardRole =
    role ||
    localStorage.getItem(
      "user_role"
    ) ||
    "player";


  /* =======================================================
     Unauthorized
  ======================================================= */

  const handleUnauthorized =
    useCallback(() => {
      const currentRole =
        String(
          localStorage.getItem(
            "user_role"
          ) ||
          ""
        )
          .toLowerCase()
          .trim();


      if (
        currentRole
      ) {
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
        "referee_token"
      );

      localStorage.removeItem(
        "club_token"
      );

      localStorage.removeItem(
        "heyat_token"
      );

      localStorage.removeItem(
        "board_token"
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
        type:
          "warning",

        title:
          "پایان اعتبار ورود",

        message:
          "نشست کاربری شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد حساب کاربری شوید.",

        onClose:
          () => {
            navigate(
              "/"
            );
          },
      });

    }, [
      navigate,
    ]);


  /* =======================================================
     Snapshot error
  ======================================================= */

  const handleSnapshotError =
    useCallback(
      (
        error
      ) => {
        console.error(
          "BRACKET_SNAPSHOT_ERROR",
          error
        );


        if (
          snapshotErrorShownRef
            .current
        ) {
          return;
        }


        snapshotErrorShownRef.current =
          true;


        showGlobalMessage({
          type:
            "error",

          title:
            "خطا در ساخت تصویر جدول",

          message:
            "تصویر یکی از جدول‌های مسابقه ساخته نشد. این مشکل ممکن است به تصویر لوگو، محدودیت CORS یا سنگینی محتوای جدول مربوط باشد.",
        });
      },
      []
    );


  /* =======================================================
     Load bracket
  ======================================================= */

  useEffect(() => {
    let mounted =
      true;


    snapshotErrorShownRef.current =
      false;


    setLoading(
      true
    );


    setLoadState(
      "loading"
    );


    setData(
      null
    );


    const loadBracket =
      async () => {
        try {
          const response =
            await getBracket(
              slug
            );


          if (!mounted) {
            return;
          }


          setData(
            response
          );


          setLoadState(
            "ready"
          );

        } catch (error) {
          if (!mounted) {
            return;
          }


          console.error(
            "COMPETITION_BRACKET_LOAD_ERROR",
            error
          );


          const status =
            getErrorStatus(
              error
            );


          /*
           * 404 در این صفحه یک حالت عادی است:
           * یعنی هنوز جدول منتشر نشده.
           */
          if (
            status ===
            404
          ) {
            setLoadState(
              "not-found"
            );

            return;
          }


          /*
           * Unauthorized
           */
          if (
            status ===
            401
          ) {
            setLoadState(
              "failed"
            );


            handleUnauthorized();

            return;
          }


          setLoadState(
            "failed"
          );


          showGlobalMessage({
            type:
              "error",

            title:
              "خطا در دریافت جدول مسابقه",

            message:
              getErrorMessage(
                error,
                "جدول مسابقه از سرور دریافت نشد."
              ),
          });

        } finally {
          if (
            mounted
          ) {
            setLoading(
              false
            );
          }
        }
      };


    loadBracket();


    return () => {
      mounted =
        false;
    };

  }, [
    slug,
    handleUnauthorized,
  ]);


  /* =======================================================
     Back to details
  ======================================================= */

  const goDetails =
    () => {
      navigate(
        `/dashboard/${encodeURIComponent(
          dashboardRole
        )}/competitions/${encodeURIComponent(
          slug
        )}`
      );
    };


  /* =======================================================
     Download all
  ======================================================= */

  const downloadAll =
    () => {
      const images =
        document.querySelectorAll(
          ".card-snapshot"
        );


      if (
        !images.length
      ) {
        showGlobalMessage({
          type:
            "warning",

          title:
            "تصاویر هنوز آماده نیستند",

          message:
            "لطفاً چند لحظه صبر کنید تا تصاویر جدول‌ها ساخته شوند و سپس دوباره «دانلود همه تصاویر» را انتخاب کنید.",
        });

        return;
      }


      images.forEach(
        (
          image,
          index
        ) => {
          const source =
            image.getAttribute(
              "src"
            );


          if (!source) {
            return;
          }


          const anchor =
            document.createElement(
              "a"
            );


          const filename =
            image
              .closest(
                ".card"
              )
              ?.dataset
              ?.filename ||
            `bracket-${
              index +
              1
            }.png`;


          anchor.href =
            source;


          anchor.download =
            filename;


          document.body.appendChild(
            anchor
          );


          anchor.click();


          anchor.remove();
        }
      );
    };


  /* =======================================================
     Loading
  ======================================================= */

  if (loading) {
    return (
      <div
        className="cb-wrap"
        dir="rtl"
      >
        در حال بارگذاری…
      </div>
    );
  }


  /* =======================================================
     Not published / 404
  ======================================================= */

  if (
    loadState ===
    "not-found"
  ) {
    return (
      <div
        className="cb-wrap cb-error"
        dir="rtl"
      >

        <div
          style={{
            marginBottom:
              12,
          }}
        >
          هنوز قرعه‌کشی یا انتشار جدول انجام نشده است.
        </div>


        <div className="cb-toolbar">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={
              goDetails
            }
          >
            بازگشت به جزئیات
          </button>

        </div>

      </div>
    );
  }


  /* =======================================================
     Real failure
  ======================================================= */

  if (
    loadState ===
    "failed"
  ) {
    return (
      <div
        className="cb-wrap"
        dir="rtl"
      >

        <div
          className="cb-empty"
        >
          امکان دریافت جدول مسابقه در حال حاضر وجود ندارد.
        </div>


        <div className="cb-toolbar">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={
              goDetails
            }
          >
            بازگشت به جزئیات
          </button>

        </div>

      </div>
    );
  }


  /* =======================================================
     Draws
  ======================================================= */

  const draws =
    Array.isArray(
      data?.draws
    )
      ? data.draws
      : [];


  if (
    !draws.length
  ) {
    return (
      <div
        className="cb-wrap"
        dir="rtl"
      >

        <div className="cb-empty">
          هنوز قرعه‌کشی انجام نشده یا شماره‌گذاری کامل نیست.
        </div>


        <div className="cb-toolbar">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={
              goDetails
            }
          >
            بازگشت به جزئیات
          </button>

        </div>

      </div>
    );
  }


  /* =======================================================
     Logo
  ======================================================= */

  const logoUrl =
    data?.board_logo_url ||
    data?.board_logo ||
    data?.logo_url ||
    data?.logo ||
    BOARD_LOGO;


  /* =======================================================
     Render
  ======================================================= */

  return (
    <div
      className="cb-wrap"
      dir="rtl"
    >

      <div className="cb-toolbar">

        <button
          type="button"
          className="btn btn-secondary"
          onClick={
            goDetails
          }
        >
          بازگشت
        </button>


        <button
          type="button"
          className="btn btn-outline"
          onClick={
            downloadAll
          }
        >
          دانلود همه تصاویر
        </button>

      </div>


      <div className="cards">

        {draws.map(
          (
            draw,
            index
          ) => (
            <BracketCard
              key={
                draw?.id ??
                `${draw?.age_category_name || "draw"}-${index}`
              }
              draw={
                draw
              }
              logoUrl={
                logoUrl
              }
              onSnapshotError={
                handleSnapshotError
              }
            />
          )
        )}

      </div>

    </div>
  );
}