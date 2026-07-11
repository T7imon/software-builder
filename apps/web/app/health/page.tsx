export default function HealthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <section className="rounded-2xl border border-emerald-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Health</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">Software Builder ist bereit</h1>
        <p className="mt-4 text-slate-600">Status: OK</p>
      </section>
    </main>
  );
}
