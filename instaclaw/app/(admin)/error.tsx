"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-stone-400">
          An unexpected error occurred in the admin panel. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-stone-600 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-6 py-2 rounded-lg text-sm font-medium bg-white text-black cursor-pointer hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
