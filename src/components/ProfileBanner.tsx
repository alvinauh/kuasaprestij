import { BANNERS } from "@/hooks/useStudentPrefs";

interface Props {
  banner: string;   // key from BANNERS
  avatar: string;   // emoji
  name: string;     // student display name
  score?: number;   // optional total mastery score 0-100
}

export function ProfileBanner({ banner, avatar, name, score }: Props) {
  const bannerDef = BANNERS.find((b) => b.key === banner) ?? BANNERS[0];

  return (
    <div className="relative w-full" style={{ height: 120 }}>
      {/* Gradient background */}
      <div
        className="absolute inset-0 rounded-t-xl"
        style={{ background: bannerDef.gradient }}
      />

      {/* Student name — bottom-right */}
      <div className="absolute bottom-3 right-4 flex flex-col items-end gap-1">
        <span className="text-sm font-bold text-white drop-shadow">
          {name}
        </span>
        {score !== undefined && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {score}% Mastery
          </span>
        )}
      </div>

      {/* Avatar circle — bottom-left, overlapping below the banner */}
      <div className="absolute -bottom-7 left-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-md text-3xl">
          {avatar}
        </div>
      </div>
    </div>
  );
}
