import fs from 'fs';
import path from 'path';
import type {
  UserProfile,
  Conversation,
  ChatMessage,
  UserMemory,
  SystemPromptConfig,
  AppLimitsConfig,
  AppSettingsConfig,
} from '../../types.js';

interface StorageData {
  users: Record<string, UserProfile>;
  conversations: Record<string, Conversation[]>; // key: uid
  messages: Record<string, ChatMessage[]>; // key: conversationId
  memories: Record<string, UserMemory>; // key: uid
  configs: {
    system?: SystemPromptConfig;
    limits?: AppLimitsConfig;
    settings?: AppSettingsConfig;
  };
}

function getDataDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'backend', 'server', 'data'),
    path.resolve(process.cwd(), 'server', 'data'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return fs.existsSync(path.resolve(process.cwd(), 'backend'))
    ? path.resolve(process.cwd(), 'backend', 'server', 'data')
    : path.resolve(process.cwd(), 'server', 'data');
}

const DATA_DIR = getDataDir();
const DATA_FILE = path.join(DATA_DIR, 'store.json');

class PersistentStorage {
  private data: StorageData = {
    users: {},
    conversations: {},
    messages: {},
    memories: {},
    configs: {},
  };

  private writePromise: Promise<void> | null = null;
  private pendingSave = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const content = fs.readFileSync(DATA_FILE, 'utf-8').trim();
        if (!content) {
          this.saveSync();
          return;
        }
        const parsed = JSON.parse(content);
        this.data = {
          users: parsed.users || {},
          conversations: parsed.conversations || {},
          messages: parsed.messages || {},
          memories: parsed.memories || {},
          configs: parsed.configs || {},
        };
      } else {
        this.saveSync();
      }
    } catch (err) {
      console.warn('Could not initialize local storage file, using in-memory store:', err);
    }
  }

  private saveSync() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DATA_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DATA_FILE);
    } catch (err) {
      console.warn('Failed to write store sync:', err);
    }
  }

  private async scheduleSave() {
    if (this.writePromise) {
      this.pendingSave = true;
      return;
    }

    this.writePromise = (async () => {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          await fs.promises.mkdir(DATA_DIR, { recursive: true });
        }
        const tmpFile = `${DATA_FILE}.tmp.${Date.now()}`;
        await fs.promises.writeFile(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
        await fs.promises.rename(tmpFile, DATA_FILE);
      } catch (err) {
        console.warn('Failed to persist store asynchronously:', err);
      } finally {
        this.writePromise = null;
        if (this.pendingSave) {
          this.pendingSave = false;
          this.scheduleSave();
        }
      }
    })();
  }

  // --- Users ---
  getUser(uid: string): UserProfile | null {
    const user = this.data.users[uid];
    return user ? { ...user } : null;
  }

  getAllUsers(): UserProfile[] {
    return Object.values(this.data.users).map((u) => ({ ...u }));
  }

  saveUser(user: UserProfile): UserProfile {
    this.data.users[user.uid] = { ...user };
    this.scheduleSave();
    return { ...user };
  }

  updateUser(uid: string, updates: Partial<UserProfile>): UserProfile | null {
    const existing = this.data.users[uid];
    if (!existing) return null;
    const updated: UserProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.data.users[uid] = updated;
    this.scheduleSave();
    return { ...updated };
  }

  // --- Conversations ---
  getUserConversations(uid: string): Conversation[] {
    const list = this.data.conversations[uid] || [];
    // Sort desc by updatedAt
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getConversation(uid: string, conversationId: string): Conversation | null {
    const list = this.data.conversations[uid] || [];
    const conv = list.find((c) => c.id === conversationId);
    return conv ? { ...conv } : null;
  }

  saveConversation(uid: string, conv: Conversation): Conversation {
    if (!this.data.conversations[uid]) {
      this.data.conversations[uid] = [];
    }
    const idx = this.data.conversations[uid].findIndex((c) => c.id === conv.id);
    if (idx >= 0) {
      this.data.conversations[uid][idx] = { ...conv };
    } else {
      this.data.conversations[uid].unshift({ ...conv });
    }
    this.scheduleSave();
    return { ...conv };
  }

  updateConversation(
    uid: string,
    conversationId: string,
    updates: Partial<Conversation>
  ): Conversation | null {
    if (!this.data.conversations[uid]) return null;
    const idx = this.data.conversations[uid].findIndex((c) => c.id === conversationId);
    if (idx < 0) return null;

    const updated: Conversation = {
      ...this.data.conversations[uid][idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.data.conversations[uid][idx] = updated;
    this.scheduleSave();
    return { ...updated };
  }

  deleteConversation(uid: string, conversationId: string): void {
    if (this.data.conversations[uid]) {
      this.data.conversations[uid] = this.data.conversations[uid].filter(
        (c) => c.id !== conversationId
      );
    }
    delete this.data.messages[conversationId];
    this.scheduleSave();
  }

  // --- Messages ---
  getMessages(conversationId: string, limitCount = 100): ChatMessage[] {
    const list = this.data.messages[conversationId] || [];
    // Sort asc by createdAt
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return sorted.slice(-limitCount);
  }

  addMessage(conversationId: string, message: ChatMessage): ChatMessage {
    if (!this.data.messages[conversationId]) {
      this.data.messages[conversationId] = [];
    }
    this.data.messages[conversationId].push({ ...message });
    this.scheduleSave();
    return { ...message };
  }

  deleteMessage(conversationId: string, messageId: string): void {
    if (this.data.messages[conversationId]) {
      this.data.messages[conversationId] = this.data.messages[conversationId].filter(
        (m) => m.id !== messageId
      );
      this.scheduleSave();
    }
  }

  // --- Memory ---
  getUserMemory(uid: string): UserMemory {
    const mem = this.data.memories[uid];
    if (mem) return { ...mem };
    return {
      facts: [],
      enabled: true,
      updatedAt: new Date().toISOString(),
    };
  }

  saveUserMemory(uid: string, memory: UserMemory): UserMemory {
    this.data.memories[uid] = { ...memory };
    this.scheduleSave();
    return { ...memory };
  }

  // --- Configs ---
  getSystemPromptConfig(): SystemPromptConfig | undefined {
    return this.data.configs.system ? { ...this.data.configs.system } : undefined;
  }

  saveSystemPromptConfig(config: SystemPromptConfig): SystemPromptConfig {
    this.data.configs.system = { ...config };
    this.scheduleSave();
    return { ...config };
  }

  getAppLimitsConfig(): AppLimitsConfig | undefined {
    return this.data.configs.limits ? { ...this.data.configs.limits } : undefined;
  }

  saveAppLimitsConfig(config: AppLimitsConfig): AppLimitsConfig {
    this.data.configs.limits = { ...config };
    this.scheduleSave();
    return { ...config };
  }

  getAppSettingsConfig(): AppSettingsConfig | undefined {
    return this.data.configs.settings ? { ...this.data.configs.settings } : undefined;
  }

  saveAppSettingsConfig(config: AppSettingsConfig): AppSettingsConfig {
    this.data.configs.settings = { ...config };
    this.scheduleSave();
    return { ...config };
  }
}

export const persistentStorage = new PersistentStorage();
