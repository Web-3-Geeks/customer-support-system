function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-coral-500/20 border-t-coral-500" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default FullPageLoader;
