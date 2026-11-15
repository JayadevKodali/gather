/** Shows ?error=, ?ok= and ?notice= messages passed back by server actions. */
export function Notices({ params }: { params: Record<string, string | string[] | undefined> }) {
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);
  const error = pick("error");
  const ok = pick("ok");
  const notice = pick("notice");
  return (
    <>
      {error && <div className="notice error" role="alert">{error}</div>}
      {ok && <div className="notice ok" role="status">{ok}</div>}
      {notice && <div className="notice info" role="status">{notice}</div>}
    </>
  );
}
