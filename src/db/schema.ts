export const CREATE_TABLES_MYSQL = [
  `CREATE TABLE IF NOT EXISTS test_runs (
    id VARCHAR(64) PRIMARY KEY,
    started_at VARCHAR(40) NOT NULL,
    finished_at VARCHAR(40) NULL,
    browser VARCHAR(32) NULL,
    environment VARCHAR(32) NULL,
    total INT DEFAULT 0,
    passed INT DEFAULT 0,
    failed INT DEFAULT 0,
    skipped INT DEFAULT 0,
    duration_ms BIGINT DEFAULT 0,
    status VARCHAR(24) DEFAULT 'running'
  )`,
  `CREATE TABLE IF NOT EXISTS test_scenarios (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    feature TEXT NULL,
    tags TEXT NULL,
    status VARCHAR(24) NOT NULL,
    duration_ms BIGINT DEFAULT 0,
    browser VARCHAR(32) NULL,
    started_at VARCHAR(40) NULL,
    finished_at VARCHAR(40) NULL,
    screenshot_path TEXT NULL,
    video_path TEXT NULL,
    trace_path TEXT NULL,
    INDEX idx_scenarios_run (run_id)
  )`,
  `CREATE TABLE IF NOT EXISTS test_steps (
    id VARCHAR(64) PRIMARY KEY,
    scenario_id VARCHAR(64) NOT NULL,
    run_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    duration_ms BIGINT DEFAULT 0,
    error_message TEXT NULL,
    INDEX idx_steps_scenario (scenario_id)
  )`,
  `CREATE TABLE IF NOT EXISTS failures (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    scenario_id VARCHAR(64) NOT NULL,
    error_code VARCHAR(64) NULL,
    error_category VARCHAR(32) NULL,
    error_message TEXT NULL,
    stack TEXT NULL,
    locator TEXT NULL,
    url TEXT NULL,
    screenshot_path TEXT NULL,
    INDEX idx_failures_run (run_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ai_insights (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    scenario_id VARCHAR(64) NULL,
    likely_cause TEXT NULL,
    category VARCHAR(64) NULL,
    suggested_fix TEXT NULL,
    confidence VARCHAR(32) NULL,
    raw_response LONGTEXT NULL,
    created_at VARCHAR(40) NOT NULL,
    INDEX idx_insights_run (run_id)
  )`,
  `CREATE TABLE IF NOT EXISTS shared_kv (
    kv_key VARCHAR(191) PRIMARY KEY,
    kv_value LONGTEXT NOT NULL,
    expires_at VARCHAR(40) NULL,
    updated_at VARCHAR(40) NOT NULL
  )`,
];

export const CREATE_TABLES_POSTGRES = [
  `CREATE TABLE IF NOT EXISTS test_runs (
    id VARCHAR(64) PRIMARY KEY,
    started_at VARCHAR(40) NOT NULL,
    finished_at VARCHAR(40) NULL,
    browser VARCHAR(32) NULL,
    environment VARCHAR(32) NULL,
    total INT DEFAULT 0,
    passed INT DEFAULT 0,
    failed INT DEFAULT 0,
    skipped INT DEFAULT 0,
    duration_ms BIGINT DEFAULT 0,
    status VARCHAR(24) DEFAULT 'running'
  )`,
  `CREATE TABLE IF NOT EXISTS test_scenarios (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    feature TEXT NULL,
    tags TEXT NULL,
    status VARCHAR(24) NOT NULL,
    duration_ms BIGINT DEFAULT 0,
    browser VARCHAR(32) NULL,
    started_at VARCHAR(40) NULL,
    finished_at VARCHAR(40) NULL,
    screenshot_path TEXT NULL,
    video_path TEXT NULL,
    trace_path TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scenarios_run ON test_scenarios (run_id)`,
  `CREATE TABLE IF NOT EXISTS test_steps (
    id VARCHAR(64) PRIMARY KEY,
    scenario_id VARCHAR(64) NOT NULL,
    run_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    duration_ms BIGINT DEFAULT 0,
    error_message TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_steps_scenario ON test_steps (scenario_id)`,
  `CREATE TABLE IF NOT EXISTS failures (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    scenario_id VARCHAR(64) NOT NULL,
    error_code VARCHAR(64) NULL,
    error_category VARCHAR(32) NULL,
    error_message TEXT NULL,
    stack TEXT NULL,
    locator TEXT NULL,
    url TEXT NULL,
    screenshot_path TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_failures_run ON failures (run_id)`,
  `CREATE TABLE IF NOT EXISTS ai_insights (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    scenario_id VARCHAR(64) NULL,
    likely_cause TEXT NULL,
    category VARCHAR(64) NULL,
    suggested_fix TEXT NULL,
    confidence VARCHAR(32) NULL,
    raw_response TEXT NULL,
    created_at VARCHAR(40) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_insights_run ON ai_insights (run_id)`,
  `CREATE TABLE IF NOT EXISTS shared_kv (
    kv_key VARCHAR(191) PRIMARY KEY,
    kv_value TEXT NOT NULL,
    expires_at VARCHAR(40) NULL,
    updated_at VARCHAR(40) NOT NULL
  )`,
];
