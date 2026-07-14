const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scoreQuiz } = require('../services/quizScoring');

// A small MCQ+text quiz reused across tests.
const quiz = {
  timeLimitMinutes: 10,
  questions: [
    { id: 'q1', type: 'mcq', question: '2+2?', options: ['3', '4', '5'], correctIndex: 1 },
    { id: 'q2', type: 'mcq', question: 'Capital of France?', options: ['Paris', 'Rome'], correctIndex: 0 },
    { id: 'q3', type: 'text', question: 'Tell us about yourself.' },
  ],
};

test('all MCQ correct scores 100', () => {
  const r = scoreQuiz(quiz, [
    { questionId: 'q1', answer: 1 },
    { questionId: 'q2', answer: 0 },
    { questionId: 'q3', answer: 'I write tests.' },
  ]);
  assert.equal(r.score, 100);
  assert.equal(r.correct, 2);
  assert.equal(r.totalScored, 2); // text questions are NOT scored
});

test('no MCQ correct scores 0', () => {
  const r = scoreQuiz(quiz, [
    { questionId: 'q1', answer: 0 },
    { questionId: 'q2', answer: 1 },
  ]);
  assert.equal(r.score, 0);
  assert.equal(r.correct, 0);
});

test('partial score rounds to nearest integer', () => {
  // 1 of 2 MCQ correct -> 50
  const r = scoreQuiz(quiz, [
    { questionId: 'q1', answer: 1 }, // correct
    { questionId: 'q2', answer: 1 }, // wrong
  ]);
  assert.equal(r.score, 50);
  assert.equal(r.correct, 1);

  // 1 of 3 -> Math.round(33.33) = 33
  const three = {
    questions: [
      { id: 'a', type: 'mcq', question: '', options: ['x', 'y'], correctIndex: 0 },
      { id: 'b', type: 'mcq', question: '', options: ['x', 'y'], correctIndex: 0 },
      { id: 'c', type: 'mcq', question: '', options: ['x', 'y'], correctIndex: 0 },
    ],
  };
  const r2 = scoreQuiz(three, [{ questionId: 'a', answer: 0 }]);
  assert.equal(r2.score, 33);
});

test('string answer index is coerced to a number', () => {
  const r = scoreQuiz(quiz, [
    { questionId: 'q1', answer: '1' }, // string "1" should match correctIndex 1
    { questionId: 'q2', answer: '0' },
  ]);
  assert.equal(r.correct, 2);
  assert.equal(r.answers[0].answerIndex, 1);
});

test('missing answer for an MCQ is marked incorrect with null index', () => {
  const r = scoreQuiz(quiz, [{ questionId: 'q2', answer: 0 }]);
  const q1 = r.answers.find((a) => a.questionId === 'q1');
  assert.equal(q1.answerIndex, null);
  assert.equal(q1.correct, false);
  assert.equal(q1.answerText, ''); // undefined option -> ''
  assert.equal(q1.correctAnswer, '4'); // correct answer text is always surfaced
});

test('answer detail carries chosen and correct option text', () => {
  const r = scoreQuiz(quiz, [{ questionId: 'q1', answer: 2 }]);
  const q1 = r.answers.find((a) => a.questionId === 'q1');
  assert.equal(q1.answerText, '5');
  assert.equal(q1.correctAnswer, '4');
  assert.equal(q1.correct, false);
});

test('text answers are stored but not scored', () => {
  const r = scoreQuiz(quiz, [{ questionId: 'q3', answer: 42 }]);
  const q3 = r.answers.find((a) => a.questionId === 'q3');
  assert.equal(q3.type, 'text');
  assert.equal(q3.answerText, '42'); // coerced to string
  assert.equal(r.totalScored, 2); // only the two MCQs count
});

test('a quiz with no MCQ questions yields a null score', () => {
  const textOnly = { questions: [{ id: 't', type: 'text', question: 'Why us?' }] };
  const r = scoreQuiz(textOnly, [{ questionId: 't', answer: 'because' }]);
  assert.equal(r.score, null);
  assert.equal(r.totalScored, 0);
});

test('anti-cheat meta is parsed with sane defaults', () => {
  const withMeta = scoreQuiz(quiz, [], { timeSpentSeconds: '125', tabSwitches: 3 });
  assert.equal(withMeta.timeSpentSeconds, 125);
  assert.equal(withMeta.tabSwitches, 3);

  const noMeta = scoreQuiz(quiz, []);
  assert.equal(noMeta.timeSpentSeconds, null);
  assert.equal(noMeta.tabSwitches, 0);

  const badMeta = scoreQuiz(quiz, [], { timeSpentSeconds: 'abc', tabSwitches: 'xyz' });
  assert.equal(badMeta.timeSpentSeconds, null);
  assert.equal(badMeta.tabSwitches, 0);
});

test('handles null/undefined answers without throwing', () => {
  const r = scoreQuiz(quiz, null);
  assert.equal(r.correct, 0);
  assert.equal(r.score, 0); // 0 of 2 MCQ
  assert.equal(r.answers.length, 3);
});

test('submittedAt is a valid ISO timestamp', () => {
  const r = scoreQuiz(quiz, []);
  assert.equal(typeof r.submittedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(r.submittedAt)));
});
