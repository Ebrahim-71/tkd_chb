import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
  Link,
} from "react-router-dom";

import {
  getCompetitionResults,
  getCompetitionDetail,
} from "../../../api/competitions";

import "./CompetitionResults.css";


const toFa = (value) =>
  String(value ?? "").replace(
    /\d/g,
    (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]
  );


const formatJalaliDate = (value) => {
  if (!value) {
    return "—";
  }

  const normalized = String(value)
    .trim()
    .replace(
      /[۰-۹]/g,
      (digit) =>
        "0123456789"[
          "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)
        ]
    )
    .replace(
      /[٠-٩]/g,
      (digit) =>
        "0123456789"[
          "٠١٢٣٤٥٦٧٨٩".indexOf(digit)
        ]
    )
    .replace(/\//g, "-")
    .slice(0, 10);

  const match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (!match) {
    return toFa(
      String(value)
        .slice(0, 10)
        .replace(/-/g, "/")
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // تاریخ از قبل شمسی است
  if (year < 1700) {
    return toFa(
      `${year}/${String(month).padStart(2, "0")}/${String(
        day
      ).padStart(2, "0")}`
    );
  }

  // ساعت ۱۲ برای جلوگیری از تغییر روز بر اثر timezone
  const date = new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );

  return new Intl.DateTimeFormat(
    "fa-IR-u-ca-persian",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  )
    .format(date)
    .replace(/[\u200e\u200f]/g, "");
};
  

const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  "https://api.chbtkd.ir";


const absUrl = (url) => {
  if (!url) return null;

  const raw =
    typeof url === "object"
      ? url.url || url.image || url.file
      : url;

  if (!raw) return null;

  return String(raw).startsWith("http")
    ? raw
    : `${API_BASE}${raw}`;
};


function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== ""
  );
}


function getEntryName(entry) {
  if (!entry) return "";

  if (typeof entry === "string") {
    return entry;
  }

  return (
    entry.participant_name ||
    entry.team_name ||
    entry.player_name ||
    entry.full_name ||
    entry.player?.full_name ||
    (
      `${entry.player?.first_name || ""} ` +
      `${entry.player?.last_name || ""}`
    ).trim() ||
    ""
  );
}


function getEntryCoach(entry) {
  if (
    !entry ||
    typeof entry === "string"
  ) {
    return "";
  }

  return (
    entry.coach_name ||
    entry.coach_full_name ||
    entry.coachName ||
    entry.coach?.full_name ||
    entry.coach?.name ||
    (
      `${entry.coach?.first_name || ""} ` +
      `${entry.coach?.last_name || ""}`
    ).trim() ||
    (
      typeof entry.coach === "string"
        ? entry.coach
        : ""
    ) ||
    ""
  );
}


function getEntryLabel(entry) {
  if (!entry) {
    return "—";
  }

  if (
    typeof entry === "string"
  ) {
    return entry;
  }

  const name =
    getEntryName(entry);

  const coach =
    getEntryCoach(entry);

  return (
    entry.label ||
    [
      name,
      coach,
    ]
      .filter(Boolean)
      .join(" — ") ||
    "—"
  );
}


function EntryCell({
  entry,
  fallbackScore,
}) {
  if (!entry) {
    return (
      <span className="res-entry-empty">
        —
      </span>
    );
  }

  if (typeof entry === "string") {
    return (
      <div className="res-entry">
        <strong className="res-entry-name">
          {entry}
        </strong>
      </div>
    );
  }

  const name =
    getEntryName(entry);

  const coach =
    getEntryCoach(entry);

  const score =
    entry.final_score ??
    entry.score ??
    fallbackScore;

  return (
    <div className="res-entry">

      <strong className="res-entry-name">
        {name || getEntryLabel(entry)}
      </strong>

      {coach && (
        <span className="res-entry-coach">
          مربی: {coach}
        </span>
      )}

      {hasValue(score) && (
        <span className="res-entry-score">
          امتیاز:
          {" "}
          {toFa(score)}
        </span>
      )}

    </div>
  );
}


function getBeltGroupLabel(row) {
  return (
    row?.belt_group_label ||
    row?.belt_group ||
    "بدون گروه کمربندی"
  );
}


function inferKind(
  resultKind,
  meta,
  rows
) {
  const direct = String(
    resultKind ||
    meta?.kind ||
    rows?.[0]?.kind ||
    ""
  )
    .trim()
    .toLowerCase();

  if (direct === "poomsae") {
    return "poomsae";
  }

  if (direct === "kyorugi") {
    return "kyorugi";
  }

  const style = String(
    meta?.style ||
    meta?.style_display ||
    meta?.type ||
    ""
  ).toLowerCase();

  if (
    style.includes("poom") ||
    style.includes("پومسه")
  ) {
    return "poomsae";
  }

  return "kyorugi";
}


function poomsaeSectionLabel(row) {
  const type =
    row?.poomsae_type_label ||
    (
      row?.poomsae_type === "creative"
        ? "ابداعی"
        : "استاندارد"
    );

  const mode =
    row?.mode_label ||
    (
      row?.mode === "team"
        ? "تیمی"
        : "انفرادی"
    );

  return `${type} — ${mode}`;
}


export default function CompetitionResults() {
  const {
    slug,
    role,
  } = useParams();

  const navigate = useNavigate();

  const [meta, setMeta] = useState({
    loading: true,
    error: "",
    data: null,
  });

  const [state, setState] = useState({
    loading: true,
    error: "",
    rows: [],
    kind: "",
    competition: null,
  });

  const [query, setQuery] = useState("");


  useEffect(() => {
    let mounted = true;

    setMeta({
      loading: true,
      error: "",
      data: null,
    });

    getCompetitionDetail(slug)
      .then((data) => {
        if (!mounted) return;

        setMeta({
          loading: false,
          error: "",
          data: data || null,
        });
      })
      .catch((error) => {
        if (!mounted) return;

        setMeta({
          loading: false,
          error:
            error?.message ||
            "خطا در دریافت مسابقه",
          data: null,
        });
      });

    return () => {
      mounted = false;
    };
  }, [slug]);


  useEffect(() => {
    let mounted = true;

    setState({
      loading: true,
      error: "",
      rows: [],
      kind: "",
      competition: null,
    });

    getCompetitionResults(slug)
      .then((data) => {
        if (!mounted) return;

        const rows = Array.isArray(
          data?.results
        )
          ? data.results
          : Array.isArray(data)
          ? data
          : [];

        setState({
          loading: false,
          error: "",
          rows,
          kind:
            data?.kind ||
            rows?.[0]?.kind ||
            "",
          competition:
            data?.competition ||
            null,
        });
      })
      .catch((error) => {
        if (!mounted) return;

        setState({
          loading: false,
          error:
            error?.message ||
            "خطا در دریافت نتایج",
          rows: [],
          kind: "",
          competition: null,
        });
      });

    return () => {
      mounted = false;
    };
  }, [slug]);


  const kind = useMemo(
    () =>
      inferKind(
        state.kind,
        meta.data,
        state.rows
      ),
    [
      state.kind,
      state.rows,
      meta.data,
    ]
  );


  const isPoomsae =
    kind === "poomsae";


  const competitionTitle =
    meta?.data?.title ||
    meta?.data?.name ||
    state?.competition?.title ||
    "—";


  const competitionDate =
    meta?.data?.competition_date ||
    meta?.data?.start_date ||
    state?.competition?.competition_date ||
    null;


  const poster = useMemo(
    () =>
      absUrl(
        meta?.data?.poster?.url ||
        meta?.data?.poster
      ) ||
      "/placeholder.jpg",
    [meta?.data]
  );


  const filtered = useMemo(() => {
    const search = query
      .trim()
      .toLowerCase();

    if (!search) {
      return state.rows;
    }

    return state.rows.filter((row) => {
      const searchableValues = isPoomsae
        ? [
            row?.poomsae_type_label,
            row?.mode_label,
            row?.age_category,
            row?.belt_group,
            row?.mat_number,
            row?.table_order,
            getEntryLabel(row?.gold),
            getEntryLabel(row?.silver),
            getEntryLabel(row?.bronze1),
            getEntryLabel(row?.bronze2),
          ]
        : [
            row?.weight,
            row?.weight_name,
            getBeltGroupLabel(row),
            getEntryLabel(
              row?.gold ||
              row?.gold_enrollment
            ),
            getEntryLabel(
              row?.silver ||
              row?.silver_enrollment
            ),
            getEntryLabel(
              row?.bronze1 ||
              row?.bronze1_enrollment ||
              row?.b1
            ),
            getEntryLabel(
              row?.bronze2 ||
              row?.bronze2_enrollment ||
              row?.b2
            ),
          ];

      return searchableValues
        .filter(hasValue)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(search)
        );
    });
  }, [
    state.rows,
    query,
    isPoomsae,
  ]);


  const groupedResults = useMemo(() => {
    const groups = new Map();

    filtered.forEach((row) => {
      let key;
      let label;

      if (isPoomsae) {
        key = [
          row?.poomsae_type || "standard",
          row?.mode || "single",
        ].join(":");

        label =
          poomsaeSectionLabel(row);
      } else {
        label =
          getBeltGroupLabel(row);

        key = row?.belt_group_id
          ? `id:${row.belt_group_id}`
          : `label:${label}`;
      }

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          rows: [],
        });
      }

      groups
        .get(key)
        .rows
        .push(row);
    });

    return Array.from(
      groups.values()
    );
  }, [
    filtered,
    isPoomsae,
  ]);


  const showGroupHeaders =
    isPoomsae ||
    groupedResults.length > 1;


  const onPrint = () =>
    window.print();


  const detailsPath =
    role
      ? (
          `/dashboard/${encodeURIComponent(
            role
          )}/competitions/${encodeURIComponent(
            slug
          )}`
        )
      : (
          `/competitions/${encodeURIComponent(
            slug
          )}`
        );


  const goBack = () => {

    navigate(
      detailsPath
    );

  };


  return (
    <div
      className="res-container"
      dir="rtl"
    >

      <header className="res-hero">

        <img
          className="res-poster"
          src={poster}
          alt={competitionTitle}
          onError={(event) => {
            event.currentTarget.src =
              "/placeholder.jpg";
          }}
        />

        <div className="res-hero-body">

          <h1 className="res-title">
            {isPoomsae
              ? "نتایج پومسه"
              : "نتایج مسابقه"}
          </h1>

          <div className="res-subtitle">

            <Link
              className="res-link"
              to={detailsPath}
            >
              {competitionTitle}
            </Link>

            {competitionDate && (
              <>
                <span className="res-dot">
                  •
                </span>

                <span className="res-chip">
                  تاریخ برگزاری:
                  {" "}
                  {formatJalaliDate(competitionDate)}
                </span>
              </>
            )}

            <span className="res-chip">
              رشته:
              {" "}
              {isPoomsae
                ? "پومسه"
                : "کیوروگی"}
            </span>

          </div>
        </div>

        <div className="res-actions no-print">

          <button
            type="button"
            className="btn btn-light"
            onClick={goBack}
          >
            بازگشت
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={onPrint}
          >
            چاپ
          </button>

        </div>
      </header>


      <div className="res-toolbar no-print">

        <input
          className="res-search"
          placeholder={
            isPoomsae
              ? "جستجو در نام، مربی، رده سنی یا کمربند…"
              : "جستجو در اسامی، مربی یا وزن…"
          }
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
        />

        <div className="res-count">
          تعداد نتایج:
          {" "}
          <strong>
            {toFa(filtered.length)}
          </strong>
        </div>

      </div>


      <section className="res-content">

        {state.loading ? (
          <div className="res-skeleton">
            در حال بارگذاری…
          </div>

        ) : state.error ? (
          <div className="res-error">
            {state.error}
          </div>

        ) : filtered.length === 0 ? (
          <div className="res-empty">
            نتایجی ثبت نشده است.
          </div>

        ) : (
          <div
            className={
              groupedResults.length > 1
                ? "res-groups res-groups--multiple"
                : "res-groups"
            }
          >

            {groupedResults.map(
              (group) => (
                <section
                  className="res-group-card"
                  key={group.key}
                >

                  {showGroupHeaders && (
                    <header className="res-group-header">

                      <div>
                        <span className="res-group-caption">
                          {isPoomsae
                            ? "بخش مسابقه"
                            : "گروه کمربندی"}
                        </span>

                        <h2 className="res-group-title">
                          {group.label}
                        </h2>
                      </div>

                      <span className="res-group-count">
                        {toFa(group.rows.length)}
                        {" "}
                        {isPoomsae
                          ? "جدول نتیجه"
                          : "رده وزنی"}
                      </span>

                    </header>
                  )}


                  <div className="res-table-wrap">

                    <table
                      className={
                        isPoomsae
                          ? "listing res-table res-table--poomsae"
                          : "listing res-table"
                      }
                    >

                      <caption className="res-print-caption">

                        <span className="res-print-competition-title">
                          {competitionTitle}
                        </span>

                        <span className="res-print-belt-title">
                          {isPoomsae
                            ? `بخش: ${group.label}`
                            : `گروه کمربندی: ${group.label || "—"}`}
                        </span>

                      </caption>


                      <thead>
                        <tr>

                          <th className="col-weight">
                            {isPoomsae
                              ? "مشخصات جدول"
                              : "رده وزنی"}
                          </th>

                          <th className="col-gold">
                            🥇 طلا
                          </th>

                          <th className="col-silver">
                            🥈 نقره
                          </th>

                          <th className="col-bronze">
                            🥉 برنز
                          </th>

                          <th className="col-bronze">
                            🥉 برنز مشترک
                          </th>

                        </tr>
                      </thead>


                      <tbody>

                        {group.rows.map(
                          (row, index) => (
                            <tr
                              key={
                                row?.id ||
                                `${group.key}-${index}`
                              }
                            >

                              <td
                                className="col-weight"
                                data-label={
                                  isPoomsae
                                    ? "مشخصات جدول"
                                    : "رده وزنی"
                                }
                              >

                                {isPoomsae ? (
                                  <div className="res-poomsae-info">

                                    <strong className="res-poomsae-age">
                                      {row?.age_category || "—"}
                                    </strong>

                                    <div className="res-poomsae-meta">

                                      <span>
                                        کمربند:
                                        {" "}
                                        {row?.belt_group || "—"}
                                      </span>

                                      <span>
                                        زمین:
                                        {" "}
                                        {toFa(
                                          row?.mat_number ?? "—"
                                        )}
                                      </span>

                                      <span>
                                        جدول:
                                        {" "}
                                        {toFa(
                                          row?.table_order ?? "—"
                                        )}
                                      </span>

                                      {hasValue(
                                        row?.participant_count
                                      ) && (
                                        <span>
                                          شرکت‌کننده:
                                          {" "}
                                          {toFa(
                                            row.participant_count
                                          )}
                                        </span>
                                      )}

                                    </div>
                                  </div>

                                ) : (
                                  row?.weight ||
                                  row?.weight_name ||
                                  "—"
                                )}

                              </td>


                              <td
                                className="col-gold"
                                data-label="طلا"
                              >
                                <EntryCell
                                  entry={
                                    row?.gold ||
                                    row?.gold_enrollment
                                  }
                                  fallbackScore={
                                    row?.gold_score
                                  }
                                />
                              </td>


                              <td
                                className="col-silver"
                                data-label="نقره"
                              >
                                <EntryCell
                                  entry={
                                    row?.silver ||
                                    row?.silver_enrollment
                                  }
                                  fallbackScore={
                                    row?.silver_score
                                  }
                                />
                              </td>


                              <td
                                className="col-bronze"
                                data-label="برنز"
                              >
                                <EntryCell
                                  entry={
                                    row?.bronze1 ||
                                    row?.bronze1_enrollment ||
                                    row?.b1
                                  }
                                  fallbackScore={
                                    row?.bronze1_score
                                  }
                                />
                              </td>


                              <td
                                className="col-bronze"
                                data-label="برنز مشترک"
                              >
                                <EntryCell
                                  entry={
                                    row?.bronze2 ||
                                    row?.bronze2_enrollment ||
                                    row?.b2
                                  }
                                  fallbackScore={
                                    row?.bronze2_score
                                  }
                                />
                              </td>

                            </tr>
                          )
                        )}

                      </tbody>
                    </table>
                  </div>

                </section>
              )
            )}

          </div>
        )}

      </section>
    </div>
  );
}