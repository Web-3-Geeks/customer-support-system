import { Link } from "react-router-dom";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary:
    "bg-linear-to-b from-coral-400 to-coral-600 text-white shadow-sm hover:brightness-105",
  dark: "bg-linear-to-b from-navy-600 to-navy-900 text-white shadow-sm hover:brightness-110",
  ghost: "bg-white text-ink ring-1 ring-line hover:bg-slate-50",
};

function Button({ variant = "primary", to, className = "", children, ...props }) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export default Button;
