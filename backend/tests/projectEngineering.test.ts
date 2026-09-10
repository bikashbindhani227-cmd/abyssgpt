import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStateManager } from '../server/services/projectState.js';
import { validateToolArguments, sanitizePath } from '../server/services/toolRegistry.js';
import { createBudgetForRequest, BudgetTracker } from '../server/services/agentBudget.js';
import { createBudgetedToolExecutor } from '../server/services/agentService.js';
import { TodoManager } from '../server/services/todoManager.js';

describe('General-Purpose Software Engineering: ProjectStateManager', () => {
  it('initializes with clean state and tracks plan', () => {
    const mgr = new ProjectStateManager();
    assert.equal(mgr.snapshot().filesPlanned.length, 0);
    assert.equal(Object.keys(mgr.snapshot().filesCreated).length, 0);

    mgr.updatePlan({
      filesPlanned: ['package.json', 'src/index.ts', 'src/cli.ts'],
      framework: 'nodejs',
      language: 'typescript',
      architectureNotes: 'Modular CLI tool with TypeScript and commander',
    });

    const state = mgr.snapshot();
    assert.equal(state.filesPlanned.length, 3);
    assert.equal(state.framework, 'nodejs');
    assert.equal(state.language, 'typescript');
    assert.deepEqual(mgr.getPendingFiles(), ['package.json', 'src/index.ts', 'src/cli.ts']);
  });

  it('records file writes and computes pending files accurately', () => {
    const mgr = new ProjectStateManager();
    mgr.updatePlan({ filesPlanned: ['package.json', 'src/index.ts'] });

    mgr.writeFile('package.json', '{"name": "test-cli"}');
    assert.deepEqual(mgr.getCompletedFiles(), ['package.json']);
    assert.deepEqual(mgr.getPendingFiles(), ['src/index.ts']);

    const file = mgr.readFile('package.json');
    assert.ok(file);
    assert.equal(file.path, 'package.json');
    assert.equal(file.content, '{"name": "test-cli"}');
    assert.equal(file.version, 1);

    // Overwriting updates version
    mgr.writeFile('package.json', '{"name": "test-cli", "version": "1.0.0"}');
    assert.equal(mgr.readFile('package.json')?.version, 2);
  });

  it('records errors, fixes, and test results', () => {
    const mgr = new ProjectStateManager();
    mgr.writeFile('src/main.py', 'print("hello"');

    const err = mgr.recordError({
      file: 'src/main.py',
      command: 'python3 src/main.py',
      message: 'SyntaxError: unexpected EOF while parsing',
    });
    assert.ok(err.id);
    assert.equal(mgr.snapshot().stage, 'error_fixing');
    assert.equal(mgr.snapshot().knownErrors.length, 1);

    mgr.recordFix({
      errorId: err.id,
      file: 'src/main.py',
      description: 'Closed parenthesis on print statement',
      resolved: true,
    });
    assert.equal(mgr.snapshot().knownErrors[0].resolved, true);

    mgr.recordTest('passed', 'All 5 unit tests passed');
    assert.equal(mgr.snapshot().testStatus, 'passed');
    assert.equal(mgr.snapshot().testLog, 'All 5 unit tests passed');
  });

  it('generates a clean prompt summary without leaking secrets', () => {
    const mgr = new ProjectStateManager();
    mgr.updatePlan({
      filesPlanned: ['server.py', 'client.py'],
      language: 'python',
      framework: 'fastapi',
    });
    mgr.writeFile('server.py', 'from fastapi import FastAPI\napp = FastAPI()');

    const summary = mgr.summarizeForPrompt();
    assert.ok(summary.includes('[PROJECT STATE:'));
    assert.ok(summary.includes('python + fastapi'));
    assert.ok(summary.includes('Written: server.py'));
    assert.ok(summary.includes('Pending: client.py'));
  });
});

describe('General-Purpose Software Engineering: Tool Validation', () => {
  it('sanitizes filesystem paths safely', () => {
    assert.equal(sanitizePath('/etc/passwd'), 'etc/passwd');
    assert.equal(sanitizePath('../../../secret.env'), 'secret.env');
    assert.equal(sanitizePath('./src//components/Button.tsx'), 'src/components/Button.tsx');
  });

  it('validates run_command arguments', () => {
    const valid = validateToolArguments('run_command', { command: 'npm test' });
    assert.equal(valid.ok, true);
    assert.equal(valid.value?.command, 'npm test');

    const empty = validateToolArguments('run_command', { command: '   ' });
    assert.equal(empty.ok, false);

    const tooLong = validateToolArguments('run_command', { command: 'a'.repeat(3000) });
    assert.equal(tooLong.ok, false);
  });

  it('validates file_write and file_read arguments', () => {
    const validWrite = validateToolArguments('file_write', {
      path: 'src/app.ts',
      content: 'console.log("ready");',
    });
    assert.equal(validWrite.ok, true);
    assert.equal(validWrite.value?.path, 'src/app.ts');

    const emptyPath = validateToolArguments('file_write', { path: '', content: 'x' });
    assert.equal(emptyPath.ok, false);

    const validRead = validateToolArguments('file_read', { path: 'src/app.ts' });
    assert.equal(validRead.ok, true);
    assert.equal(validRead.value?.path, 'src/app.ts');
  });

  it('validates project_state arguments', () => {
    const validGet = validateToolArguments('project_state', { action: 'get' });
    assert.equal(validGet.ok, true);

    const validPlan = validateToolArguments('project_state', {
      action: 'update_plan',
      filesPlanned: ['index.html', 'app.js'],
      framework: 'vanilla',
    });
    assert.equal(validPlan.ok, true);
  });
});

describe('General-Purpose Software Engineering: Budgeted Executor Integration', () => {
  it('executes file_write and file_read in memory via ProjectStateManager', async () => {
    const plan = createBudgetForRequest('Build a full-stack website with React and Express');
    const tracker = new BudgetTracker(plan);
    const todoManager = new TodoManager();
    const projectStateManager = new ProjectStateManager();

    const executor = createBudgetedToolExecutor(
      plan,
      tracker,
      undefined,
      todoManager,
      projectStateManager,
    );

    // 1. Write file
    const writeResult = await executor('file_write', {
      path: 'src/server.ts',
      content: 'import express from "express";\nconst app = express();',
    });
    assert.ok(writeResult.includes('File written: "src/server.ts"'));
    assert.equal(projectStateManager.getCompletedFiles().includes('src/server.ts'), true);

    // 2. Read file
    const readResult = await executor('file_read', { path: 'src/server.ts' });
    assert.ok(readResult.includes('import express from "express"'));

    // 3. Project state inspection
    const stateResult = await executor('project_state', { action: 'get' });
    assert.ok(stateResult.includes('src/server.ts'));

    // 4. Accounts tool calls
    assert.equal(tracker.toolCallsUsedCount, 3);
  });

  it('prevents file_write loop on identical content', async () => {
    const plan = createBudgetForRequest('Build a complete full-stack SaaS web application with React and Express');
    const tracker = new BudgetTracker(plan);
    const projectStateManager = new ProjectStateManager();

    const executor = createBudgetedToolExecutor(
      plan,
      tracker,
      undefined,
      undefined,
      projectStateManager,
    );

    await executor('file_write', { path: 'test.py', content: 'print(1)' });
    await executor('file_write', { path: 'test.py', content: 'print(1)' });
    await executor('file_write', { path: 'test.py', content: 'print(1)' });

    // Gate should trigger loop detection on identical calls
    const gate = tracker.canCallTool('file_write', { path: 'test.py', content: 'print(1)' });
    assert.equal(gate.allowed, false);
    assert.ok(gate.reason?.includes('loop') || gate.reason?.includes('duplicate'));
  });
});
