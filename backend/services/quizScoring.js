// Auto-grade a submitted quiz against the job's answer key (server-side only).
// MCQ questions are scored; text questions are stored for manual review.
//
// Pure and self-contained (aside from the submission timestamp) so it can be
// unit-tested in isolation and reused outside the request path. NEVER trust the
// client for correctness — this runs on the full quiz (with correctIndex) that
// only ever lives server-side.
const scoreQuiz = (quiz, answers, meta = {}) => {
  const byId = {};
  (answers || []).forEach((a) => {
    if (a && a.questionId != null) byId[a.questionId] = a.answer;
  });

  let correct = 0;
  let totalScored = 0;
  const detail = quiz.questions.map((q) => {
    const given = byId[q.id];
    if (q.type === 'mcq') {
      totalScored += 1;
      const idx = Number.isInteger(given) ? given : parseInt(given, 10);
      const isCorrect = idx === q.correctIndex;
      if (isCorrect) correct += 1;
      return {
        questionId: q.id,
        question: q.question,
        type: 'mcq',
        answerIndex: Number.isInteger(idx) ? idx : null,
        answerText: q.options?.[idx] ?? '',
        correct: isCorrect,
        correctAnswer: q.options?.[q.correctIndex] ?? '',
      };
    }
    return { questionId: q.id, question: q.question, type: 'text', answerText: given == null ? '' : String(given) };
  });

  const timeSpentSeconds = Number.isFinite(+meta.timeSpentSeconds) ? +meta.timeSpentSeconds : null;
  const tabSwitches = Number.isFinite(+meta.tabSwitches) ? +meta.tabSwitches : 0;

  return {
    score: totalScored ? Math.round((correct / totalScored) * 100) : null,
    correct,
    totalScored,
    answers: detail,
    timeSpentSeconds,
    tabSwitches,
    submittedAt: new Date().toISOString(),
  };
};

module.exports = { scoreQuiz };
