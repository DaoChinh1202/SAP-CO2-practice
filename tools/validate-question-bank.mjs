import fs from "node:fs";
import path from "node:path";

const dataDirectory = process.argv[2] ?? "data";
const testFiles = ["test-01.json", "test-02.json", "test-03.json", "test-04.json"];
const errors = [];
let total = 0;

for (const filename of testFiles) {
  const filePath = path.join(dataDirectory, filename);
  const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (questions.length !== 75) {
    errors.push(`${filename}: expected 75 questions, found ${questions.length}`);
  }

  for (const question of questions) {
    total += 1;
    const optionIds = question.options.map((option) => option.id);
    const prefix = `${filename} question ${question.number}`;

    if (new Set(optionIds).size !== optionIds.length) {
      errors.push(`${prefix}: duplicate option IDs`);
    }
    if (optionIds.length < 4 || optionIds.length > 6) {
      errors.push(`${prefix}: expected 4–6 options, found ${optionIds.length}`);
    }
    if (question.correctAnswers.length !== question.requiredAnswers) {
      errors.push(
        `${prefix}: expected ${question.requiredAnswers} correct answer(s), found ${question.correctAnswers.length}`,
      );
    }
    if (question.correctAnswers.some((answer) => !optionIds.includes(answer))) {
      errors.push(`${prefix}: correct answer is missing from options`);
    }
    if (!question.explanation.trim()) {
      errors.push(`${prefix}: missing explanation`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Question bank validation failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Question bank valid: ${total} questions across ${testFiles.length} tests.`);
