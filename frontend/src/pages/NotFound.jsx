import Button from "../components/Button";
import { usePageTitle } from "../hooks/usePageTitle";

function NotFound() {
  usePageTitle("Page not found");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold tracking-tight text-coral-500">404</p>
      <h1 className="mt-3 text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Button to="/" className="mt-6">
        Go home
      </Button>
    </div>
  );
}

export default NotFound;
