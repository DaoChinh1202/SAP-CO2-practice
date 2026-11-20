import fs from "node:fs";
import path from "node:path";

const dataDirectory = process.argv[2] ?? "data";
const testFiles = ["test-01.json", "test-02.json", "test-03.json", "test-04.json"];
const errors = [];
let total = 0;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

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

    const aid = question.learningAid;
    if (!aid || typeof aid !== "object") {
      errors.push(`${prefix}: missing learningAid`);
      continue;
    }
    if (!hasText(aid.summary) || !hasText(aid.context)) {
      errors.push(`${prefix}: learningAid needs a summary and context`);
    }
    if (!Array.isArray(aid.requirements) || aid.requirements.length === 0 || aid.requirements.some((item) => !hasText(item))) {
      errors.push(`${prefix}: learningAid needs nonempty requirements`);
    }
    if (!Array.isArray(aid.constraints) || aid.constraints.length === 0 || aid.constraints.some((item) => !hasText(item))) {
      errors.push(`${prefix}: learningAid needs nonempty constraints`);
    }
    if (!Array.isArray(aid.focusPoints) || aid.focusPoints.length < 1 || aid.focusPoints.length > 3 || aid.focusPoints.some((item) => !hasText(item))) {
      errors.push(`${prefix}: learningAid needs 1–3 nonempty focus points`);
    }
    if (!Array.isArray(aid.keywords) || aid.keywords.length === 0 || aid.keywords.some((item) => !hasText(item?.term) || !hasText(item?.meaning))) {
      errors.push(`${prefix}: learningAid needs nonempty keywords`);
    }
    if (!aid.translation || !hasText(aid.translation.stem) || !Array.isArray(aid.translation.options)) {
      errors.push(`${prefix}: learningAid needs a translated stem and options`);
    } else {
      const translatedOptionIds = aid.translation.options.map((option) => option.id);
      if (translatedOptionIds.length !== optionIds.length ||
          translatedOptionIds.some((id, index) => id !== optionIds[index]) ||
          aid.translation.options.some((option) => !hasText(option.text))) {
        errors.push(`${prefix}: translated options must match the original options`);
      }
    }
    if (!aid.realWorld || ["scenario", "challenge", "principle", "takeaway"].some((field) => !hasText(aid.realWorld[field]))) {
      errors.push(`${prefix}: learningAid needs a complete real-world example`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Question bank validation failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Question bank valid: ${total} questions across ${testFiles.length} tests.`);
