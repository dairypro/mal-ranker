type RateLimitOptions = {
  max: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function nowMs() {
  return Date.now();
}

function cleanupExpiredBuckets(currentTime: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= currentTime) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const currentTime = nowMs();
  cleanupExpiredBuckets(currentTime);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= currentTime) {
    buckets.set(key, { count: 1, resetAt: currentTime + options.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, options.max - 1),
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  if (existing.count >= options.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, options.max - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
  };
}
