export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] p-6 sm:p-10 flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-sm bg-[#671B24] flex items-center justify-center text-white font-serif font-bold text-xl mb-4 animate-pulse">
        R
      </div>
      <div className="text-sm font-mono text-[#671B24] font-medium tracking-wide">
        Loading Platform Admin Dashboard...
      </div>
      <div className="mt-2 text-xs text-[#6B645D]">
        Authenticating and loading platform state
      </div>
    </div>
  );
}
