const health = {
  service: "software-builder-worker",
  status: "ok",
} as const;

console.log(`[worker] health=${health.status} service=${health.service}`);
