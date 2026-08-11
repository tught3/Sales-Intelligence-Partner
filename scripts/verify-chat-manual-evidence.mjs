#!/usr/bin/env node
// 채팅 기능 수동 검증 증거 파일(reports/chat-manual-verification.json)을 검사한다.
// 오케스트레이터가 실제 수동 검증(스크린샷, 실기기 테스트 등)을 수행한 뒤 이 스크립트로
// 그 증거가 요구되는 모든 항목을 충족하는지 기계적으로 확인한다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const evidencePath = path.resolve(repoRoot, "reports", "chat-manual-verification.json");

const REQUIRED_BOOLEAN_FIELDS = [
  "paste_desktop",
  "paste_mobile",
  "copy_secure_ctx",
  "copy_insecure_ctx",
  "two_client_exchange",
  "phone_client",
  "entrypoint_desktop",
  "entrypoint_mobile",
  "no_regression",
];

function fail(message) {
  console.error(`[verify-chat-manual-evidence] ${message}`);
  process.exit(1);
}

function isValidIsoTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function main() {
  if (!fs.existsSync(evidencePath)) {
    console.error(
      `[verify-chat-manual-evidence] 파일 없음, 아직 미실측: ${evidencePath}`,
    );
    process.exit(1);
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(evidencePath, "utf-8");
  } catch (err) {
    fail(`증거 파일을 읽을 수 없습니다: ${err.message}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail(`증거 파일이 올바른 JSON이 아닙니다: ${err.message}`);
    return;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    fail("증거 파일의 최상위 값은 객체여야 합니다.");
    return;
  }

  const problems = [];

  if (!isValidIsoTimestamp(data.verified_at)) {
    problems.push("verified_at: 유효한 ISO 타임스탬프 문자열이 아닙니다.");
  }

  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof data[field] !== "boolean") {
      problems.push(`${field}: boolean 필드가 존재하지 않습니다.`);
    } else if (data[field] !== true) {
      problems.push(`${field}: false입니다 (true여야 통과).`);
    }
  }

  if (!Array.isArray(data.screenshots)) {
    problems.push("screenshots: 배열이 아닙니다.");
  } else if (data.screenshots.length === 0) {
    problems.push("screenshots: 배열이 비어 있습니다. 최소 1개 이상의 경로가 필요합니다.");
  } else {
    for (const [index, entry] of data.screenshots.entries()) {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        problems.push(`screenshots[${index}]: 문자열 경로가 아닙니다.`);
        continue;
      }
      const resolved = path.isAbsolute(entry) ? entry : path.resolve(repoRoot, entry);
      if (!fs.existsSync(resolved)) {
        problems.push(`screenshots[${index}]: 파일이 존재하지 않습니다 (${resolved}).`);
      }
    }
  }

  if (typeof data.notes !== "string") {
    problems.push("notes: 문자열 필드가 존재하지 않습니다.");
  }

  if (problems.length > 0) {
    console.error("[verify-chat-manual-evidence] 검증 실패, 아래 항목을 확인하세요:");
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
    return;
  }

  console.log("[verify-chat-manual-evidence] 모든 항목 통과.");
  process.exit(0);
}

main();
