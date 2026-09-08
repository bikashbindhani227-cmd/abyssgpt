/**
 * Shared types for AI Chatbot
 */

export type UserPlan = 'free' | 'premium';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan: UserPlan;
  isAdmin: boolean;
  isBanned: boolean;
  dailyMessageLimit: number;
  dailyMessageCount: number;
  lastUsageDate: string; // YYYY-MM-DD
  rateLimitPerMinute: number;
  premiumExpiresAt?: string | null;
  customDailyMessageLimit?: number | null;
  customRateLimitPerMinute?: number | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview?: string;
  summary?: string;
}

export interface AgentToolEvent {
  name: string;
  status: 'started' | 'completed' | 'failed';
  target?: string;
  preview?: string;
  sources?: Array<{ title: string; url: string }>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model?: string;
  tokens?: number;
  isThinking?: boolean;
  /** Marks a locally-rendered failure bubble (never persisted server-side). */
  isError?: boolean;
  errorText?: string;
}

export interface UserMemory {
  facts: string[];
  enabled: boolean;
  updatedAt: string;
}

export interface AppLimitsConfig {
  free: {
    dailyMessageLimit: number;
    rateLimitPerMinute: number;
    contextLimit: number;
  };
  premium: {
    dailyMessageLimit: number;
    rateLimitPerMinute: number;
    contextLimit: number;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export interface AppSettingsConfig {
  appName: string;
  welcomeMessage: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  maxMessageLength: number;
  premiumPriceInr: number;
  telegramUsername: string;
  premiumBenefits: string[];
  defaultPremiumDurationDays: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface SystemPromptConfig {
  systemPrompt: string;
  previousPrompts?: Array<{
    prompt: string;
    updatedAt: string;
    updatedBy: string;
  }>;
  updatedAt: string;
  updatedBy: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  freeUsers: number;
  premiumUsers: number;
  activeUsersToday: number;
  messagesToday: number;
  bannedUsers: number;
  aiRequestsTotal: number;
  failedAiRequests: number;
}

export interface TierLimitsConfig {
  free: {
    dailyLimit: number;
    rateLimit: number;
    contextLimit: number;
  };
  premium: {
    dailyLimit: number;
    rateLimit: number;
    contextLimit: number;
  };
}

export interface AppConfig {
  appName: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  premiumPriceInr: number;
  telegramContactUsername: string;
  updatedAt?: string;
}
