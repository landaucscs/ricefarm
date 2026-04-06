import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import type { SeedExample, QuestionType } from '@/types';

const SEED_DATA_DIR = path.resolve(process.cwd(), '..', 'seed-data', 'passages');

// -- Raw types for JSONL parsing --

interface RawStandardRecord {
  question_code: number;
  question_number: number;
  question_type: string;
  passage: string;
  word_count: number;
  answer: number;
  jangmun_set?: boolean;
  jangmun_note?: string;
}

interface RawJangmunSubQ {
  question_number: number;
  sub_type: string;
  prompt: string;
  choices: string[];
  answer: number;
}

interface RawJangmunRecord {
  question_code: number;
  question_type: 'jangmun';
  passage: string;
  word_count: number;
  q41: RawJangmunSubQ;
  q42: RawJangmunSubQ;
}

type RawRecord = RawStandardRecord | RawJangmunRecord;

function isJangmunRecord(r: RawRecord): r is RawJangmunRecord {
  return r.question_type === 'jangmun';
}

/**
 * passage 문자열에서 선지를 분리.
 */
function splitPassageAndChoices(passage: string): { passageOnly: string; choices: string[] } {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];
  const firstChoiceIdx = passage.indexOf('①');

  if (firstChoiceIdx === -1) {
    return { passageOnly: passage.trim(), choices: [] };
  }

  const passageOnly = passage.substring(0, firstChoiceIdx).trim();
  const choicesPart = passage.substring(firstChoiceIdx);

  const choices: string[] = [];
  for (let i = 0; i < circledNumbers.length; i++) {
    const current = circledNumbers[i];
    const next = circledNumbers[i + 1];
    const startIdx = choicesPart.indexOf(current);
    if (startIdx === -1) continue;
    const endIdx = next ? choicesPart.indexOf(next) : choicesPart.length;
    if (endIdx === -1) {
      choices.push(choicesPart.substring(startIdx + current.length).trim());
    } else {
      choices.push(choicesPart.substring(startIdx + current.length, endIdx).trim());
    }
  }

  return { passageOnly, choices };
}

/**
 * 단일 JSONL 파일에서 레코드를 파싱
 */
function parseJsonlFile(filePath: string): RawRecord[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as RawRecord);
}

/**
 * 장문 레코드를 2개의 SeedExample로 분리 (41번 + 42번)
 */
function expandJangmunRecord(record: RawJangmunRecord): SeedExample[] {
  const groupId = `${record.question_code}_41_42`;
  const results: SeedExample[] = [];

  // 41번: 제목
  results.push({
    questionCode: record.question_code,
    questionNumber: record.q41.question_number,
    questionType: 'title' as QuestionType,
    passage: record.passage,
    passageOnly: record.passage,
    choices: record.q41.choices,
    wordCount: record.word_count,
    answer: record.q41.answer,
    isJangmun: true,
    jangmunNote: `장문A - ${record.q41.sub_type} (${record.q41.question_number}번)`,
    jangmunGroupId: groupId,
    jangmunSubType: 'jangmun_title',
  });

  // 42번: 어휘 — question_code에 +1을 해서 고유하게
  results.push({
    questionCode: record.question_code + 1,
    questionNumber: record.q42.question_number,
    questionType: 'vocabulary' as QuestionType,
    passage: record.passage,
    passageOnly: record.passage,
    choices: record.q42.choices,
    wordCount: record.word_count,
    answer: record.q42.answer,
    isJangmun: true,
    jangmunNote: `장문A - ${record.q42.sub_type} (${record.q42.question_number}번)`,
    jangmunGroupId: groupId,
    jangmunSubType: 'jangmun_vocabulary',
  });

  return results;
}

/**
 * seed-data/passages/ 디렉토리의 모든 JSONL 파일을 로드
 */
export function loadAllSeedData(): SeedExample[] {
  const files = fs.readdirSync(SEED_DATA_DIR).filter(f => f.endsWith('.jsonl'));
  const allExamples: SeedExample[] = [];

  for (const file of files) {
    const filePath = path.join(SEED_DATA_DIR, file);
    const records = parseJsonlFile(filePath);

    for (const record of records) {
      if (isJangmunRecord(record)) {
        // 장문: 2개 레코드로 확장
        allExamples.push(...expandJangmunRecord(record));
      } else {
        // 일반 유형 — 장문이 jangmun.jsonl에 이미 있으면 스킵
        if (record.jangmun_set) continue;

        const { passageOnly, choices } = splitPassageAndChoices(record.passage);
        allExamples.push({
          questionCode: record.question_code,
          questionNumber: record.question_number,
          questionType: record.question_type as QuestionType,
          passage: record.passage,
          passageOnly: passageOnly || undefined,
          choices: choices.length > 0 ? choices : undefined,
          wordCount: record.word_count,
          answer: record.answer,
          isJangmun: false,
          jangmunNote: record.jangmun_note,
        });
      }
    }
  }

  return allExamples;
}

/**
 * 시드 데이터를 DB에 upsert
 */
export async function syncSeedDataToDb(): Promise<number> {
  const examples = loadAllSeedData();
  let count = 0;

  for (const ex of examples) {
    await prisma.seedExample.upsert({
      where: { questionCode: ex.questionCode },
      update: {
        questionNumber: ex.questionNumber,
        questionType: ex.questionType,
        passage: ex.passage,
        passageOnly: ex.passageOnly ?? null,
        choices: ex.choices ? JSON.stringify(ex.choices) : null,
        wordCount: ex.wordCount,
        answer: ex.answer,
        isJangmun: ex.isJangmun ?? false,
        jangmunNote: ex.jangmunNote ?? null,
        jangmunGroupId: ex.jangmunGroupId ?? null,
        jangmunSubType: ex.jangmunSubType ?? null,
      },
      create: {
        questionCode: ex.questionCode,
        questionNumber: ex.questionNumber,
        questionType: ex.questionType,
        passage: ex.passage,
        passageOnly: ex.passageOnly ?? null,
        choices: ex.choices ? JSON.stringify(ex.choices) : null,
        wordCount: ex.wordCount,
        answer: ex.answer,
        isJangmun: ex.isJangmun ?? false,
        jangmunNote: ex.jangmunNote ?? null,
        jangmunGroupId: ex.jangmunGroupId ?? null,
        jangmunSubType: ex.jangmunSubType ?? null,
      },
    });
    count++;
  }

  return count;
}

/**
 * DB에서 특정 유형의 시드 예시를 가져오기
 */
export async function getSeedExamplesByType(
  questionType: QuestionType,
  limit = 5
): Promise<SeedExample[]> {
  const records = await prisma.seedExample.findMany({
    where: { questionType },
    take: limit,
    orderBy: { questionCode: 'desc' },
  });

  return records.map(r => ({
    id: r.id,
    questionCode: r.questionCode,
    questionNumber: r.questionNumber,
    questionType: r.questionType as QuestionType,
    passage: r.passage,
    passageOnly: r.passageOnly ?? undefined,
    choices: r.choices ? JSON.parse(r.choices) : undefined,
    wordCount: r.wordCount,
    answer: r.answer,
    isJangmun: r.isJangmun,
    jangmunNote: r.jangmunNote ?? undefined,
    jangmunGroupId: r.jangmunGroupId ?? undefined,
    jangmunSubType: r.jangmunSubType as SeedExample['jangmunSubType'],
  }));
}
