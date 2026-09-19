import { Languages } from "lucide-react";
import { useI18n, LANGUAGES, type Lang } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSwitcher({
  compact = false,
  lang,
  onLangChange,
  languages,
}: {
  compact?: boolean;
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
  languages?: Lang[];
}) {
  const i18n = useI18n();
  const activeLang = lang ?? i18n.lang;
  const setActiveLang = onLangChange ?? i18n.setLang;
  const availableLanguages = languages
    ? LANGUAGES.filter((language) => languages.includes(language.code))
    : LANGUAGES;
  const current =
    availableLanguages.find((language) => language.code === activeLang) ??
    LANGUAGES.find((language) => language.code === activeLang)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium backdrop-blur hover:text-foreground transition"
        aria-label="Select language"
      >
        <Languages className="h-3.5 w-3.5" />
        {compact ? current.short : current.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {availableLanguages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setActiveLang(l.code)}
            className={activeLang === l.code ? "bg-accent" : ""}
          >
            <span className="mr-2 font-mono text-xs text-muted-foreground">{l.short}</span>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
