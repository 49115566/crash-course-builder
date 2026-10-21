type ZodGlobal = typeof globalThis & {
  __zod_globalConfig?: Record<string, unknown>;
};

const scope = globalThis as ZodGlobal;
scope.__zod_globalConfig = { ...scope.__zod_globalConfig, jitless: true };
