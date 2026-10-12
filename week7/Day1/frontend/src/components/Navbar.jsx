import Logo from "./Logo";
import Button from "./Button";

function Navbar() {
  return (
    <header className="mx-auto w-full max-w-6xl px-4 pt-4">
      <nav className="flex items-center justify-between rounded-2xl bg-white/90 px-5 py-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <Logo />
        <div className="flex items-center gap-2">
          <Button to="/login" variant="ghost" className="px-4 py-2">
            Sign In
          </Button>
          <Button to="/register" variant="primary" className="px-4 py-2">
            Get Started
          </Button>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
