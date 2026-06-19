import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("app");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">{t("name")}</h1>
      <p className="text-gray-600">{t("tagline")}</p>
    </main>
  );
}
