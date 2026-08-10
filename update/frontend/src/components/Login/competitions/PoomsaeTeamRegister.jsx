// src/components/Login/competitions/PoomsaeTeamRegister.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getEligibleStudentsForCoach,
  registerPoomsaeTeams,
  startPaymentIntent,
  submitGatewayForm,
} from "../../../api/competitions";
import "./PoomsaeTeamRegister.css";

import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

/* ---------- Helpers ---------- */

const toFa = (str) => String(str ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const normalizeDigits = (s = "") =>
  String(s)
    .replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)])
    .replace(/[٠-٩]/g, (d) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);

const stripRtlMarks = (s = "") => s.replace(/[\u200e\u200f\u200c\u202a-\u202e]/g, "");

const getId = (s) =>
  s?.id ??
  s?.player_id ??
  s?.user_id ??
  s?.profile_id;



/* ---------- registration window helpers ---------- */

const normalizeIso = (s) => stripRtlMarks(normalizeDigits(String(s || ""))).slice(0, 10);

const isISODate = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(normalizeIso(s));

const toDateSafe = (s) => {
  if (!isISODate(s)) return null;
  const t = normalizeIso(s);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2] - 1;
  const d = +m[3];

  // اگر سال کمتر از 1700 باشد یعنی جلالی است → نادیده بگیر
  if (y < 1700) return null;

  return new Date(y, mo, d);
};

const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------- team structure ---------- */

const SLOTS_BY_TYPE = {
  standard: { main: 3, reserve: 2 },
  creative: { main: 2, reserve: 1 },
};

const createEmptyTeam = (index = 1) => ({
  tmpId: `team-${index}-${Date.now()}`,
  name: "",
  type: "",
  main: [],
  reserve: [],
  // insurance[playerId] = { number: "", date: "YYYY/MM/DD (jalali)", date_iso: "YYYY-MM-DD" }
  insurance: {},
  errors: {},
});

/* =========================================
   Component
   ========================================= */

export default function PoomsaeTeamRegister() {
  const { slug, role } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [competition, setCompetition] = useState(null);
  const [students, setStudents] = useState([]);

  const [teams, setTeams] = useState([
    createEmptyTeam(1),
  ]);

  const [submitting, setSubmitting] =
    useState(false);

  const [hasDiscount, setHasDiscount] =
    useState(false);

  const [discountCode, setDiscountCode] =
    useState("");

  const [
    appliedDiscountCode,
    setAppliedDiscountCode,
  ] = useState("");

  const [discountError, setDiscountError] =
    useState("");

  const [discountLoading, setDiscountLoading] =
    useState(false);

  const [discountApplied, setDiscountApplied] =
    useState(false);

  const [
    originalAmountIrr,
    setOriginalAmountIrr,
  ] = useState(0);

  const [
    discountAmountIrr,
    setDiscountAmountIrr,
  ] = useState(0);

  const [
    finalAmountIrr,
    setFinalAmountIrr,
  ] = useState(0);
  
  /* --- load eligible students + competition --- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    getEligibleStudentsForCoach(slug, "poomsae")
      .then((res) => {
        if (!alive) return;
        const compData = res?.competition || null;
        const list = Array.isArray(res?.students) ? res.students : [];
        setCompetition(compData);
        setStudents(list);
      })
      .catch((e) => alive && setErr(e?.message || "خطا در دریافت لیست شاگردها / اطلاعات مسابقه"))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [slug]);

  /* --- registrationOpen: اولویت با فلگ‌ها، اگر نبود از بازه تاریخ --- */
  const registrationOpen = useMemo(() => {
    if (!competition) return false;

    const flag =
      competition.registration_open_effective ??
      competition.registration_open ??
      competition.can_register ??
      competition.canRegister;

    if (typeof flag === "boolean") return flag;

    const start =
      toDateSafe(competition.registration_start) ||
      toDateSafe(competition.registration_start_gregorian) ||
      toDateSafe(competition.registration_start_iso);

    const end =
      toDateSafe(competition.registration_end) ||
      toDateSafe(competition.registration_end_gregorian) ||
      toDateSafe(competition.registration_end_iso);

    const today = stripTime(new Date());

    if (start && end) {
      const s = stripTime(start);
      const e = stripTime(end);
      return today >= s && today <= e;
    }

    return true;
  }, [competition]);

  /* --- age categories defined for competition --- */
  const competitionAgeCategories = useMemo(() => {
    const rawCategories = Array.isArray(
      competition?.age_categories
    )
      ? competition.age_categories
      : Array.isArray(competition?.ageCategories)
      ? competition.ageCategories
      : [];

    return rawCategories.map((category, index) => {
      const key = String(
        category?.id ??
          category?.key ??
          category?.code ??
          category?.name ??
          category?.title ??
          `age-${index}`
      );

      const label =
        category?.name ||
        category?.title ||
        category?.label ||
        category?.age_category_name ||
        `رده سنی ${index + 1}`;

      const orderValue = Number(
        category?.order ??
          category?.sort_order ??
          category?.position ??
          index
      );

      return {
        key,
        label: String(label),
        order: Number.isFinite(orderValue)
          ? orderValue
          : index,
      };
    });
  }, [competition]);

  /* --- player options --- */
  const playerOptions = useMemo(() => {
    return students.map((s) => {
      const id = getId(s);

      const name =
        `${s.first_name || ""} ${
          s.last_name || ""
        }`.trim() || "—";

      const nat =
        s.national_code ||
        s.national_id ||
        "";

      const belt =
        s.belt_grade ||
        s.belt ||
        "";

      const studentAgeId =
        s.age_category_id ??
        s.age_group_id ??
        s.age_category_key ??
        null;

      const studentAgeName =
        s.age_category_name ||
        s.age_group_name ||
        null;

      const studentAgeOrder = Number(
        s.age_category_order ?? 999999
      );

      /*
      * رده سنی بازیکن را با رده‌های تعریف‌شده
      * برای مسابقه تطبیق می‌دهیم.
      */
      const definedAgeCategory =
        competitionAgeCategories.find(
          (category) =>
            String(category.key) ===
              String(studentAgeId) ||
            String(category.label).trim() ===
              String(studentAgeName).trim()
        );

      const ageKey = String(
        definedAgeCategory?.key ??
          studentAgeId ??
          studentAgeName
      );

      const ageLabel =
        definedAgeCategory?.label ||
        studentAgeName ||
        "بدون رده سنی";

      const ageOrder =
        definedAgeCategory?.order ?? 999999;

      const labelParts = [name];

      if (nat) {
        labelParts.push(`کدملی: ${nat}`);
      }

      if (belt) {
        labelParts.push(`کمربند: ${belt}`);
      }

      return {
        id,
        name,
        nationalCode: nat,
        belt,
        label: labelParts.join(" | "),

        ageKey,
        ageLabel,
        ageOrder,

        beltKey:
          s.belt_grade_id ||
          s.belt_grade ||
          s.belt ||
          "BELT?",
      };
    });
  }, [students, competitionAgeCategories]);

  /* --- players grouped by age category --- */
  const groupedPlayerOptions = useMemo(() => {
    const groupsMap = new Map();

    playerOptions.forEach((player) => {
      const groupKey =
        player.ageKey || "unknown-age";

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          label:
            player.ageLabel ||
            "بدون رده سنی",
          order:
            player.ageOrder ?? 999999,
          players: [],
        });
      }

      groupsMap
        .get(groupKey)
        .players.push(player);
    });

    return Array.from(groupsMap.values())
      .sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }

        return String(a.label).localeCompare(
          String(b.label),
          "fa"
        );
      })
      .map((group) => ({
        ...group,
        players: [...group.players].sort(
          (a, b) =>
            String(a.name).localeCompare(
              String(b.name),
              "fa"
            )
        ),
      }));
  }, [playerOptions]);

  const findPlayer = (pid) =>
    playerOptions.find(
      (p) => String(p.id) === String(pid)
    ) || null;

  /* --- summary & fee ---
   entry_fee در بک‌اند ریال و هزینه ثبت‌نام هر نفر است.
*/
const entryFeeIrr = Number(
  competition?.entry_fee || 0
);

const entryFeeToman = Math.floor(
  entryFeeIrr / 10
);

const summary = useMemo(() => {
  let standardTeams = 0;
  let creativeTeams = 0;
  let totalSlots = 0;

  teams.forEach((t) => {
    if (!t.type) return;

    if (t.type === "standard") {
      standardTeams += 1;
    }

    if (t.type === "creative") {
      creativeTeams += 1;
    }

    const allIds = [
      ...(t.main || []),
      ...(t.reserve || []),
    ].filter(Boolean);

    totalSlots += allIds.length;
  });

  const totalTeams =
    standardTeams + creativeTeams;

  const totalAmountIrr =
    entryFeeIrr * totalSlots;

  const totalAmountToman = Math.floor(
    totalAmountIrr / 10
  );

  return {
    standardTeams,
    creativeTeams,
    totalTeams,
    totalSlots,
    totalAmountIrr,
    totalAmountToman,
  };
}, [teams, entryFeeIrr]);

useEffect(() => {
  const rawAmount = Number(
    summary.totalAmountIrr || 0
  );

  setOriginalAmountIrr(rawAmount);
  setDiscountAmountIrr(0);
  setFinalAmountIrr(rawAmount);

  // با تغییر تعداد تیم یا اعضا،
  // کد باید دوباره بررسی شود.
  setDiscountApplied(false);
  setAppliedDiscountCode("");
  setDiscountError("");
}, [summary.totalAmountIrr]);


  /* ---------- team editing ---------- */

  const updateTeam = (tmpId, patch) => {
    setTeams((prev) => prev.map((t) => (t.tmpId === tmpId ? { ...t, ...patch } : t)));
  };

  const handleTypeChange = (tmpId, newType) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.tmpId !== tmpId) return t;
        const slots = SLOTS_BY_TYPE[newType] || { main: 0, reserve: 0 };
        return {
          ...t,
          type: newType,
          main: (t.main || []).slice(0, slots.main).concat(
            Array(Math.max(slots.main - (t.main || []).length, 0)).fill(null)
          ),
          reserve: (t.reserve || []).slice(0, slots.reserve).concat(
            Array(Math.max(slots.reserve - (t.reserve || []).length, 0)).fill(null)
          ),
          errors: { ...t.errors, type: undefined },
        };
      })
    );
  };

  const handleMemberChange = (tmpId, kind, index, value) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.tmpId !== tmpId) return t;

        const arr = [...(t[kind] || [])];
        const pid = value ? Number(value) : null;
        arr[index] = pid;

        const insurance = { ...(t.insurance || {}) };
        if (pid && !insurance[String(pid)]) {
          insurance[String(pid)] = { number: "", date: "", date_iso: "" };
        }

        return {
          ...t,
          [kind]: arr,
          insurance,
          errors: { ...t.errors, [`${kind}_${index}`]: undefined },
        };
      })
    );
  };

  const handleInsuranceChange = (tmpId, pid, field, value) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.tmpId !== tmpId) return t;
        const insurance = { ...(t.insurance || {}) };
        const key = String(pid);
        insurance[key] = {
          ...(insurance[key] || { number: "", date: "", date_iso: "" }),
          [field]: value,
        };

        return { ...t, insurance };
      })
    );
  };

  const addTeam = () => {
    setTeams((prev) => [...prev, createEmptyTeam(prev.length + 1)]);
  };

  const removeTeam = (tmpId) => {
    setTeams((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.tmpId !== tmpId)));
  };

  /* ---------- date picker renderer ---------- */

  const renderInsuranceDatePicker = (teamTmpId, pid, value) => (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={value || null}
      format="YYYY/MM/DD"
      inputClass="cd-input"
      calendarPosition="bottom-right"
      onChange={(dateObj) => {
        const jalali = dateObj ? dateObj.format("YYYY/MM/DD") : "";

        let iso = "";
        try {
          const d = dateObj ? dateObj.toDate() : null; // Gregorian Date
          if (d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            iso = `${y}-${m}-${day}`;
          }
        } catch {}

        handleInsuranceChange(teamTmpId, pid, "date", jalali);
        handleInsuranceChange(teamTmpId, pid, "date_iso", iso);
      }}
      disabled={!registrationOpen}
    />
  );

  /* ---------- validation ---------- */

  const validateTeams = () => {
    let hasError = false;
    const newTeams = teams.map((t) => ({ ...t, errors: {} }));
    const usage = {}; // usage[playerId] = { standard, creative }

    newTeams.forEach((t, tIndex) => {
      const errors = {};
      const isStandard = t.type === "standard";
      const isCreative = t.type === "creative";

      if (!t.type) {
        errors.type = "نوع تیم (استاندارد/ابداعی) را انتخاب کنید.";
        hasError = true;
      }

      if (!t.name || !t.name.trim()) {
        errors.name = "نام تیم را وارد کنید.";
        hasError = true;
      }

      const slots = SLOTS_BY_TYPE[t.type] || { main: 0, reserve: 0 };
      const main = t.main || [];
      const reserve = t.reserve || [];

      for (let i = 0; i < slots.main; i++) {
        const pid = main[i];
        if (!pid) {
          errors[`main_${i}`] = "این عضو اصلی الزامی است.";
          hasError = true;
        }
      }

      const allIds = [...main, ...reserve].filter(Boolean);

      // بیمه برای هر بازیکن انتخاب‌شده
      allIds.forEach((pid) => {
        const ins = (t.insurance || {})[String(pid)] || {};
        if (!String(ins.number || "").trim()) {
          errors[`ins_no_${pid}`] = "شماره بیمه برای این بازیکن الزامی است.";
          hasError = true;
        }
        if (!String(ins.date || "").trim()) {
          errors[`ins_date_${pid}`] = "تاریخ صدور بیمه برای این بازیکن الزامی است.";
          hasError = true;
        }
      });

      // رده سنی اعضای تیم باید یکسان باشد.
      // اختلاف رده کمربندی مجاز است و بک‌اند
      // رده تیم را از بالاترین عضو تعیین می‌کند.
      if (allIds.length > 0) {
        let ageKey = null;

        for (const pid of allIds) {
          const p = findPlayer(pid);
          if (!p) continue;

          if (ageKey == null) {
            ageKey = p.ageKey;
          }

          if (ageKey !== p.ageKey) {
            errors.age_mismatch =
              "رده سنی تمام اعضای تیم باید یکسان باشد.";

            hasError = true;
            break;
          }
        }
      }
      // جلوگیری از چندبار انتخاب در تیم‌های هم‌نوع
      allIds.forEach((pid) => {
        const key = String(pid);
        if (!usage[key]) usage[key] = { standard: 0, creative: 0 };
        if (isStandard) usage[key].standard += 1;
        if (isCreative) usage[key].creative += 1;
      });

      newTeams[tIndex].errors = errors;
    });

    Object.entries(usage).forEach(([pid, u]) => {
      const p = findPlayer(pid);
      const name = p?.label || `بازیکن ${pid}`;
      if (u.standard > 1) {
        hasError = true;
        newTeams.forEach((t) => {
          if (t.type !== "standard") return;
          const all = [...(t.main || []), ...(t.reserve || [])];
          if (all.includes(Number(pid))) {
            t.errors.player_multi_standard = `بازیکن «${name}» در بیش از یک تیم استاندارد انتخاب شده است.`;
          }
        });
      }
      if (u.creative > 1) {
        hasError = true;
        newTeams.forEach((t) => {
          if (t.type !== "creative") return;
          const all = [...(t.main || []), ...(t.reserve || [])];
          if (all.includes(Number(pid))) {
            t.errors.player_multi_creative = `بازیکن «${name}» در بیش از یک تیم ابداعی انتخاب شده است.`;
          }
        });
      }
    });

    setTeams(newTeams);
    return !hasError;
  };

  const canSubmit =
    registrationOpen &&
    !loading &&
    teams.some((t) => t.type && (t.main || []).filter(Boolean).length > 0 && summary.totalSlots > 0);

  /* ---------- payload builder (backend new shape) ---------- */

  const buildTeamPayload = (t) => {
    const members = [];

    (t.main || []).filter(Boolean).forEach((pid) => {
      const ins = (t.insurance || {})[String(pid)] || {};
      members.push({
        player_id: pid,
        role: "main",
        insurance_number: (ins.number || "").trim(),
        // ترجیح ISO برای بک‌اند (fallback به شمسی)
        insurance_issue_date: (ins.date_iso || ins.date || "").trim(),
      });
    });

    (t.reserve || []).filter(Boolean).forEach((pid) => {
      const ins = (t.insurance || {})[String(pid)] || {};
      members.push({
        player_id: pid,
        role: "sub",
        insurance_number: (ins.number || "").trim(),
        insurance_issue_date: (ins.date_iso || ins.date || "").trim(),
      });
    });

    return {
      name: t.name,
      style: t.type, // standard/creative
      members,
    };
  };

  const submitTeamsToBackend = async ({
    preview = false,
    discountCodeValue = "",
  } = {}) => {
    const teamPayloads =
      teams.map(buildTeamPayload);

    const normalizedDiscountCode =
      String(
        discountCodeValue || ""
      ).trim();

    const payload = {
      teams: teamPayloads,
      gateway: "sadad",
    };

    if (preview) {
      payload.preview = true;
    }

    if (normalizedDiscountCode) {
      payload.discount_code =
        normalizedDiscountCode;
    }

    console.log(
      "POOMSAE TEAM REQUEST",
      payload
    );

    const response =
      await registerPoomsaeTeams(
        slug,
        payload
      );

    console.log(
      "POOMSAE TEAM RESPONSE",
      response
    );

    const ids = [
      ...(Array.isArray(
        response?.enrollment_ids
      )
        ? response.enrollment_ids
        : []),

      ...(response?.enrollment_id != null
        ? [response.enrollment_id]
        : []),
    ]
      .map(Number)
      .filter(Number.isFinite);

    return {
      ...response,

      enrollment_ids:
        Array.from(
          new Set(ids)
        ),
    };
  };

/* ---------- submit + payment ---------- */

const handleApplyDiscount = async () => {
  setErr("");
  setDiscountError("");
  setDiscountApplied(false);
  setAppliedDiscountCode("");

  const normalizedCode =
    String(discountCode || "").trim();

  if (!hasDiscount) {
    setDiscountCode("");
    setDiscountAmountIrr(0);
    setAppliedDiscountCode("");

    setOriginalAmountIrr(
      summary.totalAmountIrr
    );

    setFinalAmountIrr(
      summary.totalAmountIrr
    );

    return;
  }

  if (!normalizedCode) {
    setDiscountError(
      "کد تخفیف را وارد کنید."
    );
    return;
  }

  if (!summary.totalSlots) {
    setDiscountError(
      "ابتدا اعضای تیم‌ها را انتخاب کنید."
    );
    return;
  }

  if (!validateTeams()) {
    setDiscountError(
      "ابتدا خطاهای اطلاعات تیم‌ها را برطرف کنید."
    );
    return;
  }

  try {
    setDiscountLoading(true);

    const result =
      await submitTeamsToBackend({
        preview: true,

        // مهم: ارسال کد تخفیف به بک‌اند
        discountCodeValue:
          normalizedCode,
      });

    const returnedCode =
      String(
        result?.discount_code || ""
      ).trim();

    if (!returnedCode) {
      throw new Error(
        "کد تخفیف توسط سرور تأیید نشد."
      );
    }

    const rawAmount = Number(
      result?.raw_total_irr ??
      result?.original_amount_irr ??
      summary.totalAmountIrr ??
      0
    );

    const discountAmount = Number(
      result?.discount_amount_irr ??
      0
    );

    const payableAmount = Number(
      result?.amount_irr ??
      result?.payable_amount_irr ??
      Math.max(
        0,
        rawAmount - discountAmount
      )
    );

    setOriginalAmountIrr(
      Number.isFinite(rawAmount)
        ? rawAmount
        : summary.totalAmountIrr
    );

    setDiscountAmountIrr(
      Number.isFinite(discountAmount)
        ? discountAmount
        : 0
    );

    setFinalAmountIrr(
      Number.isFinite(payableAmount)
        ? payableAmount
        : summary.totalAmountIrr
    );

    // کدی که واقعاً توسط سرور تأیید شده
    setAppliedDiscountCode(
      returnedCode
    );

    setDiscountApplied(true);
    setDiscountError("");
  } catch (error) {
    const payload =
      error?.payload ||
      error?.response?.data ||
      {};

    const discountCodeError =
      payload?.discount_code;

    let message = "";

    if (
      Array.isArray(
        discountCodeError
      )
    ) {
      message = discountCodeError
        .filter(Boolean)
        .map(String)
        .join("، ");
    } else if (
      discountCodeError &&
      typeof discountCodeError ===
        "object"
    ) {
      message = Object.values(
        discountCodeError
      )
        .flat(Infinity)
        .filter(Boolean)
        .map(String)
        .join("، ");
    } else if (discountCodeError) {
      message = String(
        discountCodeError
      );
    }

    setDiscountAmountIrr(0);

    setOriginalAmountIrr(
      summary.totalAmountIrr
    );

    setFinalAmountIrr(
      summary.totalAmountIrr
    );

    setDiscountApplied(false);
    setAppliedDiscountCode("");

    setDiscountError(
      message ||
      payload?.detail ||
      payload?.message ||
      error?.message ||
      "امکان اعمال کد تخفیف وجود ندارد."
    );
  } finally {
    setDiscountLoading(false);
  }
};



const handleSubmit = async () => {
  setErr("");

  if (!registrationOpen) {
    setErr(
      "در حال حاضر ثبت‌نام این مسابقه غیرفعال است."
    );
    return;
  }

  if (!validateTeams()) {
    setErr(
      "لطفاً خطاهای فرم تیم‌ها را برطرف کنید."
    );
    return;
  }

  if (!summary.totalSlots) {
    setErr(
      "هیچ عضوی برای تیم‌ها انتخاب نشده است."
    );
    return;
  }

  if (
    hasDiscount &&
    !discountCode.trim()
  ) {
    setErr(
      "کد تخفیف را وارد کنید."
    );
    return;
  }

  if (
    hasDiscount &&
    discountCode.trim() &&
    !discountApplied
  ) {
    setErr(
      "کد تخفیف هنوز اعمال نشده است. ابتدا روی دکمه «اعمال» بزنید."
    );
    return;
  }

  if (!competition?.public_id) {
    setErr(
      "شناسه مسابقه روی سرور یافت نشد."
    );
    return;
  }

  try {
    setSubmitting(true);

    const currentDiscountCode =
      String(discountCode || "").trim();

    const finalDiscountCode =
      hasDiscount
        ? String(
            appliedDiscountCode || ""
          ).trim()
        : "";

    if (
      hasDiscount &&
      currentDiscountCode &&
      finalDiscountCode !==
        currentDiscountCode
    ) {
      throw new Error(
        "کد تخفیف تغییر کرده است؛ دوباره روی «اعمال» بزنید."
      );
    }

    if (
      hasDiscount &&
      currentDiscountCode &&
      !finalDiscountCode
    ) {
      throw new Error(
        "ابتدا کد تخفیف را اعمال کنید."
      );
    }

    const res =
      await submitTeamsToBackend({
        preview: false,
        discountCodeValue:
          finalDiscountCode,
      });

    const eids = Array.isArray(
      res?.enrollment_ids
    )
      ? res.enrollment_ids
      : [];

    if (
      res?.errors &&
      Object.keys(res.errors).length &&
      !eids.length
    ) {
      const firstError =
        Object.values(res.errors)[0];

      throw new Error(
        typeof firstError === "string"
          ? firstError
          : "اطلاعات تیم‌ها معتبر نیست."
      );
    }

    const paymentRequired =
      res?.payment_required ??
      res?.paymentRequired;

    // مسابقه رایگان یا پرداخت غیرفعال
    if (paymentRequired === false) {
      if (!eids.length) {
        throw new Error(
          res?.detail ||
            "ثبت انجام شد، اما شناسه ثبت‌نام از سرور برنگشت."
        );
      }

      const qs = encodeURIComponent(
        eids.join(",")
      );

      navigate(
        `/dashboard/${encodeURIComponent(
          role || "coach"
        )}/enrollments/bulk?ids=${qs}&kind=poomsae`,
        {
          state: {
            ids: eids,
            kind: "poomsae",
          },
          replace: true,
        }
      );

      return;
    }

    if (paymentRequired !== true) {
      throw new Error(
        res?.detail ||
          "وضعیت پرداخت در پاسخ سرور مشخص نیست."
      );
    }

    localStorage.setItem(
      "last_payment_kind",
      "poomsae"
    );

    localStorage.setItem(
      "last_payment_comp",
      String(
        slug ||
          competition?.public_id ||
          ""
      )
    );

    if (eids.length) {
      localStorage.setItem(
        "last_payment_enrollment_ids",
        eids.join(",")
      );
    }

    // اگر سرور لینک مستقیم درگاه داده باشد
    const directPaymentUrl =
      res?.payment_url ||
      res?.paymentUrl ||
      res?.redirect_url ||
      res?.redirectUrl ||
      res?.payment?.payment_url ||
      res?.payment?.redirect_url;

    if (directPaymentUrl) {
      window.location.href =
        directPaymentUrl;
      return;
    }

    // شناسه PaymentIntent ساخته‌شده در بک‌اند
    const intentPublicId =
      res?.payment_intent_public_id ||
      res?.paymentIntentPublicId ||
      res?.public_id ||
      res?.payment?.public_id;

    if (!intentPublicId) {
      throw new Error(
        "شناسه پرداخت تیم‌ها از سرور دریافت نشد."
      );
    }

    const params =
      new URLSearchParams();

    params.set(
      "flow",
      "poomsae_team_after_payment"
    );

    params.set(
      "kind",
      "poomsae"
    );

    if (competition?.id) {
      params.set(
        "cid",
        String(competition.id)
      );
    }

    if (eids.length) {
      params.set(
        "ids",
        eids.join(",")
      );
    }

    const callbackUrl =
      `${window.location.origin}` +
      `/#/payment/result?${params.toString()}`;

    const payRes =
      await startPaymentIntent(
        intentPublicId,
        {
          gateway: "sadad",
          callbackUrl,
        }
      );

    if (payRes?.redirect_url) {
      window.location.href =
        payRes.redirect_url;
      return;
    }

    if (payRes?.payment) {
      submitGatewayForm(
        payRes.payment
      );
      return;
    }

    throw new Error(
      "اطلاعات انتقال به درگاه بانکی از سرور دریافت نشد."
    );
  } catch (e) {
    const payload = e?.payload || {};
    const serverErrors = payload?.errors;

    if (
      serverErrors &&
      typeof serverErrors === "object" &&
      !Array.isArray(serverErrors) &&
      Object.keys(serverErrors).length
    ) {
      const normalizeErrorText = (value) => {
        if (Array.isArray(value)) {
          return value.filter(Boolean).join("، ");
        }

        if (value && typeof value === "object") {
          return Object.values(value)
            .flat(Infinity)
            .filter(Boolean)
            .map(String)
            .join("، ");
        }

        return String(value || "خطای نامشخص");
      };

      const messages = Object.entries(serverErrors).map(
        ([key, value]) => {
          const teamMatch = key.match(/^team_(\d+)$/);

          const title = teamMatch
            ? `تیم ${toFa(teamMatch[1])}`
            : key;

          return `${title}: ${normalizeErrorText(value)}`;
        }
      );

      // نمایش خلاصه تمام خطاها بالای صفحه
      setErr(messages.join(" | "));

      // اتصال خطای هر تیم به کارت همان تیم
      setTeams((prev) =>
        prev.map((team, index) => {
          const teamError =
            serverErrors[`team_${index + 1}`];

          if (!teamError) {
            return team;
          }

          return {
            ...team,
            errors: {
              ...(team.errors || {}),
              server: normalizeErrorText(teamError),
            },
          };
        })
      );

      return;
    }

    setErr(
      payload?.detail ||
        payload?.message ||
        e?.message ||
        "خطا در ثبت تیم‌ها یا شروع پرداخت"
    );
  } finally {
    setSubmitting(false);
  }
};
  /* ---------- UI ---------- */

  if (loading && !competition) {
    return (
      <div className="cd-container">
        <div className="cd-skeleton">در حال بارگذاری…</div>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="cd-container">
        <div className="cd-error">مسابقه یافت نشد.</div>
      </div>
    );
  }

  const titleText = competition.title || competition.name || "—";

  return (
    <div className="cd-container ptr-container" dir="rtl">
      {err && (
        <div className="cd-error" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}

      {/* header */}
      <div className="cd-hero small">
        <div className="cd-hero-body">
          <h1 className="cd-title">ثبت‌نام تیمی پومسه – {titleText}</h1>
          <div className="cd-chips">
            <span className="cd-chip">
               هزینه ثبت‌نام هر نفر:{" "}
              <strong>
                {toFa(
                  entryFeeToman.toLocaleString()
                )}
              </strong>{" "}
              تومان
            </span>
          </div>
        </div>
      </div>

      {!registrationOpen && (
        <div className="cd-note cd-note--poomsae" style={{ marginBottom: 16 }}>
          ثبت‌نام تیمی فقط در بازه‌ی تاریخ شروع و پایان ثبت‌نام مسابقه فعال است.
        </div>
      )}

      {/* teams */}
      <section className="cd-section">
        <h2 className="cd-section-title">تیم‌ها</h2>

        {teams.map((t, idx) => {
          const slots = SLOTS_BY_TYPE[t.type] || { main: 0, reserve: 0 };
          const selectedIdsInThisTeam = new Set(
            [...(t.main || []), ...(t.reserve || [])].filter(Boolean)
          );

          const renderMemberCard = (label, pid, onSelect, currentValue, errorKey) => {
            const ins = pid ? (t.insurance?.[String(pid)] || {}) : {};
            const errNo = pid ? t.errors?.[`ins_no_${pid}`] : null;
            const errDate = pid ? t.errors?.[`ins_date_${pid}`] : null;

            const optionEls = groupedPlayerOptions.map(
              (group) => (
                <optgroup
                  key={group.key}
                  label={`${group.label} — ${toFa(
                    group.players.length
                  )} بازیکن`}
                >
                  {group.players.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={
                        selectedIdsInThisTeam.has(p.id) &&
                        String(p.id) !==
                          String(currentValue)
                      }
                    >
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              )
            );

            return (
              <div className="poomsae-member-card">
                <label className="cd-label">{label}</label>

                <select
                  className="cd-input"
                  value={currentValue || ""}
                  onChange={onSelect}
                  disabled={!registrationOpen}
                >
                  <option value="">انتخاب بازیکن…</option>
                  {optionEls}
                </select>

                {errorKey && t.errors?.[errorKey] && (
                  <div className="cd-error" style={{ marginTop: 6 }}>
                    {t.errors[errorKey]}
                  </div>
                )}

                {pid && (
                  <>
                    <div className="insurance-grid" style={{ marginTop: 10 }}>
                      <div>
                        <label className="cd-label">شماره بیمه</label>
                        <input
                          className="cd-input"
                          value={ins.number || ""}
                          onChange={(e) =>
                            handleInsuranceChange(t.tmpId, pid, "number", e.target.value)
                          }
                          placeholder="مثلاً ۱۲۳۴۵۶"
                          disabled={!registrationOpen}
                        />
                        {errNo && (
                          <div className="cd-error" style={{ marginTop: 6 }}>
                            {errNo}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="cd-label">تاریخ صدور بیمه (شمسی)</label>
                        {renderInsuranceDatePicker(t.tmpId, pid, ins.date)}
                        {errDate && (
                          <div className="cd-error" style={{ marginTop: 6 }}>
                            {errDate}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          };

          return (
            <div key={t.tmpId} className="cd-card" style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 2fr auto",
                  gap: 12,
                  alignItems: "flex-end",
                  marginBottom: 8,
                }}
              >
                <div>
                  <label className="cd-label">نام تیم</label>
                  <input
                    className="cd-input"
                    value={t.name}
                    onChange={(e) =>
                      updateTeam(t.tmpId, {
                        name: e.target.value,
                        errors: { ...t.errors, name: undefined },
                      })
                    }
                    placeholder={`مثلاً تیم ${idx + 1}`}
                    disabled={!registrationOpen}
                  />
                  {t.errors.name && (
                    <div className="cd-error" style={{ marginTop: 4 }}>
                      {t.errors.name}
                    </div>
                  )}
                </div>

                <div>
                  <label className="cd-label">نوع تیم</label>
                  <select
                    className="cd-input"
                    value={t.type || ""}
                    onChange={(e) => handleTypeChange(t.tmpId, e.target.value)}
                    disabled={!registrationOpen}
                  >
                    <option value="">انتخاب کنید…</option>
                    <option value="standard">پومسه استاندارد (۳ اصلی + ۲ ذخیره)</option>
                    <option value="creative">پومسه ابداعی (۲ اصلی + ۱ ذخیره)</option>
                  </select>
                  {t.errors.type && (
                    <div className="cd-error" style={{ marginTop: 4 }}>
                      {t.errors.type}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "left" }}>
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={() => removeTeam(t.tmpId)}
                    disabled={teams.length <= 1 || !registrationOpen}
                    title={
                      teams.length <= 1
                        ? "حداقل یک تیم باید وجود داشته باشد"
                        : "حذف این تیم"
                    }
                  >
                    حذف تیم
                  </button>
                </div>
              </div>
              {t.errors?.server && (
                <div
                  className="cd-error"
                  style={{
                    marginTop: 10,
                    marginBottom: 12,
                    padding: "10px 12px",
                  }}
                >
                  {`تیم ${toFa(idx + 1)}: ${t.errors.server}`}
                </div>
              )}
              {t.type && (
                <div className="cd-grid">
                  {/* main */}
                  <div className="poomsae-members-grid">
                    {Array.from({ length: slots.main }).map((_, i) => (
                      <div key={`main-${i}`}>
                        {renderMemberCard(
                          `عضو اصلی ${toFa(i + 1)}`,
                          t.main?.[i],
                          (e) => handleMemberChange(t.tmpId, "main", i, e.target.value || null),
                          t.main?.[i],
                          `main_${i}`
                        )}
                      </div>
                    ))}
                  </div>

                  {/* reserve */}
                  <div className="poomsae-members-grid">
                    {Array.from({ length: slots.reserve }).map((_, i) => (
                      <div key={`reserve-${i}`}>
                        {renderMemberCard(
                          `بازیکن ذخیره ${toFa(i + 1)} (اختیاری)`,
                          t.reserve?.[i],
                          (e) =>
                            handleMemberChange(t.tmpId, "reserve", i, e.target.value || null),
                          t.reserve?.[i],
                          null
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {t.errors.age_mismatch && (
                <div className="cd-error" style={{ marginTop: 10 }}>
                  {t.errors.age_mismatch}
                </div>
              )}
              {t.errors.age_mismatch && (
                <div
                  className="cd-error"
                  style={{ marginTop: 10 }}
                >
                  {t.errors.age_mismatch}
                </div>
              )}
              {t.errors.player_multi_standard && (
                <div className="cd-error" style={{ marginTop: 10 }}>
                  {t.errors.player_multi_standard}
                </div>
              )}
              {t.errors.player_multi_creative && (
                <div className="cd-error" style={{ marginTop: 10 }}>
                  {t.errors.player_multi_creative}
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-outline"
          onClick={addTeam}
          disabled={!registrationOpen}
          title={!registrationOpen ? "افزودن تیم جدید فقط در بازه‌ی ثبت‌نام مجاز است" : ""}
        >
          + افزودن تیم جدید
        </button>
      </section>

      {/* summary */}
      <section className="cd-section">
        <h2 className="cd-section-title">خلاصه</h2>

        <div
          className="cd-card"
          style={{
            marginBottom: 16,
            padding: 16,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              marginBottom: hasDiscount
                ? 12
                : 0,
            }}
          >
            <input
              type="checkbox"
              checked={hasDiscount}
              disabled={
                submitting ||
                discountLoading ||
                !registrationOpen
              }
              onChange={(event) => {
                const checked =
                  event.target.checked;

                setHasDiscount(checked);
                setDiscountError("");
                setDiscountApplied(false);
                setAppliedDiscountCode("");

                if (!checked) {
                  setDiscountCode("");
                  setDiscountAmountIrr(0);

                  setOriginalAmountIrr(
                    summary.totalAmountIrr
                  );

                  setFinalAmountIrr(
                    summary.totalAmountIrr
                  );
                }
              }}
            />

            <span>
              کد تخفیف دارم
            </span>
          </label>

          {hasDiscount && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1fr) auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                className="cd-input"
                value={discountCode}
                placeholder="کد تخفیف مربی"
                disabled={
                  submitting ||
                  discountLoading ||
                  !registrationOpen
                }
                onChange={(event) => {
                  setDiscountCode(
                    event.target.value
                  );

                  // هر تغییر در متن کد، تأیید قبلی
                  // سرور را باطل می‌کند.
                  setDiscountApplied(false);
                  setAppliedDiscountCode("");
                  setDiscountError("");
                  setDiscountAmountIrr(0);

                  setOriginalAmountIrr(
                    summary.totalAmountIrr
                  );

                  setFinalAmountIrr(
                    summary.totalAmountIrr
                  );
                }}
              />

              <button
                type="button"
                className="btn btn-outline"
                onClick={
                  handleApplyDiscount
                }
                disabled={
                  discountLoading ||
                  submitting ||
                  !registrationOpen
                }
              >
                {discountLoading
                  ? "در حال بررسی…"
                  : "اعمال"}
              </button>
            </div>
          )}

          {discountError && (
            <div
              className="cd-error"
              style={{
                marginTop: 8,
              }}
            >
              {discountError}
            </div>
          )}

          {discountApplied && (
            <div
              className="cd-note cd-note--poomsae"
              style={{
                marginTop: 10,
              }}
            >
              کد تخفیف با موفقیت اعمال شد.
            </div>
          )}
        </div>

  <div className="cd-discount-summary">
          <div>
            تعداد تیم‌های استاندارد: <strong>{toFa(summary.standardTeams)}</strong>
          </div>
          <div>
            تعداد تیم‌های ابداعی: <strong>{toFa(summary.creativeTeams)}</strong>
          </div>
          <div>
            تعداد کل اسلات‌های پرشده (نفر): <strong>{toFa(summary.totalSlots)}</strong>
          </div>
          <div>
            مبلغ اولیه:{" "}
            <strong>
              {toFa(
                Math.floor(
                  Number(
                    originalAmountIrr || 0
                  ) / 10
                ).toLocaleString()
              )}
            </strong>{" "}
            تومان
          </div>

          <div>
            مبلغ تخفیف:{" "}
            <strong>
              {toFa(
                Math.floor(
                  Number(
                    discountAmountIrr || 0
                  ) / 10
                ).toLocaleString()
              )}
            </strong>{" "}
            تومان
          </div>

          <div>
            مبلغ قابل پرداخت:{" "}
            <strong>
              {toFa(
                Math.floor(
                  Number(
                    finalAmountIrr || 0
                  ) / 10
                ).toLocaleString()
              )}
            </strong>{" "}
            تومان
          </div>
        </div>

        <div className="cd-actions" style={{ marginTop: 16 }}>
          <button
            className="btn btn-light"
            onClick={() =>
              navigate(
                `/dashboard/${encodeURIComponent(role || "coach")}/competitions/${encodeURIComponent(slug)}`
              )
            }
          >
            بازگشت
          </button>

          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={
              !canSubmit ||
              submitting ||
              discountLoading
            }
            title={
              !registrationOpen
                ? "ثبت‌نام تیمی در حال حاضر بسته است"
                : !summary.totalSlots
                ? "هیچ عضوی برای تیم‌ها انتخاب نشده است"
                : hasDiscount &&
                  discountCode.trim() &&
                  !discountApplied
                ? "ابتدا کد تخفیف را اعمال کنید"
                : ""
            }
          >
            {submitting
              ? "در حال ثبت…"
              : Number(
                  finalAmountIrr || 0
                ) === 0
              ? "ثبت نهایی"
              : "تأیید و پرداخت"}
          </button>
        </div>
      </section>
    </div>
  );
}
