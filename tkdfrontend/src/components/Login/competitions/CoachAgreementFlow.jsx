// src/components/CoachAgreementFlow.jsx  ← مسیر را با پروژه‌ات چک کن
import { useEffect, useState } from "react";
// ⛳ مسیر را با جای فایل خودت تطبیق بده
import {
  getCoachApprovalStatus,
  approveCompetition,
  getCompetitionDetail,
} from "../../../api/competitions";
import "./CoachAgreementFlow.css";

const toFa = (s) => String(s ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export default function CoachAgreementFlow({ competition, onDone, onCancel }) {
  const publicId = competition?.public_id || competition?.id;

  // UI state
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("terms"); // "terms" | "code"

  // data
  const [approved, setApproved] = useState(false);
  const [code, setCode] = useState(null);

  const [coachName, setCoachName] = useState("—");
  const [clubNames, setClubNames] = useState([]);

  const [termsTitle, setTermsTitle] = useState("تعهدنامه مربی");
  const [terms, setTerms] = useState("");

  // inputs
  const [checked, setChecked] = useState(false);

  // network
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      setLoading(true);
      setError("");

      try {
        // 1) وضعیت مربی (approved/code)
        const st = await getCoachApprovalStatus(publicId);
        if (!alive) return;

        setApproved(!!st?.approved);
        setCode(st?.code || null);
        setCoachName(st?.coach_name || "—");
        setClubNames(Array.isArray(st?.club_names) ? st.club_names : []);

        // 2) متن تعهدنامه از جزئیات مسابقه (اگر روی کارت نبود)
        if (competition?.terms_title || competition?.terms_content) {
          setTermsTitle((competition.terms_title || "تعهدنامه مربی").trim());
          setTerms((competition.terms_content || "").trim());
        } else {
          try {
            const det = await getCompetitionDetail(publicId);
            if (!alive) return;
            setTermsTitle((det?.terms_title || "تعهدنامه مربی").trim());
            setTerms((det?.terms_content || "").trim());
          } catch (_) {
            // اگر نگرفتیم، اهمیتی ندارد
          }
        }

        // اگر از قبل تأیید بوده، مستقیم برو به مرحلهٔ کد
        setStep(st?.approved ? "code" : "terms");
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "خطا در دریافت اطلاعات");
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (publicId) bootstrap();
    return () => { alive = false; };
  }, [publicId, competition?.terms_title, competition?.terms_content]);

  const handleApprove = async () => {
    if (!checked || !publicId) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await approveCompetition(publicId); // { code }
      setApproved(true);
      setCode(res?.code || null);
      setStep("code"); // ✅ بلافاصله برو به مرحلهٔ کد
    } catch (e) {
      setError(e?.message || "خطا در تایید تعهدنامه");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshCode = async () => {
    setSubmitting(true);
    setError("");
    try {
      const st = await getCoachApprovalStatus(publicId);
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

      {/* Terms step */}
      {step === "terms" ? (
        <>
          <div className="modal-meta">
            <div><b>مربی:</b> {coachName}</div>
            <div><b>باشگاه‌ها:</b> {clubNames?.length ? clubNames.join("، ") : "—"}</div>
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
            <button className="btn btn-secondary" onClick={onCancel}>انصراف</button>
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
        // Code step
        <>
          {approved && code ? (
            <>
              <p className="modal-code">
                کد تأیید شما <b>{toFa(String(code))}</b> می‌باشد.<br />
                لطفاً این کد را برای ثبت‌نام به بازیکنان تیم خود ارائه کنید.
              </p>
              <div className="modal-actions" style={{ gap: 8 }}>
                <button className="btn btn-outline" onClick={copyCode}>کپی کد</button>
                <button className="btn btn-success" onClick={onDone}>ادامه</button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-code">تأیید انجام شد، اما کدی دریافت نشد.</p>
              <div className="modal-actions" style={{ gap: 8 }}>
                <button className="btn btn-outline" onClick={refreshCode} disabled={submitting}>
                  {submitting ? "در حال دریافت…" : "دریافت/تازه‌سازی کد"}
                </button>
                <button className="btn btn-success" onClick={onDone}>ادامه</button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
