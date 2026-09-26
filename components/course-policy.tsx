"use client";
import { useLanguage } from "@/components/language-provider";
import { coursePolicy, policyClosing } from "@/lib/course-policy";
export function CoursePolicy() {
  const { t } = useLanguage();
  return (
    <section
      id="course-policy"
      className="course-policy panel"
      aria-labelledby="course-policy-title"
    >
      <div className="policy-heading">
        <span className="eyebrow">BEFORE YOU TRAIN</span>
        <h2 id="course-policy-title">{t("购课须知")}</h2>
        <p>{t("购课前请阅读，之后也可随时在此查看。")}</p>
      </div>
      <div className="policy-sections">
        {coursePolicy.map((item, i) => (
          <article key={t(item.title)}>
            <span className="policy-number">0{i + 1}</span>
            <div>
              <h3>{t(item.title)}</h3>
              <p>{t(item.text)}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="policy-closing">{t(policyClosing)}</p>
    </section>
  );
}
