import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-700">Foundation</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Software Builder</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Das technische Grundgerüst ist startbereit. Automatische Projekterstellung und externe
          Integrationen sind bewusst noch deaktiviert.
        </p>
        <Link className="mt-8 inline-flex rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800" href="/health">
          Health-Status öffnen
        </Link>
      </section>
    </main>
  );
}
