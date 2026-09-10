/**
 * AbyssGPT — Authoritative Software Engineering Project State Manager
 *
 * Tracks the complete lifecycle of a software engineering task:
 *   Requirements -> Architecture -> File Manifest -> Implementation ->
 *   Daytona Sandbox Execution -> Build -> Test -> Error Observation ->
 *   Fix Loop -> Verification.
 *
 * Designed to provide small models with focused, bounded context so they don't
 * hallucinate or choke on massive prompt payloads.
 */

export type ProjectType =
  | 'website'
  | 'web_application'
  | 'saas'
  | 'ecommerce'
  | 'admin_dashboard'
  | 'rest_api'
  | 'graphql_api'
  | 'telegram_bot'
  | 'discord_bot'
  | 'automation_tool'
  | 'cli_application'
  | 'backend_service'
  | 'frontend_application'
  | 'database_application'
  | 'auth_system'
  | 'ai_application'
  | 'developer_tool'
  | 'library'
  | 'existing_project_mod'
  | 'debugging'
  | 'refactoring'
  | 'general';

export type TaskKind =
  | 'new_project'
  | 'modification'
  | 'debugging'
  | 'refactoring'
  | 'testing'
  | 'optimization';

export type Stage =
  | 'requirements'
  | 'architecture'
  | 'planning'
  | 'implementation'
  | 'build'
  | 'test'
  | 'error_fixing'
  | 'verification'
  | 'completed';

export type BuildStatus = 'not_built' | 'building' | 'success' | 'failed';
export type TestStatus = 'not_tested' | 'testing' | 'passed' | 'failed';

export interface ProjectFile {
  path: string;
  content: string;
  purpose?: string;
  language?: string;
  size: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnownError {
  id: string;
  file?: string;
  command?: string;
  message: string;
  stage: string;
  timestamp: number;
  resolved?: boolean;
}

export interface FixAttempt {
  id: string;
  errorId?: string;
  file: string;
  description: string;
  timestamp: number;
  resolved: boolean;
}

export interface VerificationCheck {
  id: string;
  name: string;
  status: 'pending' | 'passed' | 'failed' | 'warning';
  details?: string;
}

export interface ProjectStateData {
  projectType: ProjectType;
  taskKind: TaskKind;
  title: string;
  description: string;
  framework?: string;
  language: string;
  runtime: string;
  architectureNotes: string;
  dependencies: {
    production: string[];
    dev: string[];
  };
  filesPlanned: string[];
  filesCreated: Record<string, ProjectFile>;
  filesModified: string[];
  stage: Stage;
  buildStatus: BuildStatus;
  testStatus: TestStatus;
  buildLog?: string;
  testLog?: string;
  knownErrors: KnownError[];
  fixesAttempted: FixAttempt[];
  verificationChecks: VerificationCheck[];
  createdAt: number;
  updatedAt: number;
}

function detectLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'md':
      return 'markdown';
    case 'sh':
      return 'shell';
    case 'sql':
      return 'sql';
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      return 'plaintext';
  }
}

export function normalizeFilePath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^(\.\/|\/)+/, '')
    .replace(/\/\//g, '/')
    .replace(/\.\.\//g, '');
}

export class ProjectStateManager {
  private state: ProjectStateData;
  private changeListeners: Array<(state: ProjectStateData) => void> = [];

  constructor(initial?: Partial<ProjectStateData>) {
    const now = Date.now();
    this.state = {
      projectType: initial?.projectType ?? 'general',
      taskKind: initial?.taskKind ?? 'new_project',
      title: initial?.title ?? 'Software Project',
      description: initial?.description ?? '',
      framework: initial?.framework,
      language: initial?.language ?? 'typescript',
      runtime: initial?.runtime ?? 'node',
      architectureNotes: initial?.architectureNotes ?? '',
      dependencies: {
        production: initial?.dependencies?.production ?? [],
        dev: initial?.dependencies?.dev ?? [],
      },
      filesPlanned: initial?.filesPlanned ?? [],
      filesCreated: initial?.filesCreated ?? {},
      filesModified: initial?.filesModified ?? [],
      stage: initial?.stage ?? 'requirements',
      buildStatus: initial?.buildStatus ?? 'not_built',
      testStatus: initial?.testStatus ?? 'not_tested',
      buildLog: initial?.buildLog,
      testLog: initial?.testLog,
      knownErrors: initial?.knownErrors ?? [],
      fixesAttempted: initial?.fixesAttempted ?? [],
      verificationChecks: initial?.verificationChecks ?? [],
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
  }

  onChange(listener: (state: ProjectStateData) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.state.updatedAt = Date.now();
    for (const listener of this.changeListeners) {
      try {
        listener(this.snapshot());
      } catch {
        // ignore subscriber errors
      }
    }
  }

  snapshot(): ProjectStateData {
    return JSON.parse(JSON.stringify(this.state)) as ProjectStateData;
  }

  init(params: Partial<ProjectStateData>): void {
    if (params.projectType) this.state.projectType = params.projectType;
    if (params.taskKind) this.state.taskKind = params.taskKind;
    if (params.title) this.state.title = params.title;
    if (params.description) this.state.description = params.description;
    if (params.framework !== undefined) this.state.framework = params.framework;
    if (params.language) this.state.language = params.language;
    if (params.runtime) this.state.runtime = params.runtime;
    if (params.architectureNotes) this.state.architectureNotes = params.architectureNotes;
    if (params.dependencies) {
      this.state.dependencies = {
        production: params.dependencies.production ?? this.state.dependencies.production,
        dev: params.dependencies.dev ?? this.state.dependencies.dev,
      };
    }
    if (params.filesPlanned) {
      this.state.filesPlanned = params.filesPlanned.map(normalizeFilePath);
    }
    if (params.stage) this.state.stage = params.stage;
    this.notify();
  }

  updatePlan(params: {
    filesPlanned?: string[];
    architectureNotes?: string;
    dependencies?: { production?: string[]; dev?: string[] };
    framework?: string;
    language?: string;
    runtime?: string;
    projectType?: ProjectType;
  }): void {
    if (params.filesPlanned) {
      const normalized = params.filesPlanned.map(normalizeFilePath);
      const combined = Array.from(new Set([...this.state.filesPlanned, ...normalized]));
      this.state.filesPlanned = combined;
    }
    if (params.architectureNotes) this.state.architectureNotes = params.architectureNotes;
    if (params.framework) this.state.framework = params.framework;
    if (params.language) this.state.language = params.language;
    if (params.runtime) this.state.runtime = params.runtime;
    if (params.projectType) this.state.projectType = params.projectType;
    if (params.dependencies) {
      if (params.dependencies.production) {
        this.state.dependencies.production = Array.from(
          new Set([...this.state.dependencies.production, ...params.dependencies.production]),
        );
      }
      if (params.dependencies.dev) {
        this.state.dependencies.dev = Array.from(
          new Set([...this.state.dependencies.dev, ...params.dependencies.dev]),
        );
      }
    }
    this.notify();
  }

  writeFile(rawPath: string, content: string, purpose?: string): ProjectFile {
    const path = normalizeFilePath(rawPath);
    const existing = this.state.filesCreated[path];
    const now = Date.now();
    const version = existing ? existing.version + 1 : 1;
    const file: ProjectFile = {
      path,
      content,
      purpose: purpose || existing?.purpose,
      language: detectLanguageFromPath(path),
      size: Buffer.byteLength(content, 'utf8'),
      version,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    this.state.filesCreated[path] = file;
    if (existing && !this.state.filesModified.includes(path)) {
      this.state.filesModified.push(path);
    }
    if (!this.state.filesPlanned.includes(path)) {
      this.state.filesPlanned.push(path);
    }
    this.notify();
    return file;
  }

  readFile(rawPath: string): ProjectFile | null {
    const path = normalizeFilePath(rawPath);
    return this.state.filesCreated[path] || null;
  }

  deleteFile(rawPath: string): boolean {
    const path = normalizeFilePath(rawPath);
    if (this.state.filesCreated[path]) {
      delete this.state.filesCreated[path];
      this.notify();
      return true;
    }
    return false;
  }

  setStage(stage: Stage): void {
    this.state.stage = stage;
    this.notify();
  }

  recordBuild(status: BuildStatus, log?: string): void {
    this.state.buildStatus = status;
    if (log !== undefined) this.state.buildLog = log.slice(0, 8000);
    this.notify();
  }

  recordTest(status: TestStatus, log?: string): void {
    this.state.testStatus = status;
    if (log !== undefined) this.state.testLog = log.slice(0, 8000);
    this.notify();
  }

  recordError(error: { file?: string; command?: string; message: string; stage?: string }): KnownError {
    const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const err: KnownError = {
      id,
      file: error.file ? normalizeFilePath(error.file) : undefined,
      command: error.command,
      message: error.message.slice(0, 1000),
      stage: error.stage || this.state.stage,
      timestamp: Date.now(),
      resolved: false,
    };
    this.state.knownErrors.push(err);
    this.state.stage = 'error_fixing';
    this.notify();
    return err;
  }

  recordFix(fix: { errorId?: string; file: string; description: string; resolved?: boolean }): FixAttempt {
    const id = `fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const attempt: FixAttempt = {
      id,
      errorId: fix.errorId,
      file: normalizeFilePath(fix.file),
      description: fix.description.slice(0, 500),
      timestamp: Date.now(),
      resolved: fix.resolved ?? true,
    };
    this.state.fixesAttempted.push(attempt);
    if (fix.errorId) {
      const target = this.state.knownErrors.find((e) => e.id === fix.errorId);
      if (target) target.resolved = fix.resolved ?? true;
    }
    this.notify();
    return attempt;
  }

  recordVerification(name: string, status: 'passed' | 'failed' | 'warning', details?: string): void {
    const id = `v_${this.state.verificationChecks.length + 1}`;
    const check: VerificationCheck = { id, name, status, details: details?.slice(0, 500) };
    const existingIndex = this.state.verificationChecks.findIndex((c) => c.name === name);
    if (existingIndex >= 0) {
      this.state.verificationChecks[existingIndex] = check;
    } else {
      this.state.verificationChecks.push(check);
    }
    this.notify();
  }

  getPendingFiles(): string[] {
    const created = new Set(Object.keys(this.state.filesCreated));
    return this.state.filesPlanned.filter((p) => !created.has(p));
  }

  getCompletedFiles(): string[] {
    return Object.keys(this.state.filesCreated);
  }

  getActiveErrors(): KnownError[] {
    return this.state.knownErrors.filter((e) => !e.resolved);
  }

  exportManifest(): Record<string, string> {
    const manifest: Record<string, string> = {};
    for (const [path, file] of Object.entries(this.state.filesCreated)) {
      manifest[path] = file.content;
    }
    return manifest;
  }

  /**
   * Compact, small-model-safe context representation of the project state.
   * Gives the model strictly what it needs to make the next engineering decision
   * without blowing up token bounds.
   */
  summarizeForPrompt(): string {
    const s = this.state;
    const completed = this.getCompletedFiles();
    const pending = this.getPendingFiles();
    const activeErrors = this.getActiveErrors();

    const sections: string[] = [];
    sections.push(
      `[PROJECT STATE: "${s.title}" (${s.projectType}) | Stack: ${s.language}${s.framework ? ` + ${s.framework}` : ''} (${s.runtime}) | Stage: ${s.stage}]`,
    );

    if (s.architectureNotes) {
      sections.push(`Architecture: ${s.architectureNotes}`);
    }

    sections.push(
      `Files Progress (${completed.length}/${s.filesPlanned.length} created):` +
        `\n  - Written: ${completed.length ? completed.join(', ') : 'none yet'}` +
        `\n  - Pending: ${pending.length ? pending.join(', ') : 'all planned files complete'}`,
    );

    if (s.dependencies.production.length || s.dependencies.dev.length) {
      sections.push(
        `Dependencies: prod=[${s.dependencies.production.join(', ')}], dev=[${s.dependencies.dev.join(', ')}]`,
      );
    }

    sections.push(`Build Status: ${s.buildStatus} | Test Status: ${s.testStatus}`);

    if (activeErrors.length > 0) {
      const errSummaries = activeErrors.map(
        (e) => `  * [${e.id}] ${e.file ? `File: ${e.file} | ` : ''}${e.command ? `Cmd: ${e.command} | ` : ''}Error: ${e.message}`,
      );
      sections.push(`Active Errors Requiring Fix:\n${errSummaries.join('\n')}`);
    }

    if (s.verificationChecks.length > 0) {
      const verSummaries = s.verificationChecks.map((v) => `  * ${v.name}: ${v.status}${v.details ? ` (${v.details})` : ''}`);
      sections.push(`Verifications:\n${verSummaries.join('\n')}`);
    }

    return sections.join('\n');
  }

  generateRunInstructions(): string {
    const s = this.state;
    const lines: string[] = [];
    lines.push(`### How to Run "${s.title}"`);
    if (s.runtime === 'node') {
      lines.push('```bash');
      lines.push('# Install dependencies');
      lines.push('npm install');
      lines.push('');
      lines.push('# Run or dev');
      lines.push('npm run dev   # or npm start');
      lines.push('```');
    } else if (s.runtime === 'python') {
      lines.push('```bash');
      lines.push('# Create and activate virtual environment');
      lines.push('python -m venv venv');
      lines.push('source venv/bin/activate  # On Windows: venv\\Scripts\\activate');
      lines.push('');
      lines.push('# Install dependencies');
      lines.push('pip install -r requirements.txt');
      lines.push('');
      lines.push('# Run');
      lines.push('python main.py');
      lines.push('```');
    }
    return lines.join('\n');
  }
}
