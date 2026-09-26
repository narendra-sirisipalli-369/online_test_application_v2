import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ImagePlus,
  Layers3,
  ListPlus,
  Plus,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { ContentBlockList } from "../../components/ContentBlockList";
import { LatexText } from "../../components/LatexText";
import { PageHeader } from "../../components/PageHeader";
import { Pagination } from "../../components/Pagination";
import { useAuth } from "../../context/AuthContext";
import {
  buildImageMarker,
  parseStructuredText,
} from "../../utils/contentBlocks";

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) —
// this app is also served over plain HTTP on a LAN IP, where it's undefined
// and throws, so a plain random-id generator is used instead.
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const KEYS = ["A", "B", "C", "D"];
const SETS_PAGE_SIZE = 1;
type Mock = "" | "CAT" | "IPMAT_INDORE" | "IPMAT_ROHTAK";
type Question = {
  id: string;
  questionText: string;
  imagePath: string;
  answerType: "OPTIONS" | "TEXT";
  options: { key: string; content: string }[];
  correctOptionKey: string;
  correctTextAnswer: string;
};
type QuestionSet = {
  id: string;
  subject: string;
  contentType: "question" | "passage";
  paragraph: string;
  questions: Question[];
};
const EXAMS: Record<
  Exclude<Mock, "">,
  {
    label: string;
    subjects: { name: string; target: number; type: Question["answerType"] }[];
  }
> = {
  CAT: {
    label: "CAT",
    subjects: [
      { name: "VARC", target: 24, type: "OPTIONS" },
      { name: "DILR", target: 22, type: "OPTIONS" },
      { name: "QA", target: 22, type: "OPTIONS" },
    ],
  },
  IPMAT_INDORE: {
    label: "IPMAT Indore",
    subjects: [
      { name: "QA MCQ", target: 30, type: "OPTIONS" },
      { name: "QA SA", target: 15, type: "TEXT" },
      { name: "VA", target: 45, type: "OPTIONS" },
    ],
  },
  IPMAT_ROHTAK: {
    label: "IPMAT Rohtak",
    subjects: [
      { name: "QA", target: 40, type: "OPTIONS" },
      { name: "LR", target: 40, type: "OPTIONS" },
      { name: "VA", target: 40, type: "OPTIONS" },
    ],
  },
};
const createQuestion = (
  answerType: Question["answerType"] = "OPTIONS",
): Question => ({
  id: generateId(),
  questionText: "",
  imagePath: "",
  answerType,
  options: KEYS.map((key) => ({ key, content: "" })),
  correctOptionKey: "A",
  correctTextAnswer: "",
});
const createSet = (
  subject = "",
  type: Question["answerType"] = "OPTIONS",
): QuestionSet => ({
  id: generateId(),
  subject,
  contentType: "question",
  paragraph: "",
  questions: [createQuestion(type)],
});
const complete = (question: Question) =>
  Boolean(question.questionText.trim()) &&
  (question.answerType === "TEXT"
    ? Boolean(question.correctTextAnswer.trim())
    : question.options.every((option) => option.content.trim()));

export function AdminCreateQuestionPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [mock, setMock] = useState<Mock>("");
  const [sets, setSets] = useState<QuestionSet[]>([createSet()]);
  const [setPage, setSetPage] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const passageRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const questionRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const exam = mock ? EXAMS[mock] : null;
  const questions = useMemo(() => sets.flatMap((set) => set.questions), [sets]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (exam?.subjects || []).map((subject) => [
          subject.name,
          sets
            .filter((set) => set.subject === subject.name)
            .reduce((total, set) => total + set.questions.length, 0),
        ]),
      ),
    [exam, sets],
  );
  const updateSet = (id: string, patch: Partial<QuestionSet>) =>
    setSets((current) =>
      current.map((set) => (set.id === id ? { ...set, ...patch } : set)),
    );
  const updateQuestion = (
    setId: string,
    questionId: string,
    patch: Partial<Question>,
  ) =>
    setSets((current) =>
      current.map((set) =>
        set.id !== setId
          ? set
          : {
              ...set,
              questions: set.questions.map((question) =>
                question.id === questionId
                  ? { ...question, ...patch }
                  : question,
              ),
            },
      ),
    );
  const addSet = (subject = "") =>
    setSets((current) => {
      const next = [
        ...current,
        createSet(
          subject,
          exam?.subjects.find((item) => item.name === subject)?.type,
        ),
      ];
      setSetPage(Math.ceil(next.length / SETS_PAGE_SIZE));
      return next;
    });
  async function uploadImage(setId: string, questionId?: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !token) return;
      const key = questionId ? `${setId}:${questionId}` : setId;
      setUploading(key);
      try {
        const { path } = await api.uploadImage(token, file);
        if (questionId) {
          const question = sets
            .flatMap((set) => set.questions)
            .find((item) => item.id === questionId);
          if (!question) return;
          const cursor = Math.min(
            questionRefs.current[questionId]?.selectionStart ??
              question.questionText.length,
            question.questionText.length,
          );
          updateQuestion(setId, questionId, {
            imagePath: path,
            questionText: `${question.questionText.slice(0, cursor)}\n${buildImageMarker(path)}\n${question.questionText.slice(cursor)}`,
          });
        } else {
          const set = sets.find((item) => item.id === setId);
          if (!set) return;
          const cursor =
            passageRefs.current[setId]?.selectionStart ?? set.paragraph.length;
          updateSet(setId, {
            paragraph: `${set.paragraph.slice(0, cursor)}\n${buildImageMarker(path)}\n${set.paragraph.slice(cursor)}`,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to upload image");
      } finally {
        setUploading(null);
      }
    };
    input.click();
  }
  async function save() {
    setError("");
    if (!token) return;
    if (!name.trim())
      return setError("Add a clear name for this question bank.");
    if (exam && sets.some((set) => !set.subject))
      return setError("Choose a subject for every question set.");
    if (
      sets.some(
        (set) =>
          (set.contentType === "passage" && !set.paragraph.trim()) ||
          !set.questions.every(complete),
      )
    )
      return setError(
        "Finish the question text, answers, and every passage before saving.",
      );
    setSaving(true);
    try {
      const response = await api.createBank(token, {
        name: name.trim(),
        mockExamType: mock || null,
        sections: sets.map((set) => ({
          paragraph: set.contentType === "passage" ? set.paragraph : "",
          subject: set.subject,
          questions: set.questions.map((question) => ({
            questionText: question.questionText,
            imagePath: question.imagePath || null,
            answerType: question.answerType,
            options: question.answerType === "OPTIONS" ? question.options : [],
            correctOptionKey:
              question.answerType === "OPTIONS"
                ? question.correctOptionKey
                : null,
            correctTextAnswer:
              question.answerType === "TEXT"
                ? question.correctTextAnswer
                : null,
          })),
        })),
      });
      navigate(`/admin/questions/${response.bank.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save question bank",
      );
      setSaving(false);
    }
  }
  return (
    <div className="question-creator stack-lg">
      <PageHeader
        eyebrow="Question bank"
        title="Build a question bank"
        description="Create a sectional bank or a full CAT/IPMAT mock one subject at a time."
      />
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="creator-setup card">
        <div className="creator-heading">
          <span>1</span>
          <div>
            <h2>Choose a format and name the bank</h2>
            <p>The form adapts to the selected examination.</p>
          </div>
        </div>
        <div className="creator-mode-grid">
          {(
            [
              ["", "Sectional bank", "Flexible question bank"],
              ["CAT", "CAT mock", "VARC · DILR · QA"],
              ["IPMAT_INDORE", "IPMAT Indore", "QA MCQ · QA SA · VA"],
              ["IPMAT_ROHTAK", "IPMAT Rohtak", "QA · LR · VA"],
            ] as const
          ).map(([value, title, detail]) => (
            <button
              className={`creator-mode-card ${mock === value ? "creator-mode-card--active" : ""}`}
              key={title}
              onClick={() => {
                setMock(value);
                setSets((current) =>
                  current.map((set) => ({ ...set, subject: "" })),
                );
              }}
              type="button"
            >
              <strong>{title}</strong>
              <span>{detail}</span>
            </button>
          ))}
        </div>
        <label className="creator-bank-name">
          <span>Question bank name</span>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder={
              exam ? `${exam.label} Mock 01` : "e.g. Arithmetic practice set"
            }
            value={name}
          />
        </label>
      </section>
      {exam ? (
        <section className="creator-template card">
          <div>
            <span className="creator-step">2</span>
            <strong>{exam.label} subject checklist</strong>
            <p>Add question sets under each subject.</p>
          </div>
          <div className="creator-subject-progress">
            {exam.subjects.map((subject) => (
              <button
                key={subject.name}
                onClick={() => addSet(subject.name)}
                type="button"
              >
                <span>{subject.name}</span>
                <strong>
                  {counts[subject.name] || 0}
                  <small> / {subject.target}</small>
                </strong>
                <em>Add set</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <div className="creator-workspace">
        <main className="creator-workspace__main stack">
          <div className="creator-workspace__heading">
            <div className="creator-heading">
              <span>{exam ? "3" : "2"}</span>
              <h2>Add questions</h2>
            </div>
            <button
              className="ghost-button"
              onClick={() => addSet()}
              type="button"
            >
              <Plus size={16} /> Add question set
            </button>
          </div>
          {(() => {
            const setPageCount = Math.max(1, Math.ceil(sets.length / SETS_PAGE_SIZE));
            const currentSetPage = Math.min(setPage, setPageCount);
            const visibleSets = sets
              .map((set, index) => ({ set, index }))
              .slice((currentSetPage - 1) * SETS_PAGE_SIZE, currentSetPage * SETS_PAGE_SIZE);
            return (
              <>
                <Pagination
                  currentPage={currentSetPage}
                  itemLabel="question sets"
                  onPageChange={setSetPage}
                  pageSize={SETS_PAGE_SIZE}
                  totalItems={sets.length}
                  totalPages={setPageCount}
                />
                {visibleSets.map(({ set, index }) => (
                  <SetEditor
                    exam={exam}
                    index={index}
                    key={set.id}
                    onAdd={() =>
                      updateSet(set.id, {
                        questions: [
                          ...set.questions,
                          createQuestion(
                            exam?.subjects.find(
                              (subject) => subject.name === set.subject,
                            )?.type,
                          ),
                        ],
                      })
                    }
                    onDelete={() =>
                      setSets((current) => {
                        if (current.length === 1) return current;
                        const next = current.filter((item) => item.id !== set.id);
                        setSetPage((page) => Math.min(page, Math.ceil(next.length / SETS_PAGE_SIZE)));
                        return next;
                      })
                    }
                    onDeleteQuestion={(id) =>
                      updateSet(set.id, {
                        questions:
                          set.questions.length === 1
                            ? set.questions
                            : set.questions.filter((question) => question.id !== id),
                      })
                    }
                    onSet={(patch) => updateSet(set.id, patch)}
                    onUploadPassage={() => void uploadImage(set.id)}
                    onUploadQuestion={(id) => void uploadImage(set.id, id)}
                    onQuestion={(id, patch) => updateQuestion(set.id, id, patch)}
                    questionRef={(questionId, element) => {
                      questionRefs.current[questionId] = element;
                    }}
                    paragraphRef={(element) => {
                      passageRefs.current[set.id] = element;
                    }}
                    set={set}
                    uploading={uploading}
                  />
                ))}
                <Pagination
                  currentPage={currentSetPage}
                  itemLabel="question sets"
                  onPageChange={setSetPage}
                  pageSize={SETS_PAGE_SIZE}
                  totalItems={sets.length}
                  totalPages={setPageCount}
                />
              </>
            );
          })()}
        </main>
        <aside className="creator-summary card">
          <div className="creator-summary__title">
            <Layers3 size={18} /> Bank progress
          </div>
          <strong className="creator-summary__count">
            {questions.filter(complete).length}
            <small> / {questions.length} complete</small>
          </strong>
          <p>
            {exam
              ? `${exam.label} is organised subject-wise.`
              : "Add standalone questions or passage sets."}
          </p>
          {exam ? (
            <div className="creator-summary__subjects">
              {exam.subjects.map((subject) => (
                <div key={subject.name}>
                  <span>{subject.name}</span>
                  <strong>
                    {counts[subject.name] || 0} / {subject.target}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
          <button
            className="primary-button"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save question bank"}
          </button>
        </aside>
      </div>
    </div>
  );
}

function SetEditor({
  set,
  index,
  exam,
  uploading,
  paragraphRef,
  onSet,
  onQuestion,
  questionRef,
  onAdd,
  onDeleteQuestion,
  onDelete,
  onUploadPassage,
  onUploadQuestion,
}: {
  set: QuestionSet;
  index: number;
  exam: {
    subjects: { name: string; target: number; type: Question["answerType"] }[];
  } | null;
  uploading: string | null;
  paragraphRef: (element: HTMLTextAreaElement | null) => void;
  onSet: (patch: Partial<QuestionSet>) => void;
  onQuestion: (id: string, patch: Partial<Question>) => void;
  questionRef: (
    questionId: string,
    element: HTMLTextAreaElement | null,
  ) => void;
  onAdd: () => void;
  onDeleteQuestion: (id: string) => void;
  onDelete: () => void;
  onUploadPassage: () => void;
  onUploadQuestion: (id: string) => void;
}) {
  const expected = exam?.subjects.find(
    (subject) => subject.name === set.subject,
  )?.type;
  return (
    <section className="creator-set card">
      <header className="creator-set__header">
        <div>
          <span>QUESTION SET {String(index + 1).padStart(2, "0")}</span>
          <strong>
            {set.contentType === "passage"
              ? "Passage set"
              : "Standalone questions"}
          </strong>
        </div>
        <button className="icon-button-plain" onClick={onDelete} type="button">
          <Trash2 size={16} />
        </button>
      </header>
      <div className="creator-set__controls">
        <label>
          <span>Subject</span>
          {exam ? (
            <select
              onChange={(event) => {
                const subject = exam.subjects.find(
                  (item) => item.name === event.target.value,
                );
                onSet({
                  subject: event.target.value,
                  questions: set.questions.map((question) => ({
                    ...question,
                    answerType: subject?.type || question.answerType,
                  })),
                });
              }}
              value={set.subject}
            >
              <option value="">Select subject…</option>
              {exam.subjects.map((subject) => (
                <option key={subject.name} value={subject.name}>
                  {subject.name} · target {subject.target}
                </option>
              ))}
            </select>
          ) : (
            <input
              onChange={(event) => onSet({ subject: event.target.value })}
              placeholder="Optional topic"
              value={set.subject}
            />
          )}
        </label>
        <div>
          <span>Content</span>
          <div className="creator-toggle">
            <button
              className={set.contentType === "question" ? "active" : ""}
              onClick={() => onSet({ contentType: "question" })}
              type="button"
            >
              Questions
            </button>
            <button
              className={set.contentType === "passage" ? "active" : ""}
              onClick={() => onSet({ contentType: "passage" })}
              type="button"
            >
              Passage set
            </button>
          </div>
        </div>
      </div>
      {set.contentType === "passage" ? (
        <div className="creator-passage">
          <div>
            <span>Shared passage or data set</span>
            <button
              className="ghost-button"
              disabled={uploading === set.id}
              onClick={onUploadPassage}
              type="button"
            >
              <ImagePlus size={15} />{" "}
              {uploading === set.id ? "Uploading…" : "Add image"}
            </button>
          </div>
          <textarea
            onChange={(event) => onSet({ paragraph: event.target.value })}
            placeholder="Paste or type the passage."
            ref={paragraphRef}
            rows={6}
            value={set.paragraph}
          />
          {set.paragraph.trim() ? (
            <details className="creator-preview">
              <summary>
                <ChevronDown size={15} /> Preview passage
              </summary>
              <ContentBlockList blocks={parseStructuredText(set.paragraph)} />
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="creator-questions">
        {set.questions.map((question, number) => (
          <QuestionEditor
            expected={expected}
            key={question.id}
            number={number + 1}
            onDelete={() => onDeleteQuestion(question.id)}
            onUpdate={(patch) => onQuestion(question.id, patch)}
            onUpload={() => onUploadQuestion(question.id)}
            questionRef={(element) => questionRef(question.id, element)}
            question={question}
            uploading={uploading === `${set.id}:${question.id}`}
          />
        ))}
      </div>
      <button className="creator-add-question" onClick={onAdd} type="button">
        <ListPlus size={17} /> Add another question to this set
      </button>
    </section>
  );
}

function QuestionEditor({
  question,
  number,
  expected,
  uploading,
  onUpdate,
  onUpload,
  questionRef,
  onDelete,
}: {
  question: Question;
  number: number;
  expected?: Question["answerType"];
  uploading: boolean;
  onUpdate: (patch: Partial<Question>) => void;
  onUpload: () => void;
  questionRef: (element: HTMLTextAreaElement | null) => void;
  onDelete: () => void;
}) {
  const type = expected || question.answerType;
  return (
    <article
      className={`creator-question ${complete(question) ? "creator-question--complete" : ""}`}
    >
      <header>
        <span>QUESTION {number}</span>
        <div>
          {complete(question) ? (
            <b>
              <Check size={14} /> Complete
            </b>
          ) : (
            <em>Draft</em>
          )}
          <button
            className="icon-button-plain"
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      <div className="creator-passage creator-question-passage">
        <div>
          <span>Question image or data</span>
          <div className="creator-question-passage__actions">
            <button
              className="ghost-button"
              disabled={uploading}
              onClick={onUpload}
              type="button"
            >
              <ImagePlus size={15} /> {uploading ? "Uploading…" : "Add image"}
            </button>
          </div>
        </div>
        <textarea
          onChange={(event) => onUpdate({ questionText: event.target.value })}
          placeholder="Write the question here…"
          ref={questionRef}
          rows={4}
          value={question.questionText}
        />
        <small className="latex-entry-hint">Math formatting: use $...$ for inline formulas or $$...$$ for a centered formula.</small>
        {question.questionText.trim() ? (
          <details className="creator-preview">
            <summary>
              <ChevronDown size={15} /> Preview question content
            </summary>
            <ContentBlockList
              blocks={parseStructuredText(question.questionText)}
            />
          </details>
        ) : null}
      </div>
      {!expected ? (
        <div className="creator-answer-type">
          <button
            className={type === "OPTIONS" ? "active" : ""}
            onClick={() => onUpdate({ answerType: "OPTIONS" })}
            type="button"
          >
            Multiple choice
          </button>
          <button
            className={type === "TEXT" ? "active" : ""}
            onClick={() => onUpdate({ answerType: "TEXT" })}
            type="button"
          >
            Numeric / text answer
          </button>
        </div>
      ) : (
        <p className="creator-format-note">
          {type === "TEXT"
            ? "Short-answer format required for this subject."
            : "Multiple-choice format required for this subject."}
        </p>
      )}
      {type === "OPTIONS" ? (
        <div className="creator-options">
          {question.options.map((option, index) => (
            <label
              className={`creator-option ${question.correctOptionKey === option.key ? "creator-option--correct" : ""}`}
              key={option.key}
            >
              <button
                className="correct-marker"
                onClick={() => onUpdate({ correctOptionKey: option.key })}
                type="button"
              >
                {question.correctOptionKey === option.key ? (
                  <Check size={12} />
                ) : null}
              </button>
              <span>{option.key}</span>
              <input
                onChange={(event) =>
                  onUpdate({
                    options: question.options.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, content: event.target.value }
                        : item,
                    ),
                  })
                }
                placeholder={`Option ${option.key}`}
                value={option.content}
              />
            </label>
          ))}
        </div>
      ) : (
        <label className="creator-text-answer">
          <span>Correct answer</span>
          <input
            onChange={(event) =>
              onUpdate({ correctTextAnswer: event.target.value })
            }
            placeholder="Enter the exact numeric or text answer"
            value={question.correctTextAnswer}
          />
        </label>
      )}
      <QuestionPreview question={question} />
    </article>
  );
}

function QuestionPreview({ question }: { question: Question }) {
  const hasContent =
    question.questionText.trim() ||
    question.imagePath ||
    question.options.some((option) => option.content.trim()) ||
    question.correctTextAnswer.trim();
  if (!hasContent) return null;
  return (
    <details className="creator-preview">
      <summary>
        <ChevronDown size={15} /> Preview question
      </summary>
      <div className="creator-preview__question">
        {question.questionText ? (
          <ContentBlockList
            blocks={parseStructuredText(question.questionText)}
          />
        ) : (
          <p className="muted-text">Question text will appear here.</p>
        )}
        {question.answerType === "OPTIONS" ? (
          <div className="creator-preview__options">
            {question.options.map((option) => (
              <div
                className={
                  question.correctOptionKey === option.key ? "is-correct" : ""
                }
                key={option.key}
              >
                <strong>{option.key}</strong>
                <span><LatexText text={option.content || `Option ${option.key}`} /></span>
              </div>
            ))}
          </div>
        ) : (
          <p className="creator-preview__answer">
            Answer: <LatexText text={question.correctTextAnswer || "Not set"} />
          </p>
        )}
      </div>
    </details>
  );
}
