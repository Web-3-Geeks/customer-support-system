import Navbar from "./Navbar";

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c43d28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 2.6 2.6L16 9.5" />
    </svg>
  );
}

const features = [
  { title: "Real-time chat", text: "Talk to support agents instantly, right inside your ticket." },
  { title: "Role-based access", text: "Customers, agents and admins each get their own dashboard." },
];

function AuthLayout({ title, subtitle, points = [], children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
        <section>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-base text-slate-600">{subtitle}</p>

          <ul className="mt-6 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-sm font-medium text-ink">
                <CheckIcon />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-10 hidden gap-4 sm:grid sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5"
              >
                <h2 className="text-sm font-semibold text-ink">{feature.title}</h2>
                <p className="mt-1 text-xs text-muted">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full lg:justify-self-end lg:max-w-md">
          <div className="rounded-3xl bg-white/80 p-6 shadow-lg ring-1 ring-black/5 backdrop-blur sm:p-8">
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}

export default AuthLayout;
