export const ANSWER_SEPARATOR = " · ";

export const selectedValues = (answer) =>
  typeof answer === "string" ? answer.split(ANSWER_SEPARATOR).filter(Boolean) : [];

export const toggleAnswer = (answer, selection, multi = true) => {
  const current = selectedValues(answer);
  const next = !multi
    ? [selection]
    : current.includes(selection)
      ? current.filter((item) => item !== selection)
      : [...current, selection];
  return next.join(ANSWER_SEPARATOR);
};

export const generatedAction = (format) =>
  format === "Reel" ? "reel" : format === "Carosello" ? "carousel" : "post";
