// src/components/Login/competitions/CoachAgreementFlow.jsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  // Kyorugi
  getCoachApprovalStatus,
  approveCompetition,
  // Poomsae
  getPoomsaeCoachApprovalStatus,
  approvePoomsaeCompetition,
  // Common
  getCompetitionTerms,
  getCurrentRole,
} from "../../../api/competitions";
import "./CoachAgreementFlow.css";

const toFa = (s) => String(s ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export default function CoachAgreementFlow({ competition, onDone, onCancel }) {
  const navigate = useNavigate();

  const publicId = competition?.public_id || competition?.id;
  const style = useMemo(() => String(competition?.style_display || "").trim(), [competition]);
  const isKyorugi = style === "کیوروگی";
  const isPoomsae = style === "پومسه";

  // UI
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("terms"); // "terms" | "code"

  // data
  const [approved, setApproved] = useState(false);
  const [code, setCode] = useState(null);
  const [coachName, setCoachName] = useState("—");
  const [clubNames, setClubNames] = useState([]);
  const [termsTitle, setTermsTitle] = useState("تعهدنامه مربی");
  const [terms, setTerms] = useState("");

  // inputs/network
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ----- Helper: pick role segment for routing -----
  const getRoleSegment = () => {
    const raw =
      (getCurrentRole && getCurrentRole()) ||
      (localStorage.getItem("user_role") || "");
    const r = String(raw).toLowerCase();
    if (r === "both") return "coach";
    if (["coach", "player", "referee", "club", "heyat", "board"].includes(r)) return r;
    // اگر رشته‌ای مرکب باشد (coach,player و ...):
    if (r.includes("coach")) return "coach";
    if (r.includes("referee")) return "referee";
    if (r.includes("club")) return "club";
    if (r.includes("heyat") || r.includes("board")) return "heyat";
    if (r.includes("player")) return "player";
    return "coach";
  };

  const goToDetails = () => {
    if (!publicId) return;
    const roleSeg = getRoleSegment();
    const target = `/dashboard/${encodeURIComponent(roleSeg)}/competitions/${encodeURIComponent(publicId)}`;
    // یک tick برای اینکه unmount مودال کامل شود
    setTimeout(() => {
      navigate(target);
      // اگر والد هم listener دارد، اشکالی ندارد صدا بزنیم:
      onDone?.(publicId);
    }, 0);
  };

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      if (!publicId) return;
      setLoading(true);
      setError("");

      try {
        // 1) متن تعهدنامه (مشترک)
        try {
          const det = await getCompetitionTerms(publicId);
          if (!alive) return;
          setTermsTitle((det?.title || "تعهدنامه مربی").trim());
          setTerms((det?.content || "").trim() || "با پذیرش این تعهدنامه، مسئولیت‌های مربی/نماینده را می‌پذیرم.");
        } catch {
          if (!alive) return;
          setTermsTitle("تعهدنامه مربی");
          setTerms("با پذیرش این تعهدنامه، مسئولیت‌های مربی/نماینده را می‌پذیرم.");
        }

        // 2) وضعیت تایید + کُد (برای هر سبک API درست را صدا بزن)
        try {
          const st = isPoomsae
            ? await getPoomsaeCoachApprovalStatus(publicId)
            : await getCoachApprovalStatus(publicId);

          if (!alive) return;
          setApproved(!!st?.approved);
          setCode(st?.code || null);
          setCoachName(st?.coach_name || "—");
          setClubNames(Array.isArray(st?.club_names) ? st.club_names : []);
          setStep(st?.approved ? "code" : "terms");
        } catch (e) {
          if (!alive) return;
          setError(e?.message || "خطا در دریافت وضعیت مربی");
          setStep("terms");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      alive = false;
    };
  }, [publicId, isKyorugi, isPoomsae]);

  // تأیید تعهدنامه
  const handleApprove = async () => {
    if (!checked || !publicId) return;
    setSubmitting(true);
    setError("");

    try {
      if (isKyorugi) {
        const res = await approveCompetition(publicId); // POST
        setApproved(true);
        setStep("code");
        if (res?.code) {
          setCode(res.code);
        } else {
          await new Promise((r) => setTimeout(r, 200));
          try {
            const st = await getCoachApprovalStatus(publicId);
            setCode(st?.code || null);
          } catch {
            setCode(null);
          }
        }
        return; // کاربر با «ادامه» به جزئیات می‌رود
      }

      // پومسه
      const res = await approvePoomsaeCompetition(publicId); // POST
      setApproved(true);
      setStep("code");
      if (res?.code) {
        setCode(res.code);
      } else {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const st = await getPoomsaeCoachApprovalStatus(publicId);
          setCode(st?.code || null);
        } catch {
          setCode(null);
        }
      }
    } catch (e) {
      setError(e?.message || "خطا در تایید تعهدنامه");
    } finally {
      setSubmitting(false);
    }
  };

  // تازه‌سازی کُد (برای هر دو سبک)
  const refreshCode = async () => {
    setSubmitting(true);
    setError("");
    try {
      setStep("code");
      const st = isPoomsae
        ? await getPoomsaeCoachApprovalStatus(publicId)
        : await getCoachApprovalStatus(publicId);
      setApproved(!!st?.approved);
      setCode(st?.code || null);
    } catch (e) {
      setError(e?.message || "خطا در دریافت کد");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(String(code || ""));
      alert("کد کپی شد.");
    } catch {
      window.prompt("برای کپی، کد را انتخاب و کپی کنید:", String(code || ""));
    }
  };

  const Modal = ({ children }) => (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  if (loading) return null;

  return (
    <Modal>
      {/* Title */}
      <h3 className="modal-title">
        {step === "terms" ? (
          <>
            {termsTitle} «{competition?.title || "—"}»
          </>
        ) : (
          "کد تأیید مربی"
        )}
      </h3>

      {/* Error */}
      {!!error && <div className="alert-error">{error}</div>}

      {/* مرحلهٔ تعهدنامه */}
      {step === "terms" ? (
        <>
          <div className="modal-meta">
            <div>
              <b>مربی:</b> {coachName}
            </div>
            <div>
              <b>باشگاه‌ها:</b> {clubNames?.length ? clubNames.join("، ") : "—"}
            </div>
          </div>

          <div className="modal-text" style={{ whiteSpace: "pre-line" }}>
            {terms || "برای این مسابقه قالب تعهدنامه انتخاب نشده است."}
          </div>

          <label className="modal-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>تمام موارد بالا را تأیید می‌کنم</span>
          </label>

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onCancel}>
              انصراف
            </button>
            <button
              className="btn btn-success"
              disabled={!checked || submitting}
              onClick={handleApprove}
              title={!checked ? "ابتدا تعهدنامه را بپذیرید" : ""}
            >
              {submitting ? "در حال ثبت…" : "تأیید"}
            </button>
          </div>
        </>
      ) : (
        // مرحلهٔ «کُد»
        <>
          {approved && code ? (
            <>
              <p className="modal-code">
                کد تأیید شما <b>{toFa(String(code))}</b> می‌باشد.
                <br />
                لطفاً این کد را برای ثبت‌نام به بازیکنان تیم خود ارائه کنید.
              </p>
              <div className="modal-actions" style={{ gap: 8 }}>
                <button className="btn btn-outline" onClick={copyCode}>
                  کپی کد
                </button>
                <button className="btn btn-success" onClick={goToDetails}>
                  ادامه
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-code">تأیید انجام شد، اما کدی دریافت نشد.</p>
              <div className="modal-actions" style={{ gap: 8 }}>
                <button className="btn btn-outline" onClick={refreshCode} disabled={submitting}>
                  {submitting ? "در حال دریافت…" : "تازه‌سازی کد"}
                </button>
                <button className="btn btn-success" onClick={goToDetails}>
                  ادامه
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
