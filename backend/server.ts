import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { chatRouter } from './server/routes/chat.js';
import { conversationsRouter } from './server/routes/conversations.js';
import { userRouter } from './server/routes/user.js';
import { memoryRouter } from './server/routes/memory.js';
import { adminRouter } from './server/routes/admin.js';
import { getAppSettingsConfig } from './server/services/configService.js';
import { ensureFirebaseAuthSettings, authorizeDomains } from './server/config/firebaseAdmin.js';
import { botAndDdosProtection } from './server/middleware/botProtection.js';
dotenv.config();

const currentDirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'Accept'],
};

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    frameguard: false,
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(botAndDdosProtection);

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /api/\nDisallow: /admin\nAllow: /\n');
});

app.get('/health', (_req,res)=>res.json({ status:'ok', service:'abyssgpt-backend', timestamp:new Date().toISOString(), aiProvider:'AI Credits', modelConfigured:Boolean(process.env.MODEL_ID), firebaseConfigured:Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) }));
app.post('/api/auth/authorize-domain', async (req, res) => {
  try {
    const rawDomain = req.body?.domain || req.headers['x-forwarded-host'] || req.headers.host || '';
    const domain = String(rawDomain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
    if (!domain || domain === 'localhost' || domain === '127.0.0.1') {
      return res.json({ success: true, authorized: true });
    }
    const updated = await authorizeDomains([domain]);
    return res.json({ success: true, domain, authorized: updated.includes(domain) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to authorize domain', details: String(err) });
  }
});

app.get('/api/settings', async (req, res) => {
  // Opportunistically register visiting domain in the background
  try {
    const clientHost = req.headers['x-forwarded-host'] || req.headers.host || req.headers.origin || '';
    const cleanHost = String(clientHost).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '');
    if (cleanHost && cleanHost !== 'localhost' && cleanHost !== '127.0.0.1' && !cleanHost.includes(':')) {
      authorizeDomains([cleanHost]).catch(() => {});
    }
  } catch {
    // Non-blocking
  }
  try {
    const s = await getAppSettingsConfig();
    res.json({
      appName: s.appName,
      welcomeMessage: s.welcomeMessage,
      maintenanceMode: s.maintenanceMode,
      registrationEnabled: s.registrationEnabled,
      maxMessageLength: s.maxMessageLength,
      premiumPriceInr: s.premiumPriceInr,
      telegramUsername: s.telegramUsername,
      premiumBenefits: s.premiumBenefits,
      adsEnabled: s.adsEnabled ?? true,
      adsProvider: s.adsProvider || 'banner',
      adsenseClientId: s.adsenseClientId || '',
      adsenseSlotId: s.adsenseSlotId || '',
      customAdScript: s.customAdScript || '',
      sponsorBannerUrl: s.sponsorBannerUrl || '',
      sponsorLinkUrl: s.sponsorLinkUrl || 'https://telegram.me/MrNewton_2',
      sponsorTitle: s.sponsorTitle || 'AbyssGPT Partner',
      sponsorText: s.sponsorText || 'Reach thousands of active AI users. Contact to sponsor or upgrade to Pro for zero ads.',
    });
  } catch {
    res.status(200).json({
      appName: 'AbyssGPT',
      welcomeMessage: 'Welcome to AbyssGPT.',
      maintenanceMode: false,
      registrationEnabled: true,
      maxMessageLength: 4000,
      premiumPriceInr: 299,
      telegramUsername: '@MrNewton_2',
      premiumBenefits: [],
      adsEnabled: true,
      adsProvider: 'banner',
      adsenseClientId: '',
      adsenseSlotId: '',
      customAdScript: '',
      sponsorBannerUrl: '',
      sponsorLinkUrl: 'https://telegram.me/MrNewton_2',
      sponsorTitle: 'AbyssGPT Partner',
      sponsorText: 'Reach thousands of active AI users.',
    });
  }
});
app.use('/api/chat', chatRouter); app.use('/api/conversations', conversationsRouter); app.use('/api/user', userRouter); app.use('/api/memory', memoryRouter); app.use('/api/admin', adminRouter);

// API 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));

function getFrontendDistDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'frontend', 'dist'),
    path.resolve(process.cwd(), '..', 'frontend', 'dist'),
    path.resolve(process.cwd(), 'dist', 'frontend'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(currentDirname, '..', 'frontend', 'dist'),
    path.resolve(currentDirname, '..', '..', 'frontend', 'dist'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

// Serve frontend static assets
const frontendDist = getFrontendDistDir();
if (frontendDist) {
  app.use(express.static(frontendDist));
}

// SPA fallback
app.get('*', (_req, res) => {
  const dist = getFrontendDistDir();
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    res.sendFile(path.join(dist, 'index.html'));
  } else {
    res.status(200).send('AbyssGPT server is running. Frontend build in progress...');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AbyssGPT backend listening on 0.0.0.0:${PORT}`);
  ensureFirebaseAuthSettings().catch((err) => console.warn('Auth settings error:', err));
});
