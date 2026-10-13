const styles = {
  error: "bg-red-50 text-red-700 ring-red-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function Alert({ type = "error", children }) {
  if (!children) return null;

  return (
    <div role={type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ring-1 ${styles[type]}`}>
      {children}
    </div>
  );
}

export default Alert;
