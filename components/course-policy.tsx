import { coursePolicy, policyClosing } from "@/lib/course-policy";
export function CoursePolicy() {
  return (
    <section
      id="course-policy"
      className="course-policy panel"
      aria-labelledby="course-policy-title"
    >
      <div className="policy-heading">
        <span className="eyebrow">BEFORE YOU TRAIN</span>
        <h2 id="course-policy-title">购课须知</h2>
        <p>购课前请阅读，之后也可随时在此查看。</p>
      </div>
      <div className="policy-sections">
        {coursePolicy.map((item, i) => (
          <article key={item.title}>
            <span className="policy-number">0{i + 1}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="policy-closing">{policyClosing}</p>
    </section>
  );
}
