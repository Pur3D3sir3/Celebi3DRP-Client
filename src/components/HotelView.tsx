interface Props {
  onSelectMode: (mode: "free_roam" | "survival") => void;
  onLogout: () => void;
}

export default function HotelView({ onSelectMode, onLogout }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-950/30 via-black to-purple-950/20 relative">
      {/* Logout button - top right */}
      <button
        onClick={onLogout}
        className="
          absolute top-5 right-5 z-50
          flex items-center gap-2 px-5 py-3 rounded-xl
          bg-red-950/60 hover:bg-red-900/80 backdrop-blur-md
          border border-red-500/50 hover:border-red-400
          text-white font-medium shadow-xl shadow-black/30
          transition-all duration-200 hover:scale-105 active:scale-95
        "
      >
        <i className="fas fa-sign-out-alt"></i>
        Logout
      </button>

      <div className="text-center max-w-3xl">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
          Velvet Horizon
        </h1>
       
        <p className="mt-6 text-xl md:text-2xl text-gray-300 leading-relaxed">
          A sanctuary between worlds.<br />
          Relax in free roam or test your limits in survival.
        </p>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 max-w-xl mx-auto">
          <button
            onClick={() => onSelectMode("free_roam")}
            className={`
              group relative overflow-hidden
              px-10 py-6 rounded-2xl
              bg-gradient-to-br from-indigo-800/40 to-purple-900/40
              border border-indigo-500/30 hover:border-indigo-400/50
              backdrop-blur-lg shadow-2xl shadow-indigo-500/10
              text-white text-xl font-semibold
              transition-all duration-300 hover:scale-[1.04] hover:shadow-indigo-500/20
            `}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            Free Roam
          </button>

          <button
            disabled
            className={`
              px-10 py-6 rounded-2xl
              bg-gradient-to-br from-gray-800/30 to-gray-900/30
              border border-gray-700/50
              backdrop-blur-lg text-gray-500 text-xl font-semibold
              cursor-not-allowed relative
            `}
          >
            Survival
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
              Coming Soon
            </span>
          </button>
        </div>
      </div>

      <footer className="mt-24 text-gray-500 text-sm">
        © 2026 Velvet Horizon • Early Access Build
      </footer>
    </div>
  );
}