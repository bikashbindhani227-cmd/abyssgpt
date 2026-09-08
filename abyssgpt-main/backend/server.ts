import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { chatRouter } from './server/routes/chat.js';
import { conversationsRouter } from './server/routes/conversations.js';
import { userRouter } from './server/routes/user.js';
import { memoryRouter } from './server/routes/memory.js';
import { adminRouter } from './server/routes/admin.js';
import { getAppSettingsConfig } from './server/services/configService.js';
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    // Browser requests always carry an Origin header; allow server-to-server/health requests too.
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    const isVercelPreview = /^https:\/\/abyssgpt(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(normalized);
    const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(normalized);
    if (configuredOrigins.includes(normalized) || isVercelPreview || isLocalDev) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: false,
};

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/health', (_req,res)=>res.json({ status:'ok', service:'abyssgpt-backend', timestamp:new Date().toISOString(), aiProvider:'AI Credits', modelConfigured:Boolean(process.env.MODEL_ID), firebaseConfigured:Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) }));
app.get('/api/settings', async (_req,res)=>{ try { const s=await getAppSettingsConfig(); res.json({appName:s.appName,welcomeMessage:s.welcomeMessage,maintenanceMode:s.maintenanceMode,registrationEnabled:s.registrationEnabled,maxMessageLength:s.maxMessageLength,premiumPriceInr:s.premiumPriceInr,telegramUsername:s.telegramUsername,premiumBenefits:s.premiumBenefits}); } catch { res.status(200).json({appName:'AbyssGPT',welcomeMessage:'Welcome to AbyssGPT.',maintenanceMode:false,registrationEnabled:true,maxMessageLength:4000,premiumPriceInr:299,telegramUsername:'@MrNewton_2',premiumBenefits:[]}); }});
app.use('/api/chat', chatRouter); app.use('/api/conversations', conversationsRouter); app.use('/api/user', userRouter); app.use('/api/memory', memoryRouter); app.use('/api/admin', adminRouter);
app.use((_req,res)=>res.status(404).json({error:'API route not found'}));
app.listen(PORT,'0.0.0.0',()=>console.log(`AbyssGPT backend listening on 0.0.0.0:${PORT}`));
