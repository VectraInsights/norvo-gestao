type MonitorLevel = "info" | "warn" | "error";

type MonitorContext = Record<string, string | number | boolean | undefined>;

function emit(level: MonitorLevel, event: string, context: MonitorContext = {}) {
  const payload = { event, at: new Date().toISOString(), ...context };
  if (level === "error") console.error("[monitor]", payload);
  else if (level === "warn") console.warn("[monitor]", payload);
  else console.info("[monitor]", payload);
}

export function monitorInfo(event: string, context?: MonitorContext) {
  emit("info", event, context);
}

export function monitorWarning(event: string, context?: MonitorContext) {
  emit("warn", event, context);
}

export function monitorError(event: string, error: unknown, context: MonitorContext = {}) {
  const details =
    error instanceof Error
      ? { errorName: error.name, errorMessage: error.message }
      : { errorMessage: String(error) };
  emit("error", event, { ...context, ...details });
}
