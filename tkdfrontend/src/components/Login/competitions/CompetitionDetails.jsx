// src/components/Login/competitions/CompetitionDetails.jsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useNavigate,
} from "react-router-dom";

import {
  getCompetitionDetail,
  getCoachApprovalStatus,
  approveCompetition,
  registerSelf,
  getRegisterSelfPrefill,
  getMyEnrollment,
  getPoomsaeCoachApprovalStatus,
  approvePoomsaeCompetition,
  getMyPoomsaeEnrollments,
  buildPoomsaePrefill,
  registerSelfPoomsae,
  startPaymentIntent,
  submitGatewayForm,
  API_BASE,
  getCoachPlayerCardsInCompetition,
} from "../../../api/competitions";

import {
  showGlobalMessage,
  showGlobalSuccess,
  showGlobalWarning,
} from "../../../services/globalMessage";

import "./CompetitionDetails.css";

/* ====== DatePicker (Jalali) ====== */

import DatePicker from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";


/* ======================================================
   Error helpers
====================================================== */

const getErrorStatus = (error) =>
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
    error?.body ||
    null;

  if (
    typeof data === "string" &&
    data.trim()
  ) {
    return data.trim();
  }

  const direct =
    data?.detail ||
    data?.message ||
    data?.error;

  if (Array.isArray(direct)) {
    const text = direct
      .filter(Boolean)
      .map(String)
      .join("\n");

    if (text) {
      return text;
    }
  }

  if (
    typeof direct === "string" &&
    direct.trim()
  ) {
    return direct.trim();
  }

  if (
    error?.message &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return fallback;
};


const showRequestError = (
  error,
  title,
  fallback
) => {
  showGlobalMessage({
    type: "error",
    title,
    message: getErrorMessage(
      error,
      fallback
    ),
  });
};


/* ======================================================
   Helpers
====================================================== */

function toStringSafe(v) {
  return v == null
    ? ""
    : String(v);
}


const toFa = (str) =>
  String(str ?? "").replace(
    /\d/g,
    (d) =>
      "۰۱۲۳۴۵۶۷۸۹"[d]
  );


const normalizeDigits = (
  s = ""
) =>
  String(s)
    .replace(
      /[۰-۹]/g,
      (d) =>
        "0123456789"[
          "۰۱۲۳۴۵۶۷۸۹".indexOf(
            d
          )
        ]
    )
    .replace(
      /[٠-٩]/g,
      (d) =>
        "0123456789"[
          "٠١٢٣٤٥٦٧٨٩".indexOf(
            d
          )
        ]
    );


const stripRtlMarks = (
  s = ""
) =>
  String(s).replace(
    /[\u200e\u200f\u200c\u202a-\u202e]/g,
    ""
  );


const absUrl = (u) =>
  u
    ? (
        u.startsWith?.("http")
          ? u
          : `${API_BASE}${u}`
      )
    : null;


const fileNameFromUrl = (
  u
) => {
  try {
    return decodeURIComponent(
      String(u)
        .split("/")
        .pop()
    );
  } catch {
    return "فایل";
  }
};


const stripTime = (d) =>
  new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );


const isISODate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}/.test(
    stripRtlMarks(
      normalizeDigits(s)
    )
  );


const toDateSafe = (s) => {
  if (!isISODate(s)) {
    return null;
  }

  const t = stripRtlMarks(
    normalizeDigits(s)
  ).slice(0, 10);

  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!m) {
    return null;
  }

  const y = +m[1];
  const mo = +m[2] - 1;
  const d = +m[3];

  return new Date(
    y,
    mo,
    d
  );
};


/* ======================================================
   Jalali input -> ISO
====================================================== */

const jalaliInputToISO = (
  val
) => {
  if (!val) {
    return "";
  }

  try {
    const src =
      typeof val === "object" &&
      val.isValid
        ? val
        : new DateObject({
            date: stripRtlMarks(
              normalizeDigits(
                String(val)
              )
            ).replace(
              /-/g,
              "/"
            ),
            calendar:
              persian,
            locale:
              persian_fa,
            format:
              "YYYY/MM/DD",
          });

    if (!src?.isValid) {
      return "";
    }

    return src
      .convert(
        gregorian,
        gregorian_en
      )
      .format(
        "YYYY-MM-DD"
      );
  } catch {
    return "";
  }
};


const parseJalaliInputToLocalDate = (
  val
) => {
  const iso =
    jalaliInputToISO(val);

  return iso
    ? toDateSafe(iso)
    : null;
};


/* ======================================================
   Locked profile
====================================================== */

function pickFrom(
  o,
  keys
) {
  if (!o) {
    return "";
  }

  for (const k of keys) {
    if (
      o[k] != null &&
      o[k] !== ""
    ) {
      return String(
        o[k]
      );
    }
  }

  return "";
}


function findNationalIdDeep(
  obj
) {
  if (
    !obj ||
    typeof obj !==
      "object"
  ) {
    return "";
  }

  for (
    const [k, v]
    of Object.entries(obj)
  ) {
    const key =
      String(k)
        .toLowerCase()
        .replace(
          /[\u200c\s-]/g,
          ""
        )
        .replace(
          /ي/g,
          "ی"
        )
        .replace(
          /ك/g,
          "ک"
        );

    const isNatKey =
      key.includes(
        "nationalid"
      ) ||
      key.includes(
        "nationalcode"
      ) ||
      key.includes(
        "nationalidnumber"
      ) ||
      key.includes(
        "mellicode"
      ) ||
      key.includes(
        "codemelli"
      ) ||
      (
        key.includes(
          "melli"
        ) &&
        key.includes(
          "code"
        )
      ) ||
      key === "nid" ||
      key === "ssn" ||
      key.includes(
        "کدملی"
      ) ||
      key.includes(
        "كدملی"
      ) ||
      (
        key.includes(
          "کد"
        ) &&
        key.includes(
          "ملی"
        )
      );

    if (
      isNatKey &&
      v != null &&
      String(v).trim() !==
        ""
    ) {
      return String(v);
    }

    if (
      v &&
      typeof v ===
        "object"
    ) {
      const inner =
        findNationalIdDeep(
          v
        );

      if (inner) {
        return inner;
      }
    }
  }

  return "";
}


function normalizeLockedProfile(
  src
) {
  if (
    !src ||
    typeof src !==
      "object"
  ) {
    return null;
  }

  const sources = [
    src,
    src.profile,
    src.user,
    src.player,
    src.data,
    src.me,
    src.me_locked,
    src.my_locked,
    src.locked_profile,
    src.my_profile,
  ].filter(Boolean);

  const get = (
    ...keys
  ) => {
    for (
      const source
      of sources
    ) {
      const value =
        pickFrom(
          source,
          keys
        );

      if (value) {
        return value;
      }
    }

    return "";
  };

  const locked = {
    first_name: get(
      "first_name",
      "firstName",
      "fname",
      "given_name",
      "name"
    ),

    last_name: get(
      "last_name",
      "lastName",
      "family",
      "family_name",
      "surname"
    ),

    national_id:
      get(
        "national_id",
        "nationalId",
        "nationalID",
        "national_code",
        "nationalCode",
        "code_melli",
        "melli_code",
        "melliCode",
        "codeMelli",
        "nid",
        "ssn"
      ) ||
      findNationalIdDeep(
        src
      ),

    birth_date: get(
      "birth_date_jalali_fa",
      "birth_date_jalali",
      "birth_date",
      "birthDate",
      "dob"
    ),

    belt: get(
      "belt",
      "beltName",
      "belt_name",
      "belt_display"
    ),

    club: get(
      "club",
      "club_name",
      "clubName",
      "academy",
      "academy_name"
    ),

    coach: get(
      "coach",
      "coach_name",
      "coachName",
      "coach_full_name"
    ),
  };

  const hasAny =
    Object.values(
      locked
    ).some(
      (x) =>
        x &&
        String(x).trim() !==
          ""
    );

  return hasAny
    ? locked
    : null;
}


/* ======================================================
   Jalali conversion helpers
====================================================== */

const pad2 = (n) =>
  String(n).padStart(
    2,
    "0"
  );


const div = (a, b) =>
  Math.trunc(
    a / b
  );


const jalBreaks = [
  -61,
  9,
  38,
  199,
  426,
  686,
  756,
  818,
  1111,
  1181,
  1210,
  1635,
  2060,
  2097,
  2192,
  2262,
  2324,
  2394,
  2456,
  3178,
];


function jalCal(jy) {
  let bl =
    jalBreaks.length;

  const gy =
    jy + 621;

  let leapJ =
    -14;

  let jp =
    jalBreaks[0];

  let jm;
  let jump = 0;
  let n;
  let i;

  if (
    jy < jp ||
    jy >=
      jalBreaks[
        bl - 1
      ]
  ) {
    return {
      gy,
      march: 20,
      leap: false,
    };
  }

  for (
    i = 1;
    i < bl;
    i += 1
  ) {
    jm =
      jalBreaks[i];

    jump =
      jm - jp;

    if (jy < jm) {
      break;
    }

    leapJ +=
      div(
        jump,
        33
      ) *
        8 +
      div(
        jump % 33,
        4
      );

    jp = jm;
  }

  n =
    jy - jp;

  leapJ +=
    div(
      n,
      33
    ) *
      8 +
    div(
      n % 33,
      4
    );

  if (
    jump % 33 ===
      4 &&
    jump - n === 4
  ) {
    leapJ += 1;
  }

  const leapG =
    div(
      gy,
      4
    ) -
    div(
      div(
        gy,
        100
      ) + 1,
      4
    ) +
    div(
      gy,
      400
    ) -
    70;

  const march =
    20 +
    leapJ -
    leapG;

  let leap = false;

  if (
    n >= 0 &&
    [
      1,
      5,
      9,
      13,
      17,
      22,
      26,
      30,
    ].includes(
      n % 33
    )
  ) {
    leap = true;
  }

  return {
    gy,
    march,
    leap,
  };
}


function g2d(
  gy,
  gm,
  gd
) {
  const a =
    div(
      14 - gm,
      12
    );

  const y =
    gy +
    4800 -
    a;

  const m =
    gm +
    12 * a -
    3;

  return (
    gd +
    365 * y +
    div(y, 4) -
    div(y, 100) +
    div(y, 400) +
    div(
      153 * m + 2,
      5
    ) -
    32045
  );
}


function d2g(jdn) {
  const j =
    jdn +
    32044;

  const g =
    div(
      j,
      146097
    );

  const dg =
    j %
    146097;

  const c =
    div(
      (
        div(
          dg,
          36524
        ) + 1
      ) * 3,
      4
    );

  const dc =
    dg -
    c * 36524;

  const b =
    div(
      dc,
      1461
    );

  const db =
    dc %
    1461;

  const a =
    div(
      (
        div(
          db,
          365
        ) + 1
      ) * 3,
      4
    );

  const da =
    db -
    a * 365;

  let y =
    g * 400 +
    c * 100 +
    b * 4 +
    a;

  let m =
    div(
      5 * da +
        308,
      153
    ) -
    2;

  const d =
    da -
    div(
      153 *
        (m + 2) +
        2,
      5
    ) +
    1;

  y =
    y -
    4800 +
    div(
      m + 2,
      12
    );

  m =
    (
      m + 2
    ) %
      12 +
    1;

  return {
    gy: y,
    gm: m,
    gd: d,
  };
}


function j2d(
  jy,
  jm,
  jd
) {
  const r =
    jalCal(jy);

  return (
    g2d(
      r.gy,
      3,
      r.march
    ) +
    (jm - 1) *
      31 -
    div(
      jm,
      7
    ) *
      (jm - 7) +
    jd -
    1
  );
}


function d2j(jdn) {
  let { gy } =
    d2g(jdn);

  let jy =
    gy - 621;

  let r =
    jalCal(jy);

  let jdn1f =
    g2d(
      gy,
      3,
      r.march
    );

  let jd;
  let jm;

  if (
    jdn >=
    jdn1f
  ) {
    jd =
      jdn -
      jdn1f +
      1;
  } else {
    jy -= 1;

    r =
      jalCal(jy);

    jdn1f =
      g2d(
        gy - 1,
        3,
        r.march
      );

    jd =
      jdn -
      jdn1f +
      1;
  }

  if (
    jd <= 186
  ) {
    jm =
      1 +
      Math.floor(
        (jd - 1) /
          31
      );

    jd =
      jd -
      31 *
        (jm - 1);
  } else {
    jd -=
      186;

    jm =
      7 +
      Math.floor(
        (jd - 1) /
          30
      );

    jd =
      jd -
      30 *
        (jm - 7);
  }

  return {
    jy,
    jm,
    jd,
  };
}


function gregorianToJalali(
  gy,
  gm,
  gd
) {
  return d2j(
    g2d(
      gy,
      gm,
      gd
    )
  );
}


function isoToJalaliFa(
  iso
) {
  let s =
    toStringSafe(
      iso
    );

  s =
    stripRtlMarks(
      normalizeDigits(s)
    ).trim();

  const m =
    s.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );

  if (!m) {
    return toFa(
      s
        .replace(
          /-/g,
          "/"
        )
        .slice(
          0,
          10
        )
    );
  }

  const gy =
    parseInt(
      m[1],
      10
    );

  const gm =
    parseInt(
      m[2],
      10
    );

  const gd =
    parseInt(
      m[3],
      10
    );

  if (
    gy < 1700
  ) {
    return toFa(
      `${gy}/${pad2(
        gm
      )}/${pad2(
        gd
      )}`
    );
  }

  const {
    jy,
    jm,
    jd,
  } =
    gregorianToJalali(
      gy,
      gm,
      gd
    );

  return toFa(
    `${jy}/${pad2(
      jm
    )}/${pad2(
      jd
    )}`
  );
}


function fmtDateFa(
  val
) {
  if (!val) {
    return "—";
  }

  const norm =
    stripRtlMarks(
      normalizeDigits(
        String(val)
      )
    );

  if (
    /^\d{4}-\d{1,2}-\d{1,2}/.test(
      norm
    )
  ) {
    return isoToJalaliFa(
      norm
    );
  }

  return toFa(
    norm
      .slice(
        0,
        10
      )
      .replace(
        /-/g,
        "/"
      )
  );
}


/* ======================================================
   Gender
====================================================== */

const _GENDER_MAP = {
  male: "male",
  m: "male",
  man: "male",
  آقا: "male",
  اقا: "male",
  مرد: "male",
  آقایان: "male",
  آقايان: "male",
  اقایان: "male",

  female: "female",
  f: "female",
  woman: "female",
  زن: "female",
  خانم: "female",
  بانو: "female",
  بانوان: "female",
  "خانم‌ها": "female",
  خانمها: "female",

  both: "both",
  مختلط: "both",
  mix: "both",
  mixed: "both",
};


function normGender(v) {
  if (v == null) {
    return null;
  }

  const t =
    String(v)
      .trim()
      .toLowerCase()
      .replace(
        /ي/g,
        "ی"
      )
      .replace(
        /ك/g,
        "ک"
      )
      .replace(
        /\u200c/g,
        ""
      )
      .replace(
        /-/g,
        ""
      );

  return (
    _GENDER_MAP[t] ||
    t
  );
}


function cleanAgeText(s) {
  if (!s) {
    return "—";
  }

  let t =
    stripRtlMarks(
      String(s)
    )
      .replace(
        /ي/g,
        "ی"
      )
      .replace(
        /ك/g,
        "ک"
      );

  t = t.replace(
    /(?:^|\s)(?:رده|گروه)[\س\u200c]*سنی\s*[:：٫،-]?\s*/gi,
    ""
  );

  t = t.replace(
    /^[\s:：٫،-]+/,
    ""
  );

  t = t
    .replace(
      /\s*،\s*/g,
      "، "
    )
    .replace(
      /\s{2,}/g,
      " "
    )
    .trim();

  return t || "—";
}


function allowedBeltsFromCompetition(
  c
) {
  if (!c) {
    return null;
  }

  if (
    Array.isArray(
      c.allowed_belts
    ) &&
    c.allowed_belts.length
  ) {
    return new Set(
      c.allowed_belts.map(
        (v) =>
          String(v).trim()
      )
    );
  }

  if (
    Array.isArray(
      c.belt_names
    ) &&
    c.belt_names.length
  ) {
    return new Set(
      c.belt_names.map(
        (v) =>
          String(v).trim()
      )
    );
  }

  if (
    Array.isArray(
      c.belts
    ) &&
    c.belts.length
  ) {
    return new Set(
      c.belts.map(
        (v) =>
          String(v).trim()
      )
    );
  }

  if (
    Array.isArray(
      c.belt_groups
    )
  ) {
    const result =
      new Set();

    c.belt_groups.forEach(
      (group) => {
        const arr =
          Array.isArray(
            group?.belts
          )
            ? group.belts
            : [];

        arr.forEach(
          (belt) => {
            if (
              belt?.name
            ) {
              result.add(
                String(
                  belt.name
                ).trim()
              );
            }
          }
        );
      }
    );

    if (
      result.size
    ) {
      return result;
    }
  }

  return null;
}


function beltHeaderTextFromComp(
  c
) {
  const direct =
    c?.belt_level_display ||
    c?.belt_category_display ||
    c?.belt_level_name ||
    c?.belt_category_name ||
    c?.belt_level_text ||
    c?.belt_range_display;

  if (direct) {
    return direct;
  }

  const enumMap = {
    yellow_blue:
      "زرد تا آبی",
    red_black:
      "قرمز تا مشکی",
    all:
      "همهٔ کمربندها",
    any:
      "همهٔ کمربندها",
  };

  const lvl =
    String(
      c?.belt_level ||
      c?.belt_category ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    enumMap[lvl]
  ) {
    return enumMap[lvl];
  }

  if (
    Array.isArray(
      c?.belt_names
    ) &&
    c.belt_names.length
  ) {
    return c.belt_names.join(
      "، "
    );
  }

  if (
    Array.isArray(
      c?.belts
    ) &&
    c.belts.length
  ) {
    return c.belts.join(
      "، "
    );
  }

  return "—";
}


function ageGroupsTextFromComp(
  c
) {
  if (!c) {
    return "—";
  }

  const direct =
    c?.age_groups_display ??
    c?.ageGroupsDisplay;

  if (direct) {
    return direct;
  }

  const arr =
    c?.age_categories ??
    c?.ageCategories ??
    [];

  if (
    Array.isArray(
      arr
    ) &&
    arr.length
  ) {
    const list =
      arr
        .map(
          (a) =>
            a?.name ||
            `${fmtDateFa(
              a?.from_date ||
              a?.fromDate
            )}–${fmtDateFa(
              a?.to_date ||
              a?.toDate
            )}`
        )
        .filter(Boolean);

    if (
      list.length
    ) {
      return list.join(
        "، "
      );
    }
  }

  return "—";
}


function genderFaLabel(
  g
) {
  const n =
    normGender(g);

  if (
    n === "male"
  ) {
    return "آقایان";
  }

  if (
    n === "female"
  ) {
    return "بانوان";
  }

  if (
    n === "both"
  ) {
    return "مختلط";
  }

  return (
    typeof g ===
      "string" &&
    /[آ-ی]/.test(g)
  )
    ? g
    : "—";
}


function extractPlayerFromCompOrForm(
  comp,
  lockedFromForm
) {
  const candidates = [
    lockedFromForm,
    comp?.me_locked,
    comp?.my_locked,
    comp?.locked,
    comp?.my_profile,
    comp?.me,
    comp?.user,
    comp?.player,
  ];

  for (
    const obj
    of candidates
  ) {
    if (
      obj &&
      (
        obj.belt ||
        obj.beltName ||
        obj.gender ||
        obj.gender_display
      )
    ) {
      const belt =
        obj.belt ||
        obj.beltName ||
        obj.belt_name ||
        "";

      const gender =
        normGender(
          obj.gender ||
          obj.gender_display
        );

      return {
        belt:
          String(
            belt || ""
          ),

        gender:
          gender ||
          null,
      };
    }
  }

  return {
    belt: "",
    gender: null,
  };
}


/* ======================================================
   Birth date helpers
====================================================== */

const ISO_REGEX =
  /\b(19|20)\d{2}-\d{2}-\d{2}\b/;


function findBirthISODep(
  obj
) {
  if (
    !obj ||
    typeof obj !==
      "object"
  ) {
    return "";
  }

  for (
    const k
    of Object.keys(obj)
  ) {
    const v =
      obj[k];

    if (
      typeof v ===
        "string" &&
      ISO_REGEX.test(v)
    ) {
      return v.match(
        ISO_REGEX
      )[0];
    }
  }

  for (
    const k
    of Object.keys(obj)
  ) {
    const v =
      obj[k];

    if (
      v &&
      typeof v ===
        "object"
    ) {
      const found =
        findBirthISODep(
          v
        );

      if (found) {
        return found;
      }
    }
  }

  return "";
}


function mergeLockedProfiles(
  oldLocked,
  newLocked
) {
  if (!oldLocked) {
    return (
      newLocked ||
      null
    );
  }

  if (!newLocked) {
    return oldLocked;
  }

  const keys = [
    "first_name",
    "last_name",
    "national_id",
    "birth_date",
    "belt",
    "club",
    "coach",
  ];

  const out = {
    ...oldLocked,
  };

  for (
    const k
    of keys
  ) {
    const v =
      newLocked[k];

    if (
      v != null &&
      String(v).trim() !==
        ""
    ) {
      out[k] =
        String(v);
    }
  }

  return out;
}


function toJalaliDO(s) {
  if (!s) {
    return null;
  }

  try {
    const t =
      stripRtlMarks(
        normalizeDigits(
          String(s)
        )
      ).replace(
        /-/g,
        "/"
      );

    return new DateObject({
      date: t,
      calendar:
        persian,
      locale:
        persian_fa,
      format:
        "YYYY/MM/DD",
    });
  } catch {
    return null;
  }
}


function pickBirthFa(
  locked
) {
  if (!locked) {
    return "—";
  }

  const dfa =
    locked
      ?.birth_date_jalali_fa ??
    locked
      ?.birthDateJalaliFa;

  if (dfa) {
    return toFa(
      stripRtlMarks(
        String(dfa)
      )
        .replace(
          /-/g,
          "/"
        )
        .slice(
          0,
          10
        )
    );
  }

  if (
    locked?.birth_date &&
    !ISO_REGEX.test(
      String(
        locked.birth_date
      )
    )
  ) {
    return toFa(
      stripRtlMarks(
        String(
          locked.birth_date
        )
      )
        .replace(
          /-/g,
          "/"
        )
        .slice(
          0,
          10
        )
    );
  }

  const iso =
    findBirthISODep(
      locked
    );

  return iso
    ? isoToJalaliFa(
        iso
      )
    : "—";
}


/* ======================================================
   Discipline
====================================================== */

function inferDiscipline(
  comp
) {
  const k =
    String(
      comp?.kind ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    k === "poomsae"
  ) {
    return "poomsae";
  }

  if (
    k === "kyorugi"
  ) {
    return "kyorugi";
  }

  const s =
    String(
      comp?.style_display ||
      comp?.style ||
      comp?.type ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    s.includes(
      "پومسه"
    ) ||
    s.includes(
      "poom"
    )
  ) {
    return "poomsae";
  }

  if (
    s.includes(
      "کیوروگی"
    ) ||
    s.includes(
      "kyor"
    )
  ) {
    return "kyorugi";
  }

  return "kyorugi";
}


function lockedFromCompetition(
  comp
) {
  if (!comp) {
    return null;
  }

  const me =
    comp.locked ||
    comp.my_locked ||
    comp.me_locked ||
    comp.my_profile ||
    comp.me ||
    comp.user ||
    comp.player ||
    null;

  return normalizeLockedProfile(
    me
  );
}


/* ======================================================
   Component
====================================================== */

export default function CompetitionDetails() {
  const {
    slug,
    role: roleFromRoute,
  } = useParams();

  const navigate =
    useNavigate();

  const role =
    (
      roleFromRoute ||
      localStorage.getItem(
        "user_role"
      ) ||
      "guest"
    ).toLowerCase();

  const isPlayer =
    role === "player" ||
    role === "both";

  const isCoach =
    role === "coach" ||
    role === "both";

  const isRef =
    role === "referee";


  const [
    competition,
    setCompetition,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);


  /* ====================================================
     KY register state
  ==================================================== */

  const [
    reg,
    setReg,
  ] = useState({
    open: false,
    loading: false,
    errors: {},
    can_register: false,
    need_coach_code: true,
    locked: null,
    coach_code: "",
    weight_category_id:
      "",
    insurance_number:
      "",
    insurance_issue_date:
      "",
    confirmed: false,
  });


  /* ====================================================
     Poomsae register state
  ==================================================== */

  const [
    regP,
    setRegP,
  ] = useState({
    open: false,
    loading: false,
    errors: {},
    can_register: false,
    need_coach_code: true,
    locked: null,
    coach_code: "",
    poomsae_type: "",
    insurance_number:
      "",
    insurance_issue_date:
      "",
    confirmed: false,
  });


  /* ====================================================
     Coach code modal
  ==================================================== */

  const [
    codeModal,
    setCodeModal,
  ] = useState({
    open: false,
    loading: true,
    code: null,
    approved: false,
  });


  /* ====================================================
     Card info
  ==================================================== */

  const [
    cardInfo,
    setCardInfo,
  ] = useState({
    loading: false,
    checked: false,
    enrollmentId: null,
    enrollmentIds: [],
    status: null,
    canShow: false,
  });


  const [
    lightbox,
    setLightbox,
  ] = useState(null);


  const [
    coachCardsLoading,
    setCoachCardsLoading,
  ] = useState(false);


  /* ====================================================
     Unauthorized
  ==================================================== */

  const handleUnauthorized =
    useCallback(() => {
      const currentRole =
        (
          localStorage.getItem(
            "user_role"
          ) ||
          role ||
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
      role,
    ]);


  /* ====================================================
     Load competition
  ==================================================== */

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setLoadFailed(
      false
    );

    getCompetitionDetail(
      slug
    )
      .then((data) => {
        if (!mounted) {
          return;
        }

        setCompetition(
          data || null
        );
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        console.error(
          "COMPETITION_DETAIL_LOAD_ERROR",
          error
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

        if (
          status === 404
        ) {
          showGlobalWarning(
            "مسابقه موردنظر یافت نشد یا دیگر در دسترس نیست.",
            "مسابقه یافت نشد"
          );

          return;
        }

        showRequestError(
          error,
          "خطا در دریافت اطلاعات مسابقه",
          "اطلاعات مسابقه از سرور دریافت نشد."
        );
      })
      .finally(() => {
        if (mounted) {
          setLoading(
            false
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [
    slug,
    handleUnauthorized,
  ]);


  /* ====================================================
     Discipline
  ==================================================== */

  const discipline =
    useMemo(
      () =>
        inferDiscipline(
          competition
        ),
      [competition]
    );

  const isKyorugi =
    discipline ===
    "kyorugi";

  const isPoomsae =
    discipline ===
    "poomsae";




  /* ====================================================
     Check personal enrollment/card
     Background check: errors are mostly silent.
  ==================================================== */

  useEffect(() => {
    let mounted = true;

    const canHavePersonalCard =
      isPlayer ||
      isCoach;

    if (
      !canHavePersonalCard ||
      !competition
    ) {
      setCardInfo(
        (state) => ({
          ...state,
          checked: true,
          enrollmentId:
            null,
          enrollmentIds:
            [],
          status: null,
          canShow:
            false,
          loading:
            false,
        })
      );

      return () => {
        mounted = false;
      };
    }

    setCardInfo({
      loading: true,
      checked: false,
      enrollmentId: null,
      enrollmentIds: [],
      status: null,
      canShow: false,
    });

    const run =
      async () => {
        try {
          if (isKyorugi) {
            const res =
              await getMyEnrollment(
                slug
              );

            if (!mounted) {
              return;
            }

            setCardInfo({
              loading: false,
              checked: true,
              enrollmentId:
                res?.enrollment_id ||
                null,
              enrollmentIds:
                [],
              status:
                res?.status ||
                null,
              canShow:
                !!res
                  ?.enrollment_id,
            });

          } else if (
            isPoomsae
          ) {
            const res =
              await getMyPoomsaeEnrollments(
                slug
              );

            if (!mounted) {
              return;
            }

            let ids = [];
            let firstId =
              null;

            if (
              Array.isArray(
                res?.items
              ) &&
              res.items.length
            ) {
              ids =
                res.items
                  .map(
                    (item) =>
                      item
                        ?.enrollment_id ??
                      item?.id
                  )
                  .map(
                    (value) =>
                      parseInt(
                        value,
                        10
                      )
                  )
                  .filter(
                    (id) =>
                      Number.isFinite(
                        id
                      ) &&
                      id > 0
                  );

              const maybeFirst =
                res.items?.[0]
                  ?.enrollment_id ??
                res.items?.[0]
                  ?.id;

              const parsed =
                parseInt(
                  maybeFirst,
                  10
                );

              firstId =
                Number.isFinite(
                  parsed
                ) &&
                parsed > 0
                  ? parsed
                  : null;

            } else {
              const stdId =
                res?.standard
                  ?.enrollment_id ??
                res?.standard
                  ?.id ??
                null;

              const creId =
                res?.creative
                  ?.enrollment_id ??
                res?.creative
                  ?.id ??
                null;

              ids =
                [
                  stdId,
                  creId,
                ]
                  .map(
                    (value) =>
                      parseInt(
                        value,
                        10
                      )
                  )
                  .filter(
                    (id) =>
                      Number.isFinite(
                        id
                      ) &&
                      id > 0
                  );

              firstId =
                ids[0] ||
                null;
            }

            ids =
              Array.from(
                new Set(ids)
              );

            const status =
              res?.standard
                ?.status ||
              res?.creative
                ?.status ||
              (
                Array.isArray(
                  res?.items
                ) &&
                res.items[0]
                  ?.status
              ) ||
              null;

            setCardInfo({
              loading: false,
              checked: true,
              enrollmentId:
                ids[0] ||
                firstId ||
                null,
              enrollmentIds:
                ids,
              status,
              canShow:
                ids.length >
                  0 ||
                !!firstId,
            });
          }

        } catch (error) {
          if (!mounted) {
            return;
          }

          if (
            getErrorStatus(
              error
            ) === 401
          ) {
            handleUnauthorized();
          }

          setCardInfo({
            loading: false,
            checked: true,
            enrollmentId:
              null,
            enrollmentIds:
              [],
            status: null,
            canShow:
              false,
          });
        }
      };

    run();

    return () => {
      mounted = false;
    };
  }, [
    slug,
    competition,
    isPlayer,
    isCoach,
    isKyorugi,
    isPoomsae,
    handleUnauthorized,
  ]);


  /* ====================================================
     Dates
  ==================================================== */

  const registrationStart =
    useMemo(
      () =>
        toDateSafe(
          competition
            ?.registration_start
        ),
      [competition]
    );


  const registrationEnd =
    useMemo(
      () =>
        toDateSafe(
          competition
            ?.registration_end
        ),
      [competition]
    );


  const competitionDate =
    useMemo(
      () =>
        isKyorugi
          ? toDateSafe(
              competition
                ?.competition_date
            )
          : (
              toDateSafe(
                competition
                  ?.start_date
              ) ||
              toDateSafe(
                competition
                  ?.competition_date
              )
            ),
      [
        competition,
        isKyorugi,
      ]
    );


  const today =
    stripTime(
      new Date()
    );


  const inRegWindow =
    useMemo(() => {
      if (
        registrationStart &&
        registrationEnd
      ) {
        const start =
          stripTime(
            registrationStart
          );

        const end =
          stripTime(
            registrationEnd
          );

        return (
          today >= start &&
          today <= end
        );
      }

      if (
        typeof competition
          ?.registration_open ===
        "boolean"
      ) {
        return competition
          .registration_open;
      }

      return !!competition
        ?.registration_open;
    }, [
      registrationStart,
      registrationEnd,
      competition
        ?.registration_open,
      today,
    ]);


  const statusSaysOpen =
    useMemo(() => {
      const status =
        String(
          competition
            ?.status ||
          ""
        ).toLowerCase();

      return [
        "open",
        "registration_open",
        "reg_open",
        "opened",
      ].includes(status);
    }, [
      competition?.status,
    ]);


  const regOpenEff =
    competition
      ?.registration_open_effective ??
    competition
      ?.registration_open;

  const regManual =
    competition
      ?.registration_manual ??
    competition
      ?.registration_manual_open;

  const canRegisterFlag =
    competition
      ?.can_register;


  const registrationOpenBase =
    useMemo(() => {
      if (
        typeof regOpenEff ===
        "boolean"
      ) {
        return regOpenEff;
      }

      if (
        regManual === true
      ) {
        return true;
      }

      if (
        regManual === false
      ) {
        return false;
      }

      if (
        typeof canRegisterFlag ===
        "boolean"
      ) {
        return canRegisterFlag;
      }

      if (
        statusSaysOpen
      ) {
        return true;
      }

      return inRegWindow;
    }, [
      regOpenEff,
      regManual,
      canRegisterFlag,
      statusSaysOpen,
      inRegWindow,
    ]);


  /* ====================================================
     Eligibility
  ==================================================== */

  const eligibility =
    useMemo(() => {
      if (
        typeof competition
          ?.user_eligible_self ===
        "boolean"
      ) {
        return {
          ok:
            !!competition
              .user_eligible_self,
        };
      }

      const compGender =
        normGender(
          competition?.gender ||
          competition
            ?.gender_display
        ) ||
        "both";

      const allowedBelts =
        allowedBeltsFromCompetition(
          competition
        );

      const player =
        extractPlayerFromCompOrForm(
          competition,
          reg.locked ||
            regP.locked
        );

      if (
        !player.gender &&
        !player.belt
      ) {
        return {
          ok: null,
        };
      }

      const genderOK =
        compGender ===
          "both" ||
        (
          player.gender &&
          compGender ===
            player.gender
        );

      let beltOK = true;

      if (
        allowedBelts instanceof
        Set
      ) {
        beltOK =
          player.belt
            ? allowedBelts.has(
                String(
                  player.belt
                ).trim()
              )
            : false;
      }

      return {
        ok:
          !!genderOK &&
          !!beltOK,
      };
    }, [
      competition,
      reg.locked,
      regP.locked,
    ]);


  const canClickSelf =
    registrationOpenBase ===
      true &&
    eligibility.ok ===
      true;


  const canClickCoachRegister =
    registrationOpenBase ===
    true;


  const coachDisableReason =
    useMemo(() => {
      if (
        regManual ===
        false
      ) {
        return "ثبت‌نام توسط ادمین بسته شده است";
      }

      if (
        !registrationOpenBase
      ) {
        return inRegWindow
          ? "ثبت‌نام این مسابقه فعال نیست"
          : "خارج از بازه ثبت‌نام";
      }

      return "";
    }, [
      regManual,
      registrationOpenBase,
      inRegWindow,
    ]);


  const beltGroupsDisplay =
    useMemo(() => {
      const groups =
        competition
          ?.belt_groups ||
        competition
          ?.belt_groups_display ||
        [];

      if (
        Array.isArray(
          groups
        )
      ) {
        return groups
          .map(
            (group) =>
              typeof group ===
              "string"
                ? group
                : group?.label ||
                  group?.name
          )
          .filter(Boolean)
          .join(
            "، "
          );
      }

      return (
        groups ||
        "—"
      );
    }, [
      competition,
    ]);


  const beltHeaderText =
    useMemo(
      () =>
        beltHeaderTextFromComp(
          competition
        ),
      [competition]
    );


  const ageHeaderText =
    useMemo(() => {
      const raw =
        competition
          ?.age_category_name ??
        competition
          ?.ageCategoryName ??
        competition
          ?.age_category_display ??
        competition
          ?.ageCategoryDisplay ??
        "";

      return (
        cleanAgeText(
          raw
        ) ||
        "—"
      );
    }, [
      competition,
    ]);


  const ageGroupsValue =
    useMemo(() => {
      const raw =
        competition
          ?.age_groups_display ??
        competition
          ?.ageGroupsDisplay ??
        ageGroupsTextFromComp(
          competition
        );

      return cleanAgeText(
        raw
      );
    }, [
      competition,
    ]);


  const genderLabel =
    useMemo(
      () =>
        competition
          ?.gender_display ||
        competition
          ?.gender ||
        "—",
      [competition]
    );


  /* ====================================================
     Navigation
  ==================================================== */

  const navigateRole = (
    path,
    state
  ) =>
    navigate(
      `/dashboard/${encodeURIComponent(
        role
      )}${path}`,
      state
        ? {
            state,
          }
        : undefined
    );


  const goBackToDashboardList =
    () =>
      navigate(
        `/dashboard/${encodeURIComponent(
          role
        )}`
      );


  const goRegisterAthlete =
    () =>
      navigateRole(
        `/competitions/${encodeURIComponent(
          slug
        )}/register/athlete`,
        {
          style:
            discipline,
        }
      );


  /* ====================================================
     Coach player cards
  ==================================================== */

  const goCoachPlayerCards =
    async () => {
      if (
        coachCardsLoading
      ) {
        return;
      }

      try {
        setCoachCardsLoading(
          true
        );

        const kind =
          isPoomsae
            ? "poomsae"
            : "kyorugi";

        const response =
          await getCoachPlayerCardsInCompetition(
            slug,
            kind
          );

        const rawIds = [
          ...(
            Array.isArray(
              response
                ?.enrollment_ids
            )
              ? response
                  .enrollment_ids
              : []
          ),

          ...(
            Array.isArray(
              response
                ?.individual_enrollment_ids
            )
              ? response
                  .individual_enrollment_ids
              : []
          ),

          ...(
            Array.isArray(
              response
                ?.team_enrollment_ids
            )
              ? response
                  .team_enrollment_ids
              : []
          ),
        ];

        const ids =
          Array.from(
            new Set(
              rawIds
                .map(Number)
                .filter(
                  (id) =>
                    Number.isFinite(
                      id
                    ) &&
                    id > 0
                )
            )
          );

        if (!ids.length) {
          showGlobalWarning(
            "برای این مسابقه آیدی‌کارت آماده‌ای برای بازیکنان شما یافت نشد.",
            "آیدی‌کارتی یافت نشد"
          );

          return;
        }

        const idsQuery =
          encodeURIComponent(
            ids.join(",")
          );

        navigate(
          `/dashboard/${encodeURIComponent(
            role
          )}` +
            `/enrollments/bulk?ids=${idsQuery}` +
            `&kind=${encodeURIComponent(
              kind
            )}`,
          {
            state: {
              ids,
              kind,
              competitionTitle:
                competition
                  ?.title ||
                competition
                  ?.name ||
                "",
            },
          }
        );

      } catch (error) {
        console.error(
          "COACH_PLAYER_CARDS_ERROR",
          error
        );

        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          handleUnauthorized();
          return;
        }

        showRequestError(
          error,
          "خطا در دریافت آیدی‌کارت‌ها",
          "آیدی‌کارت بازیکنان دریافت نشد."
        );

      } finally {
        setCoachCardsLoading(
          false
        );
      }
    };


  const goRegisterTeam =
    () =>
      navigateRole(
        `/competitions/${encodeURIComponent(
          slug
        )}/register/team`,
        {
          style:
            "poomsae",
          mode:
            "team",
        }
      );


 /* ====================================================
   Competition Navigation
==================================================== */

const competitionKey =
  competition?.public_id ||
  competition?.slug ||
  slug;


/*
 * نکته:
 * role برای دسترسی‌های کاربری استفاده می‌شود،
 * اما برای تشخیص اینکه صفحه از Dashboard آمده یا Home
 * فقط roleFromRoute معتبر است.
 */

const isDashboardCompetition =
  Boolean(roleFromRoute);


const competitionBasePath =
  isDashboardCompetition
    ? `/dashboard/${encodeURIComponent(
        roleFromRoute
      )}/competitions/${encodeURIComponent(
        competitionKey
      )}`
    : `/competitions/${encodeURIComponent(
        competitionKey
      )}`;


/* ====================================================
   Kyorugi bracket
==================================================== */

const goBracket = () => {

  if (!competitionKey) {
    return;
  }

  navigate(
    `${competitionBasePath}/bracket`
  );
};


/* ====================================================
   Poomsae draw
==================================================== */

const goPoomsaeDraw = () => {

  if (!competitionKey) {
    return;
  }

  navigate(
    `${competitionBasePath}/poomsae-draw`
  );
};


/* ====================================================
   Table button
==================================================== */

const onBracketClick = () => {

  if (!competitionKey) {
    return;
  }

  if (isPoomsae) {

    goPoomsaeDraw();

    return;
  }

  goBracket();
};


/* ====================================================
   Results
==================================================== */

const goResults = () => {

  if (!competitionKey) {
    return;
  }

  navigate(
    `${competitionBasePath}/results`
  );
};
  /* ====================================================
     Coach code modal
  ==================================================== */

  const onOpenCoachCode =
    async () => {
      const roleLS =
        (
          localStorage.getItem(
            "user_role"
          ) || ""
        )
          .toLowerCase()
          .trim();

      const roleTokenKey =
        roleLS
          ? `${roleLS}_token`
          : null;

      const token =
        (
          roleTokenKey &&
          localStorage.getItem(
            roleTokenKey
          )
        ) ||
        localStorage.getItem(
          "coach_token"
        ) ||
        localStorage.getItem(
          "both_token"
        ) ||
        localStorage.getItem(
          "access_token"
        ) ||
        localStorage.getItem(
          "access"
        ) ||
        localStorage.getItem(
          "auth_token"
        ) ||
        localStorage.getItem(
          "token"
        );

      if (
        isKyorugi &&
        !token
      ) {
        showGlobalMessage({
          type: "warning",

          title:
            "ورود مربی الزامی است",

          message:
            "برای مشاهده کد تأیید باید با حساب مربی وارد شوید.",

          onClose: () => {
            navigate(
              `/dashboard/${encodeURIComponent(
                role
              )}`
            );
          },
        });

        return;
      }

      setCodeModal({
        open: true,
        loading: true,
        code: null,
        approved: false,
      });

      try {
        const data =
          isKyorugi
            ? await getCoachApprovalStatus(
                slug
              )
            : await getPoomsaeCoachApprovalStatus(
                slug
              );

        setCodeModal({
          open: true,
          loading: false,
          code:
            data?.code ||
            null,
          approved:
            !!data?.approved,
        });

      } catch (error) {
        console.error(
          "COACH_CODE_STATUS_ERROR",
          error
        );

        setCodeModal({
          open: false,
          loading: false,
          code: null,
          approved: false,
        });

        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          handleUnauthorized();
          return;
        }

        showRequestError(
          error,
          "خطا در دریافت کد مربی",
          "وضعیت کد تأیید مربی دریافت نشد."
        );
      }
    };


  const approveAndGetCode =
    async () => {
      try {
        setCodeModal(
          (modal) => ({
            ...modal,
            loading: true,
          })
        );

        const response =
          isKyorugi
            ? await approveCompetition(
                slug
              )
            : await approvePoomsaeCompetition(
                slug
              );

        setCodeModal({
          open: true,
          loading: false,
          code:
            response?.code ||
            null,
          approved: true,
        });

        if (
          !response?.code
        ) {
          showGlobalWarning(
            "تأیید مربی انجام شد، اما هنوز کدی از سرور دریافت نشده است.",
            "کد تأیید موجود نیست"
          );
        }

      } catch (error) {
        console.error(
          "COACH_CODE_APPROVE_ERROR",
          error
        );

        setCodeModal(
          (modal) => ({
            ...modal,
            loading: false,
          })
        );

        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          handleUnauthorized();
          return;
        }

        showRequestError(
          error,
          "خطا در دریافت کد مربی",
          "کد تأیید مربی دریافت نشد."
        );
      }
    };




  /* ====================================================
     Copy coach code
  ==================================================== */

  const copyCode =
    async () => {
      const value =
        String(
          codeModal.code ||
          ""
        ).trim();

      if (!value) {
        showGlobalWarning(
          "کدی برای کپی وجود ندارد.",
          "کد موجود نیست"
        );

        return;
      }

      try {
        await navigator
          .clipboard
          .writeText(
            value
          );

        showGlobalSuccess(
          "کد تأیید مربی با موفقیت کپی شد.",
          "کد کپی شد"
        );

      } catch (error) {
        console.warn(
          "COACH_CODE_COPY_ERROR",
          error
        );

        showGlobalMessage({
          type: "info",

          title:
            "کپی دستی کد",

          message:
            `امکان کپی خودکار وجود نداشت. کد تأیید: ${toFa(
              value
            )}`,
        });
      }
    };


  /* ====================================================
     Open KY register form
  ==================================================== */

  const openRegisterForm =
    async () => {
      if (
        !isKyorugi ||
        !registrationOpenBase ||
        eligibility.ok !==
          true
      ) {
        return;
      }

      setReg(
        (state) => ({
          ...state,
          open: true,
          loading: true,
          errors: {},
        })
      );

      try {
        const data =
          await getRegisterSelfPrefill(
            slug
          );

        setReg(
          (state) => ({
            ...state,

            loading:
              false,

            can_register:
              !!data
                ?.can_register,

            need_coach_code:
              !(
                isCoach ||
                isRef
              ),

            locked:
              mergeLockedProfiles(
                state.locked,
                normalizeLockedProfile(
                  data?.locked
                )
              ),

            weight_category_id:
              data?.suggested
                ?.weight_category_id ??
              data?.suggested
                ?.weightCategoryId ??
              "",

            insurance_number:
              data?.suggested
                ?.insurance_number ??
              "",

            insurance_issue_date:
              data?.suggested
                ?.insurance_issue_date ??
              "",
          })
        );

      } catch (error) {
        console.error(
          "KYORUGI_PREFILL_ERROR",
          error
        );

        setReg(
          (state) => ({
            ...state,
            loading: false,
            errors: {},
          })
        );

        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          handleUnauthorized();
          return;
        }

        showRequestError(
          error,
          "خطا در دریافت اطلاعات ثبت‌نام",
          "اطلاعات اولیه فرم ثبت‌نام دریافت نشد."
        );
      }
    };


  /* ====================================================
     Open Poomsae form
     Fallback is intentionally silent.
  ==================================================== */

  const openRegisterFormPoomsae =
    async () => {
      if (
        !isPoomsae ||
        !registrationOpenBase ||
        eligibility.ok !==
          true
      ) {
        return;
      }

      setRegP(
        (state) => ({
          ...state,
          open: true,
          loading: true,
          errors: {},
        })
      );

      try {
        const data =
          await buildPoomsaePrefill(
            slug
          );

        setRegP(
          (state) => ({
            ...state,

            loading:
              false,

            can_register:
              !!data
                ?.can_register,

            need_coach_code:
              !(
                isCoach ||
                isRef
              ),

            locked:
              mergeLockedProfiles(
                state.locked,
                normalizeLockedProfile(
                  data?.locked
                )
              ),

            poomsae_type:
              data?.suggested
                ?.poomsae_type ||
              state
                .poomsae_type ||
              "",

            insurance_number:
              data?.suggested
                ?.insurance_number ??
              "",

            insurance_issue_date:
              data?.suggested
                ?.insurance_issue_date ??
              "",
          })
        );

      } catch (error) {
        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          setRegP(
            (state) => ({
              ...state,
              loading:
                false,
            })
          );

          handleUnauthorized();
          return;
        }

        /*
         * برای پومسه fallback سالم داریم،
         * پس خطای prefill مزاحم کاربر نمی‌شود.
         */
        console.warn(
          "POOMSAE_PREFILL_FALLBACK",
          error
        );

        const fallbackLocked =
          lockedFromCompetition(
            competition
          );

        setRegP(
          (state) => ({
            ...state,

            loading:
              false,

            can_register:
              competition
                ?.registration_open_effective ??
              competition
                ?.registration_open ??
              true,

            need_coach_code:
              !(
                isCoach ||
                isRef
              ),

            locked:
              mergeLockedProfiles(
                state.locked,
                fallbackLocked
              ),
          })
        );
      }
    };


  /* ====================================================
     Insurance date limits
  ==================================================== */

  const maxIssueDO =
    useMemo(() => {
      if (
        !competitionDate
      ) {
        return null;
      }

      try {
        const compDO =
          new DateObject({
            date:
              competitionDate,
            calendar:
              gregorian,
            locale:
              gregorian_en,
          }).convert(
            persian,
            persian_fa
          );

        return compDO.subtract(
          3,
          "days"
        );
      } catch {
        return null;
      }
    }, [
      competitionDate,
    ]);


  const minIssueDO =
    useMemo(() => {
      if (
        !competitionDate
      ) {
        return null;
      }

      try {
        const compDO =
          new DateObject({
            date:
              competitionDate,
            calendar:
              gregorian,
            locale:
              gregorian_en,
          }).convert(
            persian,
            persian_fa
          );

        return compDO.subtract(
          1,
          "year"
        );
      } catch {
        return null;
      }
    }, [
      competitionDate,
    ]);


  /* ====================================================
     Validation
  ==================================================== */

  const validateKY =
    () => {
      const errors =
        {};

      if (
        !reg
          .weight_category_id
      ) {
        errors.weight_category_id =
          "انتخاب رده وزنی الزامی است.";
      }

      if (
        competitionDate
      ) {
        const issueDate =
          parseJalaliInputToLocalDate(
            reg
              .insurance_issue_date
          );

        if (
          !issueDate ||
          isNaN(
            issueDate.getTime()
          )
        ) {
          errors.insurance_issue_date =
            "تاریخ صدور نامعتبر است (الگوی ۱۴۰۳/۰۵/۲۰).";
        } else {
          const compD =
            stripTime(
              competitionDate
            );

          const minOk72h =
            new Date(
              compD
            );

          minOk72h.setDate(
            minOk72h.getDate() -
              3
          );

          const oldest1y =
            new Date(
              compD
            );

          oldest1y.setFullYear(
            oldest1y.getFullYear() -
              1
          );

          if (
            issueDate >
            minOk72h
          ) {
            errors.insurance_issue_date =
              "تاریخ صدور باید حداقل ۷۲ ساعت قبل از تاریخ مسابقه باشد.";

          } else if (
            issueDate <
            oldest1y
          ) {
            errors.insurance_issue_date =
              "اعتبار کارت بیمه منقضی است (بیش از یک سال قبل از مسابقه).";
          }
        }
      }

      if (
        reg
          .need_coach_code &&
        !String(
          reg.coach_code
        ).trim()
      ) {
        errors.coach_code =
          "کد تأیید مربی الزامی است.";
      }

      if (
        !reg.confirmed
      ) {
        errors.confirmed =
          "لطفاً صحت اطلاعات را تأیید کنید.";
      }

      if (
        !String(
          reg
            .insurance_number
        ).trim()
      ) {
        errors.insurance_number =
          "شماره بیمه الزامی است.";
      }

      return errors;
    };


  const validatePO =
    () => {
      const errors =
        {};

      if (
        !regP
          .poomsae_type
      ) {
        errors.poomsae_type =
          "نوع مسابقه را انتخاب کنید.";
      }

      if (
        competitionDate
      ) {
        const issueDate =
          parseJalaliInputToLocalDate(
            regP
              .insurance_issue_date
          );

        if (
          !issueDate ||
          isNaN(
            issueDate.getTime()
          )
        ) {
          errors.insurance_issue_date =
            "تاریخ صدور نامعتبر است (الگوی ۱۴۰۳/۰۵/۲۰).";

        } else {
          const compD =
            stripTime(
              competitionDate
            );

          const minOk72h =
            new Date(
              compD
            );

          minOk72h.setDate(
            minOk72h.getDate() -
              3
          );

          const oldest1y =
            new Date(
              compD
            );

          oldest1y.setFullYear(
            oldest1y.getFullYear() -
              1
          );

          if (
            issueDate >
            minOk72h
          ) {
            errors.insurance_issue_date =
              "تاریخ صدور باید حداقل ۷۲ ساعت قبل از تاریخ مسابقه باشد.";

          } else if (
            issueDate <
            oldest1y
          ) {
            errors.insurance_issue_date =
              "اعتبار کارت بیمه منقضی است (بیش از یک سال قبل از مسابقه).";
          }
        }
      }

      if (
        regP
          .need_coach_code &&
        !String(
          regP.coach_code
        ).trim()
      ) {
        errors.coach_code =
          "کد تأیید مربی الزامی است.";
      }

      if (
        !regP.confirmed
      ) {
        errors.confirmed =
          "لطفاً صحت اطلاعات را تأیید کنید.";
      }

      if (
        !String(
          regP
            .insurance_number
        ).trim()
      ) {
        errors.insurance_number =
          "شماره بیمه الزامی است.";
      }

      return errors;
    };


  /* ====================================================
     KY submit
  ==================================================== */

  const submitRegister =
    async (event) => {
      event.preventDefault();

      const errors =
        validateKY();

      if (
        Object.keys(
          errors
        ).length
      ) {
        setReg(
          (state) => ({
            ...state,
            errors,
          })
        );

        showGlobalWarning(
          "اطلاعات ثبت‌نام ناقص است. موارد مشخص‌شده در فرم را تکمیل یا اصلاح کنید.",
          "اطلاعات ناقص"
        );

        return;
      }

      setReg(
        (state) => ({
          ...state,
          loading: true,
          errors: {},
        })
      );

      try {
        const issueISO =
          jalaliInputToISO(
            reg
              .insurance_issue_date
          );

        if (!issueISO) {
          setReg(
            (state) => ({
              ...state,
              loading:
                false,
              errors: {
                insurance_issue_date:
                  "تاریخ نامعتبر است.",
              },
            })
          );

          showGlobalWarning(
            "تاریخ صدور بیمه‌نامه معتبر نیست.",
            "تاریخ نامعتبر"
          );

          return;
        }

        const payload = {
          coach_code:
            normalizeDigits(
              reg.coach_code ||
              ""
            ).trim() ||
            undefined,

          weight_category_id:
            Number(
              reg
                .weight_category_id
            ),

          insurance_number:
            normalizeDigits(
              reg
                .insurance_number ||
              ""
            ).trim(),

          insurance_issue_date:
            issueISO,
        };

        const response =
          await registerSelf(
            slug,
            payload
          );

        const paymentRequired =
          response
            .payment_required ??
          response
            .paymentRequired;

        if (
          paymentRequired
        ) {
          const pid =
            response
              .payment_intent_public_id ??
            response
              .paymentIntentPublicId;

          if (!pid) {
            setReg(
              (state) => ({
                ...state,
                loading:
                  false,
              })
            );

            showGlobalMessage({
              type: "error",

              title:
                "خطا در شروع پرداخت",

              message:
                "شناسه پرداخت از سرور دریافت نشد.",
            });

            return;
          }

          try {
            const payStart =
              await startPaymentIntent(
                pid,
                {
                  gateway:
                    "sadad",

                  callback_url:
                    `${API_BASE}/api/payments/bank-return/${encodeURIComponent(
                      pid
                    )}/`,
                }
              );

            const paymentObj =
              payStart
                ?.payment ||
              payStart
                ?.gateway ||
              null;

            if (
              paymentObj?.url
            ) {
              localStorage.setItem(
                "last_payment_kind",
                "kyorugi"
              );

              localStorage.setItem(
                "last_payment_comp",
                String(
                  slug ||
                  competition
                    ?.public_id ||
                  ""
                )
              );

              localStorage.setItem(
                "last_payment_pid",
                String(pid)
              );

              submitGatewayForm(
                paymentObj
              );

              return;
            }

            const payUrl =
              payStart
                ?.payment_url ||
              payStart
                ?.paymentUrl ||
              payStart
                ?.url ||
              payStart
                ?.redirect_url ||
              payStart
                ?.redirectUrl ||
              payStart
                ?.payment?.url ||
              null;

            if (!payUrl) {
              setReg(
                (state) => ({
                  ...state,
                  loading:
                    false,
                })
              );

              showGlobalMessage({
                type: "error",

                title:
                  "خطا در شروع پرداخت",

                message:
                  "لینک یا اطلاعات درگاه بانکی از سرور دریافت نشد.",
              });

              return;
            }

            localStorage.setItem(
              "last_payment_kind",
              "kyorugi"
            );

            localStorage.setItem(
              "last_payment_comp",
              String(
                slug ||
                competition
                  ?.public_id ||
                ""
              )
            );

            localStorage.setItem(
              "last_payment_pid",
              String(pid)
            );

            window.location.href =
              payUrl;

            return;

          } catch (
            paymentError
          ) {
            setReg(
              (state) => ({
                ...state,
                loading:
                  false,
              })
            );

            if (
              getErrorStatus(
                paymentError
              ) === 401
            ) {
              handleUnauthorized();
              return;
            }

            showRequestError(
              paymentError,
              "خطا در شروع پرداخت",
              "اتصال به درگاه پرداخت انجام نشد."
            );

            return;
          }
        }

        let enrollmentId =
          response
            ?.enrollment_id ??
          response?.id ??
          response
            ?.data
            ?.enrollment_id ??
          response
            ?.data?.id ??
          null;

        let status =
          response?.status ??
          response
            ?.data
            ?.status ??
          "pending_payment";

        if (
          !enrollmentId
        ) {
          try {
            const after =
              await getMyEnrollment(
                slug
              );

            enrollmentId =
              after
                ?.enrollment_id ??
              after?.id ??
              enrollmentId;

            status =
              after?.status ??
              status;

          } catch (
            fallbackError
          ) {
            console.warn(
              "getMyEnrollment fallback failed:",
              fallbackError
            );
          }
        }

        setReg(
          (state) => ({
            ...state,
            loading: false,
            open: false,
          })
        );

        setCardInfo(
          (state) => ({
            ...state,
            enrollmentId:
              enrollmentId ||
              state.enrollmentId,
            enrollmentIds:
              [],
            status,
            canShow:
              !!enrollmentId,
            checked: true,
            loading: false,
          })
        );

        if (
          !enrollmentId
        ) {
          showGlobalWarning(
            "ثبت‌نام انجام شد، اما شناسه کارت از سرور دریافت نشد. وضعیت ثبت‌نام را از بخش «مسابقات من / ثبت‌نام‌ها» بررسی کنید.",
            "ثبت‌نام انجام شد"
          );

          return;
        }

        if (
          [
            "paid",
            "confirmed",
          ].includes(
            String(
              status
            ).toLowerCase()
          )
        ) {
          showGlobalSuccess(
            "ثبت‌نام شما با موفقیت انجام شد.",
            "ثبت‌نام موفق"
          );

        } else {
          showGlobalSuccess(
            "ثبت‌نام انجام شد. در صورت تکمیل‌نبودن پرداخت یا تأیید، کارت ممکن است با وضعیت در انتظار نمایش داده شود.",
            "ثبت‌نام انجام شد"
          );
        }

        navigate(
          `/dashboard/${encodeURIComponent(
            role
          )}/enrollments/${enrollmentId}/card`,
          {
            state: {
              kind:
                "kyorugi",
            },
          }
        );

      } catch (error) {
        console.error(
          "KYORUGI_SELF_REGISTER_ERROR",
          error
        );

        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          setReg(
            (state) => ({
              ...state,
              loading:
                false,
            })
          );

          handleUnauthorized();
          return;
        }

        const payload =
          error?.payload ||
          error?.response
            ?.data ||
          {};

        const mapped = {};

        if (
          payload.coach_code
        ) {
          mapped.coach_code =
            Array.isArray(
              payload.coach_code
            )
              ? payload
                  .coach_code
                  .join(" ")
              : String(
                  payload
                    .coach_code
                );
        }

        if (
          payload
            .weight_category_id
        ) {
          mapped.weight_category_id =
            Array.isArray(
              payload
                .weight_category_id
            )
              ? payload
                  .weight_category_id
                  .join(" ")
              : String(
                  payload
                    .weight_category_id
                );
        }

        if (
          payload
            .insurance_number
        ) {
          mapped.insurance_number =
            Array.isArray(
              payload
                .insurance_number
            )
              ? payload
                  .insurance_number
                  .join(" ")
              : String(
                  payload
                    .insurance_number
                );
        }

        if (
          payload
            .insurance_issue_date
        ) {
          mapped.insurance_issue_date =
            Array.isArray(
              payload
                .insurance_issue_date
            )
              ? payload
                  .insurance_issue_date
                  .join(" ")
              : String(
                  payload
                    .insurance_issue_date
                );
        }

        const nonFieldMessages =
          [];

        if (
          Array.isArray(
            payload
              .non_field_errors
          )
        ) {
          nonFieldMessages.push(
            ...payload
              .non_field_errors
          );
        }

        if (
          Array.isArray(
            payload.__all__
          )
        ) {
          nonFieldMessages.push(
            ...payload.__all__
          );
        }

        setReg(
          (state) => ({
            ...state,
            loading: false,
            errors: mapped,
          })
        );

        if (
          nonFieldMessages.length
        ) {
          showGlobalMessage({
            type: "error",

            title:
              "ثبت‌نام انجام نشد",

            message:
              nonFieldMessages
                .map(String)
                .join("\n"),
          });

        } else if (
          Object.keys(
            mapped
          ).length
        ) {
          showGlobalWarning(
            "ثبت‌نام انجام نشد. موارد مشخص‌شده در فرم را اصلاح کنید.",
            "اطلاعات ثبت‌نام نامعتبر است"
          );

        } else {
          showRequestError(
            error,
            "خطا در ثبت‌نام",
            "ثبت‌نام انجام نشد."
          );
        }
      }
    };


  /* ====================================================
     Poomsae submit
  ==================================================== */

  const submitRegisterPoomsae =
    async (event) => {
      event.preventDefault();

      const errors =
        validatePO();

      if (
        Object.keys(
          errors
        ).length
      ) {
        setRegP(
          (state) => ({
            ...state,
            errors,
          })
        );

        showGlobalWarning(
          "اطلاعات ثبت‌نام ناقص است. موارد مشخص‌شده در فرم را تکمیل یا اصلاح کنید.",
          "اطلاعات ناقص"
        );

        return;
      }

      setRegP(
        (state) => ({
          ...state,
          loading: true,
          errors: {},
        })
      );

      try {
        const issueISO =
          jalaliInputToISO(
            regP
              .insurance_issue_date
          );

        if (!issueISO) {
          setRegP(
            (state) => ({
              ...state,
              loading:
                false,
              errors: {
                insurance_issue_date:
                  "تاریخ نامعتبر است.",
              },
            })
          );

          showGlobalWarning(
            "تاریخ صدور بیمه‌نامه معتبر نیست.",
            "تاریخ نامعتبر"
          );

          return;
        }

        const payload = {
          coach_code:
            normalizeDigits(
              regP.coach_code ||
              ""
            ).trim() ||
            undefined,

          poomsae_type:
            regP
              .poomsae_type,

          insurance_number:
            normalizeDigits(
              regP
                .insurance_number ||
              ""
            ).trim(),

          insurance_issue_date:
            issueISO,
        };

        const response =
          await registerSelfPoomsae(
            slug,
            payload
          );

        const paymentRequired =
          response
            .payment_required ??
          response
            .paymentRequired;

        if (
          paymentRequired
        ) {
          if (
            response
              .payment_error ||
            response
              .payment_unavailable
          ) {
            setRegP(
              (state) => ({
                ...state,
                loading:
                  false,
              })
            );

            showGlobalMessage({
              type: "error",

              title:
                "امکان شروع پرداخت وجود ندارد",

              message:
                response
                  .message ||
                response
                  .detail ||
                "در حال حاضر امکان شروع پرداخت وجود ندارد.",
            });

            return;
          }

          localStorage.setItem(
            "last_payment_kind",
            "poomsae"
          );

          localStorage.setItem(
            "last_payment_comp",
            String(
              slug ||
              competition
                ?.public_id ||
              ""
            )
          );

          const payUrl =
            response
              .payment_url ||
            response
              .paymentUrl;

          if (payUrl) {
            window.location.href =
              payUrl;

            return;
          }

          const paymentIntentPublicId =
            response
              .payment_intent_public_id ||
            response
              .paymentIntentPublicId ||
            response
              ?.payment
              ?.public_id ||
            response
              ?.payment
              ?.publicId;

          if (
            !paymentIntentPublicId
          ) {
            setRegP(
              (state) => ({
                ...state,
                loading:
                  false,
              })
            );

            showGlobalMessage({
              type: "error",

              title:
                "خطا در شروع پرداخت",

              message:
                "شناسه پرداخت از سرور دریافت نشد.",
            });

            return;
          }

          try {
            const started =
              await startPaymentIntent(
                paymentIntentPublicId,
                {
                  gateway:
                    "sadad",
                }
              );

            if (
              started
                ?.redirect_url
            ) {
              window.location.href =
                started.redirect_url;

              return;
            }

            if (
              started
                ?.payment
            ) {
              submitGatewayForm(
                started.payment
              );

              return;
            }

            setRegP(
              (state) => ({
                ...state,
                loading:
                  false,
              })
            );

            showGlobalMessage({
              type: "error",

              title:
                "خطا در شروع پرداخت",

              message:
                "اطلاعات درگاه بانکی از سرور دریافت نشد.",
            });

            return;

          } catch (
            paymentError
          ) {
            const resumeUrl =
              paymentError
                ?.payload
                ?.redirect_url ||
              paymentError
                ?.payload
                ?.payment_url;

            if (
              resumeUrl
            ) {
              window.location.href =
                resumeUrl;

              return;
            }

            throw paymentError;
          }
        }

        let enrollmentId =
          response
            ?.enrollment_id ??
          response?.id ??
          response
            ?.data
            ?.enrollment_id ??
          response
            ?.data?.id ??
          null;

        let status =
          response?.status ??
          response
            ?.data
            ?.status ??
          "pending_payment";

        let standardId =
          null;

        let creativeId =
          null;

        try {
          const after =
            await getMyPoomsaeEnrollments(
              slug
            );

          standardId =
            after
              ?.standard
              ?.enrollment_id ??
            after
              ?.standard
              ?.id ??
            null;

          creativeId =
            after
              ?.creative
              ?.enrollment_id ??
            after
              ?.creative
              ?.id ??
            null;

          if (
            !enrollmentId
          ) {
            enrollmentId =
              standardId ||
              creativeId ||
              null;
          }

          if (!status) {
            status =
              after
                ?.standard
                ?.status ||
              after
                ?.creative
                ?.status ||
              "pending_payment";
          }

        } catch (
          fallbackError
        ) {
          console.warn(
            "getMyPoomsaeEnrollments fallback failed:",
            fallbackError
          );
        }

        const ids =
          Array.from(
            new Set(
              [
                standardId,
                creativeId,
              ]
                .map(
                  (value) =>
                    parseInt(
                      value,
                      10
                    )
                )
                .filter(
                  (id) =>
                    Number.isFinite(
                      id
                    ) &&
                    id > 0
                )
            )
          );

        setRegP(
          (state) => ({
            ...state,
            loading: false,
            open: false,
          })
        );

        setCardInfo(
          (state) => ({
            ...state,

            enrollmentId:
              enrollmentId ||
              ids[0] ||
              state
                .enrollmentId,

            enrollmentIds:
              ids.length
                ? ids
                : state
                    .enrollmentIds ||
                  [],

            status,

            canShow:
              ids.length >
                0 ||
              !!enrollmentId,

            checked: true,
            loading: false,
          })
        );

        if (
          !enrollmentId
        ) {
          showGlobalWarning(
            "ثبت‌نام انجام شد، اما شناسه کارت از سرور دریافت نشد. وضعیت ثبت‌نام را از بخش «مسابقات من / ثبت‌نام‌ها» بررسی کنید.",
            "ثبت‌نام انجام شد"
          );

          return;
        }

        if (
          [
            "paid",
            "confirmed",
          ].includes(
            String(
              status
            ).toLowerCase()
          )
        ) {
          showGlobalSuccess(
            "ثبت‌نام پومسه با موفقیت انجام شد.",
            "ثبت‌نام موفق"
          );

        } else {
          showGlobalSuccess(
            `ثبت‌نام انجام شد. وضعیت فعلی: ${status || "در انتظار"}.`,
            "ثبت‌نام انجام شد"
          );
        }

        navigate(
          `/dashboard/${encodeURIComponent(
            role
          )}/enrollments/${enrollmentId}/card`,
          {
            state: {
              kind:
                "poomsae",
            },
          }
        );

      } catch (error) {
        console.error(
          "POOMSAE_SELF_REGISTER_ERROR",
          error
        );

        if (
          getErrorStatus(
            error
          ) === 401
        ) {
          setRegP(
            (state) => ({
              ...state,
              loading:
                false,
            })
          );

          handleUnauthorized();
          return;
        }

        const payload =
          error?.payload ||
          error?.response
            ?.data ||
          {};

        const mapped = {};

        if (
          payload.coach_code
        ) {
          mapped.coach_code =
            Array.isArray(
              payload.coach_code
            )
              ? payload
                  .coach_code
                  .join(" ")
              : String(
                  payload
                    .coach_code
                );
        }

        if (
          payload
            .poomsae_type
        ) {
          mapped.poomsae_type =
            Array.isArray(
              payload
                .poomsae_type
            )
              ? payload
                  .poomsae_type
                  .join(" ")
              : String(
                  payload
                    .poomsae_type
                );
        }

        if (
          payload
            .insurance_number
        ) {
          mapped.insurance_number =
            Array.isArray(
              payload
                .insurance_number
            )
              ? payload
                  .insurance_number
                  .join(" ")
              : String(
                  payload
                    .insurance_number
                );
        }

        if (
          payload
            .insurance_issue_date
        ) {
          mapped.insurance_issue_date =
            Array.isArray(
              payload
                .insurance_issue_date
            )
              ? payload
                  .insurance_issue_date
                  .join(" ")
              : String(
                  payload
                    .insurance_issue_date
                );
        }

        const nonFieldMessages =
          [];

        if (
          Array.isArray(
            payload
              .non_field_errors
          )
        ) {
          nonFieldMessages.push(
            ...payload
              .non_field_errors
          );
        }

        if (
          Array.isArray(
            payload.__all__
          )
        ) {
          nonFieldMessages.push(
            ...payload.__all__
          );
        }

        setRegP(
          (state) => ({
            ...state,
            loading: false,
            errors: mapped,
          })
        );

        if (
          nonFieldMessages.length
        ) {
          showGlobalMessage({
            type: "error",

            title:
              "ثبت‌نام پومسه انجام نشد",

            message:
              nonFieldMessages
                .map(String)
                .join("\n"),
          });

        } else if (
          Object.keys(
            mapped
          ).length
        ) {
          showGlobalWarning(
            "ثبت‌نام انجام نشد. موارد مشخص‌شده در فرم را اصلاح کنید.",
            "اطلاعات ثبت‌نام نامعتبر است"
          );

        } else {
          showRequestError(
            error,
            "خطا در ثبت‌نام پومسه",
            "ثبت‌نام پومسه انجام نشد."
          );
        }
      }
    };


  /* ====================================================
     Weight categories
  ==================================================== */

  const weightCategories =
    useMemo(() => {
      const items =
        Array.isArray(
          competition
            ?.allowed_weights
        )
          ? competition
              .allowed_weights
          : [];

      return [
        ...items,
      ].sort(
        (a, b) => {
          const minA =
            Number(
              a?.min_weight ??
              0
            );

          const minB =
            Number(
              b?.min_weight ??
              0
            );

          if (
            minA !== minB
          ) {
            return (
              minA -
              minB
            );
          }

          return (
            Number(
              a?.id ??
              0
            ) -
            Number(
              b?.id ??
              0
            )
          );
        }
      );
    }, [
      competition
        ?.allowed_weights,
    ]);


  /* ====================================================
     Loading / failed
  ==================================================== */

  if (loading) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">
          در حال بارگذاری…
        </div>
      </div>
    );
  }


  if (
    loadFailed ||
    !competition
  ) {
    return (
      <div
        className="cd-container"
        dir="rtl"
      >
        <div className="cd-muted">
          امکان نمایش اطلاعات این مسابقه در حال حاضر وجود ندارد.
        </div>

        <div
          style={{
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-light"
            onClick={
              goBackToDashboardList
            }
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }


  /* ====================================================
     Display data
  ==================================================== */

  const titleText =
    competition.title ||
    competition.name ||
    "—";


  const regStartVal =
    competition
      .registration_start_jalali ??
    competition
      .registration_start;


  const regEndVal =
    competition
      .registration_end_jalali ??
    competition
      .registration_end;


  const drawVal =
    competition
      .draw_date_jalali ??
    competition
      .draw_date;


  const weighVal =
    competition
      .weigh_date_jalali ??
    competition
      .weigh_date;


  const compDateVal =
    isKyorugi
      ? (
          competition
            .competition_date_jalali ??
          competition
            .competition_date
        )
      : (
          competition
            .start_date_jalali ??
          competition
            .start_date ??
          competition
            .competition_date_jalali ??
          competition
            .competition_date
        );


  const posterSrc =
    absUrl(
      competition
        ?.poster?.url ||
      competition?.poster
    ) ||
    "/placeholder.jpg";


  const addressFull =
    (() => {
      if (
        competition
          ?.address_full
      ) {
        return competition
          .address_full;
      }

      const city =
        competition
          ?.city ||
        "";

      const address =
        competition
          ?.address ||
        "";

      if (
        city &&
        address
      ) {
        return `${city}، ${address}`;
      }

      return (
        city ||
        address ||
        "—"
      );
    })();


  const showBracketBtn =
    isKyorugi ||
    isPoomsae;


  const showResultsBtn =
    isKyorugi ||
    isPoomsae;


  const entryFeeVal =
    Number(
      competition
        ?.entry_fee_rial ??
      competition
        ?.entry_fee ??
      0
    );


  /* ====================================================
     Render
  ==================================================== */

  return (
    <div
      className="cd-container"
      dir="rtl"
    >

      {/* ==========================
          Header
      ========================== */}

      <div className="cd-hero">

        <img
          className="cd-poster"
          src={
            posterSrc
          }
          alt={
            titleText
          }
          onError={(
            event
          ) => {
            event.currentTarget.src =
              "/placeholder.jpg";
          }}
        />


        <div className="cd-hero-body">

          <h1 className="cd-title">
            {titleText}
          </h1>


          <div className="cd-chips">

            <span className="cd-chip">
              سبک مسابقه:{" "}
              <strong>
                {isPoomsae
                  ? "پومسه"
                  : "کیوروگی"}
              </strong>
            </span>


            {isKyorugi && (
              <span className="cd-chip">
                رده سنی:{" "}
                <strong>
                  {ageHeaderText}
                </strong>
              </span>
            )}


            <span className="cd-chip">
              رده کمربندی:{" "}
              <strong>
                {beltHeaderText}
              </strong>
            </span>


            <span className="cd-chip">
              جنسیت:{" "}
              <strong>
                {genderLabel
                  ? genderFaLabel(
                      genderLabel
                    )
                  : "—"}
              </strong>
            </span>


            <span
              className={
                `cd-chip ${
                  registrationOpenBase
                    ? "ok"
                    : "nok"
                }`
              }
            >
              ثبت‌نام:{" "}
              <strong>
                {registrationOpenBase
                  ? "بله"
                  : "خیر"}
              </strong>
            </span>


            <span
              className={
                `cd-chip ${
                  eligibility.ok ===
                  true
                    ? "ok"
                    : eligibility.ok ===
                      false
                    ? "nok"
                    : ""
                }`
              }
            >
              صلاحیت:{" "}
              <strong>
                {eligibility.ok ===
                true
                  ? "بله"
                  : eligibility.ok ===
                    false
                  ? "خیر"
                  : "نامشخص"}
              </strong>
            </span>

          </div>
        </div>
      </div>


      {/* ==========================
          Details
      ========================== */}

      <section className="cd-section">

        <h2 className="cd-section-title">
          جزئیات مسابقه
        </h2>


        <div className="cd-grid">

          <InfoRow
            label="مبلغ ورودی"
            value={
              entryFeeVal >
              0
                ? `${toFa(
                    entryFeeVal.toLocaleString()
                  )} ریال`
                : "رایگان"
            }
          />


          <InfoRow
            label="گروه‌های کمربندی انتخاب‌شده"
            value={
              beltGroupsDisplay ||
              "—"
            }
          />


          {isPoomsae && (
            <InfoRow
              label="گروه سنی"
              value={
                ageGroupsValue
              }
            />
          )}


          <InfoRow
            label="شروع ثبت‌نام"
            value={
              fmtDateFa(
                regStartVal
              )
            }
          />


          <InfoRow
            label="پایان ثبت‌نام"
            value={
              fmtDateFa(
                regEndVal
              )
            }
          />


          {drawVal && (
            <InfoRow
              label="تاریخ قرعه‌کشی"
              value={
                fmtDateFa(
                  drawVal
                )
              }
            />
          )}


          {isKyorugi && (
            <InfoRow
              label="تاریخ وزن‌کشی"
              value={
                fmtDateFa(
                  weighVal
                )
              }
            />
          )}


          <InfoRow
            label="تاریخ برگزاری"
            value={
              fmtDateFa(
                compDateVal
              )
            }
          />


          <InfoRow
            label="نشانی محل برگزاری"
            value={
              addressFull
            }
            multiline
          />


          {isKyorugi && (
            <InfoRow
              label="تعداد زمین‌ها"
              value={
                toFa(
                  competition
                    .mat_count ??
                  "—"
                )
              }
            />
          )}


          {isPoomsae && (
            <InfoRow
              label="تیم پومسه"
              value={
                <span className="cd-note cd-note--poomsae">
                  {competition
                    ?.team_registration_note ??
                    competition
                      ?.teamRegistrationNote ??
                    "ثبت نام تیم پومسه بر عهده مربی می‌باشد"}
                </span>
              }
              multiline
            />
          )}

        </div>
      </section>


      {/* ==========================
          Attachments
      ========================== */}

      <section className="cd-section">

        <h2 className="cd-section-title">
          پیوست‌ها
        </h2>


        {(() => {
          const imgsRaw =
            (
              Array.isArray(
                competition
                  .images
              ) &&
              competition.images.map(
                (item) =>
                  item.image ||
                  item.url ||
                  item.file
              )
            ) ||
            (
              Array.isArray(
                competition
                  .gallery
              ) &&
              competition.gallery.map(
                (item) =>
                  item.image ||
                  item.url
              )
            ) ||
            [];


          const filesRaw =
            (
              Array.isArray(
                competition
                  .files
              ) &&
              competition.files.map(
                (item) =>
                  item.file ||
                  item.url
              )
            ) ||
            (
              Array.isArray(
                competition
                  .documents
              ) &&
              competition.documents.map(
                (item) =>
                  item.file ||
                  item.url
              )
            ) ||
            [];


          const images =
            imgsRaw
              .map(absUrl)
              .filter(
                Boolean
              );


          const files =
            filesRaw
              .map(absUrl)
              .filter(
                Boolean
              );


          return (
            <div className="cd-attachments-wrap">

              <div className="cd-attachments-block">

                <div className="cd-block-head">
                  <span>
                    تصاویر
                  </span>

                  <span className="cd-count">
                    {toFa(
                      images.length
                    )}
                  </span>
                </div>


                {images.length ===
                0 ? (
                  <div className="cd-muted cd-empty">
                    عکسی آپلود نشده است.
                  </div>
                ) : (
                  <div className="cd-attachments">

                    {images.map(
                      (
                        src,
                        index
                      ) => (
                        <button
                          key={`img-${index}`}
                          type="button"
                          className="cd-attachment img"
                          onClick={() =>
                            setLightbox({
                              type:
                                "img",
                              url:
                                src,
                            })
                          }
                          title="نمایش تصویر"
                        >
                          <img
                            className="cd-thumb"
                            src={
                              src
                            }
                            alt={`image-${index}`}
                          />

                          <span>
                            مشاهده
                          </span>
                        </button>
                      )
                    )}

                  </div>
                )}

              </div>


              <div className="cd-attachments-block">

                <div className="cd-block-head">
                  <span>
                    فایل‌ها
                  </span>

                  <span className="cd-count">
                    {toFa(
                      files.length
                    )}
                  </span>
                </div>


                {files.length ===
                0 ? (
                  <div className="cd-muted cd-empty">
                    فایلی آپلود نشده است.
                  </div>
                ) : (
                  <div className="cd-attachments">

                    {files.map(
                      (
                        url,
                        index
                      ) => (
                        <div
                          key={`file-${index}`}
                          className="cd-attachment file"
                        >

                          <div className="cd-file-body">

                            <div className="cd-file-icon">
                              📎
                            </div>


                            <div
                              className="cd-file-name"
                              title={
                                fileNameFromUrl(
                                  url
                                )
                              }
                            >
                              {fileNameFromUrl(
                                url
                              )}
                            </div>

                          </div>


                          <div className="cd-file-actions">

                            <a
                              className="btn btn-outline"
                              style={{
                                width:
                                  "70px",
                                height:
                                  "22px",
                              }}
                              href={
                                url
                              }
                              target="_blank"
                              rel="noreferrer"
                              download
                            >
                              دانلود
                            </a>

                          </div>

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>

            </div>
          );
        })()}

      </section>


      {/* ==========================
          Main actions
      ========================== */}

      <div className="cd-actions cd-main-actions">

        <button
          type="button"
          className="btn btn-light cd-back-btn"
          onClick={
            goBackToDashboardList
          }
        >
          بازگشت
        </button>


        <div className="cd-actions-right">

          {isCoach && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={
                onOpenCoachCode
              }
            >
              کد مربی
            </button>
          )}


          {isCoach &&
            isPoomsae && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={
                !registrationOpenBase
              }
              title={
                !registrationOpenBase
                  ? coachDisableReason
                  : ""
              }
              onClick={
                goRegisterTeam
              }
            >
              ثبت‌نام تیمی پومسه
            </button>
          )}


          {isCoach && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !canClickCoachRegister
              }
              title={
                !canClickCoachRegister
                  ? coachDisableReason
                  : ""
              }
              onClick={
                goRegisterAthlete
              }
            >
              ثبت نام بازیکن
            </button>
          )}


          {isCoach && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={
                goCoachPlayerCards
              }
              disabled={
                coachCardsLoading
              }
            >
              {coachCardsLoading
                ? "در حال دریافت کارت‌ها…"
                : "مشاهده آیدی‌کارت بازیکنان"}
            </button>
          )}


          {(isPlayer ||
            isCoach ||
            isRef) && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !canClickSelf
              }
              title={
                !registrationOpenBase
                  ? "ثبت‌نام این مسابقه فعال نیست"
                  : eligibility.ok !==
                    true
                  ? "صلاحیت شما با شرایط مسابقه هم‌خوانی ندارد"
                  : ""
              }
              onClick={() =>
                isPoomsae
                  ? openRegisterFormPoomsae()
                  : openRegisterForm()
              }
            >
              ثبت‌نام خودم
            </button>
          )}


          {(isPlayer ||
            isCoach) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (
                  cardInfo.loading ||
                  !cardInfo.checked ||
                  !cardInfo.canShow
                ) {
                  return;
                }

                if (
                  isPoomsae
                ) {
                  const ids =
                    Array.isArray(
                      cardInfo
                        .enrollmentIds
                    )
                      ? cardInfo
                          .enrollmentIds
                      : [];

                  if (
                    ids.length >
                    1
                  ) {
                    const query =
                      encodeURIComponent(
                        ids.join(
                          ","
                        )
                      );

                    navigate(
                      `/dashboard/${encodeURIComponent(
                        role
                      )}/enrollments/bulk?ids=${query}&kind=poomsae`,
                      {
                        state: {
                          ids,
                          kind:
                            "poomsae",
                        },
                      }
                    );

                    return;
                  }
                }

                if (
                  cardInfo
                    .enrollmentId
                ) {
                  navigate(
                    `/dashboard/${encodeURIComponent(
                      role
                    )}/enrollments/${cardInfo.enrollmentId}/card`,
                    {
                      state: {
                        kind:
                          isPoomsae
                            ? "poomsae"
                            : "kyorugi",
                      },
                    }
                  );
                }
              }}
              disabled={
                !cardInfo.checked ||
                cardInfo.loading ||
                !cardInfo.canShow
              }
              title={
                cardInfo.loading
                  ? "در حال بررسی وضعیت ثبت‌نام…"
                  : !cardInfo.checked
                  ? "در حال آماده‌سازی اطلاعات…"
                  : !cardInfo.canShow
                  ? "برای شما در این مسابقه آیدی‌کارت آماده‌ای وجود ندارد."
                  : "مشاهده آیدی‌کارت شخصی"
              }
            >
              {cardInfo.loading
                ? "در حال بررسی…"
                : isCoach &&
                  !isPlayer
                ? "مشاهده آیدی‌کارت خود مربی"
                : "مشاهده آیدی‌کارت شخصی"}
            </button>
          )}


          {showBracketBtn && (

            <button
              type="button"
              className="btn btn-ghost"
              onClick={onBracketClick}
              title={
                isPoomsae
                  ? "مشاهده جدول پومسه"
                  : "مشاهده جدول مسابقه"
              }
            >
              مشاهده جدول
            </button>

          )}



          {showResultsBtn && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={goResults}
              title="مشاهده نتایج این مسابقه"
            >
              نتایج مسابقه
            </button>
          )}

        </div>
      </div>


      {/* ==========================
          Poomsae note
      ========================== */}

      {isPoomsae &&
        !regP.open &&
        registrationOpenBase ===
          false && (
        <div
          className="cd-note cd-note--poomsae"
          style={{
            marginTop: 12,
          }}
        >
          ثبت‌نام فردی این مسابقه غیرفعال است (ثبت‌نام تیمی با مربی).
        </div>
      )}


      {/* ==========================
          KY form
      ========================== */}

      {isKyorugi &&
        reg.open && (
        <section className="cd-section">

          <h2 className="cd-section-title">
            فرم ثبت‌نام
          </h2>


          <form
            className="cd-form"
            onSubmit={
              submitRegister
            }
          >

            {reg.locked ? (
              <div className="cd-grid">

                <InfoRow
                  label="نام"
                  value={
                    reg.locked
                      .first_name ||
                    "—"
                  }
                />

                <InfoRow
                  label="نام خانوادگی"
                  value={
                    reg.locked
                      .last_name ||
                    "—"
                  }
                />

                <InfoRow
                  label="کد ملی"
                  value={
                    toFa(
                      reg.locked
                        .national_id
                    ) ||
                    "—"
                  }
                />

                <InfoRow
                  label="تاریخ تولد"
                  value={
                    pickBirthFa(
                      reg.locked
                    )
                  }
                />

                <InfoRow
                  label="کمربند"
                  value={
                    reg.locked
                      .belt ||
                    "—"
                  }
                />

                <InfoRow
                  label="باشگاه"
                  value={
                    reg.locked
                      .club ||
                    "—"
                  }
                />

                <InfoRow
                  label="مربی"
                  value={
                    reg.locked
                      .coach ||
                    "—"
                  }
                />

              </div>
            ) : (
              <div
                className="cd-muted"
                style={{
                  marginBottom:
                    12,
                }}
              >
                در حال بارگذاری اطلاعات پروفایل…
              </div>
            )}


            <h3 className="cd-section-title">
              اطلاعات تکمیلی
            </h3>


            <div className="cd-grid">

              <div className="cd-row">

                <label
                  className="cd-label"
                  htmlFor="weight_category_id"
                >
                  رده وزنی
                </label>


                <div className="cd-value">

                  <select
                    id="weight_category_id"
                    className="cd-input"
                    value={
                      reg.weight_category_id ||
                      ""
                    }
                    onChange={(
                      event
                    ) =>
                      setReg(
                        (state) => ({
                          ...state,
                          weight_category_id:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                    aria-invalid={
                      !!reg
                        .errors
                        .weight_category_id
                    }
                    required
                    disabled={
                      !weightCategories.length
                    }
                  >
                    <option value="">
                      {weightCategories.length
                        ? "انتخاب کنید…"
                        : "رده‌های وزنی این مسابقه تعریف نشده"}
                    </option>

                    {weightCategories.map(
                      (category) => (
                        <option
                          key={
                            category.id
                          }
                          value={
                            category.id
                          }
                        >
                          {category.name ??
                            category.title ??
                            category.label ??
                            `#${category.id}`}
                        </option>
                      )
                    )}
                  </select>


                  {reg
                    .errors
                    .weight_category_id && (
                    <div
                      className="cd-error"
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      {
                        reg.errors
                          .weight_category_id
                      }
                    </div>
                  )}

                </div>
              </div>


              <div
                className="cd-row"
                title="شماره درج‌شده روی کارت بیمه ورزشی."
              >

                <label
                  className="cd-label"
                  htmlFor="ins-num"
                >
                  شماره بیمه
                </label>


                <div className="cd-value">

                  <input
                    id="ins-num"
                    className="cd-input"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    pattern="\d*"
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                    value={
                      reg.insurance_number
                    }
                    onChange={(
                      event
                    ) =>
                      setReg(
                        (state) => ({
                          ...state,

                          insurance_number:
                            normalizeDigits(
                              event
                                .target
                                .value
                            ),
                        })
                      )
                    }
                    required
                  />


                  {reg
                    .errors
                    .insurance_number && (
                    <div
                      className="cd-error"
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      {
                        reg.errors
                          .insurance_number
                      }
                    </div>
                  )}

                </div>
              </div>


              <div className="cd-row">

                <label
                  className="cd-label"
                  htmlFor="ins-date"
                >
                  تاریخ صدور بیمه‌نامه
                </label>


                <div className="cd-value">

                  <DatePicker
                    id="ins-date"
                    inputClass="cd-input"
                    containerClassName="cd-date"
                    calendar={
                      persian
                    }
                    locale={
                      persian_fa
                    }
                    format="YYYY/MM/DD"
                    value={
                      toJalaliDO(
                        reg
                          .insurance_issue_date
                      )
                    }
                    onChange={(
                      value
                    ) =>
                      setReg(
                        (state) => ({
                          ...state,

                          insurance_issue_date:
                            value
                              ? normalizeDigits(
                                  value.format(
                                    "YYYY/MM/DD"
                                  )
                                )
                              : "",
                        })
                      )
                    }
                    calendarPosition="bottom-right"
                    editable={
                      false
                    }
                    maxDate={
                      maxIssueDO
                    }
                    minDate={
                      minIssueDO
                    }
                  />


                  {reg
                    .errors
                    .insurance_issue_date && (
                    <div
                      className="cd-error"
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      {
                        reg.errors
                          .insurance_issue_date
                      }
                    </div>
                  )}

                </div>
              </div>


              {reg
                .need_coach_code && (
                <div
                  className="cd-row"
                  title="این کد را مربی‌تان در داشبورد خودش می‌بیند."
                >

                  <label
                    className="cd-label"
                    htmlFor="coach_code"
                  >
                    کد تأیید مربی
                  </label>


                  <div className="cd-value">

                    <input
                      id="coach_code"
                      name="coach_code"
                      dir="ltr"
                      inputMode="numeric"
                      pattern="\d*"
                      className="cd-input"
                      placeholder="مثلاً ۴۵۸۲۷۱"
                      value={
                        reg
                          .coach_code
                      }
                      onChange={(
                        event
                      ) =>
                        setReg(
                          (state) => ({
                            ...state,

                            coach_code:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      aria-invalid={
                        !!reg
                          .errors
                          .coach_code
                      }
                      required={
                        reg
                          .need_coach_code
                      }
                    />


                    {reg
                      .errors
                      .coach_code && (
                      <div
                        className="cd-error"
                        style={{
                          marginTop:
                            6,
                        }}
                      >
                        {
                          reg.errors
                            .coach_code
                        }
                      </div>
                    )}

                  </div>
                </div>
              )}

            </div>


            <div className="cd-row cd-row-multi">

              <label className="cd-checkbox">

                <input
                  type="checkbox"
                  checked={
                    reg.confirmed
                  }
                  onChange={(
                    event
                  ) =>
                    setReg(
                      (state) => ({
                        ...state,

                        confirmed:
                          event
                            .target
                            .checked,
                      })
                    )
                  }
                />

                <span>
                  تمام اطلاعات واردشده را صحیح می‌دانم و مسئولیت آن را می‌پذیرم.
                </span>

              </label>


              {reg
                .errors
                .confirmed && (
                <div
                  className="cd-error"
                  style={{
                    marginTop:
                      6,
                  }}
                >
                  {
                    reg.errors
                      .confirmed
                  }
                </div>
              )}

            </div>


            <div
              className="cd-actions"
              style={{
                marginTop: 16,
              }}
            >

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  reg.loading ||
                  !reg
                    .can_register
                }
                title={
                  !reg
                    .can_register
                    ? "خارج از بازه ثبت‌نام یا ثبت‌نام غیرفعال است"
                    : ""
                }
              >
                {reg.loading
                  ? "در حال ثبت…"
                  : "تأیید و پرداخت"}
              </button>


              <button
                type="button"
                className="btn btn-light"
                onClick={() =>
                  setReg(
                    (state) => ({
                      ...state,
                      open: false,
                    })
                  )
                }
                disabled={
                  reg.loading
                }
              >
                انصراف
              </button>

            </div>

          </form>
        </section>
      )}


      {/* ==========================
          Poomsae form
      ========================== */}

      {isPoomsae &&
        regP.open && (
        <section className="cd-section">

          <h2 className="cd-section-title">
            فرم ثبت‌نام
          </h2>


          <form
            className="cd-form"
            onSubmit={
              submitRegisterPoomsae
            }
          >

            {regP.locked ? (
              <div className="cd-grid">

                <InfoRow
                  label="نام"
                  value={
                    regP
                      .locked
                      .first_name ||
                    "—"
                  }
                />

                <InfoRow
                  label="نام خانوادگی"
                  value={
                    regP
                      .locked
                      .last_name ||
                    "—"
                  }
                />

                <InfoRow
                  label="کد ملی"
                  value={
                    toFa(
                      regP
                        .locked
                        .national_id
                    ) ||
                    "—"
                  }
                />

                <InfoRow
                  label="تاریخ تولد"
                  value={
                    pickBirthFa(
                      regP.locked
                    )
                  }
                />

                <InfoRow
                  label="کمربند"
                  value={
                    regP
                      .locked
                      .belt ||
                    "—"
                  }
                />

                <InfoRow
                  label="باشگاه"
                  value={
                    regP
                      .locked
                      .club ||
                    "—"
                  }
                />

                <InfoRow
                  label="مربی"
                  value={
                    regP
                      .locked
                      .coach ||
                    "—"
                  }
                />

              </div>
            ) : (
              <div
                className="cd-muted"
                style={{
                  marginBottom:
                    12,
                }}
              >
                در حال بارگذاری اطلاعات پروفایل…
              </div>
            )}


            <h3 className="cd-section-title">
              اطلاعات تکمیلی
            </h3>


            <div className="cd-grid">

              <div className="cd-row">

                <label className="cd-label">
                  نوع مسابقه
                </label>


                <div className="cd-value">

                  <div className="cd-radio-group">

                    <label className="cd-radio">

                      <input
                        type="radio"
                        name="poomsae_type"
                        value="standard"
                        checked={
                          regP
                            .poomsae_type ===
                          "standard"
                        }
                        onChange={() =>
                          setRegP(
                            (state) => ({
                              ...state,

                              poomsae_type:
                                "standard",
                            })
                          )
                        }
                      />

                      <span>
                        استاندارد
                      </span>

                    </label>


                    <label
                      className="cd-radio"
                      style={{
                        marginInlineStart:
                          16,
                      }}
                    >

                      <input
                        type="radio"
                        name="poomsae_type"
                        value="creative"
                        checked={
                          regP
                            .poomsae_type ===
                          "creative"
                        }
                        onChange={() =>
                          setRegP(
                            (state) => ({
                              ...state,

                              poomsae_type:
                                "creative",
                            })
                          )
                        }
                      />

                      <span>
                        ابداعی
                      </span>

                    </label>

                  </div>


                  {regP
                    .errors
                    .poomsae_type && (
                    <div
                      className="cd-error"
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      {
                        regP.errors
                          .poomsae_type
                      }
                    </div>
                  )}

                </div>
              </div>


              <div
                className="cd-row"
                title="شماره درج‌شده روی کارت بیمه ورزشی."
              >

                <label
                  className="cd-label"
                  htmlFor="ins-num-po"
                >
                  شماره بیمه
                </label>


                <div className="cd-value">

                  <input
                    id="ins-num-po"
                    className="cd-input"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    pattern="\d*"
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"
                    value={
                      regP
                        .insurance_number
                    }
                    onChange={(
                      event
                    ) =>
                      setRegP(
                        (state) => ({
                          ...state,

                          insurance_number:
                            normalizeDigits(
                              event
                                .target
                                .value
                            ),
                        })
                      )
                    }
                    required
                  />


                  {regP
                    .errors
                    .insurance_number && (
                    <div
                      className="cd-error"
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      {
                        regP.errors
                          .insurance_number
                      }
                    </div>
                  )}

                </div>
              </div>


              <div className="cd-row">

                <label
                  className="cd-label"
                  htmlFor="ins-date-po"
                >
                  تاریخ صدور بیمه‌نامه
                </label>


                <div className="cd-value">

                  <DatePicker
                    id="ins-date-po"
                    inputClass="cd-input"
                    containerClassName="cd-date"
                    calendar={
                      persian
                    }
                    locale={
                      persian_fa
                    }
                    format="YYYY/MM/DD"
                    value={
                      toJalaliDO(
                        regP
                          .insurance_issue_date
                      )
                    }
                    onChange={(
                      value
                    ) =>
                      setRegP(
                        (state) => ({
                          ...state,

                          insurance_issue_date:
                            value
                              ? normalizeDigits(
                                  value.format(
                                    "YYYY/MM/DD"
                                  )
                                )
                              : "",
                        })
                      )
                    }
                    calendarPosition="bottom-right"
                    editable={
                      false
                    }
                    maxDate={
                      maxIssueDO
                    }
                    minDate={
                      minIssueDO
                    }
                  />


                  {regP
                    .errors
                    .insurance_issue_date && (
                    <div
                      className="cd-error"
                      style={{
                        marginTop:
                          6,
                      }}
                    >
                      {
                        regP.errors
                          .insurance_issue_date
                      }
                    </div>
                  )}

                </div>
              </div>


              {regP
                .need_coach_code && (
                <div
                  className="cd-row"
                  title="این کد را مربی‌تان در داشبورد خودش می‌بیند."
                >

                  <label
                    className="cd-label"
                    htmlFor="coach_code_po"
                  >
                    کد تأیید مربی
                  </label>


                  <div className="cd-value">

                    <input
                      id="coach_code_po"
                      name="coach_code_po"
                      dir="ltr"
                      inputMode="numeric"
                      pattern="\d*"
                      className="cd-input"
                      placeholder="مثلاً ۴۵۸۲۷۱"
                      value={
                        regP
                          .coach_code
                      }
                      onChange={(
                        event
                      ) =>
                        setRegP(
                          (state) => ({
                            ...state,

                            coach_code:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      aria-invalid={
                        !!regP
                          .errors
                          .coach_code
                      }
                      required={
                        regP
                          .need_coach_code
                      }
                    />


                    {regP
                      .errors
                      .coach_code && (
                      <div
                        className="cd-error"
                        style={{
                          marginTop:
                            6,
                        }}
                      >
                        {
                          regP.errors
                            .coach_code
                        }
                      </div>
                    )}

                  </div>
                </div>
              )}

            </div>


            <div className="cd-row cd-row-multi">

              <label className="cd-checkbox">

                <input
                  type="checkbox"
                  checked={
                    regP.confirmed
                  }
                  onChange={(
                    event
                  ) =>
                    setRegP(
                      (state) => ({
                        ...state,

                        confirmed:
                          event
                            .target
                            .checked,
                      })
                    )
                  }
                />

                <span>
                  تمام اطلاعات واردشده را صحیح می‌دانم و مسئولیت آن را می‌پذیرم.
                </span>

              </label>


              {regP
                .errors
                .confirmed && (
                <div
                  className="cd-error"
                  style={{
                    marginTop:
                      6,
                  }}
                >
                  {
                    regP.errors
                      .confirmed
                  }
                </div>
              )}

            </div>


            <div
              className="cd-actions"
              style={{
                marginTop: 16,
              }}
            >

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  regP.loading ||
                  !regP
                    .can_register
                }
                title={
                  !regP
                    .can_register
                    ? "خارج از بازه ثبت‌نام یا ثبت‌نام غیرفعال است"
                    : ""
                }
              >
                {regP.loading
                  ? "در حال ثبت…"
                  : "تأیید و پرداخت"}
              </button>


              <button
                type="button"
                className="btn btn-light"
                onClick={() =>
                  setRegP(
                    (state) => ({
                      ...state,
                      open: false,
                    })
                  )
                }
                disabled={
                  regP.loading
                }
              >
                انصراف
              </button>

            </div>

          </form>
        </section>
      )}


      {/* ==========================
          Lightbox
      ========================== */}

      {lightbox && (
        <div
          className="cd-modal"
          onClick={() =>
            setLightbox(
              null
            )
          }
        >

          <div
            className="cd-modal-inner"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <button
              type="button"
              className="cd-modal-close"
              onClick={() =>
                setLightbox(
                  null
                )
              }
            >
              ✕
            </button>


            {lightbox.type ===
            "img" ? (
              <img
                className="cd-modal-media"
                src={
                  lightbox.url
                }
                alt="preview"
              />
            ) : null}

          </div>
        </div>
      )}


      {/* ==========================
          Coach code modal
      ========================== */}

      {codeModal.open && (
        <div
          className="cd-modal"
          onClick={() =>
            setCodeModal(
              (modal) => ({
                ...modal,
                open: false,
              })
            )
          }
        >

          <div
            className="cd-modal-inner cd-modal-inner--tiny cd-modal-inner--white"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <button
              type="button"
              className="cd-modal-close"
              onClick={() =>
                setCodeModal(
                  (modal) => ({
                    ...modal,
                    open: false,
                  })
                )
              }
            >
              ✕
            </button>


            <h3
              className="cd-section-title"
              style={{
                marginTop: 0,
                textAlign:
                  "center",
              }}
            >
              کد تأیید مربی
            </h3>


            {codeModal.loading ? (
              <div
                className="cd-muted"
                style={{
                  textAlign:
                    "center",
                }}
              >
                در حال دریافت…
              </div>

            ) : codeModal.approved &&
              codeModal.code ? (
              <>

                <div className="cd-code-box cd-code-box--small">
                  {toFa(
                    codeModal.code
                  )}
                </div>


                <div className="cd-code-actions">

                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={
                      copyCode
                    }
                  >
                    کپی
                  </button>

                </div>

              </>
            ) : (
              <>

                <div
                  className="cd-muted"
                  style={{
                    marginBottom:
                      12,
                    textAlign:
                      "center",
                  }}
                >
                  برای این مسابقه هنوز کدی ساخته نشده.
                </div>


                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "center",
                  }}
                >

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={
                      approveAndGetCode
                    }
                  >
                    دریافت کد
                  </button>

                </div>

              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}


/* ======================================================
   InfoRow
====================================================== */

function InfoRow({
  label,
  value,
  multiline = false,
}) {
  return (
    <div
      className={
        `cd-row ${
          multiline
            ? "cd-row-multi"
            : ""
        }`
      }
    >
      <div className="cd-label">
        {label}
      </div>

      <div className="cd-value">
        {value ?? "—"}
      </div>
    </div>
  );
}