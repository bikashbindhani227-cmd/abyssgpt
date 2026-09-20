import type { Request, Response, NextFunction } from 'express';

interface IpTracker {
  count: number;
  apiCount: number;
  firstSeen: number;
  violationCount: number;
  blockedUntil: number;
}

// In-memory sliding tracker for IPs
const ipRegistry = new Map<string, IpTracker>();

// Periodic cleanup of expired IP trackers every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [ip, tracker] of ipRegistry.entries()) {
    if (tracker.blockedUntil > 0 && tracker.blockedUntil < now) {
      tracker.blockedUntil = 0;
      tracker.violationCount = 0;
    }
    if (now - tracker.firstSeen > 60000 && tracker.blockedUntil <= 0) {
      ipRegistry.delete(ip);
    }
  }
}, 60000);

// Common aggressive scraping / cloning / automated bot User-Agent signatures
const BLOCKED_BOT_REGEX = /(httrack|wget|scrapy|python-requests|aiohttp|go-http-client|sqlmap|nikto|havij|masscan|zgrab|acunetix|dirbuster|wappalyzer|headlesschrome|phantomjs)/i;

// Helper to reliably extract client IP address across Cloudflare, proxies, and direct connections
export function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string') return cfIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = list.split(',')[0].trim();
    if (first) return first;
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp.trim();

  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * DDoS & Anti-Scraping Protection Middleware
 * - Blocks automated tools (HTTrack, wget, python-requests, scrapy, etc.)
 * - Limits per-IP request burst
 * - Temporarily jails aggressive flooders
 */
export function botAndDdosProtection(req: Request, res: Response, next: NextFunction): void {
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const path = req.path.toLowerCase();

  // 1. Health checks & webhooks bypass
  if (path === '/health' || path === '/robots.txt') {
    next();
    return;
  }

  // 2. Block known website downloaders / vulnerability scanner bots
  if (userAgent && BLOCKED_BOT_REGEX.test(userAgent)) {
    res.status(403).json({
      error: 'Access denied. Automated web scrapers and unauthorized bots are strictly prohibited.',
    });
    return;
  }

  // 3. Block completely empty user-agents on API mutation routes
  if (!userAgent && req.method !== 'GET' && req.method !== 'HEAD' && path.startsWith('/api/')) {
    res.status(400).json({
      error: 'Invalid request: missing client user-agent.',
    });
    return;
  }

  // 4. IP-based Flood & DoS Defense
  const ip = getClientIp(req);
  const now = Date.now();

  let tracker = ipRegistry.get(ip);
  if (!tracker) {
    tracker = {
      count: 0,
      apiCount: 0,
      firstSeen: now,
      violationCount: 0,
      blockedUntil: 0,
    };
    ipRegistry.set(ip, tracker);
  }

  // Check if IP is currently jailed
  if (tracker.blockedUntil > now) {
    const remainingSeconds = Math.ceil((tracker.blockedUntil - now) / 1000);
    res.set('Retry-After', String(remainingSeconds));
    res.status(429).json({
      error: `Your IP has been temporarily restricted due to excessive automated requests. Please wait ${remainingSeconds} seconds before trying again.`,
    });
    return;
  }

  // Reset window if 60 seconds have elapsed
  if (now - tracker.firstSeen > 60000) {
    tracker.count = 0;
    tracker.apiCount = 0;
    tracker.firstSeen = now;
  }

  tracker.count += 1;
  const isApi = path.startsWith('/api/');
  if (isApi) tracker.apiCount += 1;

  // Thresholds:
  // - Total requests per IP per minute: max 120 (2 req/sec)
  // - API requests per IP per minute: max 60 (1 req/sec unauthenticated burst)
  const MAX_TOTAL_PER_MIN = 120;
  const MAX_API_PER_MIN = 60;

  if (tracker.count > MAX_TOTAL_PER_MIN || (isApi && tracker.apiCount > MAX_API_PER_MIN)) {
    tracker.violationCount += 1;

    // If an IP keeps hammering and violates repeatedly (e.g. script blasting traffic),
    // put them in jail for 5 minutes (or 15 mins for repeat offenders)
    if (tracker.violationCount >= 3 || tracker.count > MAX_TOTAL_PER_MIN * 2) {
      tracker.blockedUntil = now + (tracker.violationCount >= 5 ? 15 * 60 * 1000 : 5 * 60 * 1000);
      const remainingSeconds = Math.ceil((tracker.blockedUntil - now) / 1000);
      res.set('Retry-After', String(remainingSeconds));
      res.status(429).json({
        error: `High-frequency traffic detected. IP restricted for ${remainingSeconds} seconds.`,
      });
      return;
    }

    res.set('Retry-After', '60');
    res.status(429).json({
      error: 'Rate limit exceeded: too many requests from your IP. Please slow down.',
    });
    return;
  }

  next();
}
