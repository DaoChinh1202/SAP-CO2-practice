import fs from "node:fs";
import path from "node:path";

const inputDirectory = process.argv[2];
const outputDirectory = process.argv[3];

if (!inputDirectory || !outputDirectory) {
  console.error("Usage: node tools/parse-question-bank.mjs <input-directory> <output-directory>");
  process.exit(1);
}

const tests = [
  ["test-01", "SAP-C02-Practice-test-1.txt"],
  ["test-02", "SAP-C02-Practice-test-02.txt"],
  ["test-03", "SAP-C02-Practice-test-03.txt"],
  ["test-04", "SAP-C02-Practice-test-04.txt"],
];

function compact(parts) {
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:?!])/g, "$1")
    .trim();
}

function findQuestionStarts(lines) {
  const starts = [];
  let expectedNumber = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^ {4}(\d+)\.\s+(.+)$/);
    if (match && Number(match[1]) === expectedNumber) {
      starts.push({ index, number: expectedNumber });
      expectedNumber += 1;
    }
  }

  return starts;
}

function parseBlock(lines, testId, number) {
  const options = [];
  const prompt = [];
  let activeOption;

  const append = (text) => {
    if (activeOption) {
      activeOption.text.push(text);
    } else {
      prompt.push(text);
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^(?:•\s*)?1 điểm$/.test(trimmed)) continue;

    const firstOption = trimmed.match(/^([A-F])\.\s*/);
    if (!firstOption) {
      append(trimmed);
      continue;
    }

    const fragments = [{ index: 0, 0: firstOption[0], 1: firstOption[1] }];
    const optionTextStart = firstOption[0].length;
    for (const inlineOption of trimmed.slice(optionTextStart).matchAll(/([B-F])\.(?=[A-Za-z])/g)) {
      fragments.push({
        index: optionTextStart + inlineOption.index,
        0: inlineOption[0],
        1: inlineOption[1],
      });
    }
    for (let index = 0; index < fragments.length; index += 1) {
      const fragment = fragments[index];
      const start = fragment.index + fragment[0].length;
      const end = fragments[index + 1]?.index ?? trimmed.length;
      activeOption = { id: fragment[1], text: [trimmed.slice(start, end).trim()] };
      options.push(activeOption);
    }
  }

  const question = compact(prompt).replace(/^\d+\.\s+/, "");
  const instruction = question.match(/\(Choose (two|three)\.\)/i)?.[1]?.toLowerCase();
  const requiredAnswers = instruction === "two" ? 2 : instruction === "three" ? 3 : 1;

  return {
    id: `${testId}-${String(number).padStart(2, "0")}`,
    source: testId,
    number,
    question,
    options: options.map((option) => ({ id: option.id, text: compact(option.text) })),
    requiredAnswers,
    correctAnswers: [],
    explanation: "",
    reviewNote: "",
  };
}

function parseTest(testId, filename) {
  const lines = fs.readFileSync(path.join(inputDirectory, filename), "utf8").split(/\r?\n/);
  const starts = findQuestionStarts(lines);

  return starts.map((start, index) => {
    const nextStart = starts[index + 1]?.index ?? lines.length;
    return parseBlock(lines.slice(start.index, nextStart), testId, start.number);
  });
}

fs.mkdirSync(outputDirectory, { recursive: true });

const catalog = [];
for (const [id, filename] of tests) {
  const questions = parseTest(id, filename);
  fs.writeFileSync(path.join(outputDirectory, `${id}.json`), `${JSON.stringify(questions, null, 2)}\n`);
  catalog.push({ id, title: `Đề ${id.slice(-2)}`, questionCount: questions.length });
  console.log(`${id}: ${questions.length} questions`);
}

fs.writeFileSync(path.join(outputDirectory, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
