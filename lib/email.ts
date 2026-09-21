export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function emailContent(
  name: string,
  subject: string,
  body: string,
  url: string,
  studio: string,
) {
  return `<div style="background:#f4f6f1;padding:32px;font-family:Arial,sans-serif;color:#203a32"><div style="max-width:560px;margin:auto;background:white;padding:32px;border-radius:12px"><p style="font-size:13px;color:#7d906e">${escapeHtml(studio)}</p><h1 style="font-size:24px">${escapeHtml(subject)}</h1><p>${escapeHtml(name)}，你好：</p><p style="line-height:1.8">${escapeHtml(body)}</p><p style="margin:30px 0"><a href="${escapeHtml(url)}" style="background:#183c30;color:white;text-decoration:none;padding:12px 20px;border-radius:6px">查看我的训练安排</a></p><hr style="border:0;border-top:1px solid #e6ecdf"><p style="font-size:12px;color:#89967d">可在网站「个人与设置」中关闭训练相关邮件提醒。具体安排以网站内最新记录为准。</p></div></div>`;
}
