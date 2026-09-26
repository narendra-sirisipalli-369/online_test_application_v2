import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Question } from "../types/app";
import { ContentBlockList } from "./ContentBlockList";
import { LatexText } from "./LatexText";
import {
  normalizeText,
  parseStructuredText,
  resolveAssetUrl,
  type RenderBlock,
} from "../utils/contentBlocks";

type Props = {
  question: Question;
  displayNumber?: number;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  previewOnly?: boolean;
  interactive?: boolean;
  answer?: string | null;
  onAnswer?: (value: string) => void;
  hideSharedContent?: boolean;
  hideAnswerSection?: boolean;
  bare?: boolean;
};

export function QuestionCard({
  question,
  displayNumber,
  selectable,
  selected,
  onToggleSelect,
  previewOnly,
  interactive,
  answer,
  onAnswer,
  hideSharedContent,
  hideAnswerSection,
  bare,
}: Props) {
  const contextBlocks = buildContextBlocks(
    question,
    Boolean(hideSharedContent),
  );
  const shownNumber =
    displayNumber ??
    (question.questionNumber ? Number(question.questionNumber) : undefined);
  const Wrapper = bare ? "div" : "article";

  return (
    <Wrapper
      className={
        bare
          ? "question-card--bare"
          : `question-card ${selected ? "question-card--selected" : ""}`
      }
    >
      <div className="question-card__header">
        <div className="question-card__title-row">
          {shownNumber ? (
            <span className="question-card__number-badge">Q{shownNumber}</span>
          ) : null}
          <div className="question-card__title">
            <ContentBlockList
              blocks={parseStructuredText(question.questionText)}
            />
          </div>
        </div>
      </div>

      {contextBlocks.length ? (
        <div className="question-card__context">
          <div className="question-card__context-label">Context</div>
          <div className="question-card__content">
            <ContentBlockList blocks={contextBlocks} />
          </div>
        </div>
      ) : null}

      {hideAnswerSection ? null : selectable || previewOnly ? (
        <div className="answer-section">
          {question.answerType === "TEXT" ? (
            <div className="text-answer-box text-answer-box--preview">
              <input
                disabled
                placeholder="Text / numeric answer — enter it in the answer phase"
                type="text"
              />
            </div>
          ) : (
            <div className="option-list" role="list">
              {question.options.map((option) => (
                <div
                  className="option-row option-row--preview"
                  key={option.key}
                >
                  <span className="option-row__radio" />
                  <span className="option-row__key">{option.key}</span>
                  <span className="option-row__text">
                    <LatexText text={option.content || "No option text"} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {selectable ? (
            <button
              className={`ghost-button ${selected ? "active" : ""}`}
              onClick={onToggleSelect}
              type="button"
            >
              {selected ? (
                <>
                  <Check size={16} /> Selected
                </>
              ) : (
                "Select this question"
              )}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="answer-section">
          {question.answerType === "TEXT" ? (
            <TextAnswerInput
              initialValue={answer}
              interactive={Boolean(interactive)}
              onAnswer={onAnswer}
              questionId={question.id}
            />
          ) : (
            <div className="option-list" role="radiogroup">
              {question.options.map((option) => {
                const isChosen = answer === option.key;
                return (
                  <button
                    aria-checked={isChosen}
                    className={`option-row ${isChosen ? "option-row--selected" : ""}`}
                    disabled={!interactive}
                    key={option.key}
                    onClick={() => onAnswer?.(option.key)}
                    role="radio"
                    type="button"
                  >
                    <span className="option-row__radio">
                      {isChosen ? <Check size={12} /> : null}
                    </span>
                    <span className="option-row__key">{option.key}</span>
                    <span className="option-row__text">
                      <LatexText text={option.content || "No option text"} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Wrapper>
  );
}

function TextAnswerInput({
  questionId,
  initialValue,
  interactive,
  onAnswer,
}: {
  questionId: string;
  initialValue?: string | null;
  interactive: boolean;
  onAnswer?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    setValue(initialValue || "");
  }, [initialValue, questionId]);

  return (
    <div className="text-answer-box">
      <input
        disabled={!interactive}
        onBlur={() => interactive && onAnswer?.(value)}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Type your answer"
        type="text"
        value={value}
      />
    </div>
  );
}

function buildContextBlocks(
  question: Question,
  hideSharedContent: boolean,
): RenderBlock[] {
  const rawBlocks = question.contentBlocks.length ? question.contentBlocks : [];

  const shouldUseParagraphFallback =
    !rawBlocks.length ||
    (rawBlocks.length === 1 &&
      rawBlocks[0].blockType === "TEXT" &&
      normalizeText(rawBlocks[0].textContent || "") ===
        normalizeText(question.questionText));

  if (shouldUseParagraphFallback) {
    return [
      ...(hideSharedContent
        ? []
        : parseStructuredText(question.paragraph || "")),
      ...(hideSharedContent || !question.imagePath
        ? []
        : [
            {
              type: "image",
              src: resolveAssetUrl(question.imagePath),
            } satisfies RenderBlock,
          ]),
      ...parseStructuredText(question.textAfterImage || ""),
    ];
  }

  return rawBlocks.flatMap((block) => {
    if (block.blockType === "IMAGE" && block.imagePath) {
      if (question.questionText.includes(`ImageMarker:(${block.imagePath})`)) {
        return [];
      }
      if (
        hideSharedContent &&
        question.imagePath &&
        normalizeText(block.imagePath) === normalizeText(question.imagePath)
      ) {
        return [];
      }
      return [
        {
          type: "image",
          src: resolveAssetUrl(block.imagePath),
        } satisfies RenderBlock,
      ];
    }

    if (block.blockType === "TEXT") {
      const text = block.textContent || "";
      if (
        normalizeText(text) === normalizeText(question.questionText) ||
        normalizeText(text) === normalizeText(question.textBeforeImage || "")
      ) {
        return [];
      }
      // Imported paragraphs containing a table get split into several
      // content-block fragments around the table marker, so no single
      // fragment equals the whole paragraph — check containment instead.
      if (
        hideSharedContent &&
        question.paragraph &&
        normalizeText(question.paragraph).includes(normalizeText(text))
      ) {
        return [];
      }
      return parseStructuredText(text);
    }

    return [];
  });
}
